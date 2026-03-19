const { migrateWorldMetadata } = require("./persistence");

function logRepair(prefix, details) {
  console.log(`[world] ${prefix}: ${details}`);
}

function isValidRespawnSelection(username, building) {
  return Boolean(
    building &&
      building.type === "respawn" &&
      building.owner === username &&
      !building.inactive &&
      Number(building.hp || 0) > 0 &&
      Number.isFinite(Number(building.center?.x)) &&
      Number.isFinite(Number(building.center?.y))
  );
}

function validateAndRepairWorldState({
  dataDir,
  buildingManager,
  worldActions,
  stmtSelectUsersWithRespawnBuildingId,
  stmtUpdateRespawnBuildingId
}) {
  const migrationResult = migrateWorldMetadata(dataDir, {
    logger: (message) => console.log(message)
  });
  logRepair(
    "schema",
    `v${migrationResult.metadata.schemaVersion} metadata loaded from ${migrationResult.filePath}`
  );

  const buildingResult = buildingManager.validateAndRepairBuildings();
  if (
    buildingResult.normalizedCount > 0 ||
    buildingResult.removedInvalidCount > 0 ||
    buildingResult.removedOverlapCount > 0 ||
    buildingResult.removedTerrainConflictCount > 0 ||
    buildingResult.repairedCells > 0
  ) {
    logRepair(
      "buildings",
      `normalized=${buildingResult.normalizedCount} removedInvalid=${buildingResult.removedInvalidCount} removedOverlaps=${buildingResult.removedOverlapCount} removedTerrainConflicts=${buildingResult.removedTerrainConflictCount} repairedLayerCells=${buildingResult.repairedCells}`
    );
  }

  let clearedRespawnSelections = 0;
  if (stmtSelectUsersWithRespawnBuildingId && stmtUpdateRespawnBuildingId) {
    for (const row of stmtSelectUsersWithRespawnBuildingId.all()) {
      const building = buildingManager.getBuildingById(row.respawn_building_id);
      if (isValidRespawnSelection(row.username, building)) continue;
      stmtUpdateRespawnBuildingId.run(null, row.username);
      clearedRespawnSelections += 1;
    }
  }
  if (clearedRespawnSelections > 0) {
    logRepair(
      "respawn",
      `cleared ${clearedRespawnSelections} invalid respawn selections`
    );
  }

  const dropBoxResult = worldActions.syncDropBoxesOnMap();
  if (
    dropBoxResult.restoredTiles > 0 ||
    dropBoxResult.clearedTiles > 0 ||
    dropBoxResult.removedEntries > 0 ||
    dropBoxResult.terrainConflicts > 0
  ) {
    logRepair(
      "drop_boxes",
      `restored=${dropBoxResult.restoredTiles} cleared=${dropBoxResult.clearedTiles} removed=${dropBoxResult.removedEntries} terrainConflicts=${dropBoxResult.terrainConflicts} from SQLite drop boxes`
    );
  }

  return {
    metadata: migrationResult.metadata,
    migrationResult,
    buildingResult,
    clearedRespawnSelections,
    dropBoxResult
  };
}

module.exports = {
  validateAndRepairWorldState
};
