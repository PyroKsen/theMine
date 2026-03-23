import { DEFAULT_MAP, TILE_BASE_HP, TILE_DISPLAY } from "./constants.js";
import { chunkKey } from "./helpers.js";

function getLoadedTileType(mapDataRef, tx, ty) {
  const { w, h, chunk, tiles } = mapDataRef.current;
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return null;
  const chunkSize = chunk || DEFAULT_MAP.chunk;
  const cx = Math.floor(tx / chunkSize);
  const cy = Math.floor(ty / chunkSize);
  const loadedChunk = tiles.get(chunkKey(cx, cy));
  if (!loadedChunk) return null;
  const lx = tx - cx * chunkSize;
  const ly = ty - cy * chunkSize;
  if (lx < 0 || ly < 0 || lx >= loadedChunk.w || ly >= loadedChunk.h) {
    return null;
  }
  return loadedChunk.data[ly * loadedChunk.w + lx];
}

function getTrackedTileHp(tileHpRef, tx, ty, type) {
  if (type == null) return null;
  const tracked = tileHpRef.current.get(`${tx},${ty}`);
  if (tracked && Number.isFinite(tracked.current) && Number.isFinite(tracked.max)) {
    return tracked;
  }
  const base = TILE_BASE_HP[type];
  if (!Number.isFinite(base)) return null;
  return { current: base, max: base };
}

export function getFrontTileInfo({ localPlayerRef, mapDataRef, tileHpRef }) {
  const player = localPlayerRef.current;
  if (!player.ready) {
    return { name: "Unknown", color: "#253140", coords: null, hp: null };
  }

  const tx = player.tx + player.fx;
  const ty = player.ty + player.fy;
  const type = getLoadedTileType(mapDataRef, tx, ty);
  if (type == null) {
    return { name: "Unknown", color: "#253140", coords: { x: tx, y: ty }, hp: null };
  }

  const display = TILE_DISPLAY[type] || { name: `Tile ${type}`, color: "#253140" };
  return {
    ...display,
    coords: { x: tx, y: ty },
    hp: getTrackedTileHp(tileHpRef, tx, ty, type)
  };
}
