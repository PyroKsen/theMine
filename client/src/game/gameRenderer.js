import { Application, Container, Graphics } from "pixi.js";
import {
  CAMERA_ZOOM,
  COLORS,
  DEFAULT_MAP,
  INTERPOLATION_DELAY,
  TILE_TYPES,
  VIEW_RADIUS_TILES
} from "./constants.js";
import { drawTerrainChunk as drawTerrainChunkInternal } from "./render/terrainChunks.js";
import { drawBuildingChunk as drawBuildingChunkInternal } from "./render/buildingChunks.js";
import { updateCamera } from "./render/camera.js";
import { updateEffects } from "./render/effects.js";
import { updatePlayers } from "./render/players.js";
import { updatePlacementPreview } from "./render/placement.js";
import { hydrateExploredCache as hydrateExploredCacheInternal, pushSnapshot as pushSnapshotInternal } from "./render/snapshots.js";
import { createBombSprite as createBombSpriteInternal } from "./render/bombs.js";
import {
  chunkIntersectsView as chunkIntersectsViewInternal,
  isTileWithinView as isTileWithinViewInternal,
  setChunkGraphicVisibility as setChunkGraphicVisibilityInternal,
  syncChunkVisibility as syncChunkVisibilityInternal
} from "./render/visibility.js";
import { chunkKey, lerp } from "./helpers.js";

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


  function setChunkGraphicVisibility(graphic, cx, cy) {
    return setChunkGraphicVisibilityInternal({
      graphic,
      cx,
      cy,
      intersectsView: chunkIntersectsView
    });
  }

  function drawTerrainChunk(cx, cy) {
    return drawTerrainChunkInternal({
      cx,
      cy,
      mapDataRef,
      state,
      terrain,
      terrainChunks,
      setChunkGraphicVisibility
    });
  }

  function drawBuildingChunk(cx, cy) {
    return drawBuildingChunkInternal({
      cx,
      cy,
      mapDataRef,
      state,
      buildingLayer,
      buildingChunks,
      setChunkGraphicVisibility
    });
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
    return hydrateExploredCacheInternal({
      state,
      mapDataRef,
      exploredChunksRef,
      staleChunksRef,
      loadedChunksRef,
      username: usernameRef.current,
      storeChunk,
      drawTerrainChunk,
      drawBuildingChunk,
      requestMapDraw
    });
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

  function syncChunkVisibility() {
    return syncChunkVisibilityInternal({
      terrainChunks,
      buildingChunks,
      setGraphicVisibility: setChunkGraphicVisibility
    });
  }

  function isTileWithinView(tx, ty) {
    return isTileWithinViewInternal({
      tx,
      ty,
      localPlayer: localPlayerRef.current,
      viewRadiusTiles: VIEW_RADIUS_TILES
    });
  }

  function chunkIntersectsView(cx, cy) {
    return chunkIntersectsViewInternal({
      cx,
      cy,
      localPlayer: localPlayerRef.current,
      mapData: mapDataRef.current,
      defaultChunkSize: DEFAULT_MAP.chunk,
      viewRadiusTiles: VIEW_RADIUS_TILES
    });
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

  function updatePlacement() {
    return updatePlacementPreview({
      selectedItemId: selectedItemRef.current,
      mapOpen: mapOpenRef.current,
      placement: placementRef.current,
      placementLayer,
      localPlayer: localPlayerRef.current,
      state,
      isCellEmpty
    });
  }

  function createBombSprite(x, y, type) {
    return createBombSpriteInternal({ x, y, type, tile: state.map.tile });
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
    return pushSnapshotInternal({
      msg,
      state,
      mapDataRef,
      requestMapDraw,
      setPlayerCount,
      setCoords,
      localPlayerRef,
      chunkIntersectsView,
      chunkRequestTimeRef,
      staleChunksRef,
      loadedChunksRef,
      requestChunks,
      syncChunkVisibility,
      updateBuildingWindows
    });
  }

  function render() {
    const dtMs = app?.ticker?.deltaMS ?? 16;
    updateEffects({
      dtMs,
      effects,
      effectsLayer,
      smokeEmitters,
      buildings: buildingsRef.current || [],
      tile: state.map.tile
    });

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

    const { localPosition } = updatePlayers({
      older,
      newer,
      t,
      dtMs,
      state,
      playersLayer
    });

    updateCamera({
      camera,
      localPosition,
      world,
      app,
      dtMs
    });

    updatePlacement();
  }

  function mount() {
    if (!container) return;

    app = new Application({
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: COLORS.background,
      antialias: false,
      powerPreference: "low-power"
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
    if (app.ticker) {
      app.ticker.maxFPS = 60;
    }
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






