import { Graphics } from "pixi.js";
import { DEFAULT_MAP } from "../constants.js";

export function drawBuildingChunk({ cx, cy, mapDataRef, state, buildingLayer, buildingChunks, setChunkGraphicVisibility }) {
  const key = `${cx},${cy}`;
  const chunk = mapDataRef.current.buildings.get(key);
  if (!chunk || !buildingLayer) return;
  let graphic = buildingChunks.get(key);
  if (!graphic) {
    graphic = new Graphics();
    buildingChunks.set(key, graphic);
    buildingLayer.addChild(graphic);
  }
  graphic.clear();
  setChunkGraphicVisibility(graphic, cx, cy);
  const { tile } = state.map;
  const chunkSize = state.map.chunk || DEFAULT_MAP.chunk;
  const originX = cx * chunkSize * tile;
  const originY = cy * chunkSize * tile;
  graphic.beginFill(0xc8ced9, 0.85);
  for (let y = 0; y < chunk.h; y += 1) {
    for (let x = 0; x < chunk.w; x += 1) {
      if (chunk.data[y * chunk.w + x]) {
        graphic.drawRect(originX + x * tile, originY + y * tile, tile, tile);
      }
    }
  }
  graphic.endFill();
}
