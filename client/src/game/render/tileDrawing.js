export function darkenNumericColor(color, factor = 0.72) {
  const safe = Math.max(0, Math.min(1, factor));
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 255) * safe)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 255) * safe)));
  const b = Math.max(0, Math.min(255, Math.round((color & 255) * safe)));
  return (r << 16) | (g << 8) | b;
}

export function darkenHexColor(hex, factor = 0.72) {
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

export function getLivingCrystalPulse() {
  const cycleMs = 1800;
  const phase = (performance.now() % cycleMs) / cycleMs;
  return (Math.sin(phase * Math.PI * 2) + 1) / 2;
}

export function drawLivingCrystalTile(graphic, tileX, tileY, size, color, pulse = getLivingCrystalPulse()) {
  const outerAlpha = 0.84 + pulse * 0.16;
  const coreColor = darkenNumericColor(color, 0.58);
  const minInset = size * 0.18;
  const maxInset = size * 0.3;
  const inset = Math.max(2, minInset + (1 - pulse) * (maxInset - minInset));
  graphic.beginFill(color, outerAlpha);
  graphic.drawRect(tileX, tileY, size, size);
  graphic.endFill();
  graphic.beginFill(coreColor, 0.92);
  graphic.drawRect(tileX + inset, tileY + inset, size - inset * 2, size - inset * 2);
  graphic.endFill();
}

export function drawBuiltBlockTile(graphic, tileX, tileY, size, color) {
  const crossColor = darkenNumericColor(color, 0.66);
  const inset = Math.max(2, size * 0.18);
  const lineWidth = Math.max(1.5, size * 0.12);
  graphic.beginFill(color);
  graphic.drawRect(tileX, tileY, size, size);
  graphic.endFill();
  graphic.lineStyle(lineWidth, crossColor, 0.95);
  graphic.moveTo(tileX + inset, tileY + inset);
  graphic.lineTo(tileX + size - inset, tileY + size - inset);
  graphic.moveTo(tileX + size - inset, tileY + inset);
  graphic.lineTo(tileX + inset, tileY + size - inset);
  graphic.lineStyle(0, 0, 0);
}
