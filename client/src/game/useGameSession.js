import { useEffect } from "react";
import { isSocketOpen, sendInput } from "./socketApi.js";
import { createSocketMessageHandler } from "./messageHandlers.js";

export function useGameSession({
  token,
  onAuthExpired,
  socketRef,
  runtime,
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
  setStatus,
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
  saveCachedChunk,
  resetDropValues,
  requestChunks,
  tileHpRef
}) {
  useEffect(() => {
    if (!token || !runtime) return undefined;

    let socket;
    let inputInterval;

    const baseUrl = import.meta.env.VITE_SERVER_URL || "ws://localhost:8080";
    const serverUrl = `${baseUrl}?token=${encodeURIComponent(token)}`;
    socket = new WebSocket(serverUrl);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setStatus("online");
    });
    socket.addEventListener("close", (event) => {
      if (event.code === 4001) {
        setStatus("unauthorized");
        if (onAuthExpired) onAuthExpired();
        return;
      }
      if (event.code === 4002) {
        setStatus("already_online");
        return;
      }
      setStatus("offline");
    });

    const handleSocketMessage = createSocketMessageHandler({
      state: runtime.state,
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
      bombs: runtime.bombs,
      bombsLayer: runtime.bombsLayer,
      effects: runtime.effects,
      effectsLayer: runtime.effectsLayer,
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
      drawGrid: runtime.drawGrid,
      drawTerrain: runtime.drawTerrain,
      drawBuildings: runtime.drawBuildings,
      pushSnapshot: runtime.pushSnapshot,
      storeChunk: runtime.storeChunk,
      drawTerrainChunk: runtime.drawTerrainChunk,
      drawBuildingChunk: runtime.drawBuildingChunk,
      setChunkValue: runtime.setChunkValue,
      isTileWithinView: runtime.isTileWithinView,
      createBombSprite: runtime.createBombSprite,
      updatePlacement: runtime.updatePlacement,
      saveCachedChunk,
      resetDropValues,
      requestChunks,
      tileHpRef
    });

    socket.addEventListener("message", handleSocketMessage);

    inputInterval = setInterval(() => {
      if (!isSocketOpen(socket)) return;
      sendInput(
        socket,
        runtime.currentDir(),
        runtime.state.keys.slow,
        runtime.state.keys.shift,
        runtime.state.keys.mine
      );
    }, 50);

    return () => {
      if (inputInterval) clearInterval(inputInterval);
      if (socket) socket.close();
      socketRef.current = null;
    };
  }, [token, onAuthExpired, runtime]);
}
