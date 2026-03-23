import { DEFAULT_MAP } from "../constants.js";
import { invalidateWorldMapChunkCache, resetWorldMapChunkCache } from "../worldMap.js";
import { chunkKey, decodeBase64, normalizeSkillConfig, normalizeSkillSlots } from "../helpers.js";
import { toHp, toInventory, toWallet } from "./stateMappers.js";

export function createWorldHandlers({
  state,
  usernameRef,
  mapDataRef,
  mapOpenRef,
  hydrateCacheRef,
  loadedChunksRef,
  staleChunksRef,
  exploredChunksRef,
  chunkRequestTimeRef,
  buildingsRef,
  tileHpRef,
  setWallet,
  setHp,
  setInventory,
  setRespawnBuildingId,
  setSkillConfig,
  setSkills,
  setSkillSlots,
  applyItems,
  updateBuildingWindows,
  requestMapDraw,
  drawGrid,
  drawTerrain,
  drawBuildings,
  pushSnapshot,
  storeChunk,
  drawTerrainChunk,
  drawBuildingChunk,
  setChunkValue,
  isTileWithinView,
  saveCachedChunk,
  requestChunks
}) {
  function upsertBuilding(building) {
    if (!building?.id) return;
    const next = [...buildingsRef.current];
    const index = next.findIndex((entry) => entry.id === building.id);
    if (index >= 0) {
      next[index] = building;
    } else {
      next.push(building);
    }
    buildingsRef.current = next;
  }

  function removeBuilding(id) {
    buildingsRef.current = buildingsRef.current.filter(
      (building) => building.id !== id
    );
  }

  function markChunkStale(cx, cy) {
    const key = chunkKey(cx, cy);
    staleChunksRef.current.add(key);
    loadedChunksRef.current.delete(key);
    invalidateWorldMapChunkCache(cx, cy);
  }

  function refreshChunkIfNeeded(cx, cy) {
    markChunkStale(cx, cy);
    if (typeof requestChunks === "function") {
      requestChunks([{ cx, cy }], { force: true });
    }
  }

  function handleWelcome(msg) {
    if (msg.username) {
      usernameRef.current = String(msg.username);
    }
    state.playerId = msg.id;
    mapDataRef.current.playerId = msg.id;
    state.serverTimeOffset = performance.now() - msg.time;
    if (msg.map) {
      state.map = { ...state.map, ...msg.map };
      mapDataRef.current.w = state.map.w;
      mapDataRef.current.h = state.map.h;
      mapDataRef.current.chunk = state.map.chunk || DEFAULT_MAP.chunk;
      mapDataRef.current.tiles = new Map();
      mapDataRef.current.buildings = new Map();
      resetWorldMapChunkCache();
      loadedChunksRef.current.clear();
      staleChunksRef.current.clear();
      exploredChunksRef.current.clear();
      chunkRequestTimeRef.current.clear();
      drawGrid();
      drawTerrain();
      drawBuildings();
      requestMapDraw();
    }
    if (msg.wallet) {
      setWallet(toWallet(msg.wallet));
    }
    if (msg.hp) {
      setHp(toHp(msg.hp));
    }
    if (msg.inventory) {
      setInventory(toInventory(msg.inventory));
    }
    setRespawnBuildingId(String(msg.respawnBuildingId || "") || null);
    if (msg.skillConfig) {
      setSkillConfig(normalizeSkillConfig(msg.skillConfig));
    }
    if (msg.skills) {
      setSkills(msg.skills);
    }
    if (Array.isArray(msg.skillSlots)) {
      setSkillSlots(normalizeSkillSlots(msg.skillSlots));
    }
    if (Array.isArray(msg.items)) {
      applyItems(msg.items);
    }
    if (Array.isArray(msg.buildings)) {
      buildingsRef.current = msg.buildings;
      updateBuildingWindows();
    }
    if (Array.isArray(msg.explored)) {
      exploredChunksRef.current = new Set(
        msg.explored
          .map((entry) => {
            const cx = Number(entry?.cx);
            const cy = Number(entry?.cy);
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
            return chunkKey(cx, cy);
          })
          .filter(Boolean)
      );
      if (mapOpenRef.current && hydrateCacheRef.current) {
        hydrateCacheRef.current();
      } else if (mapOpenRef.current) {
        requestMapDraw();
      }
    }
  }

  function handleMapChunk(msg) {
    const cx = Number(msg.cx);
    const cy = Number(msg.cy);
    const w = Number(msg.w);
    const h = Number(msg.h);
    if (
      !Number.isFinite(cx) ||
      !Number.isFinite(cy) ||
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      !msg.tiles ||
      !msg.buildings
    ) {
      return;
    }

    const tiles = decodeBase64(msg.tiles);
    const buildings = decodeBase64(msg.buildings);
    storeChunk(mapDataRef.current.tiles, cx, cy, w, h, tiles);
    storeChunk(mapDataRef.current.buildings, cx, cy, w, h, buildings);
    invalidateWorldMapChunkCache(cx, cy);
    loadedChunksRef.current.add(chunkKey(cx, cy));
    staleChunksRef.current.delete(chunkKey(cx, cy));
    exploredChunksRef.current.add(chunkKey(cx, cy));
    saveCachedChunk(usernameRef.current, cx, cy, msg.tiles, msg.buildings);
    drawTerrainChunk(cx, cy);
    drawBuildingChunk(cx, cy);
    requestMapDraw();
  }

  function handleTile(msg) {
    const chunkSize = mapDataRef.current.chunk || DEFAULT_MAP.chunk;
    const cx = Math.floor(Number(msg.x) / chunkSize);
    const cy = Math.floor(Number(msg.y) / chunkSize);
    const key = chunkKey(cx, cy);
    const hasChunk = mapDataRef.current.tiles.has(key);

    tileHpRef.current.delete(`${msg.x},${msg.y}`);
    const inView = isTileWithinView(msg.x, msg.y);
    if (!inView) {
      markChunkStale(cx, cy);
      return;
    }

    if (!hasChunk) {
      refreshChunkIfNeeded(cx, cy);
      return;
    }

    const updated = setChunkValue(
      mapDataRef.current.tiles,
      msg.x,
      msg.y,
      msg.value
    );
    if (updated) {
      invalidateWorldMapChunkCache(updated.cx, updated.cy);
      drawTerrainChunk(updated.cx, updated.cy);
      requestMapDraw();
    } else {
      refreshChunkIfNeeded(cx, cy);
    }
  }

  function handleBuildingPlace(msg) {
    if (Array.isArray(msg.tiles)) {
      const touched = new Set();
      for (const tile of msg.tiles) {
        const chunkSize = mapDataRef.current.chunk || DEFAULT_MAP.chunk;
        const cx = Math.floor(Number(tile.x) / chunkSize);
        const cy = Math.floor(Number(tile.y) / chunkSize);
        const key = chunkKey(cx, cy);
        const inView = isTileWithinView(tile.x, tile.y);
        if (!inView) {
          markChunkStale(cx, cy);
          continue;
        }
        if (!mapDataRef.current.buildings.has(key)) {
          refreshChunkIfNeeded(cx, cy);
          continue;
        }
        const updated = setChunkValue(
          mapDataRef.current.buildings,
          tile.x,
          tile.y,
          tile.value
        );
        if (updated) {
          invalidateWorldMapChunkCache(updated.cx, updated.cy);
          touched.add(chunkKey(updated.cx, updated.cy));
        } else {
          refreshChunkIfNeeded(cx, cy);
        }
      }
      for (const key of touched) {
        const [cx, cy] = key.split(",").map((value) => Number(value));
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
          drawBuildingChunk(cx, cy);
        }
      }
      if (touched.size > 0) {
        requestMapDraw();
      }
    }
    if (msg.building) {
      upsertBuilding(msg.building);
      updateBuildingWindows();
    }
  }

  function handleBuildingUpdate(msg) {
    if (!msg.building) return;
    upsertBuilding(msg.building);
    updateBuildingWindows();
    requestMapDraw();
  }

  function handleBuildingDestroyed(msg) {
    const touched = new Set();
    if (Array.isArray(msg.tiles)) {
      for (const tile of msg.tiles) {
        const chunkSize = mapDataRef.current.chunk || DEFAULT_MAP.chunk;
        const cx = Math.floor(Number(tile.x) / chunkSize);
        const cy = Math.floor(Number(tile.y) / chunkSize);
        const inView = isTileWithinView(tile.x, tile.y);
        if (!inView) {
          markChunkStale(cx, cy);
          continue;
        }
        const updated = setChunkValue(
          mapDataRef.current.buildings,
          tile.x,
          tile.y,
          tile.value
        );
        if (updated) {
          invalidateWorldMapChunkCache(updated.cx, updated.cy);
          touched.add(chunkKey(updated.cx, updated.cy));
        } else {
          refreshChunkIfNeeded(cx, cy);
        }
      }
    }
    for (const key of touched) {
      const [cx, cy] = key.split(",").map((value) => Number(value));
      if (Number.isFinite(cx) && Number.isFinite(cy)) {
        drawBuildingChunk(cx, cy);
      }
    }
    removeBuilding(String(msg.id || ""));
    updateBuildingWindows();
    requestMapDraw();
  }

  return {
    handleWelcome,
    handleMapChunk,
    handleTile,
    handleBuildingPlace,
    handleBuildingUpdate,
    handleBuildingDestroyed
  };
}
