import { Graphics } from "pixi.js";

export function createBombSprite({ x, y, type, tile }) {
  const sprite = new Graphics();
  const color =
    type === "plasmabomb"
      ? 0x6f5bff
      : type === "electrobomb"
      ? 0x35d4ff
      : 0x1b1f24;
  sprite.beginFill(color, 0.95);
  sprite.drawCircle(0, 0, Math.max(4, tile * 0.2));
  sprite.endFill();
  sprite.lineStyle(2, 0xff8f4a, 0.9);
  sprite.drawCircle(0, 0, Math.max(5, tile * 0.24));
  sprite.position.set((x + 0.5) * tile, (y + 0.5) * tile);
  return sprite;
}
