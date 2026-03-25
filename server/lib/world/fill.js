const { layeredNoise, hashNoise, chooseWinningType } = require("./noise");

function createFillLogic({ TILE_TYPES, rotateSectorPoint }) {
  function dirtyField(sector, x, y, seed) {
    const p1 = rotateSectorPoint(sector, x, y, 1.0, false);
    const p2 = rotateSectorPoint(sector, x + 23, y - 17, 1.8, true);
    const p3 = rotateSectorPoint(sector, x - 31, y + 29, 3.4, false);
    const p4 = rotateSectorPoint(sector, x + 11, y + 7, 7.8, true);
    const broad = layeredNoise(p1.x * 0.082, p1.y * 0.041, seed);
    const medium = layeredNoise(p2.x * 0.057, p2.y * 0.137, seed + 17);
    const streak = layeredNoise(p3.x * 0.031, p3.y * 0.185, seed + 33);
    const fine = layeredNoise(p4.x * 0.11, p4.y * 0.19, seed + 49);
    const grit = hashNoise(Math.floor(p4.x * 0.9), Math.floor(p4.y * 0.9), seed + 67);
    return broad * 0.18 + medium * 0.22 + streak * 0.28 + fine * 0.18 + grit * 0.14;
  }

  function patternFields(sector, x, y, seedBase, index) {
    const localA = rotateSectorPoint(sector, x, y, 1.9, index % 2 === 0);
    const localB = rotateSectorPoint(sector, x + 41, y - 27, 3.6, index % 2 !== 0);
    const localC = rotateSectorPoint(sector, x - 19, y + 33, 6.2, false);
    const pattern = sector.pool?.pattern || "bands";

    if (pattern === "patches") {
      return {
        dominant: layeredNoise(localA.x * 0.035, localA.y * 0.035, seedBase + 5),
        support: layeredNoise(localB.x * 0.062, localB.y * 0.062, seedBase + 23),
        accent: layeredNoise(localC.x * 0.11, localC.y * 0.11, seedBase + 41)
      };
    }

    if (pattern === "veins") {
      return {
        dominant: layeredNoise(localA.x * 0.024, localA.y * 0.128, seedBase + 5),
        support: layeredNoise(localB.x * 0.021, localB.y * 0.175, seedBase + 23),
        accent: layeredNoise(localC.x * 0.095, localC.y * 0.21, seedBase + 41)
      };
    }

    if (pattern === "scatter") {
      return {
        dominant: hashNoise(Math.floor(localA.x * 1.8), Math.floor(localA.y * 1.8), seedBase + 5),
        support: layeredNoise(localB.x * 0.14, localB.y * 0.14, seedBase + 23),
        accent: hashNoise(Math.floor(localC.x * 2.4), Math.floor(localC.y * 2.4), seedBase + 41)
      };
    }

    return {
      dominant: layeredNoise(localA.x * 0.02, localA.y * 0.14, seedBase + 5),
      support: layeredNoise(localB.x * 0.038, localB.y * 0.16, seedBase + 23),
      accent: layeredNoise(localC.x * 0.11, localC.y * 0.23, seedBase + 41)
    };
  }

  function dirtyFillType(sector, x, y) {
    const pool = sector.pool;
    const materials = pool?.fillEntries?.length ? pool.fillEntries : [{ type: TILE_TYPES.rock, percent: 100 }];
    const dx = x - sector.x;
    const dy = y - sector.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const centerBias = Math.max(0, 1 - dist / 280);
    const entries = materials.map((entry, index) => {
      const seedBase = sector.gx * 131 + sector.gy * 97 + index * 41;
      const fieldA = dirtyField(sector, x, y, seedBase + 11);
      const fieldB = dirtyField(sector, x + 19, y - 23, seedBase + 29);
      const fieldC = dirtyField(sector, x - 37, y + 31, seedBase + 53);
      const local = rotateSectorPoint(sector, x, y, 5.1, index % 2 === 0);
      const contamination = layeredNoise(local.x * 0.19, local.y * 0.19, seedBase + 71);
      const pattern = patternFields(sector, x, y, seedBase + 101, index);
      let weight = (entry.percent / 100) * 0.95;
      weight += fieldA * 0.45;
      weight += fieldB * 0.3;
      weight += fieldC * 0.24;
      weight += contamination * 0.16;
      weight += pattern.dominant * 0.72;
      weight += pattern.support * 0.48;
      weight += pattern.accent * 0.2;
      if (entry.type === pool.primaryType) {
        weight += centerBias * 0.35;
      } else if (entry.type === TILE_TYPES.empty) {
        weight += (1 - centerBias) * 0.24;
      } else {
        weight += (1 - centerBias) * 0.18;
      }
      return { type: entry.type, weight };
    });
    return chooseWinningType(entries, x, y, sector.gx * 101 + sector.gy * 53 + 17);
  }

  return {
    dirtyField,
    dirtyFillType
  };
}

module.exports = {
  createFillLogic
};
