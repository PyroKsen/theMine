import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SHOP_ITEMS } from "./constants.js";
import {
  buyCrystal as sendBuyCrystal,
  collectAllBuildingMoney as sendCollectAllBuildingMoney,
  collectBuildingMoney as sendCollectBuildingMoney,
  forceDeath as sendForceDeath,
  isSocketOpen,
  moveStorageCrystal as sendStorageMove,
  openStorage,
  repairBuilding as sendRepairBuilding,
  resetRespawn as sendResetRespawn,
  requestSkillSlotSet as sendSkillSlotSet,
  requestSkillUpgrade as sendSkillUpgrade,
  setRespawnHere as sendSetRespawnHere,
  sellCrystal as sendSellCrystal,
  useTeleport as sendUseTeleport
} from "./socketApi.js";

const EMPTY_CRYSTALS = {
  green: 0,
  blue: 0,
  white: 0,
  red: 0,
  pink: 0,
  cyan: 0
};

function clampRepairAmount(value, max) {
  const numeric = Math.floor(Number(value) || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(numeric, Math.max(0, max)));
}

export function useBuildingUi({
  buildingsRef,
  inventory,
  localPlayerRef,
  respawnBuildingId,
  suppressRespawnAutoOpen,
  setSuppressRespawnAutoOpen,
  socketRef,
  usernameRef
}) {
  const [ownedBuildings, setOwnedBuildings] = useState([]);
  const [storageOpen, setStorageOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopTab, setShopTab] = useState("sell");
  const [storageTab, setStorageTab] = useState("storage");
  const [storageOwner, setStorageOwner] = useState(null);
  const [shopOwner, setShopOwner] = useState(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeOwner, setUpgradeOwner] = useState(null);
  const [upgradeTab, setUpgradeTab] = useState("upgrade");
  const [respawnOpen, setRespawnOpen] = useState(false);
  const [respawnOwner, setRespawnOwner] = useState(null);
  const [respawnTab, setRespawnTab] = useState("respawn");
  const [teleportOpen, setTeleportOpen] = useState(false);
  const [teleportOwner, setTeleportOwner] = useState(null);
  const [teleportTab, setTeleportTab] = useState("use");
  const [storageId, setStorageId] = useState(null);
  const storageIdRef = useRef(null);
  const [storageState, setStorageState] = useState(EMPTY_CRYSTALS);
  const [storageTransfer, setStorageTransfer] = useState(EMPTY_CRYSTALS);
  const [shopSell, setShopSell] = useState(EMPTY_CRYSTALS);
  const [shopBuy, setShopBuy] = useState(EMPTY_CRYSTALS);
  const [storageBuilding, setStorageBuilding] = useState(null);
  const [shopBuilding, setShopBuilding] = useState(null);
  const [upgradeBuilding, setUpgradeBuilding] = useState(null);
  const [respawnBuilding, setRespawnBuilding] = useState(null);
  const [teleportBuilding, setTeleportBuilding] = useState(null);
  const [teleportTargets, setTeleportTargets] = useState([]);
  const [teleportError, setTeleportError] = useState("");

  const updateBuildingWindows = useCallback(() => {
    const player = localPlayerRef.current;
    const me = usernameRef.current || "";
    const nextOwnedBuildings = buildingsRef.current
      .filter((building) => building.owner === me)
      .map((building) => {
        const interaction =
          building.type === "storage"
            ? building.entrance || null
            : building.center || building.entrances?.[0] || null;
        return {
          id: building.id,
          type: building.type,
          hp: building.hp ?? 0,
          maxHp: building.maxHp ?? 0,
          inactive: Boolean(building.inactive),
          balance: Math.max(0, Number(building.balance || 0)),
          canCollectMoney: typeof building.balance === "number",
          isSelectedRespawn:
            building.type === "respawn" && building.id === respawnBuildingId,
          interaction
        };
      })
      .sort((a, b) => {
        const typeCompare = String(a.type).localeCompare(String(b.type));
        if (typeCompare !== 0) return typeCompare;
        return String(a.id).localeCompare(String(b.id));
      });
    setOwnedBuildings(nextOwnedBuildings);

    if (!player.ready) {
      setStorageOpen(false);
      setShopOpen(false);
      setStorageId(null);
      setStorageOwner(null);
      setShopOwner(null);
      setUpgradeOpen(false);
      setUpgradeOwner(null);
      setRespawnOpen(false);
      setRespawnOwner(null);
      setTeleportOpen(false);
      setTeleportOwner(null);
      setStorageBuilding(null);
      setShopBuilding(null);
      setUpgradeBuilding(null);
      setRespawnBuilding(null);
      setTeleportBuilding(null);
      setTeleportTargets([]);
      setTeleportError("");
      return;
    }

    let nextStorage = null;
    let nextShop = null;
    let nextUpgrade = null;
    let nextRespawn = null;
    let nextTeleport = null;

    for (const building of buildingsRef.current) {
      if (building.type === "storage" && building.entrance) {
        if (
          building.entrance.x === player.tx &&
          building.entrance.y === player.ty
        ) {
          const owner = building.owner || "";
          const isOwner = !owner || owner === me;
          if ((building.inactive && owner === me) || (!building.inactive && isOwner)) {
            nextStorage = building;
          }
        }
      }

      if (building.type === "shop" && building.center) {
        if (building.center.x === player.tx && building.center.y === player.ty) {
          const owner = building.owner || "";
          if ((building.inactive && owner === me) || !building.inactive) {
            nextShop = building;
          }
        }
      }

      if (building.type === "upgrade" && building.center) {
        if (building.center.x === player.tx && building.center.y === player.ty) {
          const owner = building.owner || "";
          if ((building.inactive && owner === me) || !building.inactive) {
            nextUpgrade = building;
          }
        }
      }

      if (building.type === "respawn" && building.center) {
        if (building.center.x === player.tx && building.center.y === player.ty) {
          const owner = building.owner || "";
          if ((building.inactive && owner === me) || owner === me) {
            nextRespawn = building;
          }
        }
      }

      if (building.type === "teleport" && building.center) {
        if (building.center.x === player.tx && building.center.y === player.ty) {
          const owner = building.owner || "";
          if ((building.inactive && owner === me) || !building.inactive) {
            nextTeleport = building;
          }
        }
      }
    }

    const nextTeleportTargets = nextTeleport?.center
      ? buildingsRef.current
          .filter(
            (building) =>
              building.type === "teleport" &&
              !building.inactive &&
              building.center
          )
          .map((building) => {
            const dx = building.center.x - nextTeleport.center.x;
            const dy = building.center.y - nextTeleport.center.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return {
              id: building.id,
              owner: building.owner || "",
              center: building.center,
              distance,
              isCurrent: building.id === nextTeleport.id,
              inRange: building.id !== nextTeleport.id && distance <= 1000
            };
          })
          .sort((a, b) => {
            if (a.isCurrent) return -1;
            if (b.isCurrent) return 1;
            return a.distance - b.distance || String(a.id).localeCompare(String(b.id));
          })
      : [];

    setStorageBuilding(nextStorage);
    setShopBuilding(nextShop);
    setUpgradeBuilding(nextUpgrade);
    setRespawnBuilding(nextRespawn);
    setTeleportBuilding(nextTeleport);
    setStorageOpen(Boolean(nextStorage));
    setShopOpen(Boolean(nextShop));
    setUpgradeOpen(Boolean(nextUpgrade));
    setTeleportOpen(Boolean(nextTeleport));
    if (nextRespawn && suppressRespawnAutoOpen) {
      setRespawnOpen(false);
    } else {
      setRespawnOpen(Boolean(nextRespawn));
    }
    setTeleportTargets(nextTeleportTargets);
    setStorageId(nextStorage?.id || null);
    setStorageOwner(nextStorage?.owner || null);
    setShopOwner(nextShop?.owner || null);
    setUpgradeOwner(nextUpgrade?.owner || null);
    setRespawnOwner(nextRespawn?.owner || null);
    setTeleportOwner(nextTeleport?.owner || null);
    if (!nextTeleport) {
      setTeleportError("");
    }
    if (!nextRespawn && suppressRespawnAutoOpen) {
      setSuppressRespawnAutoOpen?.(false);
    }
  }, [
    buildingsRef,
    localPlayerRef,
    respawnBuildingId,
    setSuppressRespawnAutoOpen,
    suppressRespawnAutoOpen,
    usernameRef
  ]);

  useEffect(() => {
    storageIdRef.current = storageId;
  }, [storageId]);

  useEffect(() => {
    updateBuildingWindows();
  }, [respawnBuildingId, updateBuildingWindows]);

  useEffect(() => {
    setShopSell((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of SHOP_ITEMS) {
        const max = Number(inventory[item.id] || 0);
        const current = Number(prev[item.id] || 0);
        const clamped = Math.max(0, Math.min(current, max));
        if (clamped !== current) {
          next[item.id] = clamped;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [inventory]);

  useEffect(() => {
    if (!storageOpen || !storageId || storageBuilding?.inactive) return;
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    openStorage(socket, storageId);
  }, [socketRef, storageBuilding?.inactive, storageId, storageOpen]);

  useEffect(() => {
    if (storageOpen) return;
    setStorageState(EMPTY_CRYSTALS);
    setStorageTransfer(EMPTY_CRYSTALS);
    setStorageTab("storage");
  }, [storageOpen]);

  useEffect(() => {
    if (!shopOpen) {
      setShopTab("sell");
      return;
    }
    const me = usernameRef.current || "";
    if (shopBuilding?.inactive && shopOwner === me) {
      setShopTab("manage");
      return;
    }
    if (shopTab === "manage" && shopOwner !== me) {
      setShopTab("sell");
    }
  }, [shopBuilding?.inactive, shopOpen, shopOwner, shopTab, usernameRef]);

  useEffect(() => {
    if (!upgradeOpen) {
      setUpgradeTab("upgrade");
      return;
    }
    const me = usernameRef.current || "";
    if (upgradeBuilding?.inactive && upgradeOwner === me) {
      setUpgradeTab("manage");
      return;
    }
    if (upgradeTab === "manage" && upgradeOwner !== me) {
      setUpgradeTab("upgrade");
    }
  }, [upgradeBuilding?.inactive, upgradeOpen, upgradeOwner, upgradeTab, usernameRef]);

  useEffect(() => {
    if (!respawnOpen) {
      setRespawnTab("respawn");
      return;
    }
    const me = usernameRef.current || "";
    if (respawnBuilding?.inactive && respawnOwner === me) {
      setRespawnTab("manage");
      return;
    }
    if (respawnTab === "manage" && respawnOwner !== me) {
      setRespawnTab("respawn");
    }
  }, [respawnBuilding?.inactive, respawnOpen, respawnOwner, respawnTab, usernameRef]);

  useEffect(() => {
    if (!teleportOpen) {
      setTeleportTab("use");
      setTeleportError("");
      return;
    }
    const me = usernameRef.current || "";
    if (teleportBuilding?.inactive && teleportOwner === me) {
      setTeleportTab("manage");
      return;
    }
    if (teleportTab === "manage" && teleportOwner !== me) {
      setTeleportTab("use");
    }
  }, [teleportBuilding?.inactive, teleportOpen, teleportOwner, teleportTab, usernameRef]);

  useEffect(() => {
    const me = usernameRef.current || "";
    if (!storageOpen) return;
    if (storageBuilding?.inactive && storageOwner === me) {
      setStorageTab("manage");
      return;
    }
    if (storageTab === "manage" && storageOwner !== me) {
      setStorageTab("storage");
    }
  }, [storageBuilding?.inactive, storageOpen, storageOwner, storageTab, usernameRef]);

  function requestSkillUpgrade(id) {
    if (!id) return;
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    sendSkillUpgrade(socket, id);
  }

  function requestSkillSlotSet(slot, id) {
    if (slot == null || !id) return;
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    sendSkillSlotSet(socket, slot, id);
  }

  function sellCrystal(id, amount = 1) {
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    sendSellCrystal(socket, id, amount);
  }

  function updateShopSell(id, value, max) {
    const numeric = Math.floor(Number(value) || 0);
    const clamped = Math.max(0, Math.min(numeric, max));
    setShopSell((prev) => ({
      ...prev,
      [id]: clamped
    }));
  }

  function updateShopBuy(id, value) {
    const numeric = Math.floor(Number(value) || 0);
    const clamped = Math.max(0, Number.isFinite(numeric) ? numeric : 0);
    setShopBuy((prev) => ({
      ...prev,
      [id]: clamped
    }));
  }

  function updateStorageTransferValue(id, value) {
    const numeric = Math.floor(Number(value) || 0);
    const clamped = Math.max(0, Number.isFinite(numeric) ? numeric : 0);
    setStorageTransfer((prev) => ({
      ...prev,
      [id]: clamped
    }));
  }

  const sellCountTotal = useMemo(
    () => SHOP_ITEMS.reduce((sum, item) => sum + (shopSell[item.id] ?? 0), 0),
    [shopSell]
  );
  const buyCountTotal = useMemo(
    () => SHOP_ITEMS.reduce((sum, item) => sum + (shopBuy[item.id] ?? 0), 0),
    [shopBuy]
  );
  const sellTotal = useMemo(
    () => SHOP_ITEMS.reduce((sum, item) => sum + (shopSell[item.id] ?? 0) * item.price, 0),
    [shopSell]
  );
  const buyTotal = useMemo(
    () => SHOP_ITEMS.reduce((sum, item) => sum + (shopBuy[item.id] ?? 0) * item.price * 2, 0),
    [shopBuy]
  );

  function sellSelectedCrystals() {
    if (sellCountTotal <= 0) return;
    for (const item of SHOP_ITEMS) {
      const amount = shopSell[item.id] ?? 0;
      if (amount > 0) {
        sellCrystal(item.id, amount);
      }
    }
    setShopSell(EMPTY_CRYSTALS);
  }

  function moveStorageCrystal(id, dir) {
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    const storageIdValue = storageIdRef.current;
    if (!storageIdValue) return;
    const desired = Math.floor(Number(storageTransfer[id] || 0));
    if (!Number.isFinite(desired) || desired <= 0) return;
    const max = dir === "deposit" ? inventory[id] ?? 0 : storageState[id] ?? 0;
    const amount = Math.min(max, desired);
    if (amount <= 0) return;
    sendStorageMove(socket, storageIdValue, id, amount, dir);
    setStorageTransfer((prev) => ({ ...prev, [id]: 0 }));
  }

  function buySelectedCrystals() {
    if (buyCountTotal <= 0) return;
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    for (const item of SHOP_ITEMS) {
      const amount = shopBuy[item.id] ?? 0;
      if (amount > 0) {
        sendBuyCrystal(socket, item.id, amount);
      }
    }
    setShopBuy(EMPTY_CRYSTALS);
  }

  function repairCurrentBuilding(building, amount) {
    if (!building?.id) return;
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    const maxRepair = Math.min(
      inventory.blue ?? 0,
      Math.max(0, (building.maxHp ?? 0) - (building.hp ?? 0))
    );
    const safeAmount = clampRepairAmount(amount, maxRepair);
    if (safeAmount <= 0) return;
    sendRepairBuilding(socket, building.id, safeAmount);
  }

  function collectBuildingMoney(id) {
    const socket = socketRef.current;
    if (!isSocketOpen(socket) || !id) return;
    sendCollectBuildingMoney(socket, id);
  }

  function collectAllBuildingMoney() {
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    sendCollectAllBuildingMoney(socket);
  }

  function setRespawnHere() {
    const socket = socketRef.current;
    if (!isSocketOpen(socket) || !respawnBuilding || respawnBuilding.inactive) return;
    sendSetRespawnHere(socket);
  }

  function resetRespawnSelection() {
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    sendResetRespawn(socket);
  }

  function useTeleportTarget(id) {
    const socket = socketRef.current;
    if (!isSocketOpen(socket) || !id) return;
    setTeleportError("");
    sendUseTeleport(socket, id);
  }

  function forceDeath() {
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    sendForceDeath(socket);
  }

  return {
    buyCountTotal,
    buySelectedCrystals,
    buyTotal,
    collectAllBuildingMoney,
    collectBuildingMoney,
    requestSkillSlotSet,
    requestSkillUpgrade,
    sellCountTotal,
    sellSelectedCrystals,
    sellTotal,
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
    teleportBuilding,
    teleportError,
    teleportOpen,
    teleportOwner,
    teleportTab,
    teleportTargets,
    updateBuildingWindows,
    updateShopBuy,
    updateShopSell,
    updateStorageTransferValue,
    upgradeBuilding,
    upgradeOpen,
    upgradeOwner,
    upgradeTab,
    moveStorageCrystal,
    repairShop: (amount) => repairCurrentBuilding(shopBuilding, amount),
    repairStorage: (amount) => repairCurrentBuilding(storageBuilding, amount),
    repairUpgrade: (amount) => repairCurrentBuilding(upgradeBuilding, amount),
    repairRespawn: (amount) => repairCurrentBuilding(respawnBuilding, amount),
    repairTeleport: (amount) => repairCurrentBuilding(teleportBuilding, amount),
    respawnBuilding,
    respawnOpen,
    respawnOwner,
    respawnTab,
    respawnBuildingId,
    setRespawnHere,
    setRespawnTab,
    resetRespawnSelection,
    setTeleportError,
    setTeleportTab,
    useTeleportTarget,
    forceDeath
  };
}
