import { Graphics } from "pixi.js";
import { DEFAULT_MAP, TILE_TYPES } from "../constants.js";
import { getTileNumericColor, isBuiltBlockTile, isLivingCrystalTile } from "./tileColors.js";
import { drawBuiltBlockTile, drawLivingCrystalTile, getLivingCrystalPulse } from "./tileDrawing.js";

export function drawTerrainChunk({ cx, cy, mapDataRef, state, terrain, terrainChunks, setChunkGraphicVisibility }) {
  const key = `${cx},${cy}`;
  const chunk = mapDataRef.current.tiles.get(key);
  if (!chunk || !terrain) return;
  let graphic = terrainChunks.get(key);
  if (!graphic) {
    graphic = new Graphics();
    terrainChunks.set(key, graphic);
    terrain.addChild(graphic);
  }
  graphic.clear();
  setChunkGraphicVisibility(graphic, cx, cy);
  const livingPulse = getLivingCrystalPulse();
  const { tile } = state.map;
  const chunkSize = state.map.chunk || DEFAULT_MAP.chunk;
  const originX = cx * chunkSize * tile;
  const originY = cy * chunkSize * tile;
  for (let y = 0; y < chunk.h; y += 1) {
    for (let x = 0; x < chunk.w; x += 1) {
      const type = chunk.data[y * chunk.w + x];
      if (type === TILE_TYPES.dropBox) {
        const centerX = originX + x * tile + tile / 2;
        const centerY = originY + y * tile + tile / 2;
        const half = tile / 2;
        graphic.beginFill(0xd4b468);
        graphic.drawPolygon([
          centerX,
          centerY - half,
          centerX + half,
          centerY,
          centerX,
          centerY + half,
          centerX - half,
          centerY
        ]);
        graphic.endFill();
        continue;
      }
      const color = getTileNumericColor(type);
      if (color === null) continue;
      const tileX = originX + x * tile;
      const tileY = originY + y * tile;
      if (isBuiltBlockTile(type)) {
        drawBuiltBlockTile(graphic, tileX, tileY, tile, color);
      } else if (isLivingCrystalTile(type)) {
        drawLivingCrystalTile(graphic, tileX, tileY, tile, color, livingPulse);
      } else {
        graphic.beginFill(color);
        graphic.drawRect(tileX, tileY, tile, tile);
        graphic.endFill();
      }
    }
  }
}
