const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const {
  BASE_HP,
  BASE_SPAWN_TX,
  BASE_SPAWN_TY,
  DEPTH_OVERLOAD_INTERVAL_MS,
  TICK_RATE,
  MINE_COOLDOWN_MS,
  CHAT_MAX_LEN,
  CRYSTAL_PRICES,
  TELEPORT_PRICE,
  TELEPORT_RANGE,
  LIVE_CRYSTAL_GROWTH_MS,
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
  SKILL_DEFS,
  ITEM_DEFS
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
const { getTile, getBuilding, flushDirty } = mapStore;

function isWalkable(x, y) {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
  if (getTile(x, y) !== TILE_TYPES.empty) return false;
  return getBuilding(x, y) === BUILDING_TYPES.none;
}

const {
  migrationResult: dbMigrationResult,
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

if (dbMigrationResult.appliedMigrations.length > 0) {
  for (const migration of dbMigrationResult.appliedMigrations) {
    console.log(`[db] migrated to v${migration.version}: ${migration.description}`);
  }
} else if (dbMigrationResult.adoptedLegacyVersion) {
  console.log(
    `[db] adopted legacy schema baseline v${dbMigrationResult.adoptedLegacyVersion} with no new migrations`
  );
}

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
  players,
  stmtInsertUser,
  stmtGetUser,
  serializeSkillSlots,
  emptySkillSlots: EMPTY_SKILL_SLOTS,
  skillDefaults: SKILL_DEFAULTS,
  baseHp: BASE_HP,
  spawnTx: BASE_SPAWN_TX,
  spawnTy: BASE_SPAWN_TY
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
      BASE_SPAWN_TX,
      BASE_SPAWN_TY,
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
const { flush: flushBuildings } = buildingManager;
const { flush: flushWorldActions } = worldActions;

function flushAllPersistence(context = "runtime") {
  const errors = [];
  for (const [label, fn] of [
    ["map", flushDirty],
    ["buildings", flushBuildings],
    ["worldActions", flushWorldActions]
  ]) {
    try {
      fn();
    } catch (error) {
      errors.push({ label, error });
    }
  }
  if (errors.length > 0) {
    const detail = errors
      .map(({ label, error }) => `${label}: ${error?.message || error}`)
      .join("; ");
    throw new Error(`flushAllPersistence failed during ${context}: ${detail}`);
  }
}

let shutdownStarted = false;
function shutdownGracefully(context, exitCode = 0, error = null) {
  if (shutdownStarted) return;
  shutdownStarted = true;

  if (error) {
    console.error(`[shutdown] ${context}`, error);
  } else {
    console.log(`[shutdown] ${context}`);
  }

  try {
    flushAllPersistence(context);
  } catch (flushError) {
    console.error(flushError);
    exitCode = exitCode || 1;
  }

  try {
    wss.close();
  } catch {
    // ignore websocket close failures during shutdown
  }

  try {
    server.close(() => process.exit(exitCode));
    setTimeout(() => process.exit(exitCode), 3000).unref();
  } catch {
    process.exit(exitCode);
  }
}

process.on("SIGINT", () => shutdownGracefully("SIGINT", 0));
process.on("SIGTERM", () => shutdownGracefully("SIGTERM", 0));
process.on("uncaughtException", (error) =>
  shutdownGracefully("uncaughtException", 1, error)
);
process.on("unhandledRejection", (reason) =>
  shutdownGracefully("unhandledRejection", 1, reason)
);

validateAndRepairWorldState({
  dataDir,
  buildingManager,
  worldActions,
  stmtSelectUsersWithRespawnBuildingId,
  stmtUpdateRespawnBuildingId
});

flushAllPersistence("startup_repair");
attachRealtimeServer({
  wss,
  sessions,
  players,
  config: {
    BASE_HP,
    BASE_SPAWN_TX,
    BASE_SPAWN_TY,
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
    LIVE_CRYSTAL_GROWTH_MS,
    TILE_TYPES,
    TILE_HP,
    SKILL_DEFS,
    ITEM_DEFS
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





