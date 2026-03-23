import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  BASE_MAX_DEPTH_TILES,
  DEFAULT_MAP,
  DEFAULT_SKILL_CONFIG,
  DEPTH_PER_LEVEL
} from "./constants.js";
import { chunkKey, formatSkillTotal } from "./helpers.js";
import { ChatPanel } from "./overlays/ChatPanel.jsx";
import { ConfirmModal } from "./overlays/ConfirmModal.jsx";
import { DropCrystalsModal } from "./overlays/DropCrystalsModal.jsx";
import { OwnedBuildingsModal } from "./overlays/OwnedBuildingsModal.jsx";
import { isSocketOpen } from "./socketApi.js";
import { saveChunkCache as saveCachedChunk } from "./chunkCache.js";
import { createGameRenderer } from "./gameRenderer.js";
import { getFrontTileInfo } from "./targetBlock.js";
import { useWorldMapUi } from "./useWorldMapUi.js";
import { useRespawnStatus } from "./useRespawnStatus.js";
import { requestVisibleChunks } from "./chunkRequests.js";
import { useBuildingUi } from "./useBuildingUi.js";
import { usePlayerUi } from "./usePlayerUi.js";
import { useSkillUi } from "./useSkillUi.js";
import { useGameShortcuts } from "./useGameShortcuts.js";
import { useGameSession } from "./useGameSession.js";

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
  const [mapWrapEl, setMapWrapEl] = useState(null);
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
  });

  const {
    statusLabel,
    respawnCoords,
    confirmResetRespawn,
    confirmForceDeath
  } = useRespawnStatus({
    status,
    buildingsRef,
    respawnBuildingId,
    setConfirmState,
    resetRespawnSelection,
    forceDeath
  });

  const frontTileInfo = getFrontTileInfo({
    localPlayerRef,
    mapDataRef,
    tileHpRef
  });

  const maxDepth =
    BASE_MAX_DEPTH_TILES + (Number(skills.depth?.level || 0) * DEPTH_PER_LEVEL);

  const isOverDepth = coords.y > maxDepth;

  function requestChunks(chunks, options = {}) {
    return requestVisibleChunks({
      socketRef,
      mapDataRef,
      loadedChunksRef,
      chunks,
      options
    });
  }

  const {
    handleMapWrapRef,
    requestMapDraw,
    zoomMapAt,
    handleMapMouseDown,
    handleMapMouseMove: handleMapMouseMoveInternal,
    handleMapMouseUp,
    handleMapMouseLeave
  } = useWorldMapUi({
    setMapWrapEl,
    setMapPanning,
    setMapHover,
    mapWrapRef,
    mapCanvasRef,
    mapDrawRafRef,
    mapOpenRef,
    mapViewRef,
    mapDataRef,
    exploredChunksRef,
    localPlayerRef,
    mapHoverRef,
    chunkKey
  });

  function handleMapMouseMove(event) {
    handleMapMouseMoveInternal(event, mapPanning);
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
    if (!mapOpen || !mapWrapEl) return undefined;

    const handleWheel = (event) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      zoomMapAt(event.clientX, event.clientY, factor);
    };

    mapWrapEl.addEventListener("wheel", handleWheel, { passive: false });
    requestMapDraw();
    return () => mapWrapEl.removeEventListener("wheel", handleWheel);
  }, [mapOpen, mapWrapEl]);

  useEffect(() => {
    const preventBrowserZoom = (event) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };

    window.addEventListener("wheel", preventBrowserZoom, { passive: false });
    return () => window.removeEventListener("wheel", preventBrowserZoom);
  }, []);

  const runtimeRef = useRef(null);
  const [runtime, setRuntime] = useState(null);

  useGameShortcuts({
    runtimeRef,
    socketRef,
    chatFocusRef,
    mapOpenRef,
    dropOpenRef,
    ownedBuildingsOpenRef,
    setMapOpen,
    setDropOpen,
    setDropError,
    setOwnedBuildingsOpen,
    useSelectedItem
  });

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
    runtimeRef.current = runtime;
    setRuntime(runtime);

    return () => {
      runtimeRef.current = null;
      setRuntime(null);
      runtime.destroy();
    };
  }, [token]);

  useGameSession({
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
  });

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
            mapWrapRef={handleMapWrapRef}
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






