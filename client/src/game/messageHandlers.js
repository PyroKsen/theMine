import { Graphics, Text } from "pixi.js";
import { DEFAULT_MAP } from "./constants.js";
import {
  chunkKey,
  crystalColor,
  decodeBase64,
  normalizeSkillConfig,
  normalizeSkillSlots
} from "./helpers.js";

function toWallet(wallet) {
  return {
    dollars: Number(wallet?.dollars || 0),
    coins: Number(wallet?.coins || 0)
  };
}

function toHp(hp) {
  return {
    current: Number(hp?.current || 0),
    max: Number(hp?.max || 0)
  };
}

function toInventory(inventory) {
  return {
    green: Number(inventory?.green || 0),
    blue: Number(inventory?.blue || 0),
    white: Number(inventory?.white || 0),
    red: Number(inventory?.red || 0),
    pink: Number(inventory?.pink || 0),
    cyan: Number(inventory?.cyan || 0)
  };
}

function toStorage(storage) {
  return {
    green: Number(storage?.green || 0),
    blue: Number(storage?.blue || 0),
    white: Number(storage?.white || 0),
    red: Number(storage?.red || 0),
    pink: Number(storage?.pink || 0),
    cyan: Number(storage?.cyan || 0)
  };
}

export function createSocketMessageHandler({
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
  storageIdRef,
  bombs,
  bombsLayer,
  effects,
  effectsLayer,
  setWallet,
  setHp,
  setInventory,
  setSuppressRespawnAutoOpen,
  setRespawnBuildingId,
  setSkillConfig,
  setSkills,
  setSkillSlots,
  setDropOpen,
  setDropError,
  setChatMessages,
  setStorageState,
  setTeleportError,
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
  createBombSprite,
  updatePlacement,
  saveCachedChunk,
  resetDropValues,
  requestChunks,
  tileHpRef
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
  }

  function refreshChunkIfNeeded(cx, cy) {
    markChunkStale(cx, cy);
    if (typeof requestChunks === "function") {
      requestChunks([{ cx, cy }], { force: true });
    }
  }

  return (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.t === "welcome") {
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
        loadedChunksRef.current.clear();
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

    if (msg.t === "state") {
      pushSnapshot(msg);
    }

    if (msg.t === "map_chunk") {
      const cx = Number(msg.cx);
      const cy = Number(msg.cy);
      const w = Number(msg.w);
      const h = Number(msg.h);
      if (
        Number.isFinite(cx) &&
        Number.isFinite(cy) &&
        Number.isFinite(w) &&
        Number.isFinite(h) &&
        msg.tiles &&
        msg.buildings
      ) {
        const tiles = decodeBase64(msg.tiles);
        const buildings = decodeBase64(msg.buildings);
        storeChunk(mapDataRef.current.tiles, cx, cy, w, h, tiles);
        storeChunk(mapDataRef.current.buildings, cx, cy, w, h, buildings);
        loadedChunksRef.current.add(chunkKey(cx, cy));
        staleChunksRef.current.delete(chunkKey(cx, cy));
        exploredChunksRef.current.add(chunkKey(cx, cy));
        saveCachedChunk(usernameRef.current, cx, cy, msg.tiles, msg.buildings);
        drawTerrainChunk(cx, cy);
        drawBuildingChunk(cx, cy);
        requestMapDraw();
      }
    }

    if (msg.t === "tile") {
      const chunkSize = mapDataRef.current.chunk || DEFAULT_MAP.chunk;
      const cx = Math.floor(Number(msg.x) / chunkSize);
      const cy = Math.floor(Number(msg.y) / chunkSize);
      const key = chunkKey(cx, cy);
      const hasChunk = mapDataRef.current.tiles.has(key);

      tileHpRef.current.delete(`${msg.x},${msg.y}`);
      const inView = isTileWithinView(msg.x, msg.y);
      if (!inView) {
        markChunkStale(cx, cy);
      } else if (hasChunk) {
        const updated = setChunkValue(
          mapDataRef.current.tiles,
          msg.x,
          msg.y,
          msg.value
        );
        if (updated) {
          drawTerrainChunk(updated.cx, updated.cy);
          requestMapDraw();
        } else {
          refreshChunkIfNeeded(cx, cy);
        }
      } else {
        refreshChunkIfNeeded(cx, cy);
      }
    }

    if (msg.t === "building_place") {
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

    if (msg.t === "building_update" && msg.building) {
      upsertBuilding(msg.building);
      updateBuildingWindows();
      requestMapDraw();
    }

    if (msg.t === "building_destroyed") {
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

    if (msg.t === "bomb_placed") {
      if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
        const key = `${msg.x},${msg.y}`;
        if (!bombs.has(key)) {
          const sprite = createBombSprite(msg.x, msg.y, msg.type);
          bombsLayer.addChild(sprite);
          bombs.set(key, { id: msg.id, sprite, type: msg.type });
          updatePlacement();
        }
      }
    }

    if (msg.t === "bomb_explode") {
      const key = `${msg.x},${msg.y}`;
      const entry = bombs.get(key);
      if (entry) {
        bombsLayer.removeChild(entry.sprite);
        entry.sprite.destroy();
        bombs.delete(key);
      }
      if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
        const { tile } = state.map;
        const blast = new Graphics();
        if (msg.type === "electrobomb") {
          const radius = Math.max(18, tile * (msg.r || 7));
          blast.beginFill(0x6ef2ff, 0.12);
          blast.drawCircle(0, 0, radius);
          blast.endFill();
          blast.lineStyle(4, 0x7ef7ff, 0.95);
          blast.drawCircle(0, 0, radius * 0.55);
          blast.lineStyle(2, 0x24cfff, 0.85);
          blast.drawCircle(0, 0, radius);
          for (let i = 0; i < 10; i += 1) {
            const angle = (Math.PI * 2 * i) / 10;
            const inner = radius * (0.2 + (i % 3) * 0.08);
            const outer = radius * (0.72 + (i % 2) * 0.12);
            blast.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
            blast.lineTo(
              Math.cos(angle + 0.14) * outer,
              Math.sin(angle + 0.14) * outer
            );
          }
          blast.position.set((msg.x + 0.5) * tile, (msg.y + 0.5) * tile);
          effectsLayer.addChild(blast);
          effects.push({
            sprite: blast,
            age: 0,
            duration: 420,
            kind: "spark"
          });

          for (let i = 0; i < 6; i += 1) {
            const arc = new Graphics();
            arc.lineStyle(2, 0xb8fcff, 0.9);
            const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.25;
            arc.moveTo(0, 0);
            arc.lineTo(
              Math.cos(angle) * radius * (0.45 + Math.random() * 0.2),
              Math.sin(angle) * radius * (0.45 + Math.random() * 0.2)
            );
            arc.lineTo(
              Math.cos(angle + 0.18) * radius * (0.8 + Math.random() * 0.12),
              Math.sin(angle + 0.18) * radius * (0.8 + Math.random() * 0.12)
            );
            arc.position.set((msg.x + 0.5) * tile, (msg.y + 0.5) * tile);
            effectsLayer.addChild(arc);
            effects.push({
              sprite: arc,
              age: 0,
              duration: 220 + i * 25,
              kind: "spark"
            });
          }
        } else {
          blast.lineStyle(3, 0xff8f4a, 0.9);
          if (msg.shape === "cross") {
            const radius = msg.r || 1;
            const len = tile * radius;
            blast.moveTo(-len, 0);
            blast.lineTo(len, 0);
            blast.moveTo(0, -len);
            blast.lineTo(0, len);
          } else {
            blast.drawCircle(0, 0, Math.max(12, tile * (msg.r || 4)));
          }
          blast.position.set((msg.x + 0.5) * tile, (msg.y + 0.5) * tile);
          effectsLayer.addChild(blast);
          effects.push({
            sprite: blast,
            age: 0,
            duration: 300,
            kind: "spark"
          });
        }
      }
      updatePlacement();
    }

    if (msg.t === "inventory" && msg.inventory) {
      setInventory(toInventory(msg.inventory));
    }

    if (msg.t === "drop_ok") {
      setDropOpen(false);
      resetDropValues();
      setDropError("");
    }

    if (msg.t === "drop_error") {
      const text = msg.message ? String(msg.message) : "Drop failed";
      setDropError(text);
    }

    if (msg.t === "teleport_error") {
      const text = msg.message ? String(msg.message) : "Teleport failed";
      setTeleportError(text);
    }

    if (msg.t === "teleport_ok") {
      setTeleportError("");
    }

    if (msg.t === "items" && Array.isArray(msg.items)) {
      applyItems(msg.items);
    }

    if (msg.t === "hit") {
      const { tile } = state.map;
      if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
        const spark = new Graphics();
        spark.lineStyle(2, 0xffc36a, 0.9);
        spark.drawCircle(0, 0, Math.max(4, tile * 0.2));
        spark.lineStyle(2, 0xfff2b0, 0.8);
        spark.moveTo(-tile * 0.2, 0);
        spark.lineTo(tile * 0.2, 0);
        spark.position.set((msg.x + 0.5) * tile, (msg.y + 0.5) * tile);
        effectsLayer.addChild(spark);
        effects.push({
          sprite: spark,
          age: 0,
          duration: 160,
          kind: "spark"
        });

        if (Number.isFinite(msg.hpCurrent) && Number.isFinite(msg.hpMax)) {
          tileHpRef.current.set(`${msg.x},${msg.y}`, {
            current: Math.max(0, Number(msg.hpCurrent)),
            max: Math.max(0, Number(msg.hpMax))
          });
        }

        if (msg.amount && msg.amount > 0) {
          const color = crystalColor(msg.type);
          if (color !== null) {
            const text = new Text(`+${msg.amount}`, {
              fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
              fontSize: 14,
              fill: color,
              stroke: 0x0b1016,
              strokeThickness: 3
            });
            if (text.anchor) {
              text.anchor.set(0.5);
            }
            text.position.set(
              (msg.x + 0.5) * tile,
              (msg.y + 0.5) * tile - 6
            );
            effectsLayer.addChild(text);
            effects.push({
              sprite: text,
              age: 0,
              duration: 600,
              kind: "float",
              startY: text.y
            });
          }
        }
      }
    }

    if (msg.t === "chat") {
      setChatMessages((prev) => {
        const next = [
          ...prev,
          {
            from: msg.from || "unknown",
            text: msg.msg || "",
            time: msg.time || Date.now()
          }
        ];
        return next.slice(-60);
      });
    }

    if (msg.t === "hp") {
      setHp(toHp(msg));
    }

    if (msg.t === "wallet") {
      setWallet(toWallet(msg));
    }

    if (msg.t === "respawn_selection") {
      setRespawnBuildingId(String(msg.id || "") || null);
    }

    if (msg.t === "player_respawned") {
      setSuppressRespawnAutoOpen(true);
    }

    if (msg.t === "skills" && msg.skills) {
      setSkills(msg.skills);
    }

    if (msg.t === "skill_slots" && Array.isArray(msg.slots)) {
      setSkillSlots(normalizeSkillSlots(msg.slots));
    }

    if (msg.t === "storage_state" && msg.storage) {
      const id = String(msg.id || "");
      if (storageIdRef.current && id !== storageIdRef.current) return;
      setStorageState(toStorage(msg.storage));
    }
  };
}







