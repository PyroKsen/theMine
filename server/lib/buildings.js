const fs = require("fs");
const path = require("path");
const {
  MAP_W,
  MAP_H,
  TILE_TYPES,
  BUILDING_TYPES
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

  const buildings = loadBuildingsMeta();
  let buildingSeq = 1;
  for (const building of buildings) {
    const match = String(building?.id || "").match(/\d+/);
    if (match) {
      const num = Number(match[0]);
      if (Number.isFinite(num)) {
        buildingSeq = Math.max(buildingSeq, num + 1);
      }
    }
  }

  let buildingsMetaDirty = false;
  for (const building of buildings) {
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
  }

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
      occupied.add(`${p.tx},${p.ty}`);
    }
    return occupied;
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
        if (bombByTile?.has(`${x},${y}`)) return false;
        if (occupied.has(`${x},${y}`)) return false;
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
      }
    };
    buildings.push(building);
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
        if (bombByTile?.has(`${x},${y}`)) return false;
        if (occupied.has(`${x},${y}`)) return false;
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
      owner: player.username
    };
    buildings.push(building);
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
        if (bombByTile?.has(`${x},${y}`)) return false;
        if (occupied.has(`${x},${y}`)) return false;
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
      owner: player.username
    };
    buildings.push(building);
    markDirty();
    broadcast?.({ t: "building_place", building, tiles });
    return true;
  }

  function isPlayerInShopCenter(player) {
    if (!player) return false;
    for (const building of buildings) {
      if (building.type !== "shop") continue;
      if (building.center?.x === player.tx && building.center?.y === player.ty) {
        return true;
      }
    }
    return false;
  }

  function isPlayerInUpgradeCenter(player) {
    if (!player) return false;
    for (const building of buildings) {
      if (building.type !== "upgrade") continue;
      if (building.center?.x === player.tx && building.center?.y === player.ty) {
        return true;
      }
    }
    return false;
  }

  function storageAtPlayer(player) {
    if (!player) return null;
    for (const building of buildings) {
      if (building.type !== "storage") continue;
      if (
        building.entrance?.x === player.tx &&
        building.entrance?.y === player.ty
      ) {
        if (building.owner && building.owner !== player.username) {
          return null;
        }
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

  return {
    buildings,
    placeStorage,
    placeShop,
    placeUpgrade,
    isPlayerInShopCenter,
    isPlayerInUpgradeCenter,
    storageAtPlayer,
    markDirty,
    flush
  };
}

module.exports = {
  createBuildingManager
};
