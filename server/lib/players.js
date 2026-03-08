const { ITEM_DEFS } = require("./config");

function createPlayerService({
  mapWidth,
  mapHeight,
  isWalkable,
  getSkillConfig,
  getOverloadPercent,
  isInventoryNearCapacity,
  skillUpdateStmts,
  stmtUpdateHp,
  stmtUpdateCrystalGreen,
  stmtUpdateCrystalBlue,
  stmtUpdateCrystalWhite,
  stmtUpdateCrystalRed,
  stmtUpdateCrystalPink,
  stmtUpdateCrystalCyan,
  itemUpdateStmts,
  crystalTileToColor
}) {
  if (typeof isWalkable !== "function") {
    throw new Error("isWalkable is required");
  }

  function sendToPlayer(player, payload) {
    if (!player?.ws || player.ws.readyState !== 1) return;
    player.ws.send(JSON.stringify(payload));
  }

  function sendSkills(player) {
    if (!player?.skills) return;
    sendToPlayer(player, { t: "skills", skills: player.skills });
  }

  function syncHpLimits(player) {
    if (!player) return;
    if (player.hp > player.maxHp) {
      player.hp = player.maxHp;
      stmtUpdateHp.run(player.hp, player.username);
    }
    sendToPlayer(player, {
      t: "hp",
      current: player.hp,
      max: player.maxHp
    });
  }

  function grantSkillXp(player, id, amount) {
    if (!player || !amount || amount <= 0) return;
    const config = getSkillConfig?.(id);
    if (!config || config.locked) return;
    const skill = player.skills?.[id];
    if (!skill) return;
    skill.xp += amount;
    const stmts = skillUpdateStmts.get(id);
    if (stmts?.xp) {
      stmts.xp.run(skill.xp, player.username);
    }
    sendSkills(player);
  }

  function applyDamageToPlayer(player, amount) {
    if (!amount || amount <= 0) return;
    player.hp = Math.max(0, player.hp - amount);
    stmtUpdateHp.run(player.hp, player.username);
    sendToPlayer(player, {
      t: "hp",
      current: player.hp,
      max: player.maxHp
    });
    grantSkillXp(player, "hp", 1);
  }

  function applyHealToPlayer(player, amount) {
    if (!amount || amount <= 0) return;
    const next = Math.min(player.maxHp, player.hp + amount);
    if (next === player.hp) return;
    player.hp = next;
    stmtUpdateHp.run(player.hp, player.username);
    sendToPlayer(player, {
      t: "hp",
      current: player.hp,
      max: player.maxHp
    });
  }

  function setCrystalCount(player, color, count) {
    const safeCount = Math.max(0, Math.floor(count || 0));
    player.inventory[color] = safeCount;
    if (color === "green") {
      stmtUpdateCrystalGreen.run(safeCount, player.username);
    } else if (color === "blue") {
      stmtUpdateCrystalBlue.run(safeCount, player.username);
    } else if (color === "white") {
      stmtUpdateCrystalWhite.run(safeCount, player.username);
    } else if (color === "red") {
      stmtUpdateCrystalRed.run(safeCount, player.username);
    } else if (color === "pink") {
      stmtUpdateCrystalPink.run(safeCount, player.username);
    } else if (color === "cyan") {
      stmtUpdateCrystalCyan.run(safeCount, player.username);
    }
  }

  function awardCrystal(player, type, amount = 1) {
    const color = crystalTileToColor.get(type);
    if (!color) return 0;
    const current = player.inventory[color] ?? 0;
    const safeAmount = Math.max(0, Number(amount) || 0);
    const remainderMap = player.crystalRemainder || {};
    const prevRemainder = remainderMap[color] ?? 0;
    const total = prevRemainder + safeAmount;
    const whole = Math.floor(total);
    const remainder = total - whole;
    if (whole > 0) {
      setCrystalCount(player, color, current + whole);
      sendToPlayer(player, { t: "inventory", inventory: player.inventory });
    }
    if (!player.crystalRemainder) {
      player.crystalRemainder = {};
    }
    player.crystalRemainder[color] = remainder;
    return whole;
  }

  function handleMoveXp(player, tiles = 1) {
    const steps = Math.max(0, Math.floor(tiles));
    if (steps <= 0) return;
    player.moveTilesSinceXp += steps;
    while (player.moveTilesSinceXp >= 5) {
      player.moveTilesSinceXp -= 5;
      grantSkillXp(player, "move", 1);
      const overload = getOverloadPercent?.(player) ?? 0;
      if (overload > 0) {
        applyDamageToPlayer(player, overload);
      }
    }
    if (isInventoryNearCapacity?.(player)) {
      player.inventoryTilesSinceXp += steps;
      while (player.inventoryTilesSinceXp >= 5) {
        player.inventoryTilesSinceXp -= 5;
        grantSkillXp(player, "inventory", 1);
      }
    } else {
      player.inventoryTilesSinceXp = 0;
    }
  }

  function buildItemsPayload(items) {
    return ITEM_DEFS.map((item) => ({
      id: item.id,
      name: item.name,
      count: items[item.id] ?? 0
    }));
  }

  function setItemCount(player, itemId, count) {
    const stmt = itemUpdateStmts.get(itemId);
    if (!stmt) return;
    const safeCount = Math.max(0, Math.floor(count || 0));
    player.items[itemId] = safeCount;
    stmt.run(safeCount, player.username);
  }

  function grantAdminItems(player) {
    if (player.username !== "Admin") return;
    for (const item of ITEM_DEFS) {
      setItemCount(player, item.id, 5);
    }
  }

  function randomSpawn() {
    for (let i = 0; i < 200; i += 1) {
      const tx = Math.floor(Math.random() * mapWidth);
      const ty = Math.floor(Math.random() * mapHeight);
      if (isWalkable(tx, ty)) {
        return { tx, ty };
      }
    }
    return { tx: 0, ty: 0 };
  }

  function validSavedSpawn(tx, ty) {
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return false;
    return isWalkable(tx, ty);
  }

  function normalizeDir(dir) {
    let x = Number(dir?.x || 0);
    let y = Number(dir?.y || 0);
    if (!Number.isFinite(x)) x = 0;
    if (!Number.isFinite(y)) y = 0;
    x = Math.sign(x);
    y = Math.sign(y);
    if (x !== 0 && y !== 0) {
      y = 0;
    }
    return { x, y };
  }

  return {
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
  };
}

module.exports = {
  createPlayerService
};
