const { TILE_TYPES } = require("../config");
const { hashNoise } = require("./noise");

const SIZE_CLASSES = {
  pocket: { min: 150, max: 190 },
  narrow: { min: 205, max: 250 },
  medium: { min: 255, max: 325 },
  large: { min: 325, max: 420 }
};

const DEFAULT_SHAPE_WEIGHTS = {
  pocket: 0,
  narrow: 0,
  compact: 1,
  stretched: 0,
  lobed: 1
};

const DEFAULT_SIZE_WEIGHTS = {
  pocket: 0,
  narrow: 0,
  medium: 1,
  large: 0
};

function normalizeFill(fill) {
  const entries = [];
  let total = 0;
  for (const [typeKey, percentRaw] of Object.entries(fill || {})) {
    const type = TILE_TYPES[typeKey];
    const percent = Number(percentRaw);
    if (!Number.isFinite(percent) || percent <= 0 || type == null) continue;
    entries.push({ type, percent });
    total += percent;
  }
  if (total < 100) {
    entries.push({ type: TILE_TYPES.empty, percent: 100 - total });
  }
  const primary = entries
    .filter((entry) => entry.type !== TILE_TYPES.empty)
    .sort((a, b) => b.percent - a.percent)[0];
  return {
    entries,
    primaryType: primary?.type ?? TILE_TYPES.rock
  };
}

function createSectorPool(definition) {
  const normalized = normalizeFill(definition.fill);
  return {
    ...definition,
    pattern: definition.pattern || "bands",
    patternStrength: Number.isFinite(Number(definition.patternStrength)) ? Number(definition.patternStrength) : 1,
    fillEntries: normalized.entries,
    primaryType: normalized.primaryType,
    shapeWeights: {
      ...DEFAULT_SHAPE_WEIGHTS,
      ...(definition.shapeWeights || {})
    },
    sizeWeights: {
      ...DEFAULT_SIZE_WEIGHTS,
      ...(definition.sizeWeights || {})
    }
  };
}

const sectorPools = [
  createSectorPool({
    id: "starter_rock",
    depthMin: 0,
    depthMax: 450,
    weight: 38,
    pattern: "bands",
    patternStrength: 0.85,
    fill: {
      rock: 82,
      crystalGreen: 6,
      crystalBlue: 7,
      sand: 2,
      semiMagneticRock: 2
    },
    tags: ["starter"],
    shapeWeights: { compact: 1.2, lobed: 0.8, narrow: 0.2 },
    sizeWeights: { pocket: 0.15, medium: 1, large: 0.45 }
  }),
  createSectorPool({
    id: "starter_sand",
    depthMin: 0,
    depthMax: 600,
    weight: 16,
    pattern: "scatter",
    patternStrength: 1.2,
    fill: {
      sand: 64,
      rock: 17,
      crystalBlue: 7,
      crystalGreen: 5,
      semiMagneticRock: 3
    },
    tags: ["starter", "loose"],
    shapeWeights: { compact: 0.7, lobed: 0.6, narrow: 0.8, stretched: 0.35 },
    sizeWeights: { pocket: 0.25, narrow: 0.65, medium: 0.85, large: 0.2 }
  }),
  createSectorPool({
    id: "semi_magnetic",
    depthMin: 220,
    depthMax: 1200,
    weight: 24,
    pattern: "bands",
    patternStrength: 1,
    fill: {
      semiMagneticRock: 58,
      rock: 10,
      sand: 10,
      magneticRock: 7,
      crystalPink: 8
    },
    tags: ["mid", "magnetic"],
    shapeWeights: { compact: 0.7, lobed: 1, narrow: 0.8, stretched: 0.45 },
    sizeWeights: { pocket: 0.1, narrow: 0.55, medium: 1, large: 0.55 }
  }),
  createSectorPool({
    id: "metal",
    depthMin: 650,
    depthMax: 2200,
    weight: 22,
    pattern: "veins",
    patternStrength: 1.25,
    fill: {
      reinforcedRock: 42,
      ironRock: 20,
      steelRock: 8,
      crystalWhite: 10,
      crystalRed: 6,
      magneticRock: 6
    },
    tags: ["mid", "metal"],
    shapeWeights: { compact: 0.6, lobed: 0.75, narrow: 0.4, stretched: 1 },
    sizeWeights: { pocket: 0.05, narrow: 0.3, medium: 0.9, large: 1 }
  }),
  createSectorPool({
    id: "acid",
    depthMin: 800,
    depthMax: 2600,
    weight: 22,
    pattern: "patches",
    patternStrength: 1.15,
    fill: {
      acidRock: 40,
      slimeRock: 16,
      corrosiveRock: 14,
      radioactiveRock: 7,
      crystalCyan: 8,
      magma: 4
    },
    tags: ["mid", "hazard", "acid"],
    shapeWeights: { compact: 0.35, lobed: 1.2, narrow: 0.5, stretched: 0.55 },
    sizeWeights: { pocket: 0.05, narrow: 0.2, medium: 0.85, large: 1 }
  }),
  createSectorPool({
    id: "crystal",
    depthMin: 700,
    depthMax: 2600,
    weight: 18,
    pattern: "patches",
    patternStrength: 1.35,
    fill: {
      crystalPink: 18,
      crystalCyan: 18,
      crystalWhite: 14,
      crystalRed: 12,
      crystalBlue: 10,
      blackRock: 16
    },
    tags: ["mid", "crystal"],
    shapeWeights: { compact: 0.35, lobed: 1.4, narrow: 0.25, stretched: 0.35 },
    sizeWeights: { pocket: 0.12, narrow: 0.2, medium: 1, large: 0.75 }
  }),
  createSectorPool({
    id: "deep_metal",
    depthMin: 1800,
    depthMax: 4000,
    weight: 14,
    pattern: "veins",
    patternStrength: 1.45,
    fill: {
      ironRock: 26,
      steelRock: 24,
      reinforcedRock: 16,
      magneticRock: 8,
      crystalWhite: 6,
      crystalRed: 6,
      radioactiveRock: 4
    },
    tags: ["late", "metal"],
    shapeWeights: { compact: 0.25, lobed: 0.5, narrow: 0.3, stretched: 1.4 },
    sizeWeights: { pocket: 0, narrow: 0.15, medium: 0.6, large: 1.2 }
  }),
  createSectorPool({
    id: "deep_hazard",
    depthMin: 2200,
    depthMax: 4000,
    weight: 12,
    pattern: "scatter",
    patternStrength: 1.3,
    fill: {
      corrosiveRock: 18,
      radioactiveRock: 16,
      magma: 10,
      steelSand: 8,
      crystalCyan: 10,
      blackRock: 12,
      acidRock: 8,
      slimeRock: 8
    },
    tags: ["late", "hazard"],
    shapeWeights: { compact: 0.2, lobed: 1.1, narrow: 0.2, stretched: 0.9 },
    sizeWeights: { pocket: 0, narrow: 0.1, medium: 0.5, large: 1.25 }
  })
];

function chooseByWeight(weightMap, x, y, seedOffset, fallback) {
  let winner = fallback;
  let best = -Infinity;
  let index = 0;
  for (const [key, weightRaw] of Object.entries(weightMap || {})) {
    const weight = Number(weightRaw) || 0;
    if (weight <= 0) {
      index += 1;
      continue;
    }
    const local = hashNoise(x + index * 17, y - index * 13, seedOffset + index * 31);
    const score = weight * (0.72 + local * 0.56);
    if (score > best) {
      best = score;
      winner = key;
    }
    index += 1;
  }
  return winner;
}

function getEligibleSectorPools(depth) {
  return sectorPools.filter((pool) => depth >= pool.depthMin && depth <= pool.depthMax);
}

function pickSectorPool(depth, gx, gy) {
  const eligible = getEligibleSectorPools(depth);
  const pools = eligible.length > 0 ? eligible : [sectorPools[0]];
  let winner = pools[0];
  let best = -Infinity;
  for (let i = 0; i < pools.length; i += 1) {
    const pool = pools[i];
    const local = hashNoise(gx + i * 19, gy - i * 23, 401 + i * 37);
    const score = pool.weight * (0.7 + local * 0.6);
    if (score > best) {
      best = score;
      winner = pool;
    }
  }
  return winner;
}

function pickSectorShape(pool, gx, gy) {
  return chooseByWeight(pool.shapeWeights, gx, gy, 701, "compact");
}

function pickSectorSize(pool, gx, gy) {
  return chooseByWeight(pool.sizeWeights, gx, gy, 907, "medium");
}

function getSizeRadius(sizeClass, gx, gy) {
  const range = SIZE_CLASSES[sizeClass] || SIZE_CLASSES.medium;
  return range.min + hashNoise(gx, gy, 1201) * (range.max - range.min);
}

module.exports = {
  sectorPools,
  pickSectorPool,
  pickSectorShape,
  pickSectorSize,
  getSizeRadius
};


