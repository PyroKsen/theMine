const {
  MAP_W,
  MAP_H,
  CHUNK_SIZE,
  VIEW_RADIUS_TILES
} = require("./config");

function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseExplored(raw) {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const set = new Set();
    for (const entry of parsed) {
      if (Array.isArray(entry) && entry.length >= 2) {
        const cx = Number(entry[0]);
        const cy = Number(entry[1]);
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
          set.add(chunkKey(cx, cy));
        }
      } else if (typeof entry === "string") {
        const parts = entry.split(",");
        const cx = Number(parts[0]);
        const cy = Number(parts[1]);
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
          set.add(chunkKey(cx, cy));
        }
      }
    }
    return set;
  } catch {
    return new Set();
  }
}

function encodeExplored(set) {
  const list = [];
  for (const key of set) {
    const parts = key.split(",");
    const cx = Number(parts[0]);
    const cy = Number(parts[1]);
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
      list.push([cx, cy]);
    }
  }
  return JSON.stringify(list);
}

function chunkIntersectsView(player, cx, cy) {
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;
  const x1 = Math.min(x0 + CHUNK_SIZE - 1, MAP_W - 1);
  const y1 = Math.min(y0 + CHUNK_SIZE - 1, MAP_H - 1);
  const nx = clamp(player.tx, x0, x1);
  const ny = clamp(player.ty, y0, y1);
  const dx = player.tx - nx;
  const dy = player.ty - ny;
  return dx * dx + dy * dy <= VIEW_RADIUS_TILES * VIEW_RADIUS_TILES;
}

function exploredPayload(set) {
  const list = [];
  for (const key of set) {
    const parts = key.split(",");
    const cx = Number(parts[0]);
    const cy = Number(parts[1]);
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
      list.push({ cx, cy });
    }
  }
  return list;
}

function updateExplored(player) {
  const maxCx = Math.ceil(MAP_W / CHUNK_SIZE) - 1;
  const maxCy = Math.ceil(MAP_H / CHUNK_SIZE) - 1;
  const minX = Math.max(0, player.tx - VIEW_RADIUS_TILES);
  const maxX = Math.min(MAP_W - 1, player.tx + VIEW_RADIUS_TILES);
  const minY = Math.max(0, player.ty - VIEW_RADIUS_TILES);
  const maxY = Math.min(MAP_H - 1, player.ty + VIEW_RADIUS_TILES);
  const minCx = Math.floor(minX / CHUNK_SIZE);
  const maxCxView = Math.floor(maxX / CHUNK_SIZE);
  const minCy = Math.floor(minY / CHUNK_SIZE);
  const maxCyView = Math.floor(maxY / CHUNK_SIZE);
  const prev = player.exploreBounds;
  if (
    prev &&
    prev.minCx === minCx &&
    prev.maxCx === maxCxView &&
    prev.minCy === minCy &&
    prev.maxCy === maxCyView
  ) {
    return;
  }
  player.exploreBounds = {
    minCx,
    maxCx: maxCxView,
    minCy,
    maxCy: maxCyView
  };
  let changed = false;
  for (let ny = minCy; ny <= maxCyView; ny += 1) {
    if (ny < 0 || ny > maxCy) continue;
    for (let nx = minCx; nx <= maxCxView; nx += 1) {
      if (nx < 0 || nx > maxCx) continue;
      if (!chunkIntersectsView(player, nx, ny)) continue;
      const key = chunkKey(nx, ny);
      if (!player.exploredChunks.has(key)) {
        player.exploredChunks.add(key);
        changed = true;
      }
    }
  }
  if (changed) {
    player.exploredDirty = true;
  }
}

module.exports = {
  chunkKey,
  parseExplored,
  encodeExplored,
  chunkIntersectsView,
  exploredPayload,
  updateExplored
};
