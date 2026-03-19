const {
  MAP_W,
  MAP_H,
  TILE_TYPES,
  BUILDING_TYPES,
  BUILDING_MAX_HP,
  BUILDING_DESTROY_TIMEOUT_MS,
  TELEPORT_PRICE
} = require("./config");

function parseJsonField(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function stringifyJsonField(value) {
  return value == null ? null : JSON.stringify(value);
}

function buildStorageShape(entranceX, entranceY) {
  const tiles = [];
  const x = entranceX - 1;
  const y = entranceY - 1;
  for (let ty = y; ty < y + 2; ty += 1) {
    for (let tx = x; tx < x + 3; tx += 1) {
      if (tx === entranceX && ty === entranceY) continue;
      tiles.push({ x: tx, y: ty });
    }
  }
  return {
    x,
    y,
    w: 3,
    h: 2,
    entrance: { x: entranceX, y: entranceY },
    tiles
  };
}

function buildShopShape(centerX, centerY) {
  const tiles = [];
  const radius = 2;
  const x = centerX - radius;
  const y = centerY - radius;
  for (let ty = y; ty <= centerY + radius; ty += 1) {
    for (let tx = x; tx <= centerX + radius; tx += 1) {
      const onCross =
        (tx === centerX && Math.abs(ty - centerY) <= radius) ||
        (ty === centerY && Math.abs(tx - centerX) <= radius);
      const isCorner =
        (tx === x && ty === y) ||
        (tx === x && ty === centerY + radius) ||
        (tx === centerX + radius && ty === y) ||
        (tx === centerX + radius && ty === centerY + radius);
      if (onCross || isCorner) continue;
      tiles.push({ x: tx, y: ty });
    }
  }
  return {
    x,
    y,
    w: 5,
    h: 5,
    center: { x: centerX, y: centerY },
    entrances: [
      { x: centerX, y: centerY - radius },
      { x: centerX, y: centerY + radius },
      { x: centerX - radius, y: centerY },
      { x: centerX + radius, y: centerY }
    ],
    tiles
  };
}

function buildUpgradeShape(entranceX, entranceY) {
  const tiles = [];
  const x = entranceX - 1;
  const y = entranceY - 2;
  const center = { x: entranceX, y: entranceY - 1 };
  const topRightX = x + 2;
  for (let ty = y; ty < y + 3; ty += 1) {
    for (let tx = x; tx < x + 3; tx += 1) {
      if (tx === entranceX && ty === entranceY) continue;
      if (tx === center.x && ty === center.y) continue;
      if (ty === y && (tx === x || tx === topRightX)) continue;
      tiles.push({ x: tx, y: ty });
    }
  }
  return {
    x,
    y,
    w: 3,
    h: 3,
    entrance: { x: entranceX, y: entranceY },
    center,
    tiles
  };
}

function buildRespawnShape(entranceX, entranceY) {
  const tiles = [];
  const x = entranceX - 1;
  const y = entranceY - 2;
  const center = { x: entranceX, y: entranceY - 1 };
  for (let ty = y; ty < y + 3; ty += 1) {
    for (let tx = x; tx < x + 3; tx += 1) {
      if (tx === center.x && ty === center.y) continue;
      if (tx === entranceX && ty === entranceY) continue;
      tiles.push({ x: tx, y: ty });
    }
  }
  return {
    x,
    y,
    w: 3,
    h: 3,
    entrance: { x: entranceX, y: entranceY },
    center,
    tiles
  };
}

const SHAPE_BUILDERS = {
  storage: buildStorageShape,
  shop: buildShopShape,
  upgrade: buildUpgradeShape,
  respawn: buildRespawnShape,
  teleport: buildRespawnShape
};

const BUILDING_PREFIX = {
  storage: "s",
  shop: "m",
  upgrade: "u",
  respawn: "r",
  teleport: "t"
};

function createBuildingManager({
  dataDir,
  buildingDb,
  mapStore,
  players,
  bombByTile,
  broadcast
}) {
  if (!dataDir) throw new Error("dataDir is required");
  if (!buildingDb?.db) throw new Error("buildingDb is required");
  if (!mapStore) throw new Error("mapStore is required");

  const { getTile, getBuilding, setBuilding, replaceBuildingLayer } = mapStore;
  const {
    db,
    stmtCountBuildings,
    stmtSelectAllBuildings,
    stmtInsertOrReplaceBuilding,
    stmtDeleteBuilding
  } = buildingDb;
  const buildings = [];
  const buildingById = new Map();
  const buildingIdByTile = new Map();
  const dirtyBuildingIds = new Set();
  const deletedBuildingIds = new Set();
  let buildingSeq = 1;

  function tileKey(x, y) {
    return `${x},${y}`;
  }

  function hydrateBuilding(row) {
    return {
      id: String(row.id || ""),
      type: String(row.type || ""),
      x: Number(row.x || 0),
      y: Number(row.y || 0),
      w: Number(row.w || 0),
      h: Number(row.h || 0),
      owner: String(row.owner || "Admin"),
      hp: Number(row.hp || 0),
      maxHp: Number(row.max_hp || 0),
      inactive: Boolean(row.inactive),
      destroyAt: row.destroy_at == null ? null : Number(row.destroy_at),
      balance: Number(row.balance || 0),
      fee: Number(row.fee || 0),
      entrance: parseJsonField(row.entrance_json, null),
      center: parseJsonField(row.center_json, null),
      entrances: parseJsonField(row.entrances_json, []),
      tiles: parseJsonField(row.tiles_json, []),
      storage: parseJsonField(row.storage_json, null),
      createdAt: Number(row.created_at || 0)
    };
  }

  function serializeBuilding(building) {
    return {
      id: building.id,
      type: building.type,
      x: Math.floor(Number(building.x || 0)),
      y: Math.floor(Number(building.y || 0)),
      w: Math.max(1, Math.floor(Number(building.w || 1))),
      h: Math.max(1, Math.floor(Number(building.h || 1))),
      owner: String(building.owner || "Admin"),
      hp: Math.max(0, Math.floor(Number(building.hp || 0))),
      maxHp: Math.max(1, Math.floor(Number(building.maxHp || 1))),
      inactive: building.inactive ? 1 : 0,
      destroyAt: building.destroyAt == null ? null : Math.floor(Number(building.destroyAt)),
      balance: Math.max(0, Math.floor(Number(building.balance || 0))),
      fee: Math.max(0, Math.floor(Number(building.fee || 0))),
      entranceJson: stringifyJsonField(building.entrance || null),
      centerJson: stringifyJsonField(building.center || null),
      entrancesJson: stringifyJsonField(building.entrances || []),
      tilesJson: stringifyJsonField(building.tiles || []),
      storageJson: stringifyJsonField(building.storage || null),
      createdAt: Math.max(0, Math.floor(Number(building.createdAt || Date.now())))
    };
  }
  function normalizeBuilding(building, index) {
    const match = String(building?.id || "").match(/\d+/);
    if (match) {
      const num = Number(match[0]);
      if (Number.isFinite(num)) {
        buildingSeq = Math.max(buildingSeq, num + 1);
      }
    }

    if (!Number.isFinite(Number(building.createdAt)) || Number(building.createdAt) <= 0) {
      building.createdAt = Date.now() + index;
      dirtyBuildingIds.add(building.id);
    }
    if (!building.owner) {
      building.owner = "Admin";
      dirtyBuildingIds.add(building.id);
    }

    const shapeType = building.type === "teleport" ? "teleport" : building.type;
    if (SHAPE_BUILDERS[shapeType]) {
      const shape =
        shapeType === "shop"
          ? SHAPE_BUILDERS.shop(
              Number(building.center?.x ?? building.x + 2),
              Number(building.center?.y ?? building.y + 2)
            )
          : SHAPE_BUILDERS[shapeType](
              Number(building.entrance?.x ?? building.x + 1),
              Number(building.entrance?.y ?? building.y + (building.h === 2 ? 1 : 2))
            );
      building.x = shape.x;
      building.y = shape.y;
      building.w = shape.w;
      building.h = shape.h;
      building.tiles = shape.tiles;
      if (shape.entrance) building.entrance = shape.entrance;
      if (shape.center) building.center = shape.center;
      if (shape.entrances) building.entrances = shape.entrances;
    }

    if (building.type === "storage" && !building.storage) {
      building.storage = {
        green: 0,
        blue: 0,
        white: 0,
        red: 0,
        pink: 0,
        cyan: 0
      };
      dirtyBuildingIds.add(building.id);
    }
    if ((building.type === "shop" || building.type === "upgrade" || building.type === "teleport") && !Number.isFinite(Number(building.balance))) {
      building.balance = 0;
      dirtyBuildingIds.add(building.id);
    }
    if (building.type === "teleport" && !Number.isFinite(Number(building.fee))) {
      building.fee = TELEPORT_PRICE;
      dirtyBuildingIds.add(building.id);
    }
    if (!Number.isFinite(Number(building.maxHp))) {
      building.maxHp = BUILDING_MAX_HP;
      dirtyBuildingIds.add(building.id);
    }
    if (!Number.isFinite(Number(building.hp))) {
      building.hp = building.maxHp;
      dirtyBuildingIds.add(building.id);
    }

    building.maxHp = Math.max(1, Math.floor(Number(building.maxHp)));
    building.hp = Math.max(0, Math.min(building.maxHp, Math.floor(Number(building.hp))));

    if (building.hp <= 0) {
      if (!building.inactive) {
        building.inactive = true;
        dirtyBuildingIds.add(building.id);
      }
      if (!Number.isFinite(Number(building.destroyAt))) {
        building.destroyAt = Date.now() + BUILDING_DESTROY_TIMEOUT_MS;
        dirtyBuildingIds.add(building.id);
      }
    } else {
      if (building.inactive) {
        building.inactive = false;
        dirtyBuildingIds.add(building.id);
      }
      if (building.destroyAt != null) {
        building.destroyAt = null;
        dirtyBuildingIds.add(building.id);
      }
    }
  }

  function rebuildIndexes() {
    buildingById.clear();
    buildingIdByTile.clear();
    for (const building of buildings) {
      if (!building?.id) continue;
      buildingById.set(building.id, building);
      for (const tile of building.tiles || []) {
        buildingIdByTile.set(tileKey(tile.x, tile.y), building.id);
      }
    }
  }

  const persistedBuildings = Number(stmtCountBuildings.get()?.count || 0);
  if (persistedBuildings > 0) {
    for (const row of stmtSelectAllBuildings.all()) {
      buildings.push(hydrateBuilding(row));
    }
  }

  for (let i = 0; i < buildings.length; i += 1) {
    normalizeBuilding(buildings[i], i);
  }
  rebuildIndexes();

  const flushTxn = db.transaction(() => {
    for (const id of deletedBuildingIds) {
      stmtDeleteBuilding.run(id);
    }
    for (const id of dirtyBuildingIds) {
      const building = buildingById.get(id);
      if (!building) continue;
      stmtInsertOrReplaceBuilding.run(serializeBuilding(building));
    }
  });

  function markDirty(buildingId) {
    if (!buildingId) return;
    deletedBuildingIds.delete(buildingId);
    dirtyBuildingIds.add(buildingId);
  }

  function flush() {
    if (dirtyBuildingIds.size === 0 && deletedBuildingIds.size === 0) return;
    flushTxn();
    dirtyBuildingIds.clear();
    deletedBuildingIds.clear();
  }

  function syncBuildingLayer() {
    const expected = new Uint8Array(MAP_W * MAP_H);
    let invalidTileCount = 0;
    let overlapCount = 0;
    for (const building of buildings) {
      const typeValue = BUILDING_TYPES[building?.type] ?? BUILDING_TYPES.none;
      if (typeValue === BUILDING_TYPES.none) continue;
      for (const tile of building.tiles || []) {
        const x = Math.floor(Number(tile?.x));
        const y = Math.floor(Number(tile?.y));
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) {
          invalidTileCount += 1;
          continue;
        }
        const index = y * MAP_W + x;
        if (expected[index] !== BUILDING_TYPES.none) overlapCount += 1;
        expected[index] = typeValue;
      }
    }
    return {
      repairedCells: replaceBuildingLayer(expected),
      invalidTileCount,
      overlapCount,
      buildingCount: buildings.length
    };
  }

  function validateAndRepairBuildings() {
    const occupiedTiles = new Set();
    const removals = [];
    const normalizedCount = dirtyBuildingIds.size;
    let removedInvalidCount = 0;
    let removedOverlapCount = 0;
    let removedTerrainConflictCount = 0;

    for (const building of buildings) {
      const typeValue = BUILDING_TYPES[building?.type] ?? BUILDING_TYPES.none;
      if (!building?.id || typeValue === BUILDING_TYPES.none) {
        removals.push({ id: building?.id, reason: "invalid" });
        removedInvalidCount += 1;
        continue;
      }

      const localTiles = new Set();
      let invalidGeometry = false;
      let terrainConflict = false;
      let overlapConflict = false;
      for (const tile of building.tiles || []) {
        const x = Math.floor(Number(tile?.x));
        const y = Math.floor(Number(tile?.y));
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) {
          invalidGeometry = true;
          break;
        }
        const key = tileKey(x, y);
        if (localTiles.has(key)) {
          invalidGeometry = true;
          break;
        }
        localTiles.add(key);
        if (getTile(x, y) !== TILE_TYPES.empty) {
          terrainConflict = true;
          break;
        }
        if (occupiedTiles.has(key)) {
          overlapConflict = true;
          break;
        }
      }

      if (invalidGeometry || localTiles.size === 0) {
        removals.push({ id: building.id, reason: "invalid" });
        removedInvalidCount += 1;
        continue;
      }
      if (terrainConflict) {
        removals.push({ id: building.id, reason: "terrain" });
        removedTerrainConflictCount += 1;
        continue;
      }
      if (overlapConflict) {
        removals.push({ id: building.id, reason: "overlap" });
        removedOverlapCount += 1;
        continue;
      }
      for (const key of localTiles) {
        occupiedTiles.add(key);
      }
    }

    for (const removal of removals) {
      removeBuildingById(removal.id, { broadcastRemoval: false });
    }
    flush();

    const layerResult = syncBuildingLayer();
    return {
      normalizedCount,
      removedInvalidCount,
      removedOverlapCount,
      removedTerrainConflictCount,
      ...layerResult
    };
  }

  function buildOccupiedSet(player) {
    const occupied = new Set();
    if (!players) return occupied;
    for (const p of players.values()) {
      if (player && p.id === player.id) continue;
      occupied.add(tileKey(p.tx, p.ty));
    }
    return occupied;
  }

  function getBuildingAtTile(x, y) {
    const id = buildingIdByTile.get(tileKey(x, y));
    return id ? buildingById.get(id) || null : null;
  }

  function getBuildingById(buildingId) {
    return buildingById.get(String(buildingId || "")) || null;
  }

  function broadcastBuildingUpdate(building) {
    if (building) {
      broadcast?.({ t: "building_update", building });
    }
  }

  function clearBuildingTiles(building) {
    for (const tile of building.tiles || []) {
      setBuilding(tile.x, tile.y, BUILDING_TYPES.none);
      buildingIdByTile.delete(tileKey(tile.x, tile.y));
    }
  }

  function removeBuildingById(buildingId, { broadcastRemoval = true } = {}) {
    const index = buildings.findIndex((entry) => entry.id === buildingId);
    if (index < 0) return false;
    const [building] = buildings.splice(index, 1);
    clearBuildingTiles(building);
    buildingById.delete(buildingId);
    dirtyBuildingIds.delete(buildingId);
    deletedBuildingIds.add(buildingId);
    if (broadcastRemoval) {
      broadcast?.({
        t: "building_destroyed",
        id: building.id,
        tiles: (building.tiles || []).map((tile) => ({
          x: tile.x,
          y: tile.y,
          value: BUILDING_TYPES.none
        }))
      });
    }
    return true;
  }

  function damageBuilding(buildingId, amount) {
    const building = buildingById.get(buildingId);
    const damage = Math.max(0, Math.floor(Number(amount) || 0));
    if (!building || damage <= 0 || building.hp <= 0) return building || null;
    building.hp = Math.max(0, building.hp - damage);
    if (building.hp <= 0) {
      building.inactive = true;
      building.destroyAt = Date.now() + BUILDING_DESTROY_TIMEOUT_MS;
    }
    markDirty(building.id);
    broadcastBuildingUpdate(building);
    return building;
  }

  function repairBuilding(buildingId, amount) {
    const building = buildingById.get(buildingId);
    const repair = Math.max(0, Math.floor(Number(amount) || 0));
    if (!building || repair <= 0 || building.hp >= building.maxHp) return building || null;
    building.hp = Math.min(building.maxHp, building.hp + repair);
    if (building.hp > 0) {
      building.inactive = false;
      building.destroyAt = null;
    }
    markDirty(building.id);
    broadcastBuildingUpdate(building);
    return building;
  }
  function creditBuildingBalance(buildingId, amount) {
    const building = buildingById.get(String(buildingId || ""));
    const delta = Math.max(0, Math.floor(Number(amount) || 0));
    if (!building || delta <= 0 || typeof building.balance !== "number") return 0;
    building.balance += delta;
    markDirty(building.id);
    broadcastBuildingUpdate(building);
    return delta;
  }

  function collectBuildingBalance(buildingId, ownerName) {
    const building = buildingById.get(String(buildingId || ""));
    if (!building || building.owner !== ownerName) return 0;
    const amount = Math.max(0, Math.floor(Number(building.balance || 0)));
    if (amount <= 0) return 0;
    building.balance = 0;
    markDirty(building.id);
    broadcastBuildingUpdate(building);
    return amount;
  }

  function collectAllOwnerBalances(ownerName) {
    let total = 0;
    for (const building of buildings) {
      if (building.owner !== ownerName || typeof building.balance !== "number") continue;
      const amount = Math.max(0, Math.floor(Number(building.balance || 0)));
      if (amount <= 0) continue;
      building.balance = 0;
      total += amount;
      markDirty(building.id);
      broadcastBuildingUpdate(building);
    }
    return total;
  }

  function destroyExpiredBuildings(now = Date.now()) {
    const expired = buildings
      .filter(
        (building) =>
          building.inactive &&
          building.hp <= 0 &&
          Number.isFinite(Number(building.destroyAt)) &&
          Number(building.destroyAt) <= now
      )
      .map((building) => building.id);
    for (const id of expired) {
      removeBuildingById(id);
    }
    return expired.length;
  }

  function canAccessStorage(player, building, { allowInactiveOwner = false } = {}) {
    if (!building || building.type !== "storage") return false;
    if (building.entrance?.x !== player.tx || building.entrance?.y !== player.ty) {
      return false;
    }
    const owner = building.owner || "";
    const isOwner = !owner || owner === player.username;
    if (!isOwner) return false;
    if (building.inactive) {
      return allowInactiveOwner && owner === player.username;
    }
    return true;
  }

  function canAccessCenterBuilding(player, building, { allowInactiveOwner = false } = {}) {
    if (!building) return false;
    if (building.center?.x !== player.tx || building.center?.y !== player.ty) {
      return false;
    }
    if (building.inactive) {
      return allowInactiveOwner && building.owner === player.username;
    }
    return true;
  }

  function getBuildingForRepair(player, buildingId) {
    const building = buildingById.get(String(buildingId || ""));
    if (!building || building.owner !== player.username) return null;
    if (building.type === "storage") {
      return canAccessStorage(player, building, { allowInactiveOwner: true }) ? building : null;
    }
    if (
      building.type === "shop" ||
      building.type === "upgrade" ||
      building.type === "respawn" ||
      building.type === "teleport"
    ) {
      return canAccessCenterBuilding(player, building, { allowInactiveOwner: true })
        ? building
        : null;
    }
    return null;
  }

  function canPlaceShape(shape, player) {
    if (shape.x < 0 || shape.y < 0 || shape.x + shape.w > MAP_W || shape.y + shape.h > MAP_H) {
      return false;
    }
    const occupied = buildOccupiedSet(player);
    const checkX0 = shape.x - 1;
    const checkY0 = shape.y - 1;
    const checkX1 = shape.x + shape.w;
    const checkY1 = shape.y + shape.h;
    if (checkX0 < 0 || checkY0 < 0 || checkX1 >= MAP_W || checkY1 >= MAP_H) {
      return false;
    }
    for (let y = checkY0; y <= checkY1; y += 1) {
      for (let x = checkX0; x <= checkX1; x += 1) {
        if (getTile(x, y) !== TILE_TYPES.empty) return false;
        if (getBuilding(x, y) !== BUILDING_TYPES.none) return false;
        if (bombByTile?.has(tileKey(x, y))) return false;
        if (occupied.has(tileKey(x, y))) return false;
      }
    }
    return true;
  }

  function placeBuildingOfType(player, type, primaryX, primaryY, extra = {}) {
    const shape = SHAPE_BUILDERS[type](primaryX, primaryY);
    if (!canPlaceShape(shape, player)) return false;
    const value = BUILDING_TYPES[type];
    const tiles = [];
    for (const tile of shape.tiles) {
      setBuilding(tile.x, tile.y, value);
      buildingIdByTile.set(tileKey(tile.x, tile.y), `${BUILDING_PREFIX[type]}${buildingSeq}`);
      tiles.push({ x: tile.x, y: tile.y, value });
    }
    const building = {
      id: `${BUILDING_PREFIX[type]}${buildingSeq++}`,
      type,
      x: shape.x,
      y: shape.y,
      w: shape.w,
      h: shape.h,
      owner: player.username,
      tiles: shape.tiles.map((tile) => ({ x: tile.x, y: tile.y })),
      hp: BUILDING_MAX_HP,
      maxHp: BUILDING_MAX_HP,
      inactive: false,
      destroyAt: null,
      createdAt: Date.now(),
      ...extra
    };
    if (shape.entrance) building.entrance = shape.entrance;
    if (shape.center) building.center = shape.center;
    if (shape.entrances) building.entrances = shape.entrances;

    buildings.push(building);
    buildingById.set(building.id, building);
    for (const tile of building.tiles) {
      buildingIdByTile.set(tileKey(tile.x, tile.y), building.id);
    }
    markDirty(building.id);
    broadcast?.({ t: "building_place", building, tiles });
    return true;
  }

  function placeStorage(player, entranceX, entranceY) {
    if (!Number.isInteger(entranceX) || !Number.isInteger(entranceY)) return false;
    if (player.facingX !== 0 || player.facingY !== -1) return false;
    return placeBuildingOfType(player, "storage", entranceX, entranceY, {
      storage: { green: 0, blue: 0, white: 0, red: 0, pink: 0, cyan: 0 }
    });
  }

  function placeShop(player, centerX, centerY) {
    if (!Number.isInteger(centerX) || !Number.isInteger(centerY)) return false;
    if (player.facingX !== 0 || player.facingY !== -1) return false;
    return placeBuildingOfType(player, "shop", centerX, centerY, { balance: 0 });
  }

  function placeUpgrade(player, entranceX, entranceY) {
    if (!Number.isInteger(entranceX) || !Number.isInteger(entranceY)) return false;
    if (player.facingX !== 0 || player.facingY !== -1) return false;
    return placeBuildingOfType(player, "upgrade", entranceX, entranceY, { balance: 0 });
  }

  function placeRespawn(player, entranceX, entranceY) {
    if (!Number.isInteger(entranceX) || !Number.isInteger(entranceY)) return false;
    if (player.facingX !== 0 || player.facingY !== -1) return false;
    return placeBuildingOfType(player, "respawn", entranceX, entranceY);
  }

  function placeTeleport(player, entranceX, entranceY) {
    if (!Number.isInteger(entranceX) || !Number.isInteger(entranceY)) return false;
    if (player.facingX !== 0 || player.facingY !== -1) return false;
    return placeBuildingOfType(player, "teleport", entranceX, entranceY, {
      balance: 0,
      fee: TELEPORT_PRICE
    });
  }
  function isPlayerInShopCenter(player) {
    return Boolean(shopAtPlayer(player));
  }

  function shopAtPlayer(player) {
    if (!player) return null;
    for (const building of buildings) {
      if (building.type === "shop" && canAccessCenterBuilding(player, building)) {
        return building;
      }
    }
    return null;
  }

  function isPlayerInUpgradeCenter(player) {
    return Boolean(upgradeAtPlayer(player));
  }

  function upgradeAtPlayer(player) {
    if (!player) return null;
    for (const building of buildings) {
      if (building.type === "upgrade" && canAccessCenterBuilding(player, building)) {
        return building;
      }
    }
    return null;
  }

  function storageAtPlayer(player) {
    if (!player) return null;
    for (const building of buildings) {
      if (building.type === "storage" && canAccessStorage(player, building)) {
        if (!building.storage) {
          building.storage = {
            green: 0,
            blue: 0,
            white: 0,
            red: 0,
            pink: 0,
            cyan: 0
          };
          markDirty(building.id);
        }
        return building;
      }
    }
    return null;
  }

  function respawnAtPlayer(player, { allowInactiveOwner = false } = {}) {
    if (!player) return null;
    for (const building of buildings) {
      if (building.type !== "respawn" || building.owner !== player.username) continue;
      if (canAccessCenterBuilding(player, building, { allowInactiveOwner })) return building;
    }
    return null;
  }

  function getRespawnSpawn(player) {
    const building = getBuildingById(player?.respawnBuildingId);
    if (!building || building.type !== "respawn") return null;
    if (building.owner !== player.username) return null;
    if (building.inactive || (building.hp ?? 0) <= 0 || !building.center) return null;
    return { tx: building.center.x, ty: building.center.y, buildingId: building.id };
  }

  function teleportAtPlayer(player, { allowInactiveOwner = false } = {}) {
    if (!player) return null;
    for (const building of buildings) {
      if (building.type !== "teleport") continue;
      if (canAccessCenterBuilding(player, building, { allowInactiveOwner })) return building;
    }
    return null;
  }

  flush();

  return {
    buildings,
    damageBuilding,
    destroyExpiredBuildings,
    flush,
    collectAllOwnerBalances,
    collectBuildingBalance,
    creditBuildingBalance,
    getBuildingAtTile,
    getBuildingById,
    getBuildingForRepair,
    getRespawnSpawn,
    isPlayerInShopCenter,
    isPlayerInUpgradeCenter,
    markDirty,
    placeRespawn,
    placeTeleport,
    placeShop,
    placeStorage,
    placeUpgrade,
    repairBuilding,
    respawnAtPlayer,
    shopAtPlayer,
    syncBuildingLayer,
    storageAtPlayer,
    teleportAtPlayer,
    upgradeAtPlayer,
    validateAndRepairBuildings
  };
}

module.exports = {
  createBuildingManager
};
