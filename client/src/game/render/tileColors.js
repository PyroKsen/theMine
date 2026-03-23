import { TILE_DISPLAY, TILE_TYPES } from "../constants.js";

export function getTileHexColor(type) {
  return TILE_DISPLAY[type]?.color ?? null;
}

export function getTileNumericColor(type) {
  const hex = getTileHexColor(type);
  if (!hex) return null;
  return Number.parseInt(hex.replace("#", ""), 16);
}

export function isBuiltBlockTile(type) {
  return (
    type === TILE_TYPES.buildGreen ||
    type === TILE_TYPES.buildYellow ||
    type === TILE_TYPES.buildRed
  );
}

export function isLivingCrystalTile(type) {
  return (
    type === TILE_TYPES.liveCrystalBlue ||
    type === TILE_TYPES.liveCrystalWhite ||
    type === TILE_TYPES.liveCrystalPink ||
    type === TILE_TYPES.liveCrystalRed ||
    type === TILE_TYPES.liveCrystalCyan ||
    type === TILE_TYPES.liveCrystalRainbow
  );
}
