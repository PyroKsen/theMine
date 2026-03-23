const fs = require("fs");
const path = require("path");
const {
  MAP_W,
  MAP_H,
  TILE_TYPES,
  TILE_HP
} = require("./config");
const {
  readJsonFile,
  recoverAtomicBackup,
  writeFileAtomic,
  writeJsonAtomic
} = require("./persistence");
const { generateInitialMap } = require("./world/generation");

const MAP_MAGIC = "TMAP";
const MAP_VERSION = 1;
const TILE_HP_FILE = "tile_hp.json";

function layerIndex(x, y) {
  return y * MAP_W + x;
}

function tileHpKey(x, y) {
  return `${x},${y}`;
}

function normalizeTileHp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric * 1000) / 1000);
}

function loadLayer(filePath, expectedW, expectedH) {
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

function saveLayer(filePath, layer, w, h) {
  const header = Buffer.alloc(12);
  header.write(MAP_MAGIC, 0, "ascii");
  header.writeUInt16LE(MAP_VERSION, 4);
  header.writeUInt16LE(w, 6);
  header.writeUInt16LE(h, 8);
  header.writeUInt16LE(0, 10);
  const body = Buffer.from(layer.buffer, layer.byteOffset, layer.byteLength);
  writeFileAtomic(filePath, Buffer.concat([header, body]));
}

function encodeChunk(layer, cx, cy, chunkSize = 64) {
  const startX = cx * chunkSize;
  const startY = cy * chunkSize;
  if (startX >= MAP_W || startY >= MAP_H) return null;
  const w = Math.min(chunkSize, MAP_W - startX);
  const h = Math.min(chunkSize, MAP_H - startY);
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const srcStart = (startY + y) * MAP_W + startX;
    data.set(layer.subarray(srcStart, srcStart + w), y * w);
  }
  return { w, h, data };
}

function fillRect(layerSetter, x0, y0, w, h, type) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
      layerSetter(x, y, type);
    }
  }
}

function loadTileHpOverrides(filePath, getTile) {
  const raw = readJsonFile(filePath, []);
  if (!Array.isArray(raw)) return [];
  const overrides = [];
  for (const entry of raw) {
    const x = Math.floor(Number(entry?.x));
    const y = Math.floor(Number(entry?.y));
    const type = Math.floor(Number(entry?.type));
    const hp = normalizeTileHp(entry?.hp);
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (!Number.isInteger(type) || !Number.isFinite(hp)) continue;
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
    if (hp <= 0) continue;
    if (getTile(x, y) !== type) continue;
    if (!TILE_HP.has(type)) continue;
    overrides.push({ x, y, type, hp });
  }
  return overrides;
}

function buildTileHpOverrides(tileHp, getTile) {
  const overrides = [];
  for (const [key, hp] of tileHp.entries()) {
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
  const mapFile = path.join(dataDir, "map.bin");
  const buildingsFile = path.join(dataDir, "buildings.bin");
  const tileHpFile = path.join(dataDir, TILE_HP_FILE);

  let mapTiles = loadLayer(mapFile, MAP_W, MAP_H);
  let buildingTiles = loadLayer(buildingsFile, MAP_W, MAP_H);
  let mapDirty = false;
  let buildingDirty = false;
  let tileHpDirty = false;
  const tileHp = new Map();

  if (!mapTiles) {
    mapTiles = new Uint8Array(MAP_W * MAP_H);
    generateInitialMap(setTile);
    mapDirty = true;
  }
  if (!buildingTiles) {
    buildingTiles = new Uint8Array(MAP_W * MAP_H);
    buildingDirty = true;
  }
  tileHp.clear();
  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      const type = getTile(x, y);
      const hp = TILE_HP.get(type);
      if (hp) {
        tileHp.set(tileHpKey(x, y), hp);
      }
    }
  }

  for (const entry of loadTileHpOverrides(tileHpFile, getTile)) {
    tileHp.set(tileHpKey(entry.x, entry.y), entry.hp);
  }

  function getTile(x, y) {
    return mapTiles[layerIndex(x, y)];
  }

  function setTile(x, y, type) {
    mapTiles[layerIndex(x, y)] = type;
    mapDirty = true;
    tileHpDirty = true;
    const baseHp = TILE_HP.get(type);
    const key = tileHpKey(x, y);
    if (baseHp) {
      tileHp.set(key, baseHp);
    } else {
      tileHp.delete(key);
    }
  }

  function getBuilding(x, y) {
    return buildingTiles[layerIndex(x, y)];
  }

  function setBuilding(x, y, type) {
    buildingTiles[layerIndex(x, y)] = type;
    buildingDirty = true;
  }

  function getTileHp(x, y) {
    return tileHp.get(tileHpKey(x, y));
  }

  function setTileHp(x, y, hp) {
    const safeHp = normalizeTileHp(hp);
    const key = tileHpKey(x, y);
    if (safeHp > 0) {
      tileHp.set(key, safeHp);
    } else {
      tileHp.delete(key);
    }
    tileHpDirty = true;
  }

  function deleteTileHp(x, y) {
    if (tileHp.delete(tileHpKey(x, y))) {
      tileHpDirty = true;
    }
  }

  function encodeMapChunk(cx, cy, chunkSize) {
    return encodeChunk(mapTiles, cx, cy, chunkSize);
  }

  function encodeBuildingChunk(cx, cy, chunkSize) {
    return encodeChunk(buildingTiles, cx, cy, chunkSize);
  }

  function replaceBuildingLayer(nextLayer) {
    if (!(nextLayer instanceof Uint8Array)) {
      throw new Error("nextLayer must be Uint8Array");
    }
    if (nextLayer.length !== buildingTiles.length) {
      throw new Error("nextLayer size mismatch");
    }
    let changed = 0;
    for (let i = 0; i < buildingTiles.length; i += 1) {
      if (buildingTiles[i] !== nextLayer[i]) {
        changed += 1;
      }
    }
    if (changed > 0) {
      buildingTiles = new Uint8Array(nextLayer);
      buildingDirty = true;
    }
    return changed;
  }

  function flushDirty() {
    if (mapDirty) {
      saveLayer(mapFile, mapTiles, MAP_W, MAP_H);
      mapDirty = false;
    }
    if (buildingDirty) {
      saveLayer(buildingsFile, buildingTiles, MAP_W, MAP_H);
      buildingDirty = false;
    }
    if (tileHpDirty) {
      writeJsonAtomic(tileHpFile, buildTileHpOverrides(tileHp, getTile));
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
    flushDirty
  };
}

module.exports = {
  createMapStore,
  encodeChunk
};









