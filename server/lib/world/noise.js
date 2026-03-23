const { TILE_TYPES } = require("../config");

function layeredNoise(x, y, seed = 0) {
  const a = Math.sin((x + seed * 3.1) * 0.071 + (y - seed) * 0.047);
  const b = Math.sin((x - seed * 2.7) * 0.029 - (y + seed * 1.3) * 0.062);
  const c = Math.sin((x + y + seed * 11) * 0.018);
  return (a * 0.45 + b * 0.35 + c * 0.2 + 1) / 2;
}

function hashNoise(x, y, seed = 0) {
  const value = Math.sin((x * 12.9898 + y * 78.233 + seed * 37.719)) * 43758.5453;
  return value - Math.floor(value);
}

function chooseWinningType(entries, x, y, seed) {
  let winner = entries[0]?.type ?? TILE_TYPES.rock;
  let best = -Infinity;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const local = layeredNoise(x, y, seed + i * 13) * 0.65 + hashNoise(x, y, seed + i * 29) * 0.35;
    const score = (entry.weight || 0) * (0.7 + local * 0.6);
    if (score > best) {
      best = score;
      winner = entry.type;
    }
  }
  return winner;
}

module.exports = {
  layeredNoise,
  hashNoise,
  chooseWinningType
};
