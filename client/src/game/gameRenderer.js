import { Application, Container, Graphics, Text } from "pixi.js";
import {
  CAMERA_ZOOM,
  COLORS,
  DEFAULT_MAP,
  FACING_ROTATIONS,
  INTERPOLATION_DELAY,
  TILE_TYPES,
  VIEW_RADIUS_TILES
} from "./constants.js";
import { loadChunkCache } from "./chunkCache.js";
import { chunkKey, decodeBase64, lerp, smoothTowards } from "./helpers.js";

export function createGameRenderer({
  buildingsRef,
  container,
  chatFocusRef,
  chunkRequestTimeRef,
  exploredChunksRef,
  hydrateCacheRef,
  loadedChunksRef,
  localPlayerRef,
  mapDataRef,
  mapOpenRef,
  placementRef,
  requestChunks,
  requestMapDraw,
  selectedItemRef,
  setCoords,
  setPlayerCount,
  staleChunksRef,
  updateBuildingWindows,
  usernameRef
}) {
  let app = null;
  let world = null;
  let grid = null;
  let gridLines = null;
  let terrain = null;
  let effectsLayer = null;
  let bombsLayer = null;
  let placementLayer = null;
  let buildingLayer = null;
  let playersLayer = null;
  let resizeObserver = null;

  const camera = { x: 0, y: 0, ready: false };
  const effects = [];
  const bombs = new Map();
  const smokeEmitters = new Map();
  const terrainChunks = new Map();
  const buildingChunks = new Map();

  const state = {
    playerId: null,
    map: { ...DEFAULT_MAP },
    serverTimeOffset: 0,
    snapshots: [],
    players: new Map(),
    keys: {
      up: false,
      down: false,
      left: false,
      right: false,
      ctrl: false,
      mine: false
    }
  };

  function storeChunk(map, cx, cy, w, h, data) {
    const key = chunkKey(cx, cy);
    map.set(key, { cx, cy, w, h, data });
  }

  function clearChunkGraphics(chunks, layer) {
    for (const graphic of chunks.values()) {
      layer.removeChild(graphic);
      graphic.destroy();
    }
    chunks.clear();
  }


  function isBuiltBlockTile(type) {
    return (
      type === TILE_TYPES.buildGreen ||
      type === TILE_TYPES.buildYellow ||
      type === TILE_TYPES.buildRed
    );
  }

  function darkenColor(color, factor = 0.72) {
    const safe = Math.max(0, Math.min(1, factor));
    const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 255) * safe)));
    const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 255) * safe)));
    const b = Math.max(0, Math.min(255, Math.round((color & 255) * safe)));
    return (r << 16) | (g << 8) | b;
  }

  function drawBuiltBlockTile(graphic, tileX, tileY, size, color) {
    const crossColor = darkenColor(color, 0.66);
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
  function drawTerrainChunk(cx, cy) {
    const key = chunkKey(cx, cy);
    const chunk = mapDataRef.current.tiles.get(key);
    if (!chunk || !terrain) return;
    let graphic = terrainChunks.get(key);
    if (!graphic) {
      graphic = new Graphics();
      terrainChunks.set(key, graphic);
      terrain.addChild(graphic);
    }
    graphic.clear();
    const { tile } = state.map;
    const chunkSize = state.map.chunk || DEFAULT_MAP.chunk;
    const originX = cx * chunkSize * tile;
    const originY = cy * chunkSize * tile;
    for (let y = 0; y < chunk.h; y += 1) {
      for (let x = 0; x < chunk.w; x += 1) {
        const type = chunk.data[y * chunk.w + x];
        let color = null;
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
        if (type === TILE_TYPES.rock) color = COLORS.rock;
        if (type === TILE_TYPES.crystalGreen) color = 0x38d86b;
        if (type === TILE_TYPES.crystalBlue) color = 0x4da3ff;
        if (type === TILE_TYPES.crystalWhite) color = 0xf0f4ff;
        if (type === TILE_TYPES.crystalRed) color = 0xff5d5d;
        if (type === TILE_TYPES.crystalPink) color = 0xff7fd6;
        if (type === TILE_TYPES.crystalCyan) color = 0x5ee9ff;
        if (type === TILE_TYPES.blackRock) color = 0x0b0b0f;
        if (type === TILE_TYPES.redRock) color = 0x7a0f0f;
        if (type === TILE_TYPES.semiMagneticRock) color = 0x5f4b2b;
        if (type === TILE_TYPES.magneticRock) color = 0x7f6816;
        if (type === TILE_TYPES.acidRock) color = 0x1d4f2f;
        if (type === TILE_TYPES.buildGreen) color = 0x3bd97a;
        if (type === TILE_TYPES.buildYellow) color = 0xf9c74f;
        if (type === TILE_TYPES.buildRed) color = 0xff6b6b;
        if (color !== null) {
          const tileX = originX + x * tile;
          const tileY = originY + y * tile;
          if (isBuiltBlockTile(type)) {
            drawBuiltBlockTile(graphic, tileX, tileY, tile, color);
          } else {
            graphic.beginFill(color);
            graphic.drawRect(tileX, tileY, tile, tile);
            graphic.endFill();
          }
        }
      }
    }
  }

  function drawBuildingChunk(cx, cy) {
    const key = chunkKey(cx, cy);
    const chunk = mapDataRef.current.buildings.get(key);
    if (!chunk || !buildingLayer) return;
    let graphic = buildingChunks.get(key);
    if (!graphic) {
      graphic = new Graphics();
      buildingChunks.set(key, graphic);
      buildingLayer.addChild(graphic);
    }
    graphic.clear();
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

  function setChunkValue(map, x, y, value) {
    const chunkSize = state.map.chunk || DEFAULT_MAP.chunk;
    const cx = Math.floor(x / chunkSize);
    const cy = Math.floor(y / chunkSize);
    const key = chunkKey(cx, cy);
    const chunk = map.get(key);
    if (!chunk) return null;
    const lx = x - cx * chunkSize;
    const ly = y - cy * chunkSize;
    if (lx < 0 || ly < 0 || lx >= chunk.w || ly >= chunk.h) return null;
    chunk.data[ly * chunk.w + lx] = value;
    return { cx, cy };
  }

  function hydrateExploredCache() {
    const chunkSize = state.map.chunk || DEFAULT_MAP.chunk;
    const { w, h } = mapDataRef.current;
    for (const key of exploredChunksRef.current) {
      if (staleChunksRef.current.has(key)) continue;
      if (loadedChunksRef.current.has(key)) continue;
      const [cx, cy] = key.split(",").map((value) => Number(value));
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      const cached = loadChunkCache(usernameRef.current, cx, cy);
      if (!cached) continue;
      const chunkW = Math.min(chunkSize, w - cx * chunkSize);
      const chunkH = Math.min(chunkSize, h - cy * chunkSize);
      if (chunkW <= 0 || chunkH <= 0) continue;
      const tiles = decodeBase64(cached.tiles);
      const buildings = decodeBase64(cached.buildings);
      storeChunk(mapDataRef.current.tiles, cx, cy, chunkW, chunkH, tiles);
      storeChunk(mapDataRef.current.buildings, cx, cy, chunkW, chunkH, buildings);
      loadedChunksRef.current.add(key);
      drawTerrainChunk(cx, cy);
      drawBuildingChunk(cx, cy);
    }
    requestMapDraw();
  }

  hydrateCacheRef.current = hydrateExploredCache;

  function drawGrid() {
    if (!grid || !gridLines) return;
    const { w, h, tile } = state.map;
    grid.clear();
    grid.beginFill(COLORS.background);
    grid.drawRect(0, 0, w * tile, h * tile);
    grid.endFill();
    gridLines.clear();
    gridLines.lineStyle(1, COLORS.grid, 0.9);
    for (let x = 0; x <= w; x += 1) {
      gridLines.moveTo(x * tile, 0);
      gridLines.lineTo(x * tile, h * tile);
    }
    for (let y = 0; y <= h; y += 1) {
      gridLines.moveTo(0, y * tile);
      gridLines.lineTo(w * tile, y * tile);
    }
  }

  function drawTerrain() {
    if (!terrain) return;
    clearChunkGraphics(terrainChunks, terrain);
  }

  function drawBuildings() {
    if (!buildingLayer) return;
    clearChunkGraphics(buildingChunks, buildingLayer);
  }

  function buildingSmokeAnchor(building) {
    if (building.type === "storage" && building.entrance) return building.entrance;
    if (building.type === "shop" && building.center) return building.center;
    if (building.type === "upgrade" && building.center) return building.center;
    if (building.center) return building.center;
    if (building.entrance) return building.entrance;
    return {
      x: (building.x ?? 0) + (building.w ?? 1) / 2,
      y: (building.y ?? 0) + (building.h ?? 1) / 2
    };
  }

  function emitBuildingSmoke(building) {
    if (!effectsLayer) return;
    const { tile } = state.map;
    const anchor = buildingSmokeAnchor(building);
    const puff = new Graphics();
    const radius = Math.max(6, tile * (0.18 + Math.random() * 0.12));
    puff.beginFill(0x535860, 0.42);
    puff.drawCircle(0, 0, radius);
    puff.drawCircle(radius * 0.55, -radius * 0.15, radius * 0.8);
    puff.drawCircle(-radius * 0.45, -radius * 0.2, radius * 0.75);
    puff.endFill();
    puff.position.set(
      (anchor.x + 0.5) * tile + (Math.random() - 0.5) * tile * 0.45,
      (anchor.y + 0.5) * tile - tile * (0.05 + Math.random() * 0.18)
    );
    effectsLayer.addChild(puff);
    effects.push({
      sprite: puff,
      age: 0,
      duration: 3800 + Math.random() * 1800,
      kind: "smoke",
      startX: puff.x,
      startY: puff.y,
      driftX: (Math.random() - 0.5) * tile * 0.6,
      driftY: tile * (1.15 + Math.random() * 0.8),
      startScale: 0.68 + Math.random() * 0.18
    });
  }

  function syncBuildingSmokeEmitters() {
    const nextIds = new Set();
    for (const building of buildingsRef.current || []) {
      if (!building?.id || !building.inactive || (building.hp ?? 0) > 0) {
        continue;
      }
      nextIds.add(building.id);
      if (!smokeEmitters.has(building.id)) {
        smokeEmitters.set(building.id, {
          buildingId: building.id,
          cooldownMs: 40 + Math.random() * 90
        });
      }
    }
    for (const id of smokeEmitters.keys()) {
      if (!nextIds.has(id)) {
        smokeEmitters.delete(id);
      }
    }
  }

  function isTileWithinView(tx, ty) {
    const player = localPlayerRef.current;
    if (!player.ready) return false;
    const dx = tx - player.tx;
    const dy = ty - player.ty;
    return dx * dx + dy * dy <= VIEW_RADIUS_TILES * VIEW_RADIUS_TILES;
  }

  function chunkIntersectsView(cx, cy) {
    const player = localPlayerRef.current;
    if (!player.ready) return false;
    const { w, h, chunk } = mapDataRef.current;
    const chunkSize = chunk || DEFAULT_MAP.chunk;
    const x0 = cx * chunkSize;
    const y0 = cy * chunkSize;
    const x1 = Math.min(x0 + chunkSize - 1, w - 1);
    const y1 = Math.min(y0 + chunkSize - 1, h - 1);
    const nx = Math.max(x0, Math.min(player.tx, x1));
    const ny = Math.max(y0, Math.min(player.ty, y1));
    const dx = player.tx - nx;
    const dy = player.ty - ny;
    return dx * dx + dy * dy <= VIEW_RADIUS_TILES * VIEW_RADIUS_TILES;
  }

  function isCellEmpty(tx, ty) {
    const chunkSize = state.map.chunk || DEFAULT_MAP.chunk;
    const cx = Math.floor(tx / chunkSize);
    const cy = Math.floor(ty / chunkSize);
    const key = chunkKey(cx, cy);
    const tileChunk = mapDataRef.current.tiles.get(key);
    const buildingChunk = mapDataRef.current.buildings.get(key);
    if (!tileChunk || !buildingChunk) return false;
    const lx = tx - cx * chunkSize;
    const ly = ty - cy * chunkSize;
    if (lx < 0 || ly < 0 || lx >= tileChunk.w || ly >= tileChunk.h) {
      return false;
    }
    if (tileChunk.data[ly * tileChunk.w + lx] !== TILE_TYPES.empty) {
      return false;
    }
    if (buildingChunk.data[ly * buildingChunk.w + lx]) return false;
    return !bombs.has(`${tx},${ty}`);
  }

  function isBombSelected() {
    const id = selectedItemRef.current;
    return id === "bomb" || id === "plasmabomb" || id === "electrobomb";
  }

  function isStorageSelected() {
    return selectedItemRef.current === "storage";
  }

  function isShopSelected() {
    return selectedItemRef.current === "shop";
  }

  function isUpgradeSelected() {
    return selectedItemRef.current === "upgrade";
  }

  function isRespawnSelected() {
    return selectedItemRef.current === "respawn";
  }
  function isTeleportSelected() {
    return selectedItemRef.current === "teleport";
  }


  function isBuildingSelected() {
    return (
      isStorageSelected() ||
      isShopSelected() ||
      isRespawnSelected() ||
      isTeleportSelected() ||
      isUpgradeSelected()
    );
  }

  function getFrontTile() {
    const player = localPlayerRef.current;
    if (!player.ready) return null;
    const tx = player.tx + player.fx;
    const ty = player.ty + player.fy;
    if (tx < 0 || tx >= state.map.w || ty < 0 || ty >= state.map.h) {
      return null;
    }
    return { x: tx, y: ty };
  }

  function updatePlacement() {
    const placement = placementRef.current;
    if (mapOpenRef.current || (!isBombSelected() && !isBuildingSelected())) {
      placement.valid = false;
      if (placementLayer) placementLayer.visible = false;
      return;
    }
    const front = getFrontTile();
    if (!front) {
      placement.valid = false;
      if (placementLayer) placementLayer.visible = false;
      return;
    }

    placement.x = front.x;
    placement.y = front.y;

    if (!placementLayer) return;
    const { tile } = state.map;
    placementLayer.clear();

    if (isBombSelected()) {
      const valid = isCellEmpty(front.x, front.y);
      placement.valid = valid;
      placementLayer.beginFill(valid ? 0x38d86b : 0xff5d5d, 0.35);
      placementLayer.drawRect(front.x * tile, front.y * tile, tile, tile);
      placementLayer.endFill();
      placementLayer.visible = true;
      return;
    }

    if (
      isStorageSelected() ||
      isShopSelected() ||
      isRespawnSelected() ||
      isTeleportSelected() ||
      isUpgradeSelected()
    ) {
      const facingUp =
        localPlayerRef.current.fx === 0 && localPlayerRef.current.fy === -1;
      const latest = state.snapshots[state.snapshots.length - 1];
      const occupied = new Set();
      if (latest) {
        for (const p of latest.map.values()) {
          if (p.id !== state.playerId) {
            occupied.add(`${p.tx},${p.ty}`);
          }
        }
      }

      if (isStorageSelected()) {
        const topLeftX = front.x - 1;
        const topLeftY = front.y - 1;
        const width = 3;
        const height = 2;
        let valid = facingUp;
        if (
          topLeftX < 0 ||
          topLeftY < 0 ||
          topLeftX + width > state.map.w ||
          topLeftY + height > state.map.h
        ) {
          valid = false;
        } else {
          const checkX0 = topLeftX - 1;
          const checkY0 = topLeftY - 1;
          const checkX1 = topLeftX + width;
          const checkY1 = topLeftY + height;
          if (
            checkX0 < 0 ||
            checkY0 < 0 ||
            checkX1 >= state.map.w ||
            checkY1 >= state.map.h
          ) {
            valid = false;
          } else {
            for (let y = checkY0; y <= checkY1; y += 1) {
              for (let x = checkX0; x <= checkX1; x += 1) {
                if (!isCellEmpty(x, y) || occupied.has(`${x},${y}`)) {
                  valid = false;
                  break;
                }
              }
              if (!valid) break;
            }
          }
        }

        placement.valid = valid;
        placementLayer.beginFill(valid ? 0x38d86b : 0xff5d5d, 0.35);
        for (let y = topLeftY; y < topLeftY + height; y += 1) {
          for (let x = topLeftX; x < topLeftX + width; x += 1) {
            if (x === front.x && y === front.y) continue;
            placementLayer.drawRect(x * tile, y * tile, tile, tile);
          }
        }
        placementLayer.endFill();
        placementLayer.visible = true;
        return;
      }

      if (isShopSelected()) {
        const radius = 2;
        const topLeftX = front.x - radius;
        const topLeftY = front.y - radius;
        const size = radius * 2 + 1;
        let valid = facingUp;
        if (
          topLeftX < 0 ||
          topLeftY < 0 ||
          topLeftX + size > state.map.w ||
          topLeftY + size > state.map.h
        ) {
          valid = false;
        } else {
          const checkX0 = topLeftX - 1;
          const checkY0 = topLeftY - 1;
          const checkX1 = topLeftX + size;
          const checkY1 = topLeftY + size;
          if (
            checkX0 < 0 ||
            checkY0 < 0 ||
            checkX1 >= state.map.w ||
            checkY1 >= state.map.h
          ) {
            valid = false;
          } else {
            for (let y = checkY0; y <= checkY1; y += 1) {
              for (let x = checkX0; x <= checkX1; x += 1) {
                if (!isCellEmpty(x, y) || occupied.has(`${x},${y}`)) {
                  valid = false;
                  break;
                }
              }
              if (!valid) break;
            }
          }
        }

        placement.valid = valid;
        placementLayer.beginFill(valid ? 0x38d86b : 0xff5d5d, 0.35);
        for (let y = topLeftY; y < topLeftY + size; y += 1) {
          for (let x = topLeftX; x < topLeftX + size; x += 1) {
            const onCross =
              (x === front.x && Math.abs(y - front.y) <= radius) ||
              (y === front.y && Math.abs(x - front.x) <= radius);
            const isCorner =
              (x === topLeftX && y === topLeftY) ||
              (x === topLeftX && y === topLeftY + size - 1) ||
              (x === topLeftX + size - 1 && y === topLeftY) ||
              (x === topLeftX + size - 1 && y === topLeftY + size - 1);
            if (onCross || isCorner) continue;
            placementLayer.drawRect(x * tile, y * tile, tile, tile);
          }
        }
        placementLayer.endFill();
        placementLayer.visible = true;
        return;
      }

      if (isRespawnSelected() || isTeleportSelected()) {
        const topLeftX = front.x - 1;
        const topLeftY = front.y - 2;
        const width = 3;
        const height = 3;
        let valid = facingUp;
        if (
          topLeftX < 0 ||
          topLeftY < 0 ||
          topLeftX + width > state.map.w ||
          topLeftY + height > state.map.h
        ) {
          valid = false;
        } else {
          const checkX0 = topLeftX - 1;
          const checkY0 = topLeftY - 1;
          const checkX1 = topLeftX + width;
          const checkY1 = topLeftY + height;
          if (
            checkX0 < 0 ||
            checkY0 < 0 ||
            checkX1 >= state.map.w ||
            checkY1 >= state.map.h
          ) {
            valid = false;
          } else {
            for (let y = checkY0; y <= checkY1; y += 1) {
              for (let x = checkX0; x <= checkX1; x += 1) {
                if (!isCellEmpty(x, y) || occupied.has(`${x},${y}`)) {
                  valid = false;
                  break;
                }
              }
              if (!valid) break;
            }
          }
        }

        placement.valid = valid;
        placementLayer.beginFill(valid ? 0x38d86b : 0xff5d5d, 0.35);
        for (let y = topLeftY; y < topLeftY + height; y += 1) {
          for (let x = topLeftX; x < topLeftX + width; x += 1) {
            if (x === front.x && y === front.y - 1) continue;
            if (x === front.x && y === front.y) continue;
            placementLayer.drawRect(x * tile, y * tile, tile, tile);
          }
        }
        placementLayer.endFill();
        placementLayer.visible = true;
        return;
      }

      if (isUpgradeSelected()) {
        const topLeftX = front.x - 1;
        const topLeftY = front.y - 2;
        const width = 3;
        const height = 3;
        const topRightX = topLeftX + width - 1;
        let valid = facingUp;
        if (
          topLeftX < 0 ||
          topLeftY < 0 ||
          topLeftX + width > state.map.w ||
          topLeftY + height > state.map.h
        ) {
          valid = false;
        } else {
          const checkX0 = topLeftX - 1;
          const checkY0 = topLeftY - 1;
          const checkX1 = topLeftX + width;
          const checkY1 = topLeftY + height;
          if (
            checkX0 < 0 ||
            checkY0 < 0 ||
            checkX1 >= state.map.w ||
            checkY1 >= state.map.h
          ) {
            valid = false;
          } else {
            for (let y = checkY0; y <= checkY1; y += 1) {
              for (let x = checkX0; x <= checkX1; x += 1) {
                if (!isCellEmpty(x, y) || occupied.has(`${x},${y}`)) {
                  valid = false;
                  break;
                }
              }
              if (!valid) break;
            }
          }
        }

        placement.valid = valid;
        placementLayer.beginFill(valid ? 0x38d86b : 0xff5d5d, 0.35);
        for (let y = topLeftY; y < topLeftY + height; y += 1) {
          for (let x = topLeftX; x < topLeftX + width; x += 1) {
            if (x === front.x && y === front.y) continue;
            if (x === front.x && y === front.y - 1) continue;
            if (y === topLeftY && (x === topLeftX || x === topRightX)) continue;
            placementLayer.drawRect(x * tile, y * tile, tile, tile);
          }
        }
        placementLayer.endFill();
        placementLayer.visible = true;
      }
    }
  }

  function createBombSprite(x, y, type) {
    const { tile } = state.map;
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

  function getPlayerSprite(id) {
    let sprite = state.players.get(id);
    if (!sprite) {
      sprite = new Container();
      const body = new Graphics();
      const color = id === state.playerId ? COLORS.playerSelf : COLORS.player;
      body.beginFill(color);
      body.drawRect(-12, -12, 24, 24);
      body.endFill();
      const facing = new Graphics();
      facing.beginFill(COLORS.facing);
      facing.drawPolygon([0, -18, -5, -10, 5, -10]);
      facing.endFill();
      const label = new Text("", {
        fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
        fontSize: 12,
        fill: COLORS.name,
        stroke: COLORS.nameStroke,
        strokeThickness: 3,
        align: "center"
      });
      if (label.anchor) {
        label.anchor.set(0.5);
      }
      label.position.set(0, -22);
      sprite.body = body;
      sprite.facingGraphic = facing;
      sprite.label = label;
      sprite.renderPos = { x: 0, y: 0, ready: false };
      sprite.addChild(body);
      sprite.addChild(facing);
      sprite.addChild(label);
      playersLayer.addChild(sprite);
      state.players.set(id, sprite);
    }
    return sprite;
  }

  function removeMissingPlayers(activeIds) {
    for (const [id, sprite] of state.players.entries()) {
      if (!activeIds.has(id)) {
        playersLayer.removeChild(sprite);
        sprite.destroy({ children: true });
        state.players.delete(id);
      }
    }
  }

  function updateInputKey(key, pressed) {
    if (chatFocusRef.current) return;
    if (key === "KeyW" || key === "ArrowUp") state.keys.up = pressed;
    if (key === "KeyS" || key === "ArrowDown") state.keys.down = pressed;
    if (key === "KeyA" || key === "ArrowLeft") state.keys.left = pressed;
    if (key === "KeyD" || key === "ArrowRight") state.keys.right = pressed;
    if (key === "ShiftLeft" || key === "ShiftRight") state.keys.shift = pressed;
    if (key === "KeyZ") state.keys.mine = pressed;
  }

  function currentDir() {
    let x = 0;
    let y = 0;
    if (state.keys.left) x -= 1;
    if (state.keys.right) x += 1;
    if (state.keys.up) y -= 1;
    if (state.keys.down) y += 1;
    if (x !== 0 && y !== 0) {
      y = 0;
    }
    return { x, y };
  }

  function pushSnapshot(msg) {
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
        const force = request.some(({ cx, cy }) =>
          staleChunksRef.current.has(chunkKey(cx, cy))
        );
        requestChunks(request, { force });
      }
      updateBuildingWindows();
    }
  }

  function render() {
    const dtMs = app?.ticker?.deltaMS ?? 16;
    syncBuildingSmokeEmitters();
    for (const emitter of smokeEmitters.values()) {
      emitter.cooldownMs -= dtMs;
      if (emitter.cooldownMs > 0) continue;
      const building = (buildingsRef.current || []).find(
        (entry) => entry.id === emitter.buildingId
      );
      if (building && building.inactive && (building.hp ?? 0) <= 0) {
        emitBuildingSmoke(building);
        if (Math.random() > 0.35) {
          emitBuildingSmoke(building);
        }
      }
      emitter.cooldownMs = 80 + Math.random() * 140;
    }
    for (let i = effects.length - 1; i >= 0; i -= 1) {
      const effect = effects[i];
      effect.age += dtMs;
      const t = Math.min(1, effect.age / effect.duration);
      if (t >= 1) {
        effectsLayer.removeChild(effect.sprite);
        effect.sprite.destroy();
        effects.splice(i, 1);
      } else if (effect.kind === "float") {
        effect.sprite.alpha = 1 - t;
        effect.sprite.y = effect.startY - t * 14;
      } else if (effect.kind === "smoke") {
        effect.sprite.alpha = (1 - t) * 0.72;
        effect.sprite.x = effect.startX + effect.driftX * t;
        effect.sprite.y = effect.startY - effect.driftY * t;
        const scale = effect.startScale + t * 1.3;
        effect.sprite.scale.set(scale);
      } else {
        effect.sprite.alpha = 1 - t;
        const scale = 1 + t * 0.6;
        effect.sprite.scale.set(scale);
      }
    }

    if (state.snapshots.length === 0) return;

    const now = performance.now();
    const serverNow = now - state.serverTimeOffset;
    const renderTime = serverNow - INTERPOLATION_DELAY;

    let older = null;
    let newer = null;

    for (let i = state.snapshots.length - 1; i >= 0; i -= 1) {
      const snap = state.snapshots[i];
      if (snap.time <= renderTime) {
        older = snap;
        newer = state.snapshots[i + 1] || snap;
        break;
      }
    }

    if (!older) {
      older = state.snapshots[0];
      newer = state.snapshots[1] || older;
    }

    const span = newer.time - older.time || 1;
    const t = Math.max(0, Math.min(1, (renderTime - older.time) / span));

    const ids = new Set();
    for (const id of older.map.keys()) ids.add(id);
    for (const id of newer.map.keys()) ids.add(id);

    const activeIds = new Set();
    let localPosition = null;
    const selfId = state.playerId;
    const selfA = selfId ? older.map.get(selfId) || newer.map.get(selfId) : null;
    const selfB = selfId ? newer.map.get(selfId) || selfA : null;
    const selfTx = selfA && selfB ? lerp(selfA.tx, selfB.tx, t) : null;
    const selfTy = selfA && selfB ? lerp(selfA.ty, selfB.ty, t) : null;
    const radiusSq = VIEW_RADIUS_TILES * VIEW_RADIUS_TILES;

    const { tile } = state.map;
    for (const id of ids) {
      const a = older.map.get(id) || newer.map.get(id);
      const b = newer.map.get(id) || a;
      if (!a || !b) continue;
      const nextX = lerp(a.tx, b.tx, t);
      const nextY = lerp(a.ty, b.ty, t);
      const x = (nextX + 0.5) * tile;
      const y = (nextY + 0.5) * tile;
      const sprite = getPlayerSprite(id);
      if (selfTx != null && selfTy != null && id !== selfId) {
        const dx = nextX - selfTx;
        const dy = nextY - selfTy;
        sprite.visible = dx * dx + dy * dy <= radiusSq;
      } else {
        sprite.visible = true;
      }
      if (!sprite.renderPos.ready) {
        sprite.renderPos.x = x;
        sprite.renderPos.y = y;
        sprite.renderPos.ready = true;
      } else {
        sprite.renderPos.x = smoothTowards(sprite.renderPos.x, x, dtMs, 90);
        sprite.renderPos.y = smoothTowards(sprite.renderPos.y, y, dtMs, 90);
      }
      sprite.position.set(sprite.renderPos.x, sprite.renderPos.y);

      const fx = b.fx ?? a.fx;
      const fy = b.fy ?? a.fy;
      if (fx !== undefined && fy !== undefined && (fx !== 0 || fy !== 0)) {
        const rot = FACING_ROTATIONS.get(`${fx},${fy}`) ?? 0;
        if (sprite.facingGraphic) {
          sprite.facingGraphic.rotation = rot;
        }
      }
      const name = id === state.playerId ? "" : b.name || a.name || "";
      if (sprite.label && sprite.label.text !== name) {
        sprite.label.text = name;
        if (sprite.label.anchor) {
          sprite.label.anchor.set(0.5);
        } else {
          sprite.label.position.set(-sprite.label.width / 2, -22);
        }
      }

      activeIds.add(id);
      if (id === state.playerId) {
        localPosition = { x: sprite.renderPos.x, y: sprite.renderPos.y };
      }
    }

    removeMissingPlayers(activeIds);

    if (localPosition && app) {
      if (!camera.ready) {
        camera.x = localPosition.x;
        camera.y = localPosition.y;
        camera.ready = true;
      } else {
        const smoothTimeMs = 320;
        const alpha = 1 - Math.exp(-dtMs / smoothTimeMs);
        camera.x += (localPosition.x - camera.x) * alpha;
        camera.y += (localPosition.y - camera.y) * alpha;
      }
      world.pivot.set(camera.x, camera.y);
      world.position.set(app.renderer.width / 2, app.renderer.height / 2);
    }

    updatePlacement();
  }

  function mount() {
    if (!container) return;

    app = new Application({
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: COLORS.background,
      antialias: true
    });
    container.appendChild(app.view);

    world = new Container();
    grid = new Graphics();
    gridLines = new Graphics();
    terrain = new Container();
    buildingLayer = new Container();
    placementLayer = new Graphics();
    placementLayer.visible = false;
    bombsLayer = new Container();
    effectsLayer = new Container();
    playersLayer = new Container();

    drawGrid();
    drawTerrain();
    drawBuildings();

    world.addChild(grid);
    world.addChild(terrain);
    world.addChild(buildingLayer);
    world.addChild(placementLayer);
    world.addChild(effectsLayer);
    world.addChild(gridLines);
    world.addChild(bombsLayer);
    world.addChild(playersLayer);
    world.scale.set(CAMERA_ZOOM);
    app.stage.addChild(world);

    const handleResize = () => {
      if (!app) return;
      app.renderer.resize(container.clientWidth, container.clientHeight);
    };

    resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    app.ticker.add(render);
  }

  function destroy() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (app) {
      app.destroy(true, { children: true });
      app = null;
    }
  }

  return {
    bombs,
    effects,
    get bombsLayer() {
      return bombsLayer;
    },
    get effectsLayer() {
      return effectsLayer;
    },
    state,
    createBombSprite,
    currentDir,
    destroy,
    drawBuildings,
    drawBuildingChunk,
    drawGrid,
    drawTerrain,
    drawTerrainChunk,
    isTileWithinView,
    mount,
    pushSnapshot,
    setChunkValue,
    storeChunk,
    updateInputKey,
    updatePlacement
  };
}





