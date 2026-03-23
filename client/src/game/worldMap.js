import { TILE_TYPES, VIEW_RADIUS_TILES } from "./constants.js";
import { darkenHexColor } from "./render/tileDrawing.js";
import { getTileHexColor, isBuiltBlockTile } from "./render/tileColors.js";

const terrainChunkCanvasCache = new Map();
const buildingChunkCanvasCache = new Map();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function chunkCacheKey(kind, cx, cy) {
  return `${kind}:${cx},${cy}`;
}

export function resetWorldMapChunkCache() {
  terrainChunkCanvasCache.clear();
  buildingChunkCanvasCache.clear();
}

export function invalidateWorldMapChunkCache(cx, cy) {
  terrainChunkCanvasCache.delete(chunkCacheKey("terrain", cx, cy));
  buildingChunkCanvasCache.delete(chunkCacheKey("building", cx, cy));
}

function chunkIntersectsViewport(chunk, chunkSize, worldW, worldH, originX, originY, scale, width, height) {
  const startX = originX + chunk.cx * chunkSize * scale;
  const startY = originY + chunk.cy * chunkSize * scale;
  const drawW = Math.min(chunkSize, worldW - chunk.cx * chunkSize) * scale;
  const drawH = Math.min(chunkSize, worldH - chunk.cy * chunkSize) * scale;
  return startX < width && startY < height && startX + drawW > 0 && startY + drawH > 0;
}

function getTileMapColor(type) {
  return getTileHexColor(type);
}

function getTerrainChunkCanvas(chunk) {
  const key = chunkCacheKey("terrain", chunk.cx, chunk.cy);
  const cached = terrainChunkCanvasCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, chunk.w);
  canvas.height = Math.max(1, chunk.h);
  const ctx = canvas.getContext("2d", { alpha: true });

  for (let y = 0; y < chunk.h; y += 1) {
    for (let x = 0; x < chunk.w; x += 1) {
      const type = chunk.data[y * chunk.w + x];
      if (type === TILE_TYPES.dropBox) {
        ctx.fillStyle = "#d4b468";
        ctx.fillRect(x, y, 1, 1);
        continue;
      }
      const color = getTileMapColor(type);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  terrainChunkCanvasCache.set(key, canvas);
  return canvas;
}

function getBuildingChunkCanvas(chunk) {
  const key = chunkCacheKey("building", chunk.cx, chunk.cy);
  const cached = buildingChunkCanvasCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, chunk.w);
  canvas.height = Math.max(1, chunk.h);
  const ctx = canvas.getContext("2d", { alpha: true });
  ctx.fillStyle = "#c8ced9";

  for (let y = 0; y < chunk.h; y += 1) {
    for (let x = 0; x < chunk.w; x += 1) {
      if (chunk.data[y * chunk.w + x]) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  buildingChunkCanvasCache.set(key, canvas);
  return canvas;
}

export function drawWorldMapCanvas({
  wrap,
  canvas,
  mapData,
  mapView,
  exploredChunks,
  localPlayer,
  chunkKey
}) {
  if (!wrap || !canvas) return;
  const ctx = canvas.getContext("2d");
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;
  if (width === 0 || height === 0) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  ctx.clearRect(0, 0, width, height);

  const { w, h, chunk: chunkSize, tiles, buildings, players, playerId } = mapData;
  if (!w || !h) return;
  const baseScale = Math.min(width / w, height / h);
  const scale = baseScale * mapView.zoom;
  const originX = (width - w * scale) / 2 + mapView.panX;
  const originY = (height - h * scale) / 2 + mapView.panY;

  ctx.fillStyle = "#141c25";
  ctx.fillRect(originX, originY, w * scale, h * scale);

  if (tiles) {
    for (const chunk of tiles.values()) {
      if (!chunkIntersectsViewport(chunk, chunkSize, w, h, originX, originY, scale, width, height)) {
        continue;
      }
      const startX = chunk.cx * chunkSize;
      const startY = chunk.cy * chunkSize;
      const drawX = originX + startX * scale;
      const drawY = originY + startY * scale;
      const drawW = Math.min(chunkSize, w - startX) * scale;
      const drawH = Math.min(chunkSize, h - startY) * scale;

      if (scale <= 4) {
        ctx.drawImage(getTerrainChunkCanvas(chunk), drawX, drawY, drawW, drawH);
        continue;
      }

      for (let y = 0; y < chunk.h; y += 1) {
        for (let x = 0; x < chunk.w; x += 1) {
          const type = chunk.data[y * chunk.w + x];
          if (type === TILE_TYPES.dropBox) {
            const cx = originX + (startX + x + 0.5) * scale;
            const cy = originY + (startY + y + 0.5) * scale;
            const half = Math.max(0.5, scale / 2);
            ctx.beginPath();
            ctx.moveTo(cx, cy - half);
            ctx.lineTo(cx + half, cy);
            ctx.lineTo(cx, cy + half);
            ctx.lineTo(cx - half, cy);
            ctx.closePath();
            ctx.fillStyle = "#d4b468";
            ctx.fill();
            continue;
          }
          const color = getTileMapColor(type);
          if (!color) continue;
          const tileX = originX + (startX + x) * scale;
          const tileY = originY + (startY + y) * scale;
          ctx.fillStyle = color;
          ctx.fillRect(tileX, tileY, scale, scale);
          if (isBuiltBlockTile(type) && scale >= 3) {
            const inset = Math.max(0.75, scale * 0.18);
            ctx.strokeStyle = darkenHexColor(color, 0.66);
            ctx.lineWidth = Math.max(1, scale * 0.12);
            ctx.beginPath();
            ctx.moveTo(tileX + inset, tileY + inset);
            ctx.lineTo(tileX + scale - inset, tileY + scale - inset);
            ctx.moveTo(tileX + scale - inset, tileY + inset);
            ctx.lineTo(tileX + inset, tileY + scale - inset);
            ctx.stroke();
          }
        }
      }
    }
  }

  if (buildings) {
    ctx.fillStyle = "#c8ced9";
    for (const chunk of buildings.values()) {
      if (!chunkIntersectsViewport(chunk, chunkSize, w, h, originX, originY, scale, width, height)) {
        continue;
      }
      const startX = chunk.cx * chunkSize;
      const startY = chunk.cy * chunkSize;
      const drawX = originX + startX * scale;
      const drawY = originY + startY * scale;
      const drawW = Math.min(chunkSize, w - startX) * scale;
      const drawH = Math.min(chunkSize, h - startY) * scale;

      if (scale <= 4) {
        ctx.drawImage(getBuildingChunkCanvas(chunk), drawX, drawY, drawW, drawH);
        continue;
      }

      for (let y = 0; y < chunk.h; y += 1) {
        for (let x = 0; x < chunk.w; x += 1) {
          if (chunk.data[y * chunk.w + x]) {
            ctx.fillRect(originX + (startX + x) * scale, originY + (startY + y) * scale, scale, scale);
          }
        }
      }
    }
  }

  const maxCx = Math.ceil(w / chunkSize);
  const maxCy = Math.ceil(h / chunkSize);
  ctx.fillStyle = "#000000";
  for (let cy = 0; cy < maxCy; cy += 1) {
    for (let cx = 0; cx < maxCx; cx += 1) {
      if (exploredChunks.has(chunkKey(cx, cy))) continue;
      const startX = cx * chunkSize * scale + originX;
      const startY = cy * chunkSize * scale + originY;
      const fogW = Math.min(chunkSize, w - cx * chunkSize) * scale;
      const fogH = Math.min(chunkSize, h - cy * chunkSize) * scale;
      if (startX >= width || startY >= height || startX + fogW <= 0 || startY + fogH <= 0) {
        continue;
      }
      ctx.fillRect(startX, startY, fogW, fogH);
    }
  }

  const radius = Math.max(2, Math.min(6, scale * 0.4));
  for (const [id, player] of players.entries()) {
    if (!localPlayer.ready) continue;
    const dx = player.tx - localPlayer.tx;
    const dy = player.ty - localPlayer.ty;
    if (dx * dx + dy * dy > VIEW_RADIUS_TILES * VIEW_RADIUS_TILES) continue;
    const px = originX + (player.tx + 0.5) * scale;
    const py = originY + (player.ty + 0.5) * scale;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = id === playerId ? "#ff4d4d" : "#7dd3fc";
    ctx.fill();
  }
}

export function applyMapZoom({ wrap, mapData, mapView, clientX, clientY, factor }) {
  if (!wrap) return false;
  const { w, h } = mapData;
  if (!w || !h) return false;

  const rect = wrap.getBoundingClientRect();
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;
  const baseScale = Math.min(width / w, height / h);
  const prevScale = baseScale * mapView.zoom;
  const originX = (width - w * prevScale) / 2 + mapView.panX;
  const originY = (height - h * prevScale) / 2 + mapView.panY;

  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;
  const worldX = (screenX - originX) / prevScale;
  const worldY = (screenY - originY) / prevScale;

  const nextZoom = clamp(mapView.zoom * factor, 0.1, 12);
  const nextScale = baseScale * nextZoom;
  const nextOriginX = screenX - worldX * nextScale;
  const nextOriginY = screenY - worldY * nextScale;
  mapView.panX = nextOriginX - (width - w * nextScale) / 2;
  mapView.panY = nextOriginY - (height - h * nextScale) / 2;
  mapView.zoom = nextZoom;
  return true;
}

export function getMapHoverPosition({ wrap, mapData, mapView, clientX, clientY }) {
  if (!wrap) return { x: null, y: null, inside: false };
  const { w, h } = mapData;
  if (!w || !h) return { x: null, y: null, inside: false };

  const rect = wrap.getBoundingClientRect();
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;
  if (width === 0 || height === 0) return { x: null, y: null, inside: false };

  const baseScale = Math.min(width / w, height / h);
  const scale = baseScale * mapView.zoom;
  const originX = (width - w * scale) / 2 + mapView.panX;
  const originY = (height - h * scale) / 2 + mapView.panY;
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;
  const worldX = (screenX - originX) / scale;
  const worldY = (screenY - originY) / scale;
  const inside = worldX >= 0 && worldY >= 0 && worldX < w && worldY < h;
  if (!inside) {
    return { x: null, y: null, inside: false };
  }
  return {
    x: Math.floor(worldX),
    y: Math.floor(worldY),
    inside: true
  };
}
