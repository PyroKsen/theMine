import { DEFAULT_MAP, VIEW_RADIUS_TILES } from "../constants.js";
import { chunkKey, decodeBase64 } from "../helpers.js";
import { loadChunkCache } from "../chunkCache.js";

export function hydrateExploredCache({
  state,
  mapDataRef,
  exploredChunksRef,
  staleChunksRef,
  loadedChunksRef,
  username,
  storeChunk,
  drawTerrainChunk,
  drawBuildingChunk,
  requestMapDraw
}) {
  const chunkSize = state.map.chunk || DEFAULT_MAP.chunk;
  const { w, h } = mapDataRef.current;
  for (const key of exploredChunksRef.current) {
    if (staleChunksRef.current.has(key)) continue;
    if (loadedChunksRef.current.has(key)) continue;
    const [cx, cy] = key.split(",").map((value) => Number(value));
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    const cached = loadChunkCache(username, cx, cy);
    if (!cached) continue;
    const chunkW = Math.min(chunkSize, w - cx * chunkSize);
    const chunkH = Math.min(chunkSize, h - cy * chunkSize);
    if (chunkW <= 0 || chunkH <= 0) continue;
    const tiles = decodeBase64(cached.tiles);
    const buildings = decodeBase64(cached.buildings);
    storeChunk(mapDataRef.current.tiles, cx, cy, chunkW, chunkH, tiles);
    storeChunk(mapDataRef.current.buildings, cx, cy, chunkW, chunkH, buildings);
    loadedChunksRef.current.add(key);
    staleChunksRef.current.add(key);
    drawTerrainChunk(cx, cy);
    drawBuildingChunk(cx, cy);
  }
  requestMapDraw();
}

export function pushSnapshot({
  msg,
  state,
  mapDataRef,
  requestMapDraw,
  setPlayerCount,
  setCoords,
  localPlayerRef,
  chunkIntersectsView,
  chunkRequestTimeRef,
  staleChunksRef,
  loadedChunksRef,
  requestChunks,
  syncChunkVisibility,
  updateBuildingWindows
}) {
  const map = new Map();
  for (const p of msg.players) {
    map.set(p.id, p);
  }
  state.snapshots.push({ time: msg.time, map });
  mapDataRef.current.players = map;
  mapDataRef.current.playerId = state.playerId;
  requestMapDraw();
  if (state.snapshots.length > 30) {
    state.snapshots.shift();
  }
  setPlayerCount(map.size);
  const me = state.playerId ? map.get(state.playerId) : null;
  if (me) {
    setCoords({ x: me.tx, y: me.ty });
    localPlayerRef.current = {
      ...localPlayerRef.current,
      tx: me.tx,
      ty: me.ty,
      fx: me.fx ?? localPlayerRef.current.fx,
      fy: me.fy ?? localPlayerRef.current.fy,
      ready: true
    };
    const chunkSize = state.map.chunk || DEFAULT_MAP.chunk;
    const minX = Math.max(0, me.tx - VIEW_RADIUS_TILES);
    const maxX = Math.min(state.map.w - 1, me.tx + VIEW_RADIUS_TILES);
    const minY = Math.max(0, me.ty - VIEW_RADIUS_TILES);
    const maxY = Math.min(state.map.h - 1, me.ty + VIEW_RADIUS_TILES);
    const minCx = Math.floor(minX / chunkSize);
    const maxCx = Math.floor(maxX / chunkSize);
    const minCy = Math.floor(minY / chunkSize);
    const maxCy = Math.floor(maxY / chunkSize);
    const now = performance.now();
    const request = [];
    for (let cy = minCy; cy <= maxCy; cy += 1) {
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        if (!chunkIntersectsView(cx, cy)) continue;
        const key = chunkKey(cx, cy);
        const isStale = staleChunksRef.current.has(key);
        if (loadedChunksRef.current.has(key) && !isStale) continue;
        const last = chunkRequestTimeRef.current.get(key) || 0;
        if (now - last < 800) continue;
        chunkRequestTimeRef.current.set(key, now);
        request.push({ cx, cy });
      }
    }
    if (request.length > 0) {
      const force = request.some(({ cx, cy }) => staleChunksRef.current.has(chunkKey(cx, cy)));
      requestChunks(request, { force });
    }
    syncChunkVisibility();
    updateBuildingWindows();
  } else {
    syncChunkVisibility();
  }
}
