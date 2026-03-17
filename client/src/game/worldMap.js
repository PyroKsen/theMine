import { TILE_TYPES, VIEW_RADIUS_TILES } from "./constants.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}


function isBuiltBlockTile(type) {
  return (
    type === TILE_TYPES.buildGreen ||
    type === TILE_TYPES.buildYellow ||
    type === TILE_TYPES.buildRed
  );
}

function darkenHexColor(hex, factor = 0.72) {
  const safe = Math.max(0, Math.min(1, factor));
  const value = String(hex || "#000000").replace("#", "");
  const padded = value.length === 3
    ? value.split("").map((part) => part + part).join("")
    : value.padStart(6, "0");
  const r = Math.max(0, Math.min(255, Math.round(parseInt(padded.slice(0, 2), 16) * safe)));
  const g = Math.max(0, Math.min(255, Math.round(parseInt(padded.slice(2, 4), 16) * safe)));
  const b = Math.max(0, Math.min(255, Math.round(parseInt(padded.slice(4, 6), 16) * safe)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
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
      const startX = chunk.cx * chunkSize;
      const startY = chunk.cy * chunkSize;
      for (let y = 0; y < chunk.h; y += 1) {
        for (let x = 0; x < chunk.w; x += 1) {
          const type = chunk.data[y * chunk.w + x];
          let color = null;
          if (type === TILE_TYPES.rock) color = "#2b0f4d";
          if (type === TILE_TYPES.crystalGreen) color = "#38d86b";
          if (type === TILE_TYPES.crystalBlue) color = "#4da3ff";
          if (type === TILE_TYPES.crystalWhite) color = "#f0f4ff";
          if (type === TILE_TYPES.crystalRed) color = "#ff5d5d";
          if (type === TILE_TYPES.crystalPink) color = "#ff7fd6";
          if (type === TILE_TYPES.crystalCyan) color = "#5ee9ff";
          if (type === TILE_TYPES.blackRock) color = "#0b0b0f";
          if (type === TILE_TYPES.redRock) color = "#7a0f0f";
          if (type === TILE_TYPES.semiMagneticRock) color = "#5f4b2b";
          if (type === TILE_TYPES.magneticRock) color = "#7f6816";
          if (type === TILE_TYPES.acidRock) color = "#1d4f2f";
          if (type === TILE_TYPES.buildGreen) color = "#3bd97a";
          if (type === TILE_TYPES.buildYellow) color = "#f9c74f";
          if (type === TILE_TYPES.buildRed) color = "#ff6b6b";
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
          if (color) {
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
  }

  if (buildings) {
    ctx.fillStyle = "#c8ced9";
    for (const chunk of buildings.values()) {
      const startX = chunk.cx * chunkSize;
      const startY = chunk.cy * chunkSize;
      for (let y = 0; y < chunk.h; y += 1) {
        for (let x = 0; x < chunk.w; x += 1) {
          if (chunk.data[y * chunk.w + x]) {
            ctx.fillRect(
              originX + (startX + x) * scale,
              originY + (startY + y) * scale,
              scale,
              scale
            );
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





