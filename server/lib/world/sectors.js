const { MAP_W: DEFAULT_MAP_W, MAP_H: DEFAULT_MAP_H } = require("../config");
const { hashNoise } = require("./noise");
const {
  pickSectorPool,
  pickSectorShape,
  pickSectorSize,
  getSizeRadius
} = require("./sectorPools");

const SECTOR_SPACING = 190;
const SECTOR_MARGIN = 520;
let WORLD_W = DEFAULT_MAP_W;
let WORLD_H = DEFAULT_MAP_H;

function setWorldBounds(width, height) {
  WORLD_W = Math.max(1, Math.floor(Number(width) || DEFAULT_MAP_W));
  WORLD_H = Math.max(1, Math.floor(Number(height) || DEFAULT_MAP_H));
}

function createSectorFromGrid(gx, gy) {
  const jitterX = Math.floor((hashNoise(gx, gy, 1) - 0.5) * 90);
  const jitterY = Math.floor((hashNoise(gx, gy, 2) - 0.5) * 90);
  const x = gx * SECTOR_SPACING + SECTOR_SPACING / 2 + jitterX;
  const y = gy * SECTOR_SPACING + SECTOR_SPACING / 2 + jitterY;
  if (x < -120 || x > WORLD_W + 120 || y < -120 || y > WORLD_H + 120) return null;

  const redMacro = false;
  const depth = y;
  const pool = pickSectorPool(depth, gx, gy);
  const angle = hashNoise(gx, gy, 5) * Math.PI * 2;
  const angle2 = hashNoise(gx, gy, 6) * Math.PI * 2;
  const stretchX = 0.72 + hashNoise(gx, gy, 7) * 1.1;
  const stretchY = 0.72 + hashNoise(gx, gy, 8) * 1.1;
  const sizeClass = pickSectorSize(pool, gx, gy);
  const shapeKind = pickSectorShape(pool, gx, gy);
  const radius = getSizeRadius(sizeClass, gx, gy);
  const lobeAmp = 20 + hashNoise(gx, gy, 15) * 110;
  const lobeFreq = 2 + Math.floor(hashNoise(gx, gy, 16) * 4);
  const pinch = 0.08 + hashNoise(gx, gy, 17) * 0.32;

  return {
    id: `${gx},${gy}`,
    gx,
    gy,
    x,
    y,
    depth,
    redMacro,
    poolId: pool.id,
    pool,
    angle,
    angle2,
    cos: Math.cos(angle),
    sin: Math.sin(angle),
    cos2: Math.cos(angle2),
    sin2: Math.sin(angle2),
    stretchX,
    stretchY,
    radius,
    sizeClass,
    shapeKind,
    lobeAmp,
    lobeFreq,
    pinch
  };
}

function getSectorsForBounds(x0, y0, x1, y1, margin = SECTOR_MARGIN) {
  const minGx = Math.floor((x0 - margin) / SECTOR_SPACING) - 1;
  const maxGx = Math.ceil((x1 + margin) / SECTOR_SPACING) + 1;
  const minGy = Math.floor((y0 - margin) / SECTOR_SPACING) - 1;
  const maxGy = Math.ceil((y1 + margin) / SECTOR_SPACING) + 1;
  const sectors = [];
  for (let gy = minGy; gy <= maxGy; gy += 1) {
    for (let gx = minGx; gx <= maxGx; gx += 1) {
      const sector = createSectorFromGrid(gx, gy);
      if (sector) sectors.push(sector);
    }
  }
  return sectors;
}

function buildMacroSectors() {
  return getSectorsForBounds(0, 0, WORLD_W - 1, WORLD_H - 1);
}

module.exports = {
  SECTOR_SPACING,
  SECTOR_MARGIN,
  setWorldBounds,
  createSectorFromGrid,
  getSectorsForBounds,
  buildMacroSectors
};
