import { createEffectHandlers } from "./messages/effectHandlers.js";
import { createUiMessageHandlers } from "./messages/uiHandlers.js";
import { createWorldHandlers } from "./messages/worldHandlers.js";

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
  const worldHandlers = createWorldHandlers({
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
  });

  const effectHandlers = createEffectHandlers({
    state,
    bombs,
    bombsLayer,
    effects,
    effectsLayer,
    tileHpRef,
    createBombSprite,
    updatePlacement
  });

  const uiHandlers = createUiMessageHandlers({
    storageIdRef,
    setWallet,
    setHp,
    setInventory,
    setSuppressRespawnAutoOpen,
    setRespawnBuildingId,
    setSkills,
    setSkillSlots,
    setDropOpen,
    setDropError,
    setChatMessages,
    setStorageState,
    setTeleportError,
    applyItems,
    resetDropValues
  });

  return (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.t === "welcome") {
      worldHandlers.handleWelcome(msg);
    }

    if (msg.t === "state") {
      pushSnapshot(msg);
    }

    if (msg.t === "map_chunk") {
      worldHandlers.handleMapChunk(msg);
    }

    if (msg.t === "tile") {
      worldHandlers.handleTile(msg);
    }

    if (msg.t === "building_place") {
      worldHandlers.handleBuildingPlace(msg);
    }

    if (msg.t === "building_update" && msg.building) {
      worldHandlers.handleBuildingUpdate(msg);
    }

    if (msg.t === "building_destroyed") {
      worldHandlers.handleBuildingDestroyed(msg);
    }

    if (msg.t === "bomb_placed") {
      effectHandlers.handleBombPlaced(msg);
    }

    if (msg.t === "bomb_explode") {
      effectHandlers.handleBombExplode(msg);
    }

    if (msg.t === "inventory" && msg.inventory) {
      uiHandlers.handleInventory(msg);
    }

    if (msg.t === "drop_ok") {
      uiHandlers.handleDropOk();
    }

    if (msg.t === "drop_error") {
      uiHandlers.handleDropError(msg);
    }

    if (msg.t === "teleport_error") {
      uiHandlers.handleTeleportError(msg);
    }

    if (msg.t === "teleport_ok") {
      setTeleportError("");
    }

    if (msg.t === "items" && Array.isArray(msg.items)) {
      uiHandlers.handleItems(msg);
    }

    if (msg.t === "hit") {
      effectHandlers.handleHit(msg);
    }

    if (msg.t === "chat") {
      uiHandlers.handleChat(msg);
    }

    if (msg.t === "hp") {
      uiHandlers.handleHp(msg);
    }

    if (msg.t === "wallet") {
      uiHandlers.handleWallet(msg);
    }

    if (msg.t === "respawn_selection") {
      uiHandlers.handleRespawnSelection(msg);
    }

    if (msg.t === "player_respawned") {
      uiHandlers.handlePlayerRespawned();
    }

    if (msg.t === "skills" && msg.skills) {
      uiHandlers.handleSkills(msg);
    }

    if (msg.t === "skill_slots" && Array.isArray(msg.slots)) {
      uiHandlers.handleSkillSlots(msg);
    }

    if (msg.t === "storage_state" && msg.storage) {
      uiHandlers.handleStorageState(msg);
    }
  };
}
