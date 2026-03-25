const {
  CHUNK_SIZE,
  MAP_W: DEFAULT_MAP_W,
  MAP_H: DEFAULT_MAP_H,
  TILE_TYPES
} = require("../config");
const { layeredNoise, hashNoise, chooseWinningType } = require("./noise");
const { getSectorsForBounds, setWorldBounds: setSectorWorldBounds } = require("./sectors");
const { createFillLogic } = require("./fill");

let WORLD_W = DEFAULT_MAP_W;
let WORLD_H = DEFAULT_MAP_H;

function setWorldBounds(width, height) {
  WORLD_W = Math.max(1, Math.floor(Number(width) || DEFAULT_MAP_W));
  WORLD_H = Math.max(1, Math.floor(Number(height) || DEFAULT_MAP_H));
  setSectorWorldBounds(WORLD_W, WORLD_H);
}

function rotateSectorPoint(sector, x, y, scale = 1, secondary = false) {
  const dx = (x - sector.x) * scale * (secondary ? sector.stretchY : sector.stretchX);
  const dy = (y - sector.y) * scale * (secondary ? sector.stretchX : sector.stretchY);
  const cos = secondary ? sector.cos2 : sector.cos;
  const sin = secondary ? sector.sin2 : sector.sin;
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos
  };
}

function sectorField(sector, x, y) {
  const cellBias = layeredNoise(x * 0.65, y * 0.65, sector.gx * 17 + sector.gy * 29 + 5) - 0.5;
  const warpX = (layeredNoise(x * 0.18, y * 0.18, sector.gx + 90) - 0.5) * 52;
  const warpY = (layeredNoise(x * 0.18, y * 0.18, sector.gy + 140) - 0.5) * 52;
  const localA = rotateSectorPoint(sector, x + warpX, y + warpY, 1, false);
  const localB = rotateSectorPoint(sector, x - warpY * 0.35, y + warpX * 0.35, 1, true);
  const ax = Math.abs(localA.x);
  const ay = Math.abs(localA.y);
  const bx = Math.abs(localB.x);
  const by = Math.abs(localB.y);
  let distanceMetric = 0;
  if (sector.shapeKind === "pocket") {
    distanceMetric = ax * 0.95 + ay * 1.35 + Math.max(ax, ay) * 0.35;
  } else if (sector.shapeKind === "narrow") {
    distanceMetric = ax * 0.7 + ay * 1.55 + bx * 0.15;
  } else if (sector.shapeKind === "stretched") {
    distanceMetric = ax * 1.28 + ay * 0.72 + by * 0.2;
  } else if (sector.shapeKind === "lobed") {
    distanceMetric = Math.max(ax, ay) * 0.78 + Math.min(ax, ay) * 0.46;
  } else {
    distanceMetric = ax + ay * 0.98;
  }
  const angle = Math.atan2(localA.y, localA.x);
  const radialNoise = layeredNoise(localA.x * 0.035, localA.y * 0.035, sector.gx * 37 + sector.gy * 41);
  const lobeWave = Math.sin(angle * sector.lobeFreq + sector.angle2 * 1.7) * sector.lobeAmp;
  const pinchWave = Math.cos(angle * (sector.lobeFreq + 1) - sector.angle) * (sector.radius * sector.pinch);
  const jagged = (radialNoise - 0.5) * (32 + sector.lobeAmp * 0.22);
  const shapeOffset = sector.shapeKind === "lobed"
    ? lobeWave + pinchWave * 0.45
    : sector.shapeKind === "narrow"
    ? pinchWave * 0.85
    : sector.shapeKind === "stretched"
    ? pinchWave * 0.6 + lobeWave * 0.18
    : sector.shapeKind === "pocket"
    ? -Math.abs(pinchWave) * 0.45
    : pinchWave * 0.3;
  const base = sector.radius - distanceMetric + shapeOffset + jagged;
  return base + cellBias * 105;
}

function evaluateSector(sectors, x, y) {
  let bestIndex = -1;
  let bestValue = -Infinity;
  let secondIndex = -1;
  let secondValue = -Infinity;
  for (let i = 0; i < sectors.length; i += 1) {
    const value = sectorField(sectors[i], x, y);
    if (value > bestValue) {
      secondValue = bestValue;
      secondIndex = bestIndex;
      bestValue = value;
      bestIndex = i;
    } else if (value > secondValue) {
      secondValue = value;
      secondIndex = i;
    }
  }
  return {
    ownerIndex: bestIndex,
    rivalIndex: secondIndex,
    delta: bestValue - secondValue
  };
}

function createChunkField(sectors, x0, y0, w, h) {
  const expandedX0 = Math.max(0, x0 - 1);
  const expandedY0 = Math.max(0, y0 - 1);
  const expandedX1 = Math.min(WORLD_W - 1, x0 + w);
  const expandedY1 = Math.min(WORLD_H - 1, y0 + h);
  const expandedW = expandedX1 - expandedX0 + 1;
  const expandedH = expandedY1 - expandedY0 + 1;
  const ownership = new Int32Array(expandedW * expandedH).fill(-1);
  const rival = new Int32Array(expandedW * expandedH).fill(-1);
  const delta = new Float32Array(expandedW * expandedH);

  function localIndex(x, y) {
    return (y - expandedY0) * expandedW + (x - expandedX0);
  }

  for (let y = expandedY0; y <= expandedY1; y += 1) {
    for (let x = expandedX0; x <= expandedX1; x += 1) {
      const result = evaluateSector(sectors, x, y);
      const idx = localIndex(x, y);
      ownership[idx] = result.ownerIndex;
      rival[idx] = result.rivalIndex;
      delta[idx] = result.delta;
    }
  }

  return {
    expandedX0,
    expandedY0,
    expandedX1,
    expandedY1,
    ownership,
    rival,
    delta,
    localIndex
  };
}

function createShellHelpers(sectors, chunkField, dirtyField, dirtyFillType) {
  const {
    expandedX0,
    expandedY0,
    expandedX1,
    expandedY1,
    ownership,
    rival,
    delta,
    localIndex
  } = chunkField;

  function boundaryStrength(x, y) {
    return Math.max(0, Math.min(1, 1 - delta[localIndex(x, y)] / 108));
  }

  function getOwnerIndexAt(x, y) {
    if (x < expandedX0 || y < expandedY0 || x > expandedX1 || y > expandedY1) {
      return evaluateSector(sectors, x, y).ownerIndex;
    }
    return ownership[localIndex(x, y)];
  }

  function isComplexJunction(x, y) {
    const owners = new Set();
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const tx = x + ox;
        const ty = y + oy;
        if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) continue;
        owners.add(getOwnerIndexAt(tx, ty));
        if (owners.size >= 3) return true;
      }
    }
    return false;
  }

  function shellType(sector, x, y) {
    const shellNoise = dirtyField(sector, x, y, sector.gx * 211 + sector.gy * 157 + 9);
    const shellGrain = dirtyField(sector, x + 17, y - 13, sector.gx * 223 + sector.gy * 167 + 21);
    const edgeFray = (shellNoise - 0.5) * 0.34 + (shellGrain - 0.5) * 0.22 + (hashNoise(x, y, sector.gx * 233 + sector.gy * 181) - 0.5) * 0.16;
    const boundary = Math.max(0, Math.min(1, boundaryStrength(x, y) + edgeFray));
    const fillType = dirtyFillType(sector, x, y);
    const complexJunction = isComplexJunction(x, y);
    const redField = dirtyField(sector, x, y, sector.gx * 173 + sector.gy * 139 + 1);
    const blackFieldA = dirtyField(sector, x + 43, y - 19, sector.gx * 173 + sector.gy * 139 + 2);
    const blackFieldB = dirtyField(sector, x - 27, y + 37, sector.gx * 173 + sector.gy * 139 + 3);
    const redBand = Math.max(0, 1 - Math.abs(boundary - 0.84) / 0.12);
    const blackBandInner = Math.max(0, 1 - Math.abs(boundary - 0.58) / 0.12);
    let redWeight = redBand * (0.82 + redField * 1.05);
    let blackWeight = blackBandInner * (0.62 + blackFieldA * 0.95 + blackFieldB * 0.45);
    let fillWeight = Math.max(0.2, 1 - Math.max(redBand, blackBandInner * 0.9) * 1.18);
    if (complexJunction) {
      redWeight *= 0.4;
      blackWeight *= 1.22;
      fillWeight *= 0.82;
    }
    const shellPresence = Math.max(redBand, blackBandInner);
    if (shellPresence > 0.05) {
      return redWeight >= blackWeight ? TILE_TYPES.redRock : TILE_TYPES.blackRock;
    }
    const entries = [
      { type: TILE_TYPES.blackRock, weight: blackWeight },
      { type: TILE_TYPES.redRock, weight: redWeight },
      { type: fillType, weight: fillWeight }
    ];
    return chooseWinningType(entries, x, y, sector.gx * 73 + sector.gy * 47 + 700);
  }

  function resolveShellTile(x, y) {
    const idx = localIndex(x, y);
    const owner = sectors[ownership[idx]];
    if (!owner || owner.redMacro) return null;
    const candidates = [];
    const primary = shellType(owner, x, y);
    if (primary === TILE_TYPES.redRock || primary === TILE_TYPES.blackRock) {
      candidates.push(primary);
    }
    const rivalIndex = rival[idx];
    if (rivalIndex >= 0) {
      const other = sectors[rivalIndex];
      if (other && !other.redMacro) {
        const secondary = shellType(other, x, y);
        if (secondary === TILE_TYPES.redRock || secondary === TILE_TYPES.blackRock) {
          candidates.push(secondary);
        }
      }
    }
    if (candidates.includes(TILE_TYPES.redRock)) return TILE_TYPES.redRock;
    if (candidates.includes(TILE_TYPES.blackRock)) return TILE_TYPES.blackRock;
    return null;
  }

  return {
    boundaryStrength,
    resolveShellTile,
    getOwnerIndexAt
  };
}

function applySpawnZone(data, x0, y0, w, h) {
  const fill = (sx0, sy0, sw, sh, type) => {
    for (let y = sy0; y < sy0 + sh; y += 1) {
      for (let x = sx0; x < sx0 + sw; x += 1) {
        if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) continue;
        data[(y - y0) * w + (x - x0)] = type;
      }
    }
  };
  fill(0, 0, 26, 26, TILE_TYPES.empty);
  fill(4, 4, 5, 4, TILE_TYPES.rock);
  fill(10, 4, 3, 3, TILE_TYPES.crystalGreen);
  fill(14, 4, 3, 3, TILE_TYPES.crystalBlue);
  fill(4, 10, 2, 2, TILE_TYPES.sand);
}

function generateTerrainChunk(cx, cy, chunkSize = CHUNK_SIZE) {
  const x0 = cx * chunkSize;
  const y0 = cy * chunkSize;
  if (x0 >= WORLD_W || y0 >= WORLD_H) return null;
  const w = Math.min(chunkSize, WORLD_W - x0);
  const h = Math.min(chunkSize, WORLD_H - y0);
  const x1 = x0 + w - 1;
  const y1 = y0 + h - 1;

  const sectors = getSectorsForBounds(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  const chunkField = createChunkField(sectors, x0, y0, w, h);
  const { dirtyField, dirtyFillType } = createFillLogic({ TILE_TYPES, rotateSectorPoint });
  const { boundaryStrength, resolveShellTile, getOwnerIndexAt } = createShellHelpers(
    sectors,
    chunkField,
    dirtyField,
    dirtyFillType
  );
  const data = new Uint8Array(w * h);

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const ownerIndex = getOwnerIndexAt(x, y);
      const sector = sectors[ownerIndex];
      if (!sector) continue;
      const idx = (y - y0) * w + (x - x0);
      data[idx] = sector.redMacro ? TILE_TYPES.redRock : dirtyFillType(sector, x, y);
    }
  }

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const ownerIndex = getOwnerIndexAt(x, y);
      const sector = sectors[ownerIndex];
      if (!sector || sector.redMacro) continue;
      const shellStrength = boundaryStrength(x, y);
      if (shellStrength <= 0.01) continue;
      const shellTile = resolveShellTile(x, y);
      if (shellTile !== null) {
        data[(y - y0) * w + (x - x0)] = shellTile;
      }
    }
  }

  const livingTypes = [
    TILE_TYPES.liveCrystalBlue,
    TILE_TYPES.liveCrystalWhite,
    TILE_TYPES.liveCrystalPink,
    TILE_TYPES.liveCrystalRed,
    TILE_TYPES.liveCrystalCyan,
    TILE_TYPES.liveCrystalRainbow,
    TILE_TYPES.hypnoRock
  ];
  for (const sector of sectors) {
    if (sector.redMacro) continue;
    const livingCount = 2 + Math.floor(hashNoise(sector.gx, sector.gy, 620) * 4);
    for (let i = 0; i < livingCount; i += 1) {
      const angle = hashNoise(sector.gx + i, sector.gy, 640) * Math.PI * 2;
      const radius = 18 + hashNoise(sector.gx, sector.gy + i, 670) * 70;
      const x = Math.max(5, Math.min(WORLD_W - 6, Math.floor(sector.x + Math.cos(angle) * radius)));
      const y = Math.max(5, Math.min(WORLD_H - 6, Math.floor(sector.y + Math.sin(angle) * radius)));
      if (x < x0 || y < y0 || x > x1 || y > y1) continue;
      if (sectors[getOwnerIndexAt(x, y)]?.id !== sector.id) continue;
      data[(y - y0) * w + (x - x0)] = livingTypes[(sector.gx + sector.gy + i) % livingTypes.length];
    }
  }

  applySpawnZone(data, x0, y0, w, h);
  return { w, h, data };
}

function generateInitialMap(setTile) {
  const maxCx = Math.ceil(WORLD_W / CHUNK_SIZE);
  const maxCy = Math.ceil(WORLD_H / CHUNK_SIZE);
  for (let cy = 0; cy < maxCy; cy += 1) {
    for (let cx = 0; cx < maxCx; cx += 1) {
      const chunk = generateTerrainChunk(cx, cy, CHUNK_SIZE);
      if (!chunk) continue;
      const startX = cx * CHUNK_SIZE;
      const startY = cy * CHUNK_SIZE;
      for (let y = 0; y < chunk.h; y += 1) {
        for (let x = 0; x < chunk.w; x += 1) {
          setTile(startX + x, startY + y, chunk.data[y * chunk.w + x]);
        }
      }
    }
  }
}

module.exports = {
  setWorldBounds,
  generateInitialMap,
  generateTerrainChunk
};
