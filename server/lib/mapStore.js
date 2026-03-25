const fs = require("fs");
const path = require("path");
const {
  MAP_W: DEFAULT_MAP_W,
  MAP_H: DEFAULT_MAP_H,
  CHUNK_SIZE,
  TILE_HP
} = require("./config");
const {
  readJsonFile,
  recoverAtomicBackup,
  writeFileAtomic,
  writeJsonAtomic,
  WORLD_METADATA_FILE
} = require("./persistence");
const { generateTerrainChunk, setWorldBounds } = require("./world/generation");

const MAP_MAGIC = "TMAP";
const MAP_VERSION = 1;
const TILE_HP_FILE = "tile_hp.json";
const TERRAIN_DIR = "terrain_chunks";
const BUILDING_DIR = "building_chunks";
const CHUNK_CACHE_TTL_MS = 60 * 1000;

function tileHpKey(x, y) {
  return `${x},${y}`;
}

function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

function chunkFilePath(dir, cx, cy) {
  return path.join(dir, `${cx}_${cy}.bin`);
}

function parseChunkKey(key) {
  const [cxRaw, cyRaw] = String(key || "").split(",");
  const cx = Number(cxRaw);
  const cy = Number(cyRaw);
  if (!Number.isInteger(cx) || !Number.isInteger(cy)) return null;
  return { cx, cy };
}

function normalizeTileHp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric * 1000) / 1000);
}

function loadBinaryLayer(filePath, expectedW, expectedH) {
  recoverAtomicBackup(filePath);
  if (!fs.existsSync(filePath)) return null;
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 12) return null;
    const magic = buf.subarray(0, 4).toString("ascii");
    if (magic !== MAP_MAGIC) return null;
    const version = buf.readUInt16LE(4);
    const w = buf.readUInt16LE(6);
    const h = buf.readUInt16LE(8);
    if (version !== MAP_VERSION || w !== expectedW || h !== expectedH) {
      return null;
    }
    const data = buf.subarray(12);
    if (data.length !== w * h) return null;
    return new Uint8Array(data);
  } catch {
    return null;
  }
}

function saveBinaryLayer(filePath, layer, w, h) {
  const header = Buffer.alloc(12);
  header.write(MAP_MAGIC, 0, "ascii");
  header.writeUInt16LE(MAP_VERSION, 4);
  header.writeUInt16LE(w, 6);
  header.writeUInt16LE(h, 8);
  header.writeUInt16LE(0, 10);
  const body = Buffer.from(layer.buffer, layer.byteOffset, layer.byteLength);
  writeFileAtomic(filePath, Buffer.concat([header, body]));
}

function encodeChunkFromLayer(layer, width, height, cx, cy, chunkSize = CHUNK_SIZE) {
  const startX = cx * chunkSize;
  const startY = cy * chunkSize;
  if (startX >= width || startY >= height || cx < 0 || cy < 0) return null;
  const w = Math.min(chunkSize, width - startX);
  const h = Math.min(chunkSize, height - startY);
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const srcStart = (startY + y) * width + startX;
    data.set(layer.subarray(srcStart, srcStart + w), y * w);
  }
  return { w, h, data };
}

function loadTileHpOverrides(filePath, getTile, width, height) {
  const raw = readJsonFile(filePath, []);
  if (!Array.isArray(raw)) return new Map();
  const overrides = new Map();
  for (const entry of raw) {
    const x = Math.floor(Number(entry?.x));
    const y = Math.floor(Number(entry?.y));
    const type = Math.floor(Number(entry?.type));
    const hp = normalizeTileHp(entry?.hp);
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (!Number.isInteger(type) || !Number.isFinite(hp)) continue;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (hp <= 0) continue;
    if (getTile(x, y) !== type) continue;
    if (!TILE_HP.has(type)) continue;
    overrides.set(tileHpKey(x, y), hp);
  }
  return overrides;
}

function buildTileHpOverrides(tileHpOverrides, getTile) {
  const overrides = [];
  for (const [key, hp] of tileHpOverrides.entries()) {
    const [xRaw, yRaw] = key.split(",");
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    const type = getTile(x, y);
    const baseHp = TILE_HP.get(type);
    const normalizedHp = normalizeTileHp(hp);
    if (!baseHp || normalizedHp <= 0 || normalizedHp === baseHp) continue;
    overrides.push({ x, y, type, hp: normalizedHp });
  }
  overrides.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return overrides;
}

function createMapStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });

  const worldMetadata = readJsonFile(path.join(dataDir, WORLD_METADATA_FILE), null);
  const worldWidth = Number.isFinite(Number(worldMetadata?.worldWidth))
    ? Number(worldMetadata.worldWidth)
    : DEFAULT_MAP_W;
  const worldHeight = Number.isFinite(Number(worldMetadata?.worldHeight))
    ? Number(worldMetadata.worldHeight)
    : DEFAULT_MAP_H;
  setWorldBounds(worldWidth, worldHeight);

  const mapFile = path.join(dataDir, "map.bin");
  const buildingsFile = path.join(dataDir, "buildings.bin");
  const terrainDir = path.join(dataDir, TERRAIN_DIR);
  const buildingsDir = path.join(dataDir, BUILDING_DIR);
  const tileHpFile = path.join(dataDir, TILE_HP_FILE);

  const legacyTerrainLayer = loadBinaryLayer(mapFile, worldWidth, worldHeight);
  const legacyBuildingLayer = loadBinaryLayer(buildingsFile, worldWidth, worldHeight);
  const terrainChunks = new Map();
  const buildingChunks = new Map();
  let tileHpOverrides = null;
  let tileHpDirty = false;

  function getChunkMeta(cx, cy, chunkSize = CHUNK_SIZE) {
    const startX = cx * chunkSize;
    const startY = cy * chunkSize;
    if (startX >= worldWidth || startY >= worldHeight || cx < 0 || cy < 0) return null;
    return {
      startX,
      startY,
      w: Math.min(chunkSize, worldWidth - startX),
      h: Math.min(chunkSize, worldHeight - startY)
    };
  }

  function createEmptyChunk(cx, cy, chunkSize = CHUNK_SIZE) {
    const meta = getChunkMeta(cx, cy, chunkSize);
    if (!meta) return null;
    return {
      w: meta.w,
      h: meta.h,
      data: new Uint8Array(meta.w * meta.h),
      dirty: false,
      lastAccessedAt: Date.now()
    };
  }

  function listChunkKeysFromDir(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .map((name) => {
        const match = name.match(/^(\d+)_(\d+)\.bin$/);
        if (!match) return null;
        return `${match[1]},${match[2]}`;
      })
      .filter(Boolean);
  }

  function touchChunk(chunk) {
    chunk.lastAccessedAt = Date.now();
  }

  function chunksEqual(a, b) {
    if (!a || !b) return false;
    if (a.w !== b.w || a.h !== b.h || a.data.length !== b.data.length) return false;
    for (let i = 0; i < a.data.length; i += 1) {
      if (a.data[i] !== b.data[i]) return false;
    }
    return true;
  }

  function ensureTerrainChunk(cx, cy) {
    const key = chunkKey(cx, cy);
    const cached = terrainChunks.get(key);
    if (cached) {
      touchChunk(cached);
      return cached;
    }
    const meta = getChunkMeta(cx, cy);
    if (!meta) return null;
    const fromDisk = loadBinaryLayer(chunkFilePath(terrainDir, cx, cy), meta.w, meta.h);
    if (fromDisk) {
      const chunk = { w: meta.w, h: meta.h, data: fromDisk, dirty: false, lastAccessedAt: Date.now() };
      terrainChunks.set(key, chunk);
      return chunk;
    }
    if (legacyTerrainLayer) {
      const chunk = encodeChunkFromLayer(legacyTerrainLayer, worldWidth, worldHeight, cx, cy);
      if (chunk) {
        const hydrated = { ...chunk, dirty: false, lastAccessedAt: Date.now() };
        terrainChunks.set(key, hydrated);
        return hydrated;
      }
    }
    const generated = generateTerrainChunk(cx, cy, CHUNK_SIZE);
    if (!generated) return null;
    const chunk = { ...generated, dirty: false, lastAccessedAt: Date.now() };
    terrainChunks.set(key, chunk);
    return chunk;
  }

  function ensureBuildingChunk(cx, cy) {
    const key = chunkKey(cx, cy);
    const cached = buildingChunks.get(key);
    if (cached) {
      touchChunk(cached);
      return cached;
    }
    const meta = getChunkMeta(cx, cy);
    if (!meta) return null;
    const fromDisk = loadBinaryLayer(chunkFilePath(buildingsDir, cx, cy), meta.w, meta.h);
    if (fromDisk) {
      const chunk = { w: meta.w, h: meta.h, data: fromDisk, dirty: false, lastAccessedAt: Date.now() };
      buildingChunks.set(key, chunk);
      return chunk;
    }
    if (legacyBuildingLayer) {
      const chunk = encodeChunkFromLayer(legacyBuildingLayer, worldWidth, worldHeight, cx, cy);
      if (chunk) {
        const hydrated = { ...chunk, dirty: false, lastAccessedAt: Date.now() };
        buildingChunks.set(key, hydrated);
        return hydrated;
      }
    }
    const empty = createEmptyChunk(cx, cy);
    if (!empty) return null;
    buildingChunks.set(key, empty);
    return empty;
  }

  function getChunkCell(chunk, x, y) {
    const lx = x % CHUNK_SIZE;
    const ly = y % CHUNK_SIZE;
    return chunk.data[ly * chunk.w + lx];
  }

  function setChunkCell(chunk, x, y, value) {
    const lx = x % CHUNK_SIZE;
    const ly = y % CHUNK_SIZE;
    chunk.data[ly * chunk.w + lx] = value;
    chunk.dirty = true;
    touchChunk(chunk);
  }

  function getTile(x, y) {
    if (x < 0 || x >= worldWidth || y < 0 || y >= worldHeight) return 0;
    const chunk = ensureTerrainChunk(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE));
    return chunk ? getChunkCell(chunk, x, y) : 0;
  }

  function setTile(x, y, type) {
    if (x < 0 || x >= worldWidth || y < 0 || y >= worldHeight) return;
    const chunk = ensureTerrainChunk(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE));
    if (!chunk) return;
    setChunkCell(chunk, x, y, type);
    tileHpOverrides?.delete(tileHpKey(x, y));
    tileHpDirty = true;
  }

  function getBuilding(x, y) {
    if (x < 0 || x >= worldWidth || y < 0 || y >= worldHeight) return 0;
    const chunk = ensureBuildingChunk(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE));
    return chunk ? getChunkCell(chunk, x, y) : 0;
  }

  function setBuilding(x, y, type) {
    if (x < 0 || x >= worldWidth || y < 0 || y >= worldHeight) return;
    const chunk = ensureBuildingChunk(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE));
    if (!chunk) return;
    setChunkCell(chunk, x, y, type);
  }

  function ensureTileHpOverrides() {
    if (tileHpOverrides) return tileHpOverrides;
    tileHpOverrides = loadTileHpOverrides(tileHpFile, getTile, worldWidth, worldHeight);
    return tileHpOverrides;
  }

  function getTileHp(x, y) {
    const overrides = ensureTileHpOverrides();
    const override = overrides.get(tileHpKey(x, y));
    if (override != null) return override;
    return TILE_HP.get(getTile(x, y));
  }

  function setTileHp(x, y, hp) {
    const overrides = ensureTileHpOverrides();
    const safeHp = normalizeTileHp(hp);
    const baseHp = TILE_HP.get(getTile(x, y)) || 0;
    const key = tileHpKey(x, y);
    if (safeHp > 0 && safeHp !== baseHp) {
      overrides.set(key, safeHp);
    } else {
      overrides.delete(key);
    }
    tileHpDirty = true;
  }

  function deleteTileHp(x, y) {
    const overrides = ensureTileHpOverrides();
    if (overrides.delete(tileHpKey(x, y))) {
      tileHpDirty = true;
    }
  }

  function encodeChunkByReader(reader, cx, cy, chunkSize = CHUNK_SIZE) {
    const meta = getChunkMeta(cx, cy, chunkSize);
    if (!meta) return null;
    const data = new Uint8Array(meta.w * meta.h);
    for (let y = 0; y < meta.h; y += 1) {
      for (let x = 0; x < meta.w; x += 1) {
        data[y * meta.w + x] = reader(meta.startX + x, meta.startY + y);
      }
    }
    return { w: meta.w, h: meta.h, data };
  }

  function encodeMapChunk(cx, cy, chunkSize) {
    return encodeChunkByReader(getTile, cx, cy, chunkSize);
  }

  function encodeBuildingChunk(cx, cy, chunkSize) {
    return encodeChunkByReader(getBuilding, cx, cy, chunkSize);
  }

  function replaceBuildingLayer(nextLayer) {
    if (!(nextLayer instanceof Uint8Array)) {
      throw new Error("nextLayer must be Uint8Array");
    }
    if (nextLayer.length !== worldWidth * worldHeight) {
      throw new Error("nextLayer size mismatch");
    }
    let changed = 0;
    for (let y = 0; y < worldHeight; y += 1) {
      for (let x = 0; x < worldWidth; x += 1) {
        const idx = y * worldWidth + x;
        const current = getBuilding(x, y);
        const next = nextLayer[idx];
        if (current === next) continue;
        setBuilding(x, y, next);
        changed += 1;
      }
    }
    return changed;
  }

  function rebuildBuildingLayer(entries) {
    const desiredByChunk = new Map();
    for (const entry of entries) {
      const x = Math.floor(Number(entry?.x));
      const y = Math.floor(Number(entry?.y));
      const value = Math.floor(Number(entry?.value));
      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(value)) continue;
      if (x < 0 || x >= worldWidth || y < 0 || y >= worldHeight) continue;
      const cx = Math.floor(x / CHUNK_SIZE);
      const cy = Math.floor(y / CHUNK_SIZE);
      const key = chunkKey(cx, cy);
      let chunk = desiredByChunk.get(key);
      if (!chunk) {
        chunk = createEmptyChunk(cx, cy);
        desiredByChunk.set(key, chunk);
      }
      const lx = x % CHUNK_SIZE;
      const ly = y % CHUNK_SIZE;
      chunk.data[ly * chunk.w + lx] = value;
    }

    const existingKeys = new Set([
      ...listChunkKeysFromDir(buildingsDir),
      ...buildingChunks.keys(),
      ...desiredByChunk.keys()
    ]);
    let repairedCells = 0;

    for (const key of existingKeys) {
      const parsed = parseChunkKey(key);
      if (!parsed) continue;
      const desired = desiredByChunk.get(key) || createEmptyChunk(parsed.cx, parsed.cy);
      const current = ensureBuildingChunk(parsed.cx, parsed.cy);
      if (!desired || !current) continue;
      if (chunksEqual(current, desired)) continue;
      const nextChunk = {
        w: desired.w,
        h: desired.h,
        data: new Uint8Array(desired.data),
        dirty: true,
        lastAccessedAt: Date.now()
      };
      buildingChunks.set(key, nextChunk);
      repairedCells += desired.data.reduce((sum, value) => sum + (value !== 0 ? 1 : 0), 0);
      if (desired.data.every((value) => value === 0)) {
        const filePath = chunkFilePath(buildingsDir, parsed.cx, parsed.cy);
        if (fs.existsSync(filePath)) {
          fs.rmSync(filePath, { force: true });
        }
      }
    }

    return repairedCells;
  }

  function flushChunkDir(layerDir, chunks) {
    fs.mkdirSync(layerDir, { recursive: true });
    for (const [key, chunk] of chunks.entries()) {
      if (!chunk.dirty) continue;
      const parsed = parseChunkKey(key);
      if (!parsed) continue;
      if (chunk.data.every((value) => value === 0)) {
        const filePath = chunkFilePath(layerDir, parsed.cx, parsed.cy);
        if (fs.existsSync(filePath)) {
          fs.rmSync(filePath, { force: true });
        }
        chunk.dirty = false;
        continue;
      }
      saveBinaryLayer(chunkFilePath(layerDir, parsed.cx, parsed.cy), chunk.data, chunk.w, chunk.h);
      chunk.dirty = false;
    }
  }

  function sweepChunkCache(activeChunkKeys = new Set(), ttlMs = CHUNK_CACHE_TTL_MS) {
    const now = Date.now();
    let evictedTerrain = 0;
    let evictedBuildings = 0;
    for (const [key, chunk] of terrainChunks.entries()) {
      if (chunk.dirty) continue;
      if (activeChunkKeys.has(key)) continue;
      if (now - (chunk.lastAccessedAt || 0) < ttlMs) continue;
      terrainChunks.delete(key);
      evictedTerrain += 1;
    }
    for (const [key, chunk] of buildingChunks.entries()) {
      if (chunk.dirty) continue;
      if (activeChunkKeys.has(key)) continue;
      if (now - (chunk.lastAccessedAt || 0) < ttlMs) continue;
      buildingChunks.delete(key);
      evictedBuildings += 1;
    }
    return { evictedTerrain, evictedBuildings };
  }

  function flushDirty() {
    flushChunkDir(terrainDir, terrainChunks);
    flushChunkDir(buildingsDir, buildingChunks);
    if (tileHpDirty) {
      writeJsonAtomic(tileHpFile, buildTileHpOverrides(ensureTileHpOverrides(), getTile));
      tileHpDirty = false;
    }
  }

  return {
    getTile,
    setTile,
    getBuilding,
    setBuilding,
    getTileHp,
    setTileHp,
    deleteTileHp,
    encodeMapChunk,
    encodeBuildingChunk,
    replaceBuildingLayer,
    rebuildBuildingLayer,
    flushDirty,
    sweepChunkCache,
    getOrCreateTerrainChunk: ensureTerrainChunk,
    getOrCreateBuildingChunk: ensureBuildingChunk,
    getDimensions: () => ({ width: worldWidth, height: worldHeight, chunkSize: CHUNK_SIZE })
  };
}

module.exports = {
  createMapStore
};
