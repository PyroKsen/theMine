export function isTileWithinView({ tx, ty, localPlayer, viewRadiusTiles }) {
  if (!localPlayer?.ready) return false;
  const dx = tx - localPlayer.tx;
  const dy = ty - localPlayer.ty;
  return dx * dx + dy * dy <= viewRadiusTiles * viewRadiusTiles;
}

export function chunkIntersectsView({ cx, cy, localPlayer, mapData, defaultChunkSize, viewRadiusTiles }) {
  if (!localPlayer?.ready) return false;

  const { w, h, chunk } = mapData;
  const chunkSize = chunk || defaultChunkSize;
  const x0 = cx * chunkSize;
  const y0 = cy * chunkSize;
  const x1 = Math.min(x0 + chunkSize - 1, w - 1);
  const y1 = Math.min(y0 + chunkSize - 1, h - 1);
  const nx = Math.max(x0, Math.min(localPlayer.tx, x1));
  const ny = Math.max(y0, Math.min(localPlayer.ty, y1));
  const dx = localPlayer.tx - nx;
  const dy = localPlayer.ty - ny;
  return dx * dx + dy * dy <= viewRadiusTiles * viewRadiusTiles;
}

export function setChunkGraphicVisibility({ graphic, cx, cy, intersectsView }) {
  if (!graphic) return;
  graphic.visible = intersectsView(cx, cy);
}

export function syncChunkVisibility({ terrainChunks, buildingChunks, setGraphicVisibility }) {
  for (const [key, graphic] of terrainChunks.entries()) {
    const [cx, cy] = key.split(",").map((value) => Number(value));
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    setGraphicVisibility(graphic, cx, cy);
  }
  for (const [key, graphic] of buildingChunks.entries()) {
    const [cx, cy] = key.split(",").map((value) => Number(value));
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    setGraphicVisibility(graphic, cx, cy);
  }
}
