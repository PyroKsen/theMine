const { palettes } = require("./palettes");
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

  function dirtyFillType(sector, x, y) {
    const palette = palettes[sector.paletteKey] || palettes.starter;
    const dx = x - sector.x;
    const dy = y - sector.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const centerBias = Math.max(0, 1 - dist / 280);
    const entries = palette.materials.map((entry, index) => {
      const seedBase = sector.gx * 131 + sector.gy * 97 + index * 41;
      const fieldA = dirtyField(sector, x, y, seedBase + 11);
      const fieldB = dirtyField(sector, x + 19, y - 23, seedBase + 29);
      const fieldC = dirtyField(sector, x - 37, y + 31, seedBase + 53);
      const local = rotateSectorPoint(sector, x, y, 5.1, index % 2 === 0);
      const contamination = layeredNoise(local.x * 0.19, local.y * 0.19, seedBase + 71);
      let weight = entry.weight * 0.55;
      weight += fieldA * 0.85;
      weight += fieldB * 0.65;
      weight += fieldC * 0.55;
      weight += contamination * 0.35;
      if (entry.type === palette.primary) {
        weight += centerBias * 0.35;
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
