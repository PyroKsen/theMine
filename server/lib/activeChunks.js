const {
  CHUNK_SIZE: DEFAULT_CHUNK_SIZE,
  MAP_W: DEFAULT_MAP_W,
  MAP_H: DEFAULT_MAP_H,
  VIEW_RADIUS_TILES: DEFAULT_VIEW_RADIUS_TILES
} = require("./config");

function createActiveChunkUtils({
  chunkSize = DEFAULT_CHUNK_SIZE,
  mapWidth = DEFAULT_MAP_W,
  mapHeight = DEFAULT_MAP_H,
  viewRadiusTiles = DEFAULT_VIEW_RADIUS_TILES
} = {}) {
  function chunkKey(cx, cy) {
    return `${cx},${cy}`;
  }

  function getPlayerActiveChunkBounds(player, extraRadiusTiles = 0) {
    const radius = viewRadiusTiles + Math.max(0, Number(extraRadiusTiles) || 0);
    const minX = Math.max(0, player.tx - radius);
    const maxX = Math.min(mapWidth - 1, player.tx + radius);
    const minY = Math.max(0, player.ty - radius);
    const maxY = Math.min(mapHeight - 1, player.ty + radius);
    return {
      minCx: Math.floor(minX / chunkSize),
      maxCx: Math.floor(maxX / chunkSize),
      minCy: Math.floor(minY / chunkSize),
      maxCy: Math.floor(maxY / chunkSize)
    };
  }

  function getActiveChunkKeys(players, extraRadiusTiles = 0) {
    const keys = new Set();
    for (const player of players.values()) {
      const bounds = getPlayerActiveChunkBounds(player, extraRadiusTiles);
      for (let cy = bounds.minCy; cy <= bounds.maxCy; cy += 1) {
        for (let cx = bounds.minCx; cx <= bounds.maxCx; cx += 1) {
          keys.add(chunkKey(cx, cy));
        }
      }
    }
    return keys;
  }

  function forEachActiveChunk(players, callback, extraRadiusTiles = 0) {
    const seen = new Set();
    for (const player of players.values()) {
      const bounds = getPlayerActiveChunkBounds(player, extraRadiusTiles);
      for (let cy = bounds.minCy; cy <= bounds.maxCy; cy += 1) {
        for (let cx = bounds.minCx; cx <= bounds.maxCx; cx += 1) {
          const key = chunkKey(cx, cy);
          if (seen.has(key)) continue;
          seen.add(key);
          callback(cx, cy, key);
        }
      }
    }
  }

  return {
    chunkKey,
    getPlayerActiveChunkBounds,
    getActiveChunkKeys,
    forEachActiveChunk
  };
}

module.exports = {
  ...createActiveChunkUtils(),
  createActiveChunkUtils
};
