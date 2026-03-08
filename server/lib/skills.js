const {
  BASE_MOVE_TILES_PER_SEC,
  BASE_INVENTORY_CAPACITY,
  BASE_MINE_DAMAGE,
  BASE_MAX_DEPTH_TILES,
  DEPTH_PER_LEVEL,
  CRYSTAL_PRICES,
  SKILL_DEFS
} = require("./config");

const SKILL_BY_ID = new Map(SKILL_DEFS.map((skill) => [skill.id, skill]));

function getSkillConfig(id) {
  return SKILL_BY_ID.get(id) || null;
}

function getSkillXpNeed(config, level) {
  if (!config || config.locked) return Number.POSITIVE_INFINITY;
  return Math.max(1, config.xpBase + config.xpGrowth * level);
}

function getSkillCost(config, level) {
  if (!config || config.locked) return Number.POSITIVE_INFINITY;
  return Math.max(0, config.dollarBase + config.dollarGrowth * level);
}

function getMoveTilesPerSec(player) {
  const level = player?.skills?.move?.level ?? 0;
  const overload = getOverloadPercent(player);
  const speedMultiplier = Math.max(0.2, 1 - overload / 100);
  const baseSpeed =
    BASE_MOVE_TILES_PER_SEC * (1 + level * 0.01) * speedMultiplier;
  if (player?.inputSlow && baseSpeed > 5) return 5;
  return baseSpeed;
}

function getMoveStepDelayMs(player) {
  const speed = getMoveTilesPerSec(player);
  return 1000 / Math.max(0.1, speed);
}

function getMiningDamage(player) {
  const level = player?.skills?.mining?.level ?? 0;
  return BASE_MINE_DAMAGE + level * 0.1;
}

function getCrystalCapacity(player) {
  const level = player?.skills?.inventory?.level ?? 0;
  return BASE_INVENTORY_CAPACITY + level * 100;
}

function getMaxDepth(player) {
  const level = player?.skills?.depth?.level ?? 0;
  return BASE_MAX_DEPTH_TILES + level * DEPTH_PER_LEVEL;
}

function getOverloadPercent(player) {
  const capacity = getCrystalCapacity(player);
  if (capacity <= 0) return 0;
  let maxOver = 0;
  for (const color of CRYSTAL_PRICES ? Object.keys(CRYSTAL_PRICES) : []) {
    const count = player.inventory?.[color] ?? 0;
    const over = Math.floor(((count - capacity) / capacity) * 100);
    if (over > maxOver) maxOver = over;
  }
  return Math.max(0, maxOver);
}

function isInventoryNearCapacity(player) {
  const capacity = getCrystalCapacity(player);
  const threshold = capacity * 0.8;
  for (const color of CRYSTAL_PRICES ? Object.keys(CRYSTAL_PRICES) : []) {
    if ((player.inventory?.[color] ?? 0) >= threshold) return true;
  }
  return false;
}

module.exports = {
  SKILL_DEFS,
  SKILL_BY_ID,
  getSkillConfig,
  getSkillXpNeed,
  getSkillCost,
  getMoveTilesPerSec,
  getMoveStepDelayMs,
  getMiningDamage,
  getCrystalCapacity,
  getMaxDepth,
  getOverloadPercent,
  isInventoryNearCapacity
};
