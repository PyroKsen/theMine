const fs = require("fs");
const path = require("path");
const {
  MAP_W,
  MAP_H,
  TILE_TYPES,
  BUILDING_TYPES,
  BUILDING_MAX_HP,
  BUILDING_DESTROY_TIMEOUT_MS,
  TELEPORT_PRICE
} = require("./config");

function createBuildingManager({ dataDir, mapStore, players, bombByTile, broadcast }) {
  if (!dataDir) {
    throw new Error("dataDir is required");
  }
  if (!mapStore) {
    throw new Error("mapStore is required");
  }

  const { getTile, getBuilding, setBuilding } = mapStore;
  const metaFile = path.join(dataDir, "buildings.json");

  function loadBuildingsMeta() {
    if (!fs.existsSync(metaFile)) return [];
    try {
      const raw = fs.readFileSync(metaFile, "utf-8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveBuildingsMeta(list) {
    fs.writeFileSync(metaFile, JSON.stringify(list));
  }

  function tileKey(x, y) {
    return `${x},${y}`;
  }

  function buildStorageTiles(entranceX, entranceY) {
    const tiles = [];
    const topLeftX = entranceX - 1;
    const topLeftY = entranceY - 1;
    for (let y = topLeftY; y < topLeftY + 2; y += 1) {
      for (let x = topLeftX; x < topLeftX + 3; x += 1) {
        if (x === entranceX && y === entranceY) continue;
        tiles.push({ x, y });
      }
    }
    return tiles;
  }

  function buildShopTiles(centerX, centerY) {
    const tiles = [];
    const radius = 2;
    const topLeftX = centerX - radius;
    const topLeftY = centerY - radius;
    for (let y = topLeftY; y <= centerY + radius; y += 1) {
      for (let x = topLeftX; x <= centerX + radius; x += 1) {
        const onCross =
          (x === centerX && Math.abs(y - centerY) <= radius) ||
          (y === centerY && Math.abs(x - centerX) <= radius);
        const isCorner =
          (x === topLeftX && y === topLeftY) ||
          (x === topLeftX && y === centerY + radius) ||
          (x === centerX + radius && y === topLeftY) ||
          (x === centerX + radius && y === centerY + radius);
        if (onCross || isCorner) continue;
        tiles.push({ x, y });
      }
    }
    return tiles;
  }

  function buildUpgradeTiles(entranceX, entranceY) {
    const tiles = [];
    const topLeftX = entranceX - 1;
    const topLeftY = entranceY - 2;
    const centerX = entranceX;
    const centerY = entranceY - 1;
    const topRightX = topLeftX + 2;
    for (let y = topLeftY; y < topLeftY + 3; y += 1) {
      for (let x = topLeftX; x < topLeftX + 3; x += 1) {
        if (x === entranceX && y === entranceY) continue;
        if (x === centerX && y === centerY) continue;
        if (y === topLeftY && (x === topLeftX || x === topRightX)) continue;
        tiles.push({ x, y });
      }
    }
    return tiles;
  }

  function buildRespawnTiles(entranceX, entranceY) {
    const tiles = [];
    const topLeftX = entranceX - 1;
    const topLeftY = entranceY - 2;
    const centerX = entranceX;
    const centerY = entranceY - 1;
    for (let y = topLeftY; y < topLeftY + 3; y += 1) {
      for (let x = topLeftX; x < topLeftX + 3; x += 1) {
        if (x === centerX && y === centerY) continue;
        if (x === entranceX && y === entranceY) continue;
        tiles.push({ x, y });
      }
    }
    return tiles;
  }

  function ensureBuildingShape(building) {
    if (building.type === "storage") {
      const entranceX = Number(building.entrance?.x ?? building.x + 1);
      const entranceY = Number(building.entrance?.y ?? building.y + 1);
      building.x = entranceX - 1;
      building.y = entranceY - 1;
      building.w = 3;
      building.h = 2;
      building.entrance = { x: entranceX, y: entranceY };
      if (!Array.isArray(building.tiles) || building.tiles.length === 0) {
        building.tiles = buildStorageTiles(entranceX, entranceY);
      }
    }

    if (building.type === "shop") {
      const centerX = Number(building.center?.x ?? building.x + 2);
      const centerY = Number(building.center?.y ?? building.y + 2);
      building.x = centerX - 2;
      building.y = centerY - 2;
      building.w = 5;
      building.h = 5;
      building.center = { x: centerX, y: centerY };
      if (!Array.isArray(building.entrances) || building.entrances.length === 0) {
        building.entrances = [
          { x: centerX, y: centerY - 2 },
          { x: centerX, y: centerY + 2 },
          { x: centerX - 2, y: centerY },
          { x: centerX + 2, y: centerY }
        ];
      }
      if (!Array.isArray(building.tiles) || building.tiles.length === 0) {
        building.tiles = buildShopTiles(centerX, centerY);
      }
      if (!Number.isFinite(Number(building.balance))) {
        building.balance = 0;
      }
    }

    if (building.type === "upgrade") {
      const entranceX = Number(building.entrance?.x ?? building.x + 1);
      const entranceY = Number(building.entrance?.y ?? building.y + 2);
      const centerX = Number(building.center?.x ?? entranceX);
      const centerY = Number(building.center?.y ?? entranceY - 1);
      building.x = entranceX - 1;
      building.y = entranceY - 2;
      building.w = 3;
      building.h = 3;
      building.entrance = { x: entranceX, y: entranceY };
      building.center = { x: centerX, y: centerY };
      if (!Array.isArray(building.tiles) || building.tiles.length === 0) {
        building.tiles = buildUpgradeTiles(entranceX, entranceY);
      }
      if (!Number.isFinite(Number(building.balance))) {
        building.balance = 0;
      }
    }

    if (building.type === "respawn") {
      const entranceX = Number(building.entrance?.x ?? building.x + 1);
      const entranceY = Number(building.entrance?.y ?? building.y + 2);
      const centerX = Number(building.center?.x ?? entranceX);
      const centerY = Number(building.center?.y ?? entranceY - 1);
      building.x = entranceX - 1;
      building.y = entranceY - 2;
      building.w = 3;
      building.h = 3;
      building.entrance = { x: entranceX, y: entranceY };
      building.center = { x: centerX, y: centerY };
      if (!Array.isArray(building.tiles) || building.tiles.length === 0) {
        building.tiles = buildRespawnTiles(entranceX, entranceY);
      }
    }

    if (building.type === "teleport") {
      const entranceX = Number(building.entrance?.x ?? building.x + 1);
      const entranceY = Number(building.entrance?.y ?? building.y + 2);
      const centerX = Number(building.center?.x ?? entranceX);
      const centerY = Number(building.center?.y ?? entranceY - 1);
      building.x = entranceX - 1;
      building.y = entranceY - 2;
      building.w = 3;
      building.h = 3;
      building.entrance = { x: entranceX, y: entranceY };
      building.center = { x: centerX, y: centerY };
      if (!Array.isArray(building.tiles) || building.tiles.length === 0) {
        building.tiles = buildRespawnTiles(entranceX, entranceY);
      }
      if (!Number.isFinite(Number(building.balance))) {
        building.balance = 0;
      }
      if (!Number.isFinite(Number(building.fee))) {
        building.fee = TELEPORT_PRICE;
      }
    }
  }

  const buildings = loadBuildingsMeta();
  let buildingSeq = 1;
  let buildingsMetaDirty = false;
  const buildingById = new Map();
  const buildingIdByTile = new Map();

  for (const building of buildings) {
    const match = String(building?.id || "").match(/\d+/);
    if (match) {
      const num = Number(match[0]);
      if (Number.isFinite(num)) {
        buildingSeq = Math.max(buildingSeq, num + 1);
      }
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
      buildingsMetaDirty = true;
    }
    if (!building.owner) {
      building.owner = "Admin";
      buildingsMetaDirty = true;
    }

    ensureBuildingShape(building);

    if (!Number.isFinite(Number(building.maxHp))) {
      building.maxHp = BUILDING_MAX_HP;
      buildingsMetaDirty = true;
    }
    if (!Number.isFinite(Number(building.hp))) {
      building.hp = building.maxHp;
      buildingsMetaDirty = true;
    }
    building.maxHp = Math.max(1, Math.floor(Number(building.maxHp)));
    building.hp = Math.max(0, Math.min(building.maxHp, Math.floor(Number(building.hp))));

    if (building.hp <= 0) {
      if (!building.inactive) {
        building.inactive = true;
        buildingsMetaDirty = true;
      }
      if (!Number.isFinite(Number(building.destroyAt))) {
        building.destroyAt = Date.now() + BUILDING_DESTROY_TIMEOUT_MS;
        buildingsMetaDirty = true;
      }
    } else {
      if (building.inactive) {
        building.inactive = false;
        buildingsMetaDirty = true;
      }
      if (building.destroyAt != null) {
        building.destroyAt = null;
        buildingsMetaDirty = true;
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

  rebuildIndexes();

  function markDirty() {
    buildingsMetaDirty = true;
  }

  function flush() {
    if (!buildingsMetaDirty) return;
    saveBuildingsMeta(buildings);
    buildingsMetaDirty = false;
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
    if (!building) return;
    broadcast?.({ t: "building_update", building });
  }

  function clearBuildingTiles(building) {
    for (const tile of building.tiles || []) {
      setBuilding(tile.x, tile.y, BUILDING_TYPES.none);
      buildingIdByTile.delete(tileKey(tile.x, tile.y));
    }
  }

  function removeBuildingById(buildingId) {
    const index = buildings.findIndex((entry) => entry.id === buildingId);
    if (index < 0) return false;
    const [building] = buildings.splice(index, 1);
    clearBuildingTiles(building);
    buildingById.delete(buildingId);
    markDirty();
    broadcast?.({
      t: "building_destroyed",
      id: building.id,
      tiles: (building.tiles || []).map((tile) => ({
        x: tile.x,
        y: tile.y,
        value: BUILDING_TYPES.none
      }))
    });
    return true;
  }

  function damageBuilding(buildingId, amount) {
    const building = buildingById.get(buildingId);
    if (!building) return null;
    const damage = Math.max(0, Math.floor(Number(amount) || 0));
    if (damage <= 0 || building.hp <= 0) return building;
    building.hp = Math.max(0, building.hp - damage);
    if (building.hp <= 0) {
      building.inactive = true;
      building.destroyAt = Date.now() + BUILDING_DESTROY_TIMEOUT_MS;
    }
    markDirty();
    broadcastBuildingUpdate(building);
    return building;
  }

  function repairBuilding(buildingId, amount) {
    const building = buildingById.get(buildingId);
    if (!building) return null;
    const repair = Math.max(0, Math.floor(Number(amount) || 0));
    if (repair <= 0 || building.hp >= building.maxHp) return building;
    building.hp = Math.min(building.maxHp, building.hp + repair);
    if (building.hp > 0) {
      building.inactive = false;
      building.destroyAt = null;
    }
    markDirty();
    broadcastBuildingUpdate(building);
    return building;
  }

  function creditBuildingBalance(buildingId, amount) {
    const building = buildingById.get(String(buildingId || ""));
    const delta = Math.max(0, Math.floor(Number(amount) || 0));
    if (!building || delta <= 0) return 0;
    if (typeof building.balance !== "number") {
      return 0;
    }
    building.balance += delta;
    markDirty();
    broadcastBuildingUpdate(building);
    return delta;
  }

  function collectBuildingBalance(buildingId, ownerName) {
    const building = buildingById.get(String(buildingId || ""));
    if (!building || building.owner !== ownerName) return 0;
    const amount = Math.max(0, Math.floor(Number(building.balance || 0)));
    if (amount <= 0) return 0;
    building.balance = 0;
    markDirty();
    broadcastBuildingUpdate(building);
    return amount;
  }

  function collectAllOwnerBalances(ownerName) {
    let total = 0;
    for (const building of buildings) {
      if (building.owner !== ownerName) continue;
      if (typeof building.balance !== "number") continue;
      const amount = Math.max(0, Math.floor(Number(building.balance || 0)));
      if (amount <= 0) continue;
      building.balance = 0;
      total += amount;
      broadcastBuildingUpdate(building);
    }
    if (total > 0) {
      markDirty();
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
    if (
      building.entrance?.x !== player.tx ||
      building.entrance?.y !== player.ty
    ) {
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
    if (
      building.center?.x !== player.tx ||
      building.center?.y !== player.ty
    ) {
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
      return canAccessStorage(player, building, { allowInactiveOwner: true })
        ? building
        : null;
    }
    if (building.type === "shop" || building.type === "upgrade") {
      return canAccessCenterBuilding(player, building, { allowInactiveOwner: true })
        ? building
        : null;
    }    if (building.type === "respawn" || building.type === "teleport") {
      return canAccessCenterBuilding(player, building, { allowInactiveOwner: true })
        ? building
        : null;
    }
    return null;
  }

  function canPlaceStorage(entranceX, entranceY, player) {
    const width = 3;
    const height = 2;
    const topLeftX = entranceX - 1;
    const topLeftY = entranceY - 1;
    if (
      topLeftX < 0 ||
      topLeftY < 0 ||
      topLeftX + width > MAP_W ||
      topLeftY + height > MAP_H
    ) {
      return false;
    }
    const occupied = buildOccupiedSet(player);
    const checkX0 = topLeftX - 1;
    const checkY0 = topLeftY - 1;
    const checkX1 = topLeftX + width;
    const checkY1 = topLeftY + height;
    if (
      checkX0 < 0 ||
      checkY0 < 0 ||
      checkX1 >= MAP_W ||
      checkY1 >= MAP_H
    ) {
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

  function placeStorage(player, entranceX, entranceY) {
    if (!Number.isInteger(entranceX) || !Number.isInteger(entranceY)) return false;
    if (player.facingX !== 0 || player.facingY !== -1) return false;
    if (!canPlaceStorage(entranceX, entranceY, player)) return false;

    const width = 3;
    const height = 2;
    const topLeftX = entranceX - 1;
    const topLeftY = entranceY - 1;
    const tiles = [];
    for (let y = topLeftY; y < topLeftY + height; y += 1) {
      for (let x = topLeftX; x < topLeftX + width; x += 1) {
        if (x === entranceX && y === entranceY) continue;
        setBuilding(x, y, BUILDING_TYPES.storage);
        tiles.push({ x, y, value: BUILDING_TYPES.storage });
      }
    }

    const building = {
      id: `s${buildingSeq++}`,
      type: "storage",
      x: topLeftX,
      y: topLeftY,
      w: width,
      h: height,
      entrance: { x: entranceX, y: entranceY },
      owner: player.username,
      storage: {
        green: 0,
        blue: 0,
        white: 0,
        red: 0,
        pink: 0,
        cyan: 0
      },
      tiles: tiles.map(({ x, y }) => ({ x, y })),
      hp: BUILDING_MAX_HP,
      maxHp: BUILDING_MAX_HP,
      inactive: false,
      destroyAt: null
    };
    buildings.push(building);
    buildingById.set(building.id, building);
    for (const tile of building.tiles) {
      buildingIdByTile.set(tileKey(tile.x, tile.y), building.id);
    }
    markDirty();
    broadcast?.({ t: "building_place", building, tiles });
    return true;
  }

  function canPlaceShop(centerX, centerY, player) {
    const radius = 2;
    const topLeftX = centerX - radius;
    const topLeftY = centerY - radius;
    const size = radius * 2 + 1;
    if (
      topLeftX < 0 ||
      topLeftY < 0 ||
      topLeftX + size > MAP_W ||
      topLeftY + size > MAP_H
    ) {
      return false;
    }
    const occupied = buildOccupiedSet(player);
    const checkX0 = topLeftX - 1;
    const checkY0 = topLeftY - 1;
    const checkX1 = topLeftX + size;
    const checkY1 = topLeftY + size;
    if (
      checkX0 < 0 ||
      checkY0 < 0 ||
      checkX1 >= MAP_W ||
      checkY1 >= MAP_H
    ) {
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

  function placeShop(player, centerX, centerY) {
    if (!Number.isInteger(centerX) || !Number.isInteger(centerY)) return false;
    if (player.facingX !== 0 || player.facingY !== -1) return false;
    if (!canPlaceShop(centerX, centerY, player)) return false;

    const radius = 2;
    const topLeftX = centerX - radius;
    const topLeftY = centerY - radius;
    const tiles = [];
    for (let y = topLeftY; y <= centerY + radius; y += 1) {
      for (let x = topLeftX; x <= centerX + radius; x += 1) {
        const onCross =
          (x === centerX && Math.abs(y - centerY) <= radius) ||
          (y === centerY && Math.abs(x - centerX) <= radius);
        const isCorner =
          (x === topLeftX && y === topLeftY) ||
          (x === topLeftX && y === centerY + radius) ||
          (x === centerX + radius && y === topLeftY) ||
          (x === centerX + radius && y === centerY + radius);
        if (onCross || isCorner) continue;
        setBuilding(x, y, BUILDING_TYPES.shop);
        tiles.push({ x, y, value: BUILDING_TYPES.shop });
      }
    }

    const entrances = [
      { x: centerX, y: centerY - radius },
      { x: centerX, y: centerY + radius },
      { x: centerX - radius, y: centerY },
      { x: centerX + radius, y: centerY }
    ];

    const building = {
      id: `m${buildingSeq++}`,
      type: "shop",
      x: topLeftX,
      y: topLeftY,
      w: radius * 2 + 1,
      h: radius * 2 + 1,
      center: { x: centerX, y: centerY },
      entrances,
      owner: player.username,
      balance: 0,
      tiles: tiles.map(({ x, y }) => ({ x, y })),
      hp: BUILDING_MAX_HP,
      maxHp: BUILDING_MAX_HP,
      inactive: false,
      destroyAt: null
    };
    buildings.push(building);
    buildingById.set(building.id, building);
    for (const tile of building.tiles) {
      buildingIdByTile.set(tileKey(tile.x, tile.y), building.id);
    }
    markDirty();
    broadcast?.({ t: "building_place", building, tiles });
    return true;
  }

  function canPlaceUpgrade(entranceX, entranceY, player) {
    const width = 3;
    const height = 3;
    const topLeftX = entranceX - 1;
    const topLeftY = entranceY - 2;
    if (
      topLeftX < 0 ||
      topLeftY < 0 ||
      topLeftX + width > MAP_W ||
      topLeftY + height > MAP_H
    ) {
      return false;
    }
    const occupied = buildOccupiedSet(player);
    const checkX0 = topLeftX - 1;
    const checkY0 = topLeftY - 1;
    const checkX1 = topLeftX + width;
    const checkY1 = topLeftY + height;
    if (
      checkX0 < 0 ||
      checkY0 < 0 ||
      checkX1 >= MAP_W ||
      checkY1 >= MAP_H
    ) {
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

  function placeUpgrade(player, entranceX, entranceY) {
    if (!Number.isInteger(entranceX) || !Number.isInteger(entranceY)) return false;
    if (player.facingX !== 0 || player.facingY !== -1) return false;
    if (!canPlaceUpgrade(entranceX, entranceY, player)) return false;

    const width = 3;
    const height = 3;
    const topLeftX = entranceX - 1;
    const topLeftY = entranceY - 2;
    const centerX = entranceX;
    const centerY = entranceY - 1;
    const topRightX = topLeftX + width - 1;
    const tiles = [];
    for (let y = topLeftY; y < topLeftY + height; y += 1) {
      for (let x = topLeftX; x < topLeftX + width; x += 1) {
        if (x === entranceX && y === entranceY) continue;
        if (x === centerX && y === centerY) continue;
        if (y === topLeftY && (x === topLeftX || x === topRightX)) continue;
        setBuilding(x, y, BUILDING_TYPES.upgrade);
        tiles.push({ x, y, value: BUILDING_TYPES.upgrade });
      }
    }

    const building = {
      id: `u${buildingSeq++}`,
      type: "upgrade",
      x: topLeftX,
      y: topLeftY,
      w: width,
      h: height,
      entrance: { x: entranceX, y: entranceY },
      center: { x: centerX, y: centerY },
      owner: player.username,
      balance: 0,
      tiles: tiles.map(({ x, y }) => ({ x, y })),
      hp: BUILDING_MAX_HP,
      maxHp: BUILDING_MAX_HP,
      inactive: false,
      destroyAt: null
    };
    buildings.push(building);
    buildingById.set(building.id, building);
    for (const tile of building.tiles) {
      buildingIdByTile.set(tileKey(tile.x, tile.y), building.id);
    }
    markDirty();
    broadcast?.({ t: "building_place", building, tiles });
    return true;
  }

  function canPlaceRespawn(entranceX, entranceY, player) {
    const width = 3;
    const height = 3;
    const topLeftX = entranceX - 1;
    const topLeftY = entranceY - 2;
    if (
      topLeftX < 0 ||
      topLeftY < 0 ||
      topLeftX + width > MAP_W ||
      topLeftY + height > MAP_H
    ) {
      return false;
    }
    const occupied = buildOccupiedSet(player);
    const checkX0 = topLeftX - 1;
    const checkY0 = topLeftY - 1;
    const checkX1 = topLeftX + width;
    const checkY1 = topLeftY + height;
    if (
      checkX0 < 0 ||
      checkY0 < 0 ||
      checkX1 >= MAP_W ||
      checkY1 >= MAP_H
    ) {
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

  function placeRespawn(player, entranceX, entranceY) {
    if (!Number.isInteger(entranceX) || !Number.isInteger(entranceY)) return false;
    if (player.facingX !== 0 || player.facingY !== -1) return false;
    if (!canPlaceRespawn(entranceX, entranceY, player)) return false;

    const width = 3;
    const height = 3;
    const topLeftX = entranceX - 1;
    const topLeftY = entranceY - 2;
    const centerX = entranceX;
    const centerY = entranceY - 1;
    const tiles = [];
    for (let y = topLeftY; y < topLeftY + height; y += 1) {
      for (let x = topLeftX; x < topLeftX + width; x += 1) {
        if (x === centerX && y === centerY) continue;
        if (x === entranceX && y === entranceY) continue;
        setBuilding(x, y, BUILDING_TYPES.respawn);
        tiles.push({ x, y, value: BUILDING_TYPES.respawn });
      }
    }

    const building = {
      id: `r${buildingSeq++}`,
      type: "respawn",
      x: topLeftX,
      y: topLeftY,
      w: width,
      h: height,
      entrance: { x: entranceX, y: entranceY },
      center: { x: centerX, y: centerY },
      owner: player.username,
      tiles: tiles.map(({ x, y }) => ({ x, y })),
      hp: BUILDING_MAX_HP,
      maxHp: BUILDING_MAX_HP,
      inactive: false,
      destroyAt: null
    };
    buildings.push(building);
    buildingById.set(building.id, building);
    for (const tile of building.tiles) {
      buildingIdByTile.set(tileKey(tile.x, tile.y), building.id);
    }
    markDirty();
    broadcast?.({ t: "building_place", building, tiles });
    return true;
  }

  function canPlaceTeleport(entranceX, entranceY, player) {
    return canPlaceRespawn(entranceX, entranceY, player);
  }

  function placeTeleport(player, entranceX, entranceY) {
    if (!Number.isInteger(entranceX) || !Number.isInteger(entranceY)) return false;
    if (player.facingX !== 0 || player.facingY !== -1) return false;
    if (!canPlaceTeleport(entranceX, entranceY, player)) return false;

    const width = 3;
    const height = 3;
    const topLeftX = entranceX - 1;
    const topLeftY = entranceY - 2;
    const centerX = entranceX;
    const centerY = entranceY - 1;
    const tiles = [];
    for (let y = topLeftY; y < topLeftY + height; y += 1) {
      for (let x = topLeftX; x < topLeftX + width; x += 1) {
        if (x === centerX && y === centerY) continue;
        if (x === entranceX && y === entranceY) continue;
        setBuilding(x, y, BUILDING_TYPES.teleport);
        tiles.push({ x, y, value: BUILDING_TYPES.teleport });
      }
    }

    const building = {
      id: `t${buildingSeq++}`,
      type: "teleport",
      x: topLeftX,
      y: topLeftY,
      w: width,
      h: height,
      entrance: { x: entranceX, y: entranceY },
      center: { x: centerX, y: centerY },
      owner: player.username,
      balance: 0,
      fee: TELEPORT_PRICE,
      tiles: tiles.map(({ x, y }) => ({ x, y })),
      hp: BUILDING_MAX_HP,
      maxHp: BUILDING_MAX_HP,
      inactive: false,
      destroyAt: null
    };
    buildings.push(building);
    buildingById.set(building.id, building);
    for (const tile of building.tiles) {
      buildingIdByTile.set(tileKey(tile.x, tile.y), building.id);
    }
    markDirty();
    broadcast?.({ t: "building_place", building, tiles });
    return true;
  }

  function isPlayerInShopCenter(player) {
    if (!player) return false;
    for (const building of buildings) {
      if (building.type !== "shop") continue;
      if (canAccessCenterBuilding(player, building)) {
        return true;
      }
    }
    return false;
  }

  function shopAtPlayer(player) {
    if (!player) return null;
    for (const building of buildings) {
      if (building.type !== "shop") continue;
      if (canAccessCenterBuilding(player, building)) {
        return building;
      }
    }
    return null;
  }

  function isPlayerInUpgradeCenter(player) {
    if (!player) return false;
    for (const building of buildings) {
      if (building.type !== "upgrade") continue;
      if (canAccessCenterBuilding(player, building)) {
        return true;
      }
    }
    return false;
  }

  function upgradeAtPlayer(player) {
    if (!player) return null;
    for (const building of buildings) {
      if (building.type !== "upgrade") continue;
      if (canAccessCenterBuilding(player, building)) {
        return building;
      }
    }
    return null;
  }

  function storageAtPlayer(player) {
    if (!player) return null;
    for (const building of buildings) {
      if (building.type !== "storage") continue;
      if (canAccessStorage(player, building)) {
        if (!building.storage) {
          building.storage = {
            green: 0,
            blue: 0,
            white: 0,
            red: 0,
            pink: 0,
            cyan: 0
          };
          markDirty();
        }
        return building;
      }
    }
    return null;
  }

  function respawnAtPlayer(player, { allowInactiveOwner = false } = {}) {
    if (!player) return null;
    for (const building of buildings) {
      if (building.type !== "respawn") continue;
      if (building.owner !== player.username) continue;
      if (canAccessCenterBuilding(player, building, { allowInactiveOwner })) {
        return building;
      }
    }
    return null;
  }

  function getRespawnSpawn(player) {
    const building = getBuildingById(player?.respawnBuildingId);
    if (!building || building.type !== "respawn") return null;
    if (building.owner !== player.username) return null;
    if (building.inactive || (building.hp ?? 0) <= 0) return null;
    if (!building.center) return null;
    return { tx: building.center.x, ty: building.center.y, buildingId: building.id };
  }
  function teleportAtPlayer(player, { allowInactiveOwner = false } = {}) {
    if (!player) return null;
    for (const building of buildings) {
      if (building.type !== "teleport") continue;
      if (canAccessCenterBuilding(player, building, { allowInactiveOwner })) {
        return building;
      }
    }
    return null;
  }

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
    storageAtPlayer,
    teleportAtPlayer,
    upgradeAtPlayer
  };
}

module.exports = {
  createBuildingManager
};


