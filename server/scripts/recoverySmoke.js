const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  MAP_W,
  MAP_H,
  TILE_TYPES,
  TILE_HP,
  BUILDING_TYPES,
  CRYSTAL_PRICES
} = require("../lib/config");
const { getSkillConfig } = require("../lib/skills");
const { createDb } = require("../lib/db");
const { createMapStore } = require("../lib/mapStore");
const { createBuildingManager } = require("../lib/buildings");
const { createWorldActions } = require("../lib/worldActions");
const { validateAndRepairWorldState } = require("../lib/worldValidation");
const {
  readJsonFile,
  writeJsonAtomic,
  migrateWorldMetadata
} = require("../lib/persistence");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "themine-recovery-"));
}

function removeDirSafe(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures in smoke test
  }
}

function closeDbSafe(world) {
  try {
    world?.db?.db?.close?.();
  } catch {
    // ignore close failures in smoke test
  }
}

function buildWorld(dataDir) {
  const mapStore = createMapStore(dataDir);
  const db = createDb(dataDir);
  const players = new Map();
  const bombByTile = new Map();
  const broadcast = () => {};
  const buildingManager = createBuildingManager({
    dataDir,
    buildingDb: db.buildingDb,
    mapStore,
    players,
    bombByTile,
    broadcast
  });
  const worldActions = createWorldActions({
    dataDir,
    dropBoxDb: db.dropBoxDb,
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
    slotHelpers: {
      isSkillSlotted: () => false,
      isSkillAvailable: () => false
    },
    playerService: {
      sendToPlayer: () => {},
      grantSkillXp: () => {},
      setCrystalCount: (player, color, value) => {
        if (!player.inventory) player.inventory = {};
        player.inventory[color] = value;
      }
    },
    stmtUpdateUserPos: { run: () => {} },
    stmtUpdateHp: { run: () => {} },
    stmtUpdateRespawnBuildingId: db.stmtUpdateRespawnBuildingId,
    bombByTile,
    getRespawnSpawn: buildingManager.getRespawnSpawn,
    clearRespawnSelection: () => {},
    broadcast
  });

  return {
    dataDir,
    mapStore,
    db,
    buildingManager,
    worldActions
  };
}

function flushAll(world) {
  world.mapStore.flushDirty();
  world.buildingManager.flush();
  world.worldActions.flush();
}

function runFractionalTileDamageTest() {
  const dataDir = makeTempDir();
  let world = null;
  try {
    world = buildWorld(dataDir);
    const x = 8;
    const y = 8;
    assert.strictEqual(world.mapStore.getTile(x, y), TILE_TYPES.rock);

    const firstHit = world.worldActions.damageTile(x, y, "tester", null, 2.7);
    assert.strictEqual(firstHit.hit, true);
    assert.strictEqual(firstHit.broken, false);
    assert.strictEqual(world.mapStore.getTile(x, y), TILE_TYPES.rock);
    assert.strictEqual(world.mapStore.getTileHp(x, y), 0.3);

    flushAll(world);
    closeDbSafe(world);

    world = buildWorld(dataDir);
    assert.strictEqual(world.mapStore.getTileHp(x, y), 0.3);

    const secondHit = world.worldActions.damageTile(x, y, "tester", null, 2.7);
    assert.strictEqual(secondHit.hit, true);
    assert.strictEqual(secondHit.broken, true);
    assert.strictEqual(world.mapStore.getTile(x, y), TILE_TYPES.empty);
    assert.strictEqual(world.mapStore.getTileHp(x, y), undefined);
  } finally {
    closeDbSafe(world);
    removeDirSafe(dataDir);
  }
}
function runTileHpPersistenceTest() {
  const dataDir = makeTempDir();
  let world = null;
  try {
    world = buildWorld(dataDir);
    const x = 8;
    const y = 8;
    const type = world.mapStore.getTile(x, y);
    const baseHp = TILE_HP.get(type);
    assert.ok(baseHp > 1, "expected a default solid tile for tileHp test");
    world.mapStore.setTileHp(x, y, baseHp - 1);
    flushAll(world);
    closeDbSafe(world);

    world = buildWorld(dataDir);
    assert.strictEqual(world.mapStore.getTileHp(x, y), baseHp - 1);

    const payload = readJsonFile(path.join(dataDir, "tile_hp.json"), []);
    const match = payload.find((entry) => entry.x === x && entry.y === y);
    assert.ok(match, "tile hp override missing from persisted file");
    assert.strictEqual(match.hp, baseHp - 1);
  } finally {
    closeDbSafe(world);
    removeDirSafe(dataDir);
  }
}

function runTileHpOverrideCleanupTest() {
  const dataDir = makeTempDir();
  let world = null;
  try {
    world = buildWorld(dataDir);
    const x = 8;
    const y = 8;
    const baseHp = TILE_HP.get(world.mapStore.getTile(x, y));
    world.mapStore.setTileHp(x, y, baseHp - 1);
    flushAll(world);

    world.mapStore.setTile(x, y, TILE_TYPES.empty);
    flushAll(world);
    closeDbSafe(world);

    const payload = readJsonFile(path.join(dataDir, "tile_hp.json"), []);
    const match = payload.find((entry) => entry.x === x && entry.y === y);
    assert.strictEqual(match, undefined);

    world = buildWorld(dataDir);
    assert.strictEqual(world.mapStore.getTile(x, y), TILE_TYPES.empty);
    assert.strictEqual(world.mapStore.getTileHp(x, y), undefined);
  } finally {
    closeDbSafe(world);
    removeDirSafe(dataDir);
  }
}

function runBuildingLayerRepairTest() {
  const dataDir = makeTempDir();
  let world = null;
  try {
    world = buildWorld(dataDir);
    const player = { username: "host", facingX: 0, facingY: -1 };
    const placed = world.buildingManager.placeRespawn(player, 40, 40);
    assert.ok(placed, "failed to place respawn building in fixture");
    const building = world.buildingManager.buildings.find((entry) => entry.type === "respawn");
    assert.ok(building, "respawn building was not created");
    const sampleTile = building.tiles[0];

    flushAll(world);
    world.mapStore.replaceBuildingLayer(new Uint8Array(MAP_W * MAP_H));
    world.mapStore.flushDirty();
    closeDbSafe(world);

    world = buildWorld(dataDir);
    const result = validateAndRepairWorldState({
      dataDir,
      buildingManager: world.buildingManager,
      worldActions: world.worldActions,
      stmtSelectUsersWithRespawnBuildingId: world.db.stmtSelectUsersWithRespawnBuildingId,
      stmtUpdateRespawnBuildingId: world.db.stmtUpdateRespawnBuildingId
    });

    assert.ok(result.buildingResult.repairedCells > 0, "building layer was not repaired");
    assert.strictEqual(
      world.mapStore.getBuilding(sampleTile.x, sampleTile.y),
      BUILDING_TYPES.respawn
    );
  } finally {
    closeDbSafe(world);
    removeDirSafe(dataDir);
  }
}

function runBuildingLayerRepairPersistenceTest() {
  const dataDir = makeTempDir();
  let world = null;
  try {
    world = buildWorld(dataDir);
    const player = { username: "host", facingX: 0, facingY: -1 };
    assert.ok(world.buildingManager.placeRespawn(player, 44, 44));
    flushAll(world);

    world.mapStore.replaceBuildingLayer(new Uint8Array(MAP_W * MAP_H));
    world.mapStore.flushDirty();
    closeDbSafe(world);

    world = buildWorld(dataDir);
    const firstRepair = validateAndRepairWorldState({
      dataDir,
      buildingManager: world.buildingManager,
      worldActions: world.worldActions,
      stmtSelectUsersWithRespawnBuildingId: world.db.stmtSelectUsersWithRespawnBuildingId,
      stmtUpdateRespawnBuildingId: world.db.stmtUpdateRespawnBuildingId
    });
    assert.ok(firstRepair.buildingResult.repairedCells > 0);
    flushAll(world);
    closeDbSafe(world);

    world = buildWorld(dataDir);
    const secondRepair = validateAndRepairWorldState({
      dataDir,
      buildingManager: world.buildingManager,
      worldActions: world.worldActions,
      stmtSelectUsersWithRespawnBuildingId: world.db.stmtSelectUsersWithRespawnBuildingId,
      stmtUpdateRespawnBuildingId: world.db.stmtUpdateRespawnBuildingId
    });
    assert.strictEqual(secondRepair.buildingResult.repairedCells, 0);
  } finally {
    closeDbSafe(world);
    removeDirSafe(dataDir);
  }
}

function runDropBoxTerrainConflictTest() {
  const dataDir = makeTempDir();
  let world = null;
  try {
    const prepMap = createMapStore(dataDir);
    prepMap.setTile(60, 60, TILE_TYPES.rock);
    prepMap.flushDirty();

    const prepDb = createDb(dataDir);
    prepDb.dropBoxDb.stmtInsertOrReplaceDropBox.run({
      x: 60,
      y: 60,
      crystalsJson: JSON.stringify({ green: 5 }),
      createdAt: Date.now()
    });
    prepDb.db.close();

    world = buildWorld(dataDir);
    const result = world.worldActions.syncDropBoxesOnMap();
    world.worldActions.flush();

    assert.strictEqual(result.removedEntries, 1);
    assert.strictEqual(result.terrainConflicts, 1);
    assert.strictEqual(
      Number(world.db.dropBoxDb.stmtCountDropBoxes.get().count || 0),
      0
    );
    assert.strictEqual(world.mapStore.getTile(60, 60), TILE_TYPES.rock);
  } finally {
    closeDbSafe(world);
    removeDirSafe(dataDir);
  }
}

function runDropBoxRestoreFromDbTest() {
  const dataDir = makeTempDir();
  let world = null;
  try {
    const prepDb = createDb(dataDir);
    prepDb.dropBoxDb.stmtInsertOrReplaceDropBox.run({
      x: 61,
      y: 61,
      crystalsJson: JSON.stringify({ green: 3, blue: 1 }),
      createdAt: Date.now()
    });
    prepDb.db.close();

    world = buildWorld(dataDir);
    const result = world.worldActions.syncDropBoxesOnMap();

    assert.strictEqual(result.restoredTiles, 1);
    assert.strictEqual(world.mapStore.getTile(61, 61), TILE_TYPES.dropBox);
    assert.strictEqual(world.mapStore.getTileHp(61, 61), 1);
  } finally {
    closeDbSafe(world);
    removeDirSafe(dataDir);
  }
}

function runRespawnSelectionRepairTest() {
  const dataDir = makeTempDir();
  let world = null;
  try {
    const prepDb = createDb(dataDir);
    prepDb.db
      .prepare(
        "INSERT INTO users (username, password_hash, created_at, respawn_building_id) VALUES (?, ?, ?, ?)"
      )
      .run("alice", "hash", Date.now(), "missing_respawn");
    prepDb.db.close();

    world = buildWorld(dataDir);
    const result = validateAndRepairWorldState({
      dataDir,
      buildingManager: world.buildingManager,
      worldActions: world.worldActions,
      stmtSelectUsersWithRespawnBuildingId: world.db.stmtSelectUsersWithRespawnBuildingId,
      stmtUpdateRespawnBuildingId: world.db.stmtUpdateRespawnBuildingId
    });

    assert.strictEqual(result.clearedRespawnSelections, 1);
    assert.strictEqual(world.db.stmtGetUser.get("alice").respawn_building_id, null);
  } finally {
    closeDbSafe(world);
    removeDirSafe(dataDir);
  }
}

function runDbLegacyAdoptionTest() {
  const dataDir = makeTempDir();
  let dbHandle = null;
  try {
    dbHandle = createDb(dataDir);
    assert.strictEqual(dbHandle.migrationResult.toVersion, 5);
    dbHandle.db.pragma("user_version = 0");
    dbHandle.db.close();

    dbHandle = createDb(dataDir);
    assert.strictEqual(dbHandle.migrationResult.appliedMigrations.length, 0);
    assert.strictEqual(dbHandle.migrationResult.adoptedLegacyVersion, 5);
    assert.strictEqual(dbHandle.db.pragma("user_version", { simple: true }), 5);
  } finally {
    try {
      dbHandle?.db?.close?.();
    } catch {
      // ignore close failures in smoke test
    }
    removeDirSafe(dataDir);
  }
}

function runWorldMetadataMigrationTest() {
  const dataDir = makeTempDir();
  try {
    const legacyMetadata = {
      createdAt: Date.now() - 5000,
      updatedAt: Date.now() - 4000,
      schemaVersion: 5,
      sourcesOfTruth: {
        terrain: "map.bin",
        tileHp: "tile_hp.json (sparse overrides for non-default terrain HP)",
        buildings: "themine.db::buildings",
        buildingLayer: "buildings.bin (derived cache repaired from SQLite buildings at startup)",
        dropBoxes: "themine.db::drop_boxes",
        legacyFiles: "removed from runtime persistence"
      }
    };
    writeJsonAtomic(path.join(dataDir, "world_meta.json"), legacyMetadata);

    const result = migrateWorldMetadata(dataDir);
    assert.strictEqual(result.fromVersion, 5);
    assert.strictEqual(result.toVersion, 6);
    assert.strictEqual(result.appliedMigrations.length, 1);
    assert.strictEqual(result.appliedMigrations[0].version, 6);
    assert.strictEqual(result.metadata.migrationState.repairSeparated, true);

    const persisted = readJsonFile(path.join(dataDir, "world_meta.json"), null);
    assert.strictEqual(persisted.schemaVersion, 6);
    assert.ok(Array.isArray(persisted.migrationHistory));
    assert.strictEqual(persisted.migrationHistory.at(-1).version, 6);
  } finally {
    removeDirSafe(dataDir);
  }
}

const tests = [
  ["fractional tile damage", runFractionalTileDamageTest],
  ["tileHp persistence", runTileHpPersistenceTest],
  ["tileHp override cleanup", runTileHpOverrideCleanupTest],
  ["building layer repair", runBuildingLayerRepairTest],
  ["building layer repair persistence", runBuildingLayerRepairPersistenceTest],
  ["drop box terrain conflict", runDropBoxTerrainConflictTest],
  ["drop box restore from db", runDropBoxRestoreFromDbTest],
  ["respawn selection repair", runRespawnSelectionRepairTest],
  ["db legacy adoption", runDbLegacyAdoptionTest],
  ["world metadata migration", runWorldMetadataMigrationTest]
];

try {
  for (const [name, fn] of tests) {
    fn();
    console.log(`[ok] ${name}`);
  }
  console.log(`[ok] recovery smoke tests: ${tests.length}/${tests.length}`);
} catch (error) {
  console.error("[fail] recovery smoke tests", error);
  process.exit(1);
}

