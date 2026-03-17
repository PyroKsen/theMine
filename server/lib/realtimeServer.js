const crypto = require("crypto");

function attachRealtimeServer({
  wss,
  sessions,
  players,
  config,
  db,
  mapStore,
  buildingManager,
  bombManager,
  playerService,
  skillHelpers,
  exploration,
  slotHelpers,
  worldActions,
  isWalkable
}) {
  const {
    BASE_HP,
    DEPTH_OVERLOAD_INTERVAL_MS,
    TICK_RATE,
    MINE_COOLDOWN_MS,
    CHAT_MAX_LEN,
    CRYSTAL_PRICES,
    BOMB_ITEMS,
    BUILDING_ITEMS,
    MAP_W,
    MAP_H,
    TILE_SIZE,
    CHUNK_SIZE,
    TELEPORT_PRICE,
    TELEPORT_RANGE,
    TILE_TYPES,
    TILE_HP,
    SKILL_DEFS
  } = config;
  const {
    stmtGetUser,
    stmtUpdateUserPos,
    stmtUpdateExplored,
    stmtUpdateSkillSlots,
    stmtUpdateRespawnBuildingId,
    stmtUpdateDollars,
    stmtUpdateHp,
    stmtUpdateMaxHp,
    itemUpdateStmts,
    skillUpdateStmts
  } = db;
  const {
    encodeMapChunk,
    encodeBuildingChunk,
    flushDirty,
    getTile,
    setTile,
    getBuilding,
    getTileHp,
    setTileHp,
    deleteTileHp
  } = mapStore;
  const {
    buildings,
    collectAllOwnerBalances,
    collectBuildingBalance,
    creditBuildingBalance,
    destroyExpiredBuildings,
    getBuildingForRepair,
    getBuildingById,    placeStorage,
    placeRespawn,
    placeTeleport,
    placeShop,
    placeUpgrade,
    repairBuilding,
    respawnAtPlayer,
    teleportAtPlayer,
    isPlayerInShopCenter,
    isPlayerInUpgradeCenter,
    shopAtPlayer,
    storageAtPlayer,
    upgradeAtPlayer,
    markDirty: markBuildingsDirty,
    flush: flushBuildings
  } = buildingManager;
  const { bombByTile, placeBomb } = bombManager;
  const {
    sendToPlayer,
    sendSkills,
    syncHpLimits,
    grantSkillXp,
    applyDamageToPlayer,
    applyHealToPlayer,
    setCrystalCount,
    awardCrystal,
    handleMoveXp,
    buildItemsPayload,
    setItemCount,
    grantAdminItems,
    randomSpawn,
    validSavedSpawn,
    normalizeDir
  } = playerService;
  const {
    getSkillConfig,
    getSkillXpNeed,
    getSkillCost,
    getMoveStepDelayMs,
    getMiningDamage,
    getMaxDepth
  } = skillHelpers;
  const {
    chunkKey,
    parseExplored,
    encodeExplored,
    chunkIntersectsView,
    exploredPayload,
    updateExplored
  } = exploration;
  const {
    SKILL_SLOT_COUNT,
    normalizeSkillSlots,
    serializeSkillSlots,
    isSkillSlotted,
    isSkillAvailable
  } = slotHelpers;
  const {
    damageTile,
    dropCrystals,
    collectDropBox,
    handlePlayerDeath,
    handleBuildAction,
    flush: flushWorldActions
  } = worldActions;

  function broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }

  function sendMapChunk(ws, cx, cy) {
    const chunk = encodeMapChunk(cx, cy, CHUNK_SIZE);
    const buildingChunk = encodeBuildingChunk(cx, cy, CHUNK_SIZE);
    if (!chunk || !buildingChunk) return;
    ws.send(
      JSON.stringify({
        t: "map_chunk",
        cx,
        cy,
        w: chunk.w,
        h: chunk.h,
        tiles: Buffer.from(chunk.data).toString("base64"),
        buildings: Buffer.from(buildingChunk.data).toString("base64")
      })
    );
  }

  const FALLING_TILE_STEP_MS = 500;
  const SAND_FALL_DAMAGE = 3;
  const STEEL_SAND_FALL_DAMAGE = 10;
  const MAGMA_FALL_DAMAGE = 60;

  function isFallingTile(type) {
    return (
      type === TILE_TYPES.sand ||
      type === TILE_TYPES.steelSand ||
      type === TILE_TYPES.magma
    );
  }
  function findPlayerAt(tx, ty) {
    for (const player of players.values()) {
      if (player.tx === tx && player.ty === ty && player.hp > 0) {
        return player;
      }
    }
    return null;
  }

  function canFallingTileOccupy(tx, ty) {
    if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;
    if (getTile(tx, ty) !== TILE_TYPES.empty) return false;
    if (getBuilding(tx, ty) !== 0) return false;
    if (bombByTile.has(`${tx},${ty}`)) return false;
    return true;
  }

  function moveFallingTile(fromX, fromY, toX, toY) {
    const type = getTile(fromX, fromY);
    if (!isFallingTile(type)) return false;
    if (toX < 0 || toX >= MAP_W || toY < 0 || toY >= MAP_H) return false;
    const targetPlayer = findPlayerAt(toX, toY);
    if (targetPlayer) {
      setTile(fromX, fromY, TILE_TYPES.empty);
      deleteTileHp(fromX, fromY);
      broadcast({ t: "tile", x: fromX, y: fromY, value: TILE_TYPES.empty });
      const fallDamage =
        type === TILE_TYPES.magma
          ? MAGMA_FALL_DAMAGE
          : type === TILE_TYPES.steelSand
          ? STEEL_SAND_FALL_DAMAGE
          : SAND_FALL_DAMAGE;
      applyDamageToPlayer(targetPlayer, fallDamage);
      return true;
    }
    if (!canFallingTileOccupy(toX, toY)) return false;
    const currentHp = getTileHp(fromX, fromY) ?? TILE_HP.get(type) ?? 1;
    setTile(fromX, fromY, TILE_TYPES.empty);
    deleteTileHp(fromX, fromY);
    setTile(toX, toY, type);
    setTileHp(toX, toY, currentHp);
    broadcast({ t: "tile", x: fromX, y: fromY, value: TILE_TYPES.empty });
    broadcast({ t: "tile", x: toX, y: toY, value: type });
    return true;
  }

  function runFallingTilesStep() {
    for (let y = MAP_H - 2; y >= 0; y -= 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        const type = getTile(x, y);
        if (!isFallingTile(type)) continue;
        if (moveFallingTile(x, y, x, y + 1)) {
          continue;
        }
        const belowType = getTile(x, y + 1);
        if (!isFallingTile(belowType)) continue;
        const directions = Math.random() < 0.5 ? [-1, 1] : [1, -1];
        for (const dx of directions) {
          if (moveFallingTile(x, y, x + dx, y + 1)) {
            break;
          }
        }
      }
    }
  }

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "/", "http://localhost");
    const token = url.searchParams.get("token");
    const session = token ? sessions.get(token) : null;
    if (!session) {
      ws.close(4001, "unauthorized");
      return;
    }
    for (const existing of players.values()) {
      if (existing.username === session.username) {
        ws.close(4002, "already_online");
        return;
      }
    }

    const id = crypto.randomUUID();
    const saved = stmtGetUser.get(session.username);
    const skills = {};
    for (const skill of SKILL_DEFS) {
      const levelKey = `skill_${skill.id}_level`;
      const xpKey = `skill_${skill.id}_xp`;
      skills[skill.id] = {
        level: saved?.[levelKey] ?? 0,
        xp: saved?.[xpKey] ?? 0
      };
    }

    const skillSlots = normalizeSkillSlots(saved?.skill_slots);
    const spawn = validSavedSpawn(saved?.last_tx, saved?.last_ty)
      ? { tx: saved.last_tx, ty: saved.last_ty }
      : randomSpawn();
    const savedHp = saved?.hp ?? BASE_HP;
    const savedMaxHp = saved?.max_hp ?? BASE_HP;
    const skillHpLevel = skills.hp?.level ?? 0;
    const computedMaxHp = Math.max(savedMaxHp, BASE_HP + skillHpLevel);
    const currentHp = Math.min(savedHp, computedMaxHp);
    const player = {
      id,
      username: session.username,
      ws,
      tx: spawn.tx,
      ty: spawn.ty,
      inputDirX: 0,
      inputDirY: 0,
      inputRotate: false,
      inputSlow: false,
      inputMine: false,
      facingX: 0,
      facingY: 1,
      moveCooldownMs: 0,
      mineCooldownMs: 0,
      dollars: saved?.dollars ?? 0,
      coins: saved?.coins ?? 0,
      hp: currentHp,
      maxHp: computedMaxHp,
      inventory: {
        green: saved?.crystal_green ?? 0,
        blue: saved?.crystal_blue ?? 0,
        white: saved?.crystal_white ?? 0,
        red: saved?.crystal_red ?? 0,
        pink: saved?.crystal_pink ?? 0,
        cyan: saved?.crystal_cyan ?? 0
      },
      skills,
      skillSlots,
      respawnBuildingId: saved?.respawn_building_id || null,
      moveTilesSinceXp: 0,
      inventoryTilesSinceXp: 0,
      crystalRemainder: {},
      depthOverTimerMs: null,
      depthXpTimerMs: null,
      exploredChunks: parseExplored(saved?.explored_chunks),
      exploredDirty: false,
      exploreBounds: null,
      items: {
        medkit: saved?.item_medkit ?? 0,
        bomb: saved?.item_bomb ?? 0,
        plasmabomb: saved?.item_plasmabomb ?? 0,
        electrobomb: saved?.item_electrobomb ?? 0,
        storage: saved?.item_storage ?? 0,
        shop: saved?.item_shop ?? 0,
        respawn: saved?.item_respawn ?? 0,
        upgrade: saved?.item_upgrade ?? 0,
        teleport: saved?.item_teleport ?? 0,
        turret: saved?.item_turret ?? 0,
        clan_hall: saved?.item_clan_hall ?? 0
      }
    };

    updateExplored(player);
    grantAdminItems(player);
    if (player.respawnBuildingId) {
      const respawnBuilding = getBuildingById(player.respawnBuildingId);
      const isValidRespawn =
        respawnBuilding &&
        respawnBuilding.type === "respawn" &&
        respawnBuilding.owner === player.username;
      if (!isValidRespawn) {
        player.respawnBuildingId = null;
        stmtUpdateRespawnBuildingId.run(null, player.username);
      }
    }
    players.set(id, player);
    ws.playerId = id;

    if (savedMaxHp !== computedMaxHp) {
      stmtUpdateMaxHp.run(computedMaxHp, player.username);
    }
    if (savedHp !== currentHp) {
      stmtUpdateHp.run(currentHp, player.username);
    }

    ws.send(
      JSON.stringify({
        t: "welcome",
        id,
        username: session.username,
        time: Date.now(),
        map: {
          w: MAP_W,
          h: MAP_H,
          tile: TILE_SIZE,
          chunk: CHUNK_SIZE
        },
        wallet: { dollars: player.dollars, coins: player.coins },
        hp: { current: player.hp, max: player.maxHp },
        inventory: { ...player.inventory },
        skills: player.skills,
        skillSlots: player.skillSlots,
        skillConfig: SKILL_DEFS,
        items: buildItemsPayload(player.items),
        buildings,
        respawnBuildingId: player.respawnBuildingId,
        explored: exploredPayload(player.exploredChunks)
      })
    );

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.t === "input") {
        const dir = normalizeDir(msg.dir);
        player.inputSlow = Boolean(msg.ctrl);
        player.inputRotate = Boolean(msg.shift);
        player.inputMine = Boolean(msg.mine);
        player.inputDirX = dir.x;
        player.inputDirY = dir.y;
      }

      if (msg.t === "map_chunk_req") {
        const chunks = Array.isArray(msg.chunks) ? msg.chunks : [];
        for (const entry of chunks) {
          const cx = Math.floor(Number(entry?.cx));
          const cy = Math.floor(Number(entry?.cy));
          if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
          const maxCx = Math.ceil(MAP_W / CHUNK_SIZE) - 1;
          const maxCy = Math.ceil(MAP_H / CHUNK_SIZE) - 1;
          if (cx < 0 || cy < 0 || cx > maxCx || cy > maxCy) continue;
          const key = chunkKey(cx, cy);
          if (!player.exploredChunks.has(key)) continue;
          if (!chunkIntersectsView(player, cx, cy)) continue;
          sendMapChunk(ws, cx, cy);
        }
      }

      if (msg.t === "chat") {
        const text = String(msg.msg || "").trim();
        if (!text) return;
        const safe = text.length > CHAT_MAX_LEN ? text.slice(0, CHAT_MAX_LEN) : text;
        broadcast({
          t: "chat",
          from: player.username,
          msg: safe,
          time: Date.now()
        });
      }

      if (msg.t === "use_item") {
        const id = String(msg.id || "");
        if (BOMB_ITEMS.has(id)) return;
        if (BUILDING_ITEMS.has(id)) return;
        if (!itemUpdateStmts.has(id)) return;
        const current = player.items[id] ?? 0;
        if (current <= 0) return;
        setItemCount(player, id, current - 1);
        sendToPlayer(player, { t: "items", items: buildItemsPayload(player.items) });
        if (id === "medkit") {
          applyHealToPlayer(player, 250);
        }
      }

      if (msg.t === "place_bomb") {
        const x = Number(msg.x);
        const y = Number(msg.y);
        const type = String(msg.id || "bomb");
        placeBomb(player, x, y, type, (targetPlayer, itemId) => {
          if ((targetPlayer.items[itemId] ?? 0) <= 0) return false;
          setItemCount(targetPlayer, itemId, (targetPlayer.items[itemId] ?? 0) - 1);
          sendToPlayer(targetPlayer, {
            t: "items",
            items: buildItemsPayload(targetPlayer.items)
          });
          return true;
        });
      }

      if (msg.t === "place_building") {
        const type = String(msg.type || "");
        const entranceX = Number(msg.x);
        const entranceY = Number(msg.y);
        if (type === "storage") {
          if ((player.items.storage ?? 0) <= 0) return;
          if (!placeStorage(player, entranceX, entranceY)) return;
          setItemCount(player, "storage", (player.items.storage ?? 0) - 1);
          sendToPlayer(player, { t: "items", items: buildItemsPayload(player.items) });
          return;
        }
        if (type === "shop") {
          if ((player.items.shop ?? 0) <= 0) return;
          if (!placeShop(player, entranceX, entranceY)) return;
          setItemCount(player, "shop", (player.items.shop ?? 0) - 1);
          sendToPlayer(player, { t: "items", items: buildItemsPayload(player.items) });
          return;
        }
        if (type === "upgrade") {
          if ((player.items.upgrade ?? 0) <= 0) return;
          if (!placeUpgrade(player, entranceX, entranceY)) return;
          setItemCount(player, "upgrade", (player.items.upgrade ?? 0) - 1);
          sendToPlayer(player, { t: "items", items: buildItemsPayload(player.items) });
          return;
        }
        if (type === "respawn") {
          if ((player.items.respawn ?? 0) <= 0) return;
          if (!placeRespawn(player, entranceX, entranceY)) return;
          setItemCount(player, "respawn", (player.items.respawn ?? 0) - 1);
          sendToPlayer(player, { t: "items", items: buildItemsPayload(player.items) });
          return;
        }
        if (type === "teleport") {
          if ((player.items.teleport ?? 0) <= 0) return;
          if (!placeTeleport(player, entranceX, entranceY)) return;
          setItemCount(player, "teleport", (player.items.teleport ?? 0) - 1);
          sendToPlayer(player, { t: "items", items: buildItemsPayload(player.items) });
        }
      }

      if (msg.t === "respawn_set") {
        const building = respawnAtPlayer(player);
        if (!building || building.inactive) return;
        player.respawnBuildingId = building.id;
        stmtUpdateRespawnBuildingId.run(building.id, player.username);
        sendToPlayer(player, { t: "respawn_selection", id: building.id });
      }

      if (msg.t === "respawn_reset") {
        player.respawnBuildingId = null;
        stmtUpdateRespawnBuildingId.run(null, player.username);
        sendToPlayer(player, { t: "respawn_selection", id: null });
      }
      if (msg.t === "teleport_use") {
        const targetId = String(msg.id || "");
        const currentTeleport = teleportAtPlayer(player);
        if (!currentTeleport || currentTeleport.inactive || !currentTeleport.center) {
          sendToPlayer(player, {
            t: "teleport_error",
            message: "Teleport is inactive."
          });
          return;
        }
        const targetTeleport = getBuildingById(targetId);
        if (
          !targetTeleport ||
          targetTeleport.type !== "teleport" ||
          targetTeleport.id === currentTeleport.id ||
          targetTeleport.inactive ||
          !targetTeleport.center
        ) {
          sendToPlayer(player, {
            t: "teleport_error",
            message: "Target teleport is unavailable."
          });
          return;
        }
        const dx = targetTeleport.center.x - currentTeleport.center.x;
        const dy = targetTeleport.center.y - currentTeleport.center.y;
        if (dx * dx + dy * dy > TELEPORT_RANGE * TELEPORT_RANGE) {
          sendToPlayer(player, {
            t: "teleport_error",
            message: `Target is farther than ${TELEPORT_RANGE} tiles.`
          });
          return;
        }
        const cost = Math.max(
          0,
          Math.floor(Number(currentTeleport.fee ?? TELEPORT_PRICE) || 0)
        );
        if (player.dollars < cost) {
          sendToPlayer(player, {
            t: "teleport_error",
            message: `Need ${cost} to teleport.`
          });
          return;
        }
        if (cost > 0) {
          player.dollars -= cost;
          stmtUpdateDollars.run(player.dollars, player.username);
          creditBuildingBalance(currentTeleport.id, Math.floor(cost * 0.1));
          sendToPlayer(player, {
            t: "wallet",
            dollars: player.dollars,
            coins: player.coins
          });
        }
        player.tx = targetTeleport.center.x;
        player.ty = targetTeleport.center.y;
        player.facingX = 0;
        player.facingY = 1;
        player.moveCooldownMs = 0;
        player.mineCooldownMs = 0;
        stmtUpdateUserPos.run(player.tx, player.ty, player.username);
        updateExplored(player);
        sendToPlayer(player, { t: "teleport_ok" });
        return;
      }

      if (msg.t === "force_death") {
        if (player.hp <= 0) return;
        player.hp = 0;
        handlePlayerDeath(player);
      }

      if (msg.t === "build_action") {
        handleBuildAction(player);
      }

      if (msg.t === "drop_crystals") {
        dropCrystals(player, msg.crystals || {}, Boolean(msg.all));
      }

      if (msg.t === "shop_sell") {
        const shop = shopAtPlayer(player);
        if (!shop || shop.inactive) return;
        const crystal = String(msg.crystal || "");
        const price = CRYSTAL_PRICES[crystal];
        if (!price) return;
        const amount = Math.max(1, Math.floor(Number(msg.amount || 1)));
        const current = player.inventory[crystal] ?? 0;
        if (current < amount) return;
        const total = price * amount;
        setCrystalCount(player, crystal, current - amount);
        player.dollars += total;
        stmtUpdateDollars.run(player.dollars, player.username);
        creditBuildingBalance(shop.id, Math.floor(total * 0.1));
        sendToPlayer(player, {
          t: "wallet",
          dollars: player.dollars,
          coins: player.coins
        });
        sendToPlayer(player, { t: "inventory", inventory: player.inventory });
      }

      if (msg.t === "shop_buy") {
        const shop = shopAtPlayer(player);
        if (!shop || shop.inactive) return;
        const crystal = String(msg.crystal || "");
        const basePrice = CRYSTAL_PRICES[crystal];
        if (!basePrice) return;
        const amount = Math.max(1, Math.floor(Number(msg.amount || 1)));
        const cost = basePrice * 2 * amount;
        if (player.dollars < cost) return;
        setCrystalCount(player, crystal, (player.inventory[crystal] ?? 0) + amount);
        player.dollars -= cost;
        stmtUpdateDollars.run(player.dollars, player.username);
        creditBuildingBalance(shop.id, Math.floor(cost * 0.1));
        sendToPlayer(player, {
          t: "wallet",
          dollars: player.dollars,
          coins: player.coins
        });
        sendToPlayer(player, { t: "inventory", inventory: player.inventory });
      }

      if (msg.t === "storage_open") {
        const id = String(msg.id || "");
        const storage = storageAtPlayer(player);
        if (!storage || storage.id !== id) return;
        sendToPlayer(player, {
          t: "storage_state",
          id: storage.id,
          storage: { ...storage.storage }
        });
      }

      if (msg.t === "storage_move") {
        const id = String(msg.id || "");
        const storage = storageAtPlayer(player);
        if (!storage || storage.id !== id) return;
        const crystal = String(msg.crystal || "");
        if (!CRYSTAL_PRICES[crystal]) return;
        const amount = Math.max(1, Math.floor(Number(msg.amount || 1)));
        const dir = String(msg.dir || "");
        const store = storage.storage;
        const currentPlayer = player.inventory[crystal] ?? 0;
        const currentStore = store[crystal] ?? 0;
        if (dir === "deposit") {
          if (currentPlayer < amount) return;
          setCrystalCount(player, crystal, currentPlayer - amount);
          store[crystal] = currentStore + amount;
        } else if (dir === "withdraw") {
          if (currentStore < amount) return;
          setCrystalCount(player, crystal, currentPlayer + amount);
          store[crystal] = currentStore - amount;
        } else {
          return;
        }
        markBuildingsDirty();
        sendToPlayer(player, { t: "inventory", inventory: player.inventory });
        sendToPlayer(player, {
          t: "storage_state",
          id: storage.id,
          storage: { ...storage.storage }
        });
      }

      if (msg.t === "repair_building") {
        const id = String(msg.id || "");
        const building = getBuildingForRepair(player, id);
        if (!building) return;
        const requested = Math.max(1, Math.floor(Number(msg.amount || 1)));
        const blue = player.inventory.blue ?? 0;
        const missingHp = Math.max(0, (building.maxHp ?? 0) - (building.hp ?? 0));
        const amount = Math.min(requested, blue, missingHp);
        if (amount <= 0) return;
        setCrystalCount(player, "blue", blue - amount);
        repairBuilding(building.id, amount);
        sendToPlayer(player, { t: "inventory", inventory: player.inventory });
      }

      if (msg.t === "collect_building_money") {
        const id = String(msg.id || "");
        const collected = collectBuildingBalance(id, player.username);
        if (collected <= 0) return;
        player.dollars += collected;
        stmtUpdateDollars.run(player.dollars, player.username);
        sendToPlayer(player, {
          t: "wallet",
          dollars: player.dollars,
          coins: player.coins
        });
      }

      if (msg.t === "collect_all_building_money") {
        const collected = collectAllOwnerBalances(player.username);
        if (collected <= 0) return;
        player.dollars += collected;
        stmtUpdateDollars.run(player.dollars, player.username);
        sendToPlayer(player, {
          t: "wallet",
          dollars: player.dollars,
          coins: player.coins
        });
      }

      if (msg.t === "skill_slot_set") {
        if (!isPlayerInUpgradeCenter(player)) return;
        const slot = Number(msg.slot);
        const id = String(msg.id || "");
        if (!Number.isInteger(slot) || slot < 0 || slot >= SKILL_SLOT_COUNT) {
          return;
        }
        const skillConfig = getSkillConfig(id);
        if (!skillConfig || !skillConfig.slotOnly) return;
        if (!isSkillAvailable(player, skillConfig)) return;
        const already = isSkillSlotted(player, id);
        if (already && player.skillSlots[slot] !== id) return;
        player.skillSlots[slot] = id;
        stmtUpdateSkillSlots.run(
          serializeSkillSlots(player.skillSlots),
          player.username
        );
        sendToPlayer(player, { t: "skill_slots", slots: player.skillSlots });
      }

      if (msg.t === "skill_upgrade") {
        const upgradeBuilding = upgradeAtPlayer(player);
        if (!upgradeBuilding || upgradeBuilding.inactive) return;
        const id = String(msg.id || "");
        const skillConfig = getSkillConfig(id);
        if (!skillConfig || skillConfig.locked) return;
        if (skillConfig.slotOnly && !isSkillSlotted(player, id)) return;
        const skill = player.skills?.[id];
        if (!skill) return;
        const xpNeed = getSkillXpNeed(skillConfig, skill.level);
        const cost = getSkillCost(skillConfig, skill.level);
        if (skill.xp < xpNeed || player.dollars < cost) return;
        skill.xp -= xpNeed;
        skill.level += 1;
        const stmts = skillUpdateStmts.get(id);
        if (stmts?.xp) {
          stmts.xp.run(skill.xp, player.username);
        }
        if (stmts?.level) {
          stmts.level.run(skill.level, player.username);
        }
        player.dollars -= cost;
        stmtUpdateDollars.run(player.dollars, player.username);
        creditBuildingBalance(upgradeBuilding.id, Math.floor(cost * 0.1));
        sendToPlayer(player, {
          t: "wallet",
          dollars: player.dollars,
          coins: player.coins
        });
        if (id === "hp") {
          const nextMax = Math.max(player.maxHp, BASE_HP + skill.level);
          if (nextMax !== player.maxHp) {
            player.maxHp = nextMax;
            stmtUpdateMaxHp.run(player.maxHp, player.username);
          }
          syncHpLimits(player);
        }
        sendSkills(player);
      }
    });

    ws.on("close", () => {
      players.delete(id);
      stmtUpdateUserPos.run(player.tx, player.ty, player.username);
      if (player.exploredDirty) {
        stmtUpdateExplored.run(
          encodeExplored(player.exploredChunks),
          player.username
        );
        player.exploredDirty = false;
      }
      player.ws = null;
    });
  });

  setInterval(runFallingTilesStep, FALLING_TILE_STEP_MS);

  const tickIntervalMs = 1000 / TICK_RATE;
  setInterval(() => {
    const dtMs = 1000 / TICK_RATE;

    for (const player of players.values()) {
      if (player.moveCooldownMs > 0) {
        player.moveCooldownMs = Math.max(0, player.moveCooldownMs - dtMs);
      }
      if (player.mineCooldownMs > 0) {
        player.mineCooldownMs = Math.max(0, player.mineCooldownMs - dtMs);
      }

      const maxDepth = getMaxDepth(player);
      const overDepth = Math.max(0, player.ty - maxDepth);
      const nearDepth = player.ty >= maxDepth - 20;
      if (overDepth > 0) {
        if (player.depthOverTimerMs == null) {
          player.depthOverTimerMs = DEPTH_OVERLOAD_INTERVAL_MS;
        } else {
          player.depthOverTimerMs -= dtMs;
        }
        while (player.depthOverTimerMs != null && player.depthOverTimerMs <= 0) {
          applyDamageToPlayer(player, overDepth);
          player.depthOverTimerMs += DEPTH_OVERLOAD_INTERVAL_MS;
        }
      } else {
        player.depthOverTimerMs = null;
      }

      if (nearDepth) {
        if (player.depthXpTimerMs == null) {
          player.depthXpTimerMs = DEPTH_OVERLOAD_INTERVAL_MS;
        } else {
          player.depthXpTimerMs -= dtMs;
        }
        const multiplier = overDepth > 0 ? 2 : 1;
        while (player.depthXpTimerMs != null && player.depthXpTimerMs <= 0) {
          grantSkillXp(player, "depth", multiplier);
          player.depthXpTimerMs += DEPTH_OVERLOAD_INTERVAL_MS;
        }
      } else {
        player.depthXpTimerMs = null;
      }

      const wantsMove = player.inputDirX !== 0 || player.inputDirY !== 0;
      const desiredX = player.inputDirX;
      const desiredY = player.inputDirY;

      const tryMine = (x, y) => {
        if (player.mineCooldownMs > 0) return false;
        if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
        const type = getTile(x, y);
        if (type !== TILE_TYPES.empty) {
          const hpMax = TILE_HP.get(type);
          if (hpMax) {
            const isBuildTile =
              type === TILE_TYPES.buildGreen ||
              type === TILE_TYPES.buildYellow ||
              type === TILE_TYPES.buildRed;
            const isDropBox = type === TILE_TYPES.dropBox;
            let damage = getMiningDamage(player);
            let hazardDamageMin = 0;
            let hazardDamageMax = 0;
            if (type === TILE_TYPES.acidRock) {
              hazardDamageMin = 2;
              hazardDamageMax = 5;
            } else if (type === TILE_TYPES.slimeRock) {
              hazardDamageMin = 5;
              hazardDamageMax = 10;
            } else if (type === TILE_TYPES.corrosiveRock) {
              hazardDamageMin = 15;
              hazardDamageMax = 30;
            } else if (type === TILE_TYPES.radioactiveRock) {
              hazardDamageMin = 50;
              hazardDamageMax = 75;
            }
            if (isBuildTile) {
              const demoLevel = player.skills?.demolisher?.level ?? 0;
              damage += demoLevel * 0.5;
            }
            const result = damageTile(
              x,
              y,
              player.id,
              (hitType, dealt) => awardCrystal(player, hitType, dealt),
              damage
            );
            if (result.hit) {
              if (hazardDamageMax > 0) {
                const hazardDamage =
                  hazardDamageMin +
                  Math.floor(Math.random() * (hazardDamageMax - hazardDamageMin + 1));
                applyDamageToPlayer(player, hazardDamage);
              }
              if (result.broken) {
                if (isDropBox) {
                  collectDropBox(player, x, y);
                } else {
                  grantSkillXp(player, "mining", 1);
                  if (isBuildTile) {
                    grantSkillXp(player, "demolisher", 1);
                  }
                }
              }
              player.mineCooldownMs = MINE_COOLDOWN_MS;
              return true;
            }
            return false;
          }
          broadcast({
            t: "hit",
            x,
            y,
            by: player.id,
            type,
            amount: 0
          });
          if (type === TILE_TYPES.redRock) {
            applyDamageToPlayer(player, 1);
          }
          player.mineCooldownMs = MINE_COOLDOWN_MS;
          return true;
        }
        broadcast({
          t: "hit",
          x,
          y,
          by: player.id,
          type: TILE_TYPES.empty,
          amount: 0
        });
        player.mineCooldownMs = MINE_COOLDOWN_MS;
        return true;
      };

      if (player.inputRotate) {
        if (wantsMove) {
          if (player.facingX !== desiredX || player.facingY !== desiredY) {
            player.facingX = desiredX;
            player.facingY = desiredY;
          }
        }
        if (player.inputMine && player.mineCooldownMs === 0) {
          tryMine(player.tx + player.facingX, player.ty + player.facingY);
        }
        continue;
      }

      if (wantsMove) {
        player.facingX = desiredX;
        player.facingY = desiredY;
      }

      if (wantsMove && player.moveCooldownMs === 0) {
        const nextX = player.tx + desiredX;
        const nextY = player.ty + desiredY;
        let movedTiles = 0;
        if (desiredX !== 0 && isWalkable(nextX, player.ty)) {
          player.tx = nextX;
          movedTiles += 1;
        }
        if (desiredY !== 0 && isWalkable(player.tx, nextY)) {
          player.ty = nextY;
          movedTiles += 1;
        }
        if (movedTiles > 0) {
          player.moveCooldownMs = getMoveStepDelayMs(player);
          handleMoveXp(player, movedTiles);
        } else {
          tryMine(player.tx + desiredX, player.ty + desiredY);
        }
      } else if (!wantsMove && player.inputMine && player.mineCooldownMs === 0) {
        tryMine(player.tx + player.facingX, player.ty + player.facingY);
      }

      if (player.hp <= 0) {
        handlePlayerDeath(player);
      }
      updateExplored(player);
    }

    destroyExpiredBuildings(Date.now());
    for (const player of players.values()) {
      if (!player.respawnBuildingId) continue;
      if (getBuildingById(player.respawnBuildingId)) continue;
      player.respawnBuildingId = null;
      stmtUpdateRespawnBuildingId.run(null, player.username);
      sendToPlayer(player, { t: "respawn_selection", id: null });
    }

    broadcast({
      t: "state",
      time: Date.now(),
      players: Array.from(players.values()).map((player) => ({
        id: player.id,
        tx: player.tx,
        ty: player.ty,
        fx: player.facingX,
        fy: player.facingY,
        name: player.username
      }))
    });
  }, tickIntervalMs);

  setInterval(() => {
    flushDirty();
    flushBuildings();
    flushWorldActions();
    for (const player of players.values()) {
      if (player.exploredDirty) {
        stmtUpdateExplored.run(
          encodeExplored(player.exploredChunks),
          player.username
        );
        player.exploredDirty = false;
      }
    }
  }, 2000);
}

module.exports = {
  attachRealtimeServer
};











