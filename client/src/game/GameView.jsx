import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  BASE_MAX_DEPTH_TILES,
  DEFAULT_MAP,
  DEFAULT_SKILL_CONFIG,
  DEPTH_PER_LEVEL,
  TILE_BASE_HP,
  TILE_DISPLAY
} from "./constants.js";
import { chunkKey, formatSkillTotal } from "./helpers.js";
import { ChatPanel } from "./overlays/ChatPanel.jsx";
import { ConfirmModal } from "./overlays/ConfirmModal.jsx";
import { DropCrystalsModal } from "./overlays/DropCrystalsModal.jsx";
import { OwnedBuildingsModal } from "./overlays/OwnedBuildingsModal.jsx";
import { isSocketOpen, requestMapChunks, sendBuildAction, sendInput } from "./socketApi.js";
import { saveChunkCache as saveCachedChunk } from "./chunkCache.js";
import { createSocketMessageHandler } from "./messageHandlers.js";
import {
  applyMapZoom,
  drawWorldMapCanvas,
  getMapHoverPosition
} from "./worldMap.js";
import { createGameRenderer } from "./gameRenderer.js";
import { useBuildingUi } from "./useBuildingUi.js";
import { usePlayerUi } from "./usePlayerUi.js";
import { useSkillUi } from "./useSkillUi.js";

const StorageModal = lazy(() =>
  import("./overlays/StorageModal.jsx").then((module) => ({
    default: module.StorageModal
  }))
);
const ShopModal = lazy(() =>
  import("./overlays/ShopModal.jsx").then((module) => ({
    default: module.ShopModal
  }))
);
const UpgradeModal = lazy(() =>
  import("./overlays/UpgradeModal.jsx").then((module) => ({
    default: module.UpgradeModal
  }))
);
const RespawnModal = lazy(() =>
  import("./overlays/RespawnModal.jsx").then((module) => ({
    default: module.RespawnModal
  }))
);
const TeleportModal = lazy(() =>
  import("./overlays/TeleportModal.jsx").then((module) => ({
    default: module.TeleportModal
  }))
);
const WorldMapOverlay = lazy(() =>
  import("./overlays/WorldMapOverlay.jsx").then((module) => ({
    default: module.WorldMapOverlay
  }))
);

export default function GameView({ token, onAuthExpired }) {
  const containerRef = useRef(null);
  const mapWrapRef = useRef(null);
  const mapCanvasRef = useRef(null);
  const mapDrawRafRef = useRef(null);
  const mapOpenRef = useRef(false);
  const dropOpenRef = useRef(false);
  const ownedBuildingsOpenRef = useRef(false);
  const socketRef = useRef(null);
  const chatFocusRef = useRef(false);
  const placementRef = useRef({ x: null, y: null, valid: false });
  const loadedChunksRef = useRef(new Set());
  const staleChunksRef = useRef(new Set());
  const exploredChunksRef = useRef(new Set());
  const hydrateCacheRef = useRef(null);
  const usernameRef = useRef("");
  const chunkRequestTimeRef = useRef(new Map());
  const tileHpRef = useRef(new Map());
  const localPlayerRef = useRef({
    tx: 0,
    ty: 0,
    fx: 0,
    fy: 1,
    ready: false
  });
  const buildingsRef = useRef([]);
  const mapViewRef = useRef({ zoom: 1, panX: 0, panY: 0, lastX: 0, lastY: 0 });
  const mapDataRef = useRef({
    w: DEFAULT_MAP.w,
    h: DEFAULT_MAP.h,
    chunk: DEFAULT_MAP.chunk,
    tiles: new Map(),
    buildings: new Map(),
    players: new Map(),
    playerId: null
  });
  const mapHoverRef = useRef({ x: null, y: null, inside: false });
  const [status, setStatus] = useState("connecting");
  const [playerCount, setPlayerCount] = useState(0);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [wallet, setWallet] = useState({ dollars: 0, coins: 0 });
  const [hp, setHp] = useState({ current: 100, max: 100 });
  const [inventory, setInventory] = useState({
    green: 0,
    blue: 0,
    white: 0,
    red: 0,
    pink: 0,
    cyan: 0
  });
  const [skills, setSkills] = useState({});
  const [skillConfig, setSkillConfig] = useState(DEFAULT_SKILL_CONFIG);
  const [skillSlots, setSkillSlots] = useState(Array(20).fill(null));
  const [mapOpen, setMapOpen] = useState(false);
  const [mapPanning, setMapPanning] = useState(false);
  const [ownedBuildingsOpen, setOwnedBuildingsOpen] = useState(false);
  const [respawnBuildingId, setRespawnBuildingId] = useState(null);
  const [suppressRespawnAutoOpen, setSuppressRespawnAutoOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const {
    applyItems,
    chatInput,
    chatMessages,
    chatOpen,
    dropError,
    dropOpen,
    dropTotal,
    dropValues,
    itemInventory,
    resetDropValues,
    selectedItemId,
    selectedItemRef,
    setChatFocused,
    setChatInput,
    setChatMessages,
    setChatOpen,
    setDropError,
    setDropOpen,
    setSelectedItemId,
    sortedItems,
    submitChat,
    submitDrop,
    updateDropValue,
    useSelectedItem
  } = usePlayerUi({
    chatFocusRef,
    inventory,
    placementRef,
    socketRef
  });
  const {
    buyCountTotal,
    buySelectedCrystals,
    buyTotal,
    collectAllBuildingMoney,
    collectBuildingMoney,
    forceDeath,
    requestSkillSlotSet,
    requestSkillUpgrade,
    repairRespawn,
    repairTeleport,
    repairShop,
    repairStorage,
    repairUpgrade,
    resetRespawnSelection,
    respawnBuilding,
    teleportBuilding,
    respawnOpen,
    teleportError,
    teleportOpen,
    respawnOwner,
    teleportOwner,
    respawnTab,
    teleportTab,
    teleportTargets,
    sellCountTotal,
    sellSelectedCrystals,
    sellTotal,
    setRespawnHere,
    setTeleportError,
    setTeleportTab,
    setRespawnTab,
    useTeleportTarget,
    setShopTab,
    setStorageState,
    setStorageTab,
    setUpgradeTab,
    shopBuilding,
    shopBuy,
    shopOpen,
    shopOwner,
    shopTab,
    shopSell,
    ownedBuildings,
    storageBuilding,
    storageIdRef,
    storageOpen,
    storageOwner,
    storageState,
    storageTab,
    storageTransfer,
    updateBuildingWindows,
    updateShopBuy,
    updateShopSell,
    updateStorageTransferValue,
    upgradeBuilding,
    upgradeOpen,
    upgradeOwner,
    upgradeTab,
    moveStorageCrystal
  } = useBuildingUi({
    buildingsRef,
    inventory,
    localPlayerRef,
    respawnBuildingId,
    suppressRespawnAutoOpen,
    setSuppressRespawnAutoOpen,
    socketRef,
    usernameRef
  });
  const [mapHover, setMapHover] = useState({ x: null, y: null, inside: false });
  const {
    activeCoreSkill,
    activeSkill,
    activeSkillCost,
    activeSkillNeed,
    activeSkillState,
    canInstallSlotSkill,
    canUpgradeSkill,
    inventoryCapacity,
    isSkillAvailable,
    selectedSlotIndex,
    selectedSlotSkill,
    setSelectedSkillId,
    setSelectedSlotIndex,
    setSlotCandidateId,
    slotCandidateId,
    slotCandidateSkill,
    slotSkills,
    visibleSkills
  } = useSkillUi({
    skillConfig,
    skillSlots,
    skills,
    wallet
  });  const statusLabel =
    status === "connecting"
      ? "Connecting"
      : status === "online"
      ? "Online"
      : status === "offline"
      ? "Offline"
      : status === "unauthorized"
      ? "Unauthorized"
      : status === "already_online"
      ? "Already online"
      : status;
  const selectedRespawnBuilding = respawnBuildingId
    ? buildingsRef.current.find((building) => building.id === respawnBuildingId) || null
    : null;
  const respawnCoords = selectedRespawnBuilding?.center
    ? {
        x: selectedRespawnBuilding.center.x,
        y: selectedRespawnBuilding.center.y
      }
    : { x: 1, y: 1 };
  const maxDepth =
    BASE_MAX_DEPTH_TILES + (Number(skills.depth?.level || 0) * DEPTH_PER_LEVEL);

  function getLoadedTileType(tx, ty) {
    const { w, h, chunk, tiles } = mapDataRef.current;
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return null;
    const chunkSize = chunk || DEFAULT_MAP.chunk;
    const cx = Math.floor(tx / chunkSize);
    const cy = Math.floor(ty / chunkSize);
    const loadedChunk = tiles.get(chunkKey(cx, cy));
    if (!loadedChunk) return null;
    const lx = tx - cx * chunkSize;
    const ly = ty - cy * chunkSize;
    if (lx < 0 || ly < 0 || lx >= loadedChunk.w || ly >= loadedChunk.h) {
      return null;
    }
    return loadedChunk.data[ly * loadedChunk.w + lx];
  }

  function getTrackedTileHp(tx, ty, type) {
    if (type == null) return null;
    const tracked = tileHpRef.current.get(`${tx},${ty}`);
    if (tracked && Number.isFinite(tracked.current) && Number.isFinite(tracked.max)) {
      return tracked;
    }
    const base = TILE_BASE_HP[type];
    if (!Number.isFinite(base)) return null;
    return { current: base, max: base };
  }

  const frontTileInfo = (() => {
    const player = localPlayerRef.current;
    if (!player.ready) {
      return { name: "Unknown", color: "#253140", coords: null, hp: null };
    }
    const tx = player.tx + player.fx;
    const ty = player.ty + player.fy;
    const type = getLoadedTileType(tx, ty);
    if (type == null) {
      return { name: "Unknown", color: "#253140", coords: { x: tx, y: ty }, hp: null };
    }
    const display = TILE_DISPLAY[type] || { name: `Tile ${type}`, color: "#253140" };
    return { ...display, coords: { x: tx, y: ty }, hp: getTrackedTileHp(tx, ty, type) };
  })();

  const isOverDepth = coords.y > maxDepth;

  function confirmResetRespawn() {
    setConfirmState({
      title: "Reset Respawn",
      message: "Reset respawn point to 1,1?",
      confirmLabel: "Reset",
      onConfirm: () => {
        setConfirmState(null);
        resetRespawnSelection();
      }
    });
  }

  function confirmForceDeath() {
    setConfirmState({
      title: "Force Death",
      message: "Kill the robot now?",
      confirmLabel: "Die",
      onConfirm: () => {
        setConfirmState(null);
        forceDeath();
      }
    });
  }

  function requestChunks(chunks, options = {}) {
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    const { w, h, chunk } = mapDataRef.current;
    if (!chunk) return;
    const force = Boolean(options.force);
    const maxCx = Math.ceil(w / chunk) - 1;
    const maxCy = Math.ceil(h / chunk) - 1;
    const pending = [];
    for (const entry of chunks) {
      const cx = Number(entry.cx);
      const cy = Number(entry.cy);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      if (cx < 0 || cy < 0 || cx > maxCx || cy > maxCy) continue;
      const key = chunkKey(cx, cy);
      if (!force && loadedChunksRef.current.has(key)) continue;
      pending.push({ cx, cy });
      if (pending.length >= 32) {
        requestMapChunks(socket, pending);
        pending.length = 0;
      }
    }
    if (pending.length > 0) {
      requestMapChunks(socket, pending);
    }
  }

  function requestMapDraw() {
    if (!mapOpenRef.current) return;
    if (mapDrawRafRef.current) return;
    mapDrawRafRef.current = window.requestAnimationFrame(() => {
      mapDrawRafRef.current = null;
      drawWorldMap();
    });
  }

  function drawWorldMap() {
    drawWorldMapCanvas({
      wrap: mapWrapRef.current,
      canvas: mapCanvasRef.current,
      mapData: mapDataRef.current,
      mapView: mapViewRef.current,
      exploredChunks: exploredChunksRef.current,
      localPlayer: localPlayerRef.current,
      chunkKey
    });
  }

  function zoomMapAt(clientX, clientY, factor) {
    const changed = applyMapZoom({
      wrap: mapWrapRef.current,
      mapData: mapDataRef.current,
      mapView: mapViewRef.current,
      clientX,
      clientY,
      factor
    });
    if (changed) {
      requestMapDraw();
    }
  }


  function handleMapMouseDown(event) {
    if (event.button !== 0) return;
    mapViewRef.current.lastX = event.clientX;
    mapViewRef.current.lastY = event.clientY;
    setMapPanning(true);
    updateMapHover(event.clientX, event.clientY);
  }

  function handleMapMouseMove(event) {
    if (mapPanning) {
      const view = mapViewRef.current;
      const dx = event.clientX - view.lastX;
      const dy = event.clientY - view.lastY;
      view.panX += dx;
      view.panY += dy;
      view.lastX = event.clientX;
      view.lastY = event.clientY;
      requestMapDraw();
    }
    updateMapHover(event.clientX, event.clientY);
  }

  function handleMapMouseUp() {
    setMapPanning(false);
  }

  function handleMapMouseLeave() {
    setMapPanning(false);
    if (mapHoverRef.current.inside) {
      mapHoverRef.current = { x: null, y: null, inside: false };
      setMapHover({ x: null, y: null, inside: false });
    }
  }

  function updateMapHover(clientX, clientY) {
    const next = getMapHoverPosition({
      wrap: mapWrapRef.current,
      mapData: mapDataRef.current,
      mapView: mapViewRef.current,
      clientX,
      clientY
    });
    const prev = mapHoverRef.current;
    if (prev.x !== next.x || prev.y !== next.y || prev.inside !== next.inside) {
      mapHoverRef.current = next;
      setMapHover(next);
    }
  }

  useEffect(() => {
    mapOpenRef.current = mapOpen;
    if (mapOpen) {
      mapViewRef.current.zoom = 1;
      mapViewRef.current.panX = 0;
      mapViewRef.current.panY = 0;
      if (hydrateCacheRef.current) {
        hydrateCacheRef.current();
      }
      requestMapDraw();
    } else {
      setMapPanning(false);
    }
  }, [mapOpen]);

  useEffect(() => {
    dropOpenRef.current = dropOpen;
  }, [dropOpen]);

  useEffect(() => {
    ownedBuildingsOpenRef.current = ownedBuildingsOpen;
  }, [ownedBuildingsOpen]);

  useEffect(() => {
    if (!mapOpen) return undefined;
    const handleResize = () => requestMapDraw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mapOpen]);
  useEffect(() => {
    if (!mapOpen) return undefined;
    const wrap = mapWrapRef.current;
    if (!wrap) return undefined;

    const handleWheel = (event) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      zoomMapAt(event.clientX, event.clientY, factor);
    };

    wrap.addEventListener("wheel", handleWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", handleWheel);
  }, [mapOpen]);

  useEffect(() => {
    if (!token) return undefined;

    const runtime = createGameRenderer({
      buildingsRef,
      container: containerRef.current,
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
    });

    runtime.mount();

    let socket;
    let inputInterval;

    const onKeyDown = (event) => {
      if (event.code === "KeyM" && !event.repeat) {
        setMapOpen((prev) => !prev);
        return;
      }
      if (event.code === "Escape" && mapOpenRef.current) {
        setMapOpen(false);
        return;
      }
      if (event.code === "Escape" && dropOpenRef.current) {
        setDropOpen(false);
        setDropError("");
        return;
      }
      if (event.code === "Escape" && ownedBuildingsOpenRef.current) {
        setOwnedBuildingsOpen(false);
        return;
      }
      if (event.code === "KeyF" && !event.repeat && !chatFocusRef.current) {
        useSelectedItem();
        return;
      }
      if (event.code === "KeyR" && !event.repeat && !chatFocusRef.current) {
        const currentSocket = socketRef.current;
        if (isSocketOpen(currentSocket)) {
          sendBuildAction(currentSocket);
        }
        return;
      }
      if (
        (event.code === "ControlLeft" || event.code === "ControlRight") &&
        !event.repeat &&
        !chatFocusRef.current
      ) {
        runtime.state.keys.slow = !runtime.state.keys.slow;
        return;
      }
      runtime.updateInputKey(event.code, true);
    };

    const onKeyUp = (event) => {
      runtime.updateInputKey(event.code, false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

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
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (inputInterval) clearInterval(inputInterval);
      if (socket) socket.close();
      socketRef.current = null;
      runtime.destroy();
    };
  }, [token, onAuthExpired]);

  return (
    <div className="game-wrap">
      <div ref={containerRef} className="game-wrap" />
      <div className="hud-stack">
        <div className="game-overlay">
          <div className="hud-currency">
            <div className="currency-item">
              <span className="currency-dot currency-dollar" />
              ${wallet.dollars}
            </div>
            <div className="currency-item">
              <span className="currency-dot currency-coin" />
              {wallet.coins} coins
            </div>
            <div className="currency-item hp-item">
              <span className="hp-label">HP</span>
              <span className="hp-value">
                {hp.current}/{hp.max}
              </span>
            </div>
          </div>
          <div>Status: {statusLabel}</div>
          <div>Players: {playerCount}</div>
          <div>
            Respawn: X {respawnCoords.x} Y {respawnCoords.y}
          </div>
          <div>
            X: {coords.x} Y:{" "}
            <span className={isOverDepth ? "depth-warning" : undefined}>
              {coords.y}
            </span>
          </div>
        </div>
        <div className="game-overlay inventory-overlay">
          <div className="inventory-header">
            <div className="inventory-title">Inventory</div>
            <div className="storage-actions">
              <button
                className="inventory-drop-btn"
                type="button"
                onClick={() => {
                  resetDropValues();
                  setDropError("");
                  setDropOpen(true);
                }}
              >
                Drop
              </button>
            </div>
          </div>
          <div className="inventory-list">
            <div className="inventory-line">
              <span className="inventory-label">Green</span>
              <span className="inventory-value crystal-green-text">
                {inventory.green}/{inventoryCapacity}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">Blue</span>
              <span className="inventory-value crystal-blue-text">
                {inventory.blue}/{inventoryCapacity}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">White</span>
              <span className="inventory-value crystal-white-text">
                {inventory.white}/{inventoryCapacity}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">Red</span>
              <span className="inventory-value crystal-red-text">
                {inventory.red}/{inventoryCapacity}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">Pink</span>
              <span className="inventory-value crystal-pink-text">
                {inventory.pink}/{inventoryCapacity}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">Cyan</span>
              <span className="inventory-value crystal-cyan-text">
                {inventory.cyan}/{inventoryCapacity}
              </span>
            </div>
          </div>
        </div>
        <div className="game-overlay">
          <div className="inventory-header">
            <div className="inventory-title">Actions</div>
          </div>
          <div
            className="storage-actions"
            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
          >
            <button
              className="inventory-drop-btn"
              type="button"
              onClick={() => setOwnedBuildingsOpen(true)}
            >
              My Buildings
            </button>
            <button
              className="inventory-drop-btn"
              type="button"
              onClick={confirmResetRespawn}
            >
              Reset Respawn
            </button>
            <button
              className="inventory-drop-btn"
              type="button"
              onClick={confirmForceDeath}
            >
              Force Death
            </button>
          </div>
        </div>
        <div className="game-overlay target-block-overlay">
          <div className="inventory-header">
            <div className="inventory-title">Target Block</div>
          </div>
          <div className="target-block-body">
            <span
              className="target-block-swatch"
              style={{ backgroundColor: frontTileInfo.color }}
            />
            <div className="target-block-meta">
              <div className="target-block-name">{frontTileInfo.name}</div>
              {frontTileInfo.hp ? (
                <div className="target-block-coords">
                  HP {frontTileInfo.hp.current}/{frontTileInfo.hp.max}
                </div>
              ) : null}
              {frontTileInfo.coords ? (
                <div className="target-block-coords">
                  X {frontTileInfo.coords.x} Y {frontTileInfo.coords.y}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="game-overlay items-overlay">
        <div className="items-header">
          <div className="items-title">Items</div>
          <div className="items-selected">
            {itemInventory.find((item) => item.id === selectedItemId)?.name ||
              "None"}
          </div>
        </div>
        <div className="items-grid">
          {sortedItems.map((item) => (
            <button
              key={item.id}
              className={`item-slot${
                selectedItemId === item.id ? " is-selected" : ""
              }${item.count > 0 ? "" : " is-disabled"}`}
              type="button"
              disabled={item.count <= 0}
              onClick={() =>
                setSelectedItemId((prev) => (prev === item.id ? null : item.id))
              }
            >
              <div className="item-name">{item.name}</div>
              <div className="item-count">x{item.count}</div>
            </button>
          ))}
        </div>
      </div>
      <DropCrystalsModal
        open={dropOpen}
        inventory={inventory}
        dropValues={dropValues}
        dropError={dropError}
        dropTotal={dropTotal}
        onClose={() => {
          setDropOpen(false);
          setDropError("");
        }}
        onChange={updateDropValue}
        onDropSelected={() => submitDrop(false)}
        onDropAll={() => submitDrop(true)}
      />
      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title || ""}
        message={confirmState?.message || ""}
        confirmLabel={confirmState?.confirmLabel || "Confirm"}
        onConfirm={() => confirmState?.onConfirm?.()}
        onCancel={() => setConfirmState(null)}
      />
      <OwnedBuildingsModal
        open={ownedBuildingsOpen}
        buildings={ownedBuildings}
        onCollect={collectBuildingMoney}
        onCollectAll={collectAllBuildingMoney}
        onClose={() => setOwnedBuildingsOpen(false)}
      />
      {storageOpen ? (
        <Suspense fallback={null}>
          <StorageModal
            open={storageOpen}
            storageTab={storageTab}
            onTabChange={setStorageTab}
            storageOwner={storageOwner}
            currentUsername={usernameRef.current || ""}
            storageBuilding={storageBuilding}
            inventory={inventory}
            storageState={storageState}
            storageTransfer={storageTransfer}
            onTransferChange={updateStorageTransferValue}
            onMoveCrystal={moveStorageCrystal}
            onRepair={repairStorage}
          />
        </Suspense>
      ) : null}
      {shopOpen ? (
        <Suspense fallback={null}>
          <ShopModal
            open={shopOpen}
            shopTab={shopTab}
            onTabChange={setShopTab}
            shopOwner={shopOwner}
            currentUsername={usernameRef.current || ""}
            shopBuilding={shopBuilding}
            inventory={inventory}
            shopSell={shopSell}
            shopBuy={shopBuy}
            sellTotal={sellTotal}
            buyTotal={buyTotal}
            sellCountTotal={sellCountTotal}
            buyCountTotal={buyCountTotal}
            onUpdateSell={updateShopSell}
            onUpdateBuy={updateShopBuy}
            onCollect={() => collectBuildingMoney(shopBuilding?.id)}
            onSell={sellSelectedCrystals}
            onBuy={buySelectedCrystals}
            onRepair={repairShop}
          />
        </Suspense>
      ) : null}
      {upgradeOpen ? (
        <Suspense fallback={null}>
          <UpgradeModal
            open={upgradeOpen}
            upgradeTab={upgradeTab}
            onTabChange={setUpgradeTab}
            upgradeOwner={upgradeOwner}
            currentUsername={usernameRef.current || ""}
            upgradeBuilding={upgradeBuilding}
            inventoryBlue={inventory.blue}
            skillSlots={skillSlots}
            skillConfig={skillConfig}
            visibleSkills={visibleSkills}
            skills={skills}
            selectedSlotIndex={selectedSlotIndex}
            setSelectedSlotIndex={setSelectedSlotIndex}
            setSelectedSkillId={setSelectedSkillId}
            selectedSlotSkill={selectedSlotSkill}
            slotSkills={slotSkills}
            slotCandidateId={slotCandidateId}
            setSlotCandidateId={setSlotCandidateId}
            slotCandidateSkill={slotCandidateSkill}
            canInstallSlotSkill={canInstallSlotSkill}
            requestSkillSlotSet={requestSkillSlotSet}
            activeCoreSkill={activeCoreSkill}
            activeSkill={activeSkill}
            activeSkillState={activeSkillState}
            activeSkillNeed={activeSkillNeed}
            activeSkillCost={activeSkillCost}
            canUpgradeSkill={canUpgradeSkill}
            formatSkillTotal={formatSkillTotal}
            onCollect={() => collectBuildingMoney(upgradeBuilding?.id)}
            requestSkillUpgrade={requestSkillUpgrade}
            isSkillAvailable={isSkillAvailable}
            onRepair={repairUpgrade}
          />
        </Suspense>
      ) : null}
      {respawnOpen ? (
        <Suspense fallback={null}>
          <RespawnModal
            open={respawnOpen}
            respawnTab={respawnTab}
            onTabChange={setRespawnTab}
            respawnOwner={respawnOwner}
            currentUsername={usernameRef.current || ""}
            respawnBuilding={respawnBuilding}
            respawnBuildingId={respawnBuildingId}
            inventoryBlue={inventory.blue}
            onSetRespawnHere={setRespawnHere}
            onResetRespawn={confirmResetRespawn}
            onForceDeath={confirmForceDeath}
            onRepair={repairRespawn}
          />
        </Suspense>
      ) : null}
      {teleportOpen ? (
        <Suspense fallback={null}>
          <TeleportModal
            open={teleportOpen}
            teleportTab={teleportTab}
            onTabChange={setTeleportTab}
            teleportOwner={teleportOwner}
            currentUsername={usernameRef.current || ""}
            teleportBuilding={teleportBuilding}
            teleportTargets={teleportTargets}
            teleportError={teleportError}
            inventoryBlue={inventory.blue}
            onCollect={() => collectBuildingMoney(teleportBuilding?.id)}
            onRepair={repairTeleport}
            onTeleport={useTeleportTarget}
          />
        </Suspense>
      ) : null}
      <ChatPanel
        chatOpen={chatOpen}
        toggleChat={() => setChatOpen((prev) => !prev)}
        chatMessages={chatMessages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        submitChat={submitChat}
        setChatFocused={setChatFocused}
      />
      {mapOpen ? (
        <Suspense fallback={null}>
          <WorldMapOverlay
            mapOpen={mapOpen}
            mapPanning={mapPanning}
            mapWrapRef={mapWrapRef}
            mapCanvasRef={mapCanvasRef}
            handleMapMouseDown={handleMapMouseDown}
            handleMapMouseMove={handleMapMouseMove}
            handleMapMouseUp={handleMapMouseUp}
            handleMapMouseLeave={handleMapMouseLeave}
            coords={coords}
            mapHover={mapHover}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
