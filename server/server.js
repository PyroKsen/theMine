const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const {
  BASE_HP,
  DEPTH_OVERLOAD_INTERVAL_MS,
  TICK_RATE,
  MINE_COOLDOWN_MS,
  CHAT_MAX_LEN,
  CRYSTAL_PRICES,
  BUILDING_TYPES,
  MAP_W,
  MAP_H,
  TILE_SIZE,
  CHUNK_SIZE,
  TILE_TYPES,
  CRYSTAL_TILE_TO_COLOR,
  BOMB_ITEMS,
  BUILDING_ITEMS,
  TILE_HP,
  SKILL_DEFS
} = require("./lib/config");
const {
  getSkillConfig,
  getSkillXpNeed,
  getSkillCost,
  getMoveStepDelayMs,
  getMiningDamage,
  getMaxDepth,
  getOverloadPercent,
  isInventoryNearCapacity
} = require("./lib/skills");
const { createDb } = require("./lib/db");
const { createBuildingManager } = require("./lib/buildings");
const { createBombManager } = require("./lib/bombs");
const { createPlayerService } = require("./lib/players");
const {
  chunkKey,
  parseExplored,
  encodeExplored,
  chunkIntersectsView,
  exploredPayload,
  updateExplored
} = require("./lib/exploration");
const {
  SKILL_SLOT_COUNT,
  EMPTY_SKILL_SLOTS,
  normalizeSkillSlots,
  serializeSkillSlots,
  isSkillSlotted,
  isSkillAvailable
} = require("./lib/skillSlots");
const { createAuthServer } = require("./lib/authServer");
const { createWorldActions } = require("./lib/worldActions");
const { attachRealtimeServer } = require("./lib/realtimeServer");
const { createMapStore } = require("./lib/mapStore");
const { validateAndRepairWorldState } = require("./lib/worldValidation");

const PORT = Number(process.env.PORT || 8080);
const SKILL_DEFAULTS = SKILL_DEFS.flatMap(() => [0, 0]);

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const mapStore = createMapStore(dataDir);
const { getTile, getBuilding } = mapStore;

function isWalkable(x, y) {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
  if (getTile(x, y) !== TILE_TYPES.empty) return false;
  return getBuilding(x, y) === BUILDING_TYPES.none;
}

const {
  stmtInsertUser,
  stmtGetUser,
  stmtUpdateUserPos,
  stmtUpdateExplored,
  stmtUpdateSkillSlots,
  stmtSelectUsersWithRespawnBuildingId,
  stmtUpdateRespawnBuildingId,
  stmtUpdateDollars,
  stmtUpdateHp,
  stmtUpdateMaxHp,
  itemUpdateStmts,
  stmtUpdateCrystalGreen,
  stmtUpdateCrystalBlue,
  stmtUpdateCrystalWhite,
  stmtUpdateCrystalRed,
  stmtUpdateCrystalPink,
  stmtUpdateCrystalCyan,
  skillUpdateStmts,
  buildingDb,
  dropBoxDb
} = createDb(dataDir);

const playerService = createPlayerService({
  mapWidth: MAP_W,
  mapHeight: MAP_H,
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
  crystalTileToColor: CRYSTAL_TILE_TO_COLOR
});

const sessions = new Map();
const players = new Map();
const server = createAuthServer({
  sessions,
  stmtInsertUser,
  stmtGetUser,
  serializeSkillSlots,
  emptySkillSlots: EMPTY_SKILL_SLOTS,
  skillDefaults: SKILL_DEFAULTS,
  baseHp: BASE_HP
});
const wss = new WebSocket.Server({ server });

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

const bombManager = createBombManager({
  mapStore,
  players,
  broadcast,
  applyDamageToPlayer: playerService.applyDamageToPlayer
});
const buildingManager = createBuildingManager({
  dataDir,
  buildingDb,
  mapStore,
  players,
  bombByTile: bombManager.bombByTile,
  broadcast
});
bombManager.setBuildingHooks({
  getBuildingAtTile: buildingManager.getBuildingAtTile,
  damageBuilding: buildingManager.damageBuilding
});
const worldActions = createWorldActions({
  dataDir,
  dropBoxDb,
  mapStore,
  config: {
    MAP_W,
    MAP_H,
    TILE_TYPES,
    TILE_HP,
    BUILDING_TYPES,
    CRYSTAL_PRICES
  },
  skillHelpers: { getSkillConfig },
  slotHelpers: { isSkillSlotted, isSkillAvailable },
  playerService,
  stmtUpdateUserPos,
  stmtUpdateHp,
  stmtUpdateRespawnBuildingId,
  bombByTile: bombManager.bombByTile,
  getRespawnSpawn: buildingManager.getRespawnSpawn,
  clearRespawnSelection: (player) => {
    playerService.sendToPlayer(player, { t: "respawn_selection", id: null });
  },
  broadcast
});

validateAndRepairWorldState({
  dataDir,
  buildingManager,
  worldActions,
  stmtSelectUsersWithRespawnBuildingId,
  stmtUpdateRespawnBuildingId
});

attachRealtimeServer({
  wss,
  sessions,
  players,
  config: {
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
    TILE_TYPES,
    TILE_HP,
    SKILL_DEFS
  },
  db: {
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
  },
  mapStore,
  buildingManager,
  bombManager,
  playerService,
  skillHelpers: {
    getSkillConfig,
    getSkillXpNeed,
    getSkillCost,
    getMoveStepDelayMs,
    getMiningDamage,
    getMaxDepth
  },
  exploration: {
    chunkKey,
    parseExplored,
    encodeExplored,
    chunkIntersectsView,
    exploredPayload,
    updateExplored
  },
  slotHelpers: {
    SKILL_SLOT_COUNT,
    normalizeSkillSlots,
    serializeSkillSlots,
    isSkillSlotted,
    isSkillAvailable
  },
  worldActions,
  isWalkable
});

server.listen(PORT, () => {
  console.log(`Server listening on ws://localhost:${PORT}`);
});
