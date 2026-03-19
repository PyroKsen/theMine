function calcGreenCost(base, level) {
  return Math.max(1, Math.ceil(base - (Number(level) || 0) * 0.01));
}

function parseJsonField(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function createWorldActions({
  dataDir,
  dropBoxDb,
  mapStore,
  config,
  skillHelpers,
  slotHelpers,
  playerService,
  stmtUpdateUserPos,
  stmtUpdateHp,
  stmtUpdateRespawnBuildingId,
  bombByTile,
  getRespawnSpawn,
  clearRespawnSelection,
  broadcast
}) {
  const {
    MAP_W,
    MAP_H,
    TILE_TYPES,
    TILE_HP,
    BUILDING_TYPES,
    CRYSTAL_PRICES
  } = config;
  const { getSkillConfig } = skillHelpers;
  const { isSkillSlotted, isSkillAvailable } = slotHelpers;
  const { sendToPlayer, grantSkillXp, setCrystalCount } = playerService;
  const {
    getTile,
    setTile,
    getBuilding,
    getTileHp,
    setTileHp,
    deleteTileHp
  } = mapStore;
  const {
    db,
    stmtCountDropBoxes,
    stmtSelectAllDropBoxes,
    stmtInsertOrReplaceDropBox,
    stmtDeleteDropBox
  } = dropBoxDb;

  const crystalColors = Object.keys(CRYSTAL_PRICES || {});
  const dropBoxes = new Map();
  const dirtyDropBoxes = new Map();
  const deletedDropBoxes = new Set();
  let purgedInvalidRows = 0;

  function dropBoxKey(x, y) {
    return `${x},${y}`;
  }

  function normalizeCrystals(raw) {
    const crystals = {};
    let total = 0;
    for (const color of crystalColors) {
      const value = Math.max(0, Math.floor(raw?.[color] || 0));
      crystals[color] = value;
      total += value;
    }
    return total > 0 ? crystals : null;
  }

  function setDropBoxRecord(x, y, crystals, createdAt = Date.now()) {
    const key = dropBoxKey(x, y);
    dropBoxes.set(key, {
      x,
      y,
      crystals,
      createdAt: Math.max(0, Math.floor(Number(createdAt) || Date.now()))
    });
  }

  function loadDropBoxes() {
    for (const row of stmtSelectAllDropBoxes.all()) {
      const x = Number(row.x);
      const y = Number(row.y);
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        stmtDeleteDropBox.run(row.x, row.y);
        purgedInvalidRows += 1;
        continue;
      }
      if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) {
        stmtDeleteDropBox.run(x, y);
        purgedInvalidRows += 1;
        continue;
      }
      const crystals = normalizeCrystals(parseJsonField(row.crystals_json, {}));
      if (!crystals) {
        stmtDeleteDropBox.run(x, y);
        purgedInvalidRows += 1;
        continue;
      }
      setDropBoxRecord(x, y, crystals, row.created_at);
    }
  }

  const flushTxn = db.transaction(() => {
    for (const key of deletedDropBoxes) {
      const [x, y] = key.split(",").map((value) => Number(value));
      stmtDeleteDropBox.run(x, y);
    }
    for (const entry of dirtyDropBoxes.values()) {
      stmtInsertOrReplaceDropBox.run({
        x: entry.x,
        y: entry.y,
        crystalsJson: JSON.stringify(entry.crystals),
        createdAt: entry.createdAt
      });
    }
  });

  function markDropBoxDirty(x, y) {
    const key = dropBoxKey(x, y);
    const record = dropBoxes.get(key);
    if (!record) return;
    deletedDropBoxes.delete(key);
    dirtyDropBoxes.set(key, record);
  }

  function markDropBoxDeleted(x, y) {
    const key = dropBoxKey(x, y);
    dirtyDropBoxes.delete(key);
    deletedDropBoxes.add(key);
  }

  function flush() {
    if (dirtyDropBoxes.size === 0 && deletedDropBoxes.size === 0) return;
    flushTxn();
    dirtyDropBoxes.clear();
    deletedDropBoxes.clear();
  }

  function syncDropBoxesOnMap() {
    const liveDropBoxes = new Set(dropBoxes.keys());
    let restoredTiles = 0;
    let clearedTiles = 0;
    let removedEntries = purgedInvalidRows;
    let terrainConflicts = 0;
    purgedInvalidRows = 0;

    for (const [key, record] of dropBoxes) {
      const { x, y } = record;
      if (getBuilding(x, y) !== BUILDING_TYPES.none) {
        dropBoxes.delete(key);
        markDropBoxDeleted(x, y);
        removedEntries += 1;
        continue;
      }
      const tileType = getTile(x, y);
      if (tileType !== TILE_TYPES.empty && tileType !== TILE_TYPES.dropBox) {
        dropBoxes.delete(key);
        markDropBoxDeleted(x, y);
        removedEntries += 1;
        terrainConflicts += 1;
        continue;
      }
      if (getTile(x, y) !== TILE_TYPES.dropBox) {
        setTile(x, y, TILE_TYPES.dropBox);
        restoredTiles += 1;
      }
      setTileHp(x, y, 1);
    }

    if (removedEntries > 0) {
      liveDropBoxes.clear();
      for (const key of dropBoxes.keys()) {
        liveDropBoxes.add(key);
      }
    }

    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        if (getTile(x, y) !== TILE_TYPES.dropBox) continue;
        if (liveDropBoxes.has(dropBoxKey(x, y))) continue;
        setTile(x, y, TILE_TYPES.empty);
        deleteTileHp(x, y);
        clearedTiles += 1;
      }
    }

    return {
      restoredTiles,
      clearedTiles,
      removedEntries,
      terrainConflicts,
      dropBoxCount: dropBoxes.size
    };
  }

  function damageTile(x, y, byId, onCrystalHit, damage = 1) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) {
      return { hit: false, broken: false, type: TILE_TYPES.empty };
    }
    const type = getTile(x, y);
    const hpMax = TILE_HP.get(type);
    if (!hpMax) {
      return { hit: false, broken: false, type };
    }
    const current = getTileHp(x, y) ?? hpMax;
    const safeDamage = Math.max(0, Number(damage) || 0);
    const dealt = Math.min(current, safeDamage);
    const next = current - dealt;
    let amount = 0;
    if (dealt > 0 && type !== TILE_TYPES.rock && typeof onCrystalHit === "function") {
      amount = Number(onCrystalHit(type, dealt) || 0);
    }
    broadcast({ t: "hit", x, y, by: byId, type, amount });
    if (next <= 0) {
      setTile(x, y, TILE_TYPES.empty);
      deleteTileHp(x, y);
      broadcast({ t: "tile", x, y, value: TILE_TYPES.empty });
      return { hit: true, broken: true, type, amount };
    }
    setTileHp(x, y, next);
    return { hit: true, broken: false, type, amount };
  }

  function canSpendCrystals(player, costs) {
    for (const [color, amount] of Object.entries(costs)) {
      const have = player.inventory?.[color] ?? 0;
      if (have < amount) return false;
    }
    return true;
  }

  function spendCrystals(player, costs) {
    for (const [color, amount] of Object.entries(costs)) {
      const have = player.inventory?.[color] ?? 0;
      setCrystalCount(player, color, have - amount);
    }
    sendToPlayer(player, { t: "inventory", inventory: player.inventory });
  }

  function dropCrystals(player, crystals, dropAll) {
    const targetX = player.tx + player.facingX;
    const targetY = player.ty + player.facingY;
    if (targetX < 0 || targetX >= MAP_W || targetY < 0 || targetY >= MAP_H) {
      sendToPlayer(player, {
        t: "drop_error",
        message: "No free tile to drop crystals."
      });
      return false;
    }
    if (getTile(targetX, targetY) !== TILE_TYPES.empty) {
      sendToPlayer(player, {
        t: "drop_error",
        message: "That tile is occupied."
      });
      return false;
    }
    if (getBuilding(targetX, targetY) !== BUILDING_TYPES.none) {
      sendToPlayer(player, {
        t: "drop_error",
        message: "That tile is occupied."
      });
      return false;
    }
    if (bombByTile?.has(dropBoxKey(targetX, targetY))) {
      sendToPlayer(player, {
        t: "drop_error",
        message: "That tile is occupied."
      });
      return false;
    }

    const payload = {};
    let total = 0;
    for (const color of crystalColors) {
      const have = player.inventory?.[color] ?? 0;
      const want = dropAll
        ? have
        : Math.max(0, Math.floor(Number(crystals?.[color] || 0)));
      const amount = Math.min(have, want);
      payload[color] = amount;
      total += amount;
    }

    if (total <= 0) {
      sendToPlayer(player, {
        t: "drop_error",
        message: "Nothing to drop."
      });
      return false;
    }

    for (const color of crystalColors) {
      const amount = payload[color];
      if (amount > 0) {
        const have = player.inventory?.[color] ?? 0;
        setCrystalCount(player, color, have - amount);
      }
    }
    sendToPlayer(player, { t: "inventory", inventory: player.inventory });

    setTile(targetX, targetY, TILE_TYPES.dropBox);
    setTileHp(targetX, targetY, 1);
    setDropBoxRecord(targetX, targetY, payload, Date.now());
    markDropBoxDirty(targetX, targetY);
    broadcast({ t: "tile", x: targetX, y: targetY, value: TILE_TYPES.dropBox });
    sendToPlayer(player, { t: "drop_ok" });
    return true;
  }

  function collectDropBox(player, x, y) {
    const key = dropBoxKey(x, y);
    const stored = dropBoxes.get(key);
    if (!stored) return;
    for (const color of crystalColors) {
      const amount = Math.max(0, Math.floor(Number(stored.crystals?.[color] || 0)));
      if (amount <= 0) continue;
      const have = player.inventory?.[color] ?? 0;
      setCrystalCount(player, color, have + amount);
    }
    sendToPlayer(player, { t: "inventory", inventory: player.inventory });
    dropBoxes.delete(key);
    markDropBoxDeleted(x, y);
  }

  function dropCrystalsOnDeath(player) {
    const payload = {};
    let total = 0;
    for (const color of crystalColors) {
      const amount = Math.max(0, Math.floor(player.inventory?.[color] || 0));
      payload[color] = amount;
      total += amount;
      if (amount > 0) {
        setCrystalCount(player, color, 0);
      }
    }
    sendToPlayer(player, { t: "inventory", inventory: player.inventory });
    if (total <= 0) return;

    setTile(player.tx, player.ty, TILE_TYPES.dropBox);
    setTileHp(player.tx, player.ty, 1);
    setDropBoxRecord(player.tx, player.ty, payload, Date.now());
    markDropBoxDirty(player.tx, player.ty);
    broadcast({
      t: "tile",
      x: player.tx,
      y: player.ty,
      value: TILE_TYPES.dropBox
    });
  }

  function handlePlayerDeath(player) {
    if (!player || player.hp > 0) return false;
    dropCrystalsOnDeath(player);
    const respawn = getRespawnSpawn?.(player) || null;
    if (!respawn && player.respawnBuildingId) {
      player.respawnBuildingId = null;
      stmtUpdateRespawnBuildingId?.run(null, player.username);
      clearRespawnSelection?.(player);
    }
    player.tx = respawn?.tx ?? 1;
    player.ty = respawn?.ty ?? 1;
    player.facingX = 0;
    player.facingY = 1;
    player.moveCooldownMs = 0;
    player.mineCooldownMs = 0;
    player.depthOverTimerMs = null;
    player.depthXpTimerMs = null;
    player.crystalRemainder = {};
    player.hp = player.maxHp;
    stmtUpdateUserPos.run(player.tx, player.ty, player.username);
    stmtUpdateHp.run(player.hp, player.username);
    sendToPlayer(player, {
      t: "hp",
      current: player.hp,
      max: player.maxHp
    });
    sendToPlayer(player, {
      t: "player_respawned",
      tx: player.tx,
      ty: player.ty
    });
    return true;
  }

  function handleBuildAction(player) {
    const targetX = player.tx + player.facingX;
    const targetY = player.ty + player.facingY;
    if (targetX < 0 || targetX >= MAP_W || targetY < 0 || targetY >= MAP_H) {
      return;
    }
    if (getBuilding(targetX, targetY) !== BUILDING_TYPES.none) return;

    const type = getTile(targetX, targetY);
    if (type === TILE_TYPES.empty) {
      const config = getSkillConfig("build1");
      if (!config || !isSkillSlotted(player, "build1")) return;
      if (!isSkillAvailable(player, config)) return;
      const level = player.skills?.build1?.level ?? 0;
      const greenCost = calcGreenCost(3, level);
      const costs = { green: greenCost };
      if (!canSpendCrystals(player, costs)) return;
      spendCrystals(player, costs);
      setTile(targetX, targetY, TILE_TYPES.buildGreen);
      setTileHp(targetX, targetY, 5 + level);
      broadcast({
        t: "tile",
        x: targetX,
        y: targetY,
        value: TILE_TYPES.buildGreen
      });
      grantSkillXp(player, "build1", 1);
      return;
    }

    if (type === TILE_TYPES.buildGreen) {
      const config = getSkillConfig("build2");
      if (!config || !isSkillSlotted(player, "build2")) return;
      if (!isSkillAvailable(player, config)) return;
      const level = player.skills?.build2?.level ?? 0;
      const greenCost = calcGreenCost(3, level);
      const costs = { green: greenCost, white: 1 };
      if (!canSpendCrystals(player, costs)) return;
      spendCrystals(player, costs);
      const currentHp = getTileHp(targetX, targetY) ?? TILE_HP.get(type) ?? 0;
      setTile(targetX, targetY, TILE_TYPES.buildYellow);
      setTileHp(targetX, targetY, currentHp + 50 + level);
      broadcast({
        t: "tile",
        x: targetX,
        y: targetY,
        value: TILE_TYPES.buildYellow
      });
      grantSkillXp(player, "build2", 1);
      return;
    }

    if (type === TILE_TYPES.buildYellow) {
      const config = getSkillConfig("build3");
      if (!config || !isSkillSlotted(player, "build3")) return;
      if (!isSkillAvailable(player, config)) return;
      const level = player.skills?.build3?.level ?? 0;
      const greenCost = calcGreenCost(10, level);
      const costs = { green: greenCost, blue: 1, white: 1, red: 1 };
      if (!canSpendCrystals(player, costs)) return;
      spendCrystals(player, costs);
      const currentHp = getTileHp(targetX, targetY) ?? TILE_HP.get(type) ?? 0;
      setTile(targetX, targetY, TILE_TYPES.buildRed);
      setTileHp(targetX, targetY, currentHp + 100 + level);
      broadcast({ t: "tile", x: targetX, y: targetY, value: TILE_TYPES.buildRed });
      grantSkillXp(player, "build3", 1);
    }
  }

  loadDropBoxes();
  flush();

  return {
    damageTile,
    dropCrystals,
    collectDropBox,
    handlePlayerDeath,
    handleBuildAction,
    flush,
    syncDropBoxesOnMap
  };
}

module.exports = {
  createWorldActions
};
