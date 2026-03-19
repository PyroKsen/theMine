const fs = require("fs");
const path = require("path");

const WORLD_SCHEMA_VERSION = 6;
const WORLD_METADATA_FILE = "world_meta.json";

function buildSourcesOfTruth(version) {
  if (version <= 1) {
    return {
      terrain: "map.bin",
      buildings: "buildings.json",
      dropBoxes: "drop_boxes.json"
    };
  }
  if (version === 2) {
    return {
      terrain: "map.bin",
      buildings: "buildings.json",
      buildingLayer: "buildings.bin",
      dropBoxes: "drop_boxes.json"
    };
  }
  if (version === 3) {
    return {
      terrain: "map.bin",
      buildings: "themine.db::buildings",
      buildingLayer: "buildings.bin (derived cache repaired from persisted buildings at startup)",
      dropBoxes: "drop_boxes.json"
    };
  }
  if (version === 4) {
    return {
      terrain: "map.bin",
      buildings: "themine.db::buildings",
      buildingLayer: "buildings.bin (derived cache repaired from SQLite buildings at startup)",
      dropBoxes: "themine.db::drop_boxes",
      legacyFiles: "removed from runtime persistence"
    };
  }
  if (version === 5) {
    return {
      terrain: "map.bin",
      tileHp: "tile_hp.json (sparse overrides for non-default terrain HP)",
      buildings: "themine.db::buildings",
      buildingLayer: "buildings.bin (derived cache repaired from SQLite buildings at startup)",
      dropBoxes: "themine.db::drop_boxes",
      legacyFiles: "removed from runtime persistence"
    };
  }
  return {
    terrain: "map.bin",
    tileHp: "tile_hp.json (sparse overrides for non-default terrain HP)",
    buildings: "themine.db::buildings",
    buildingLayer: "buildings.bin (derived cache repaired from SQLite buildings at startup)",
    dropBoxes: "themine.db::drop_boxes",
    legacyFiles: "removed from runtime persistence"
  };
}

const WORLD_SOURCES_OF_TRUTH = Object.freeze(buildSourcesOfTruth(WORLD_SCHEMA_VERSION));

const WORLD_MIGRATIONS = Object.freeze([
  {
    version: 1,
    description: "initialize metadata for legacy file-based world persistence",
    up(metadata) {
      metadata.sourcesOfTruth = buildSourcesOfTruth(1);
    }
  },
  {
    version: 2,
    description: "record building layer cache alongside file-based persistence",
    up(metadata) {
      metadata.sourcesOfTruth = buildSourcesOfTruth(2);
    }
  },
  {
    version: 3,
    description: "move buildings source of truth into SQLite",
    up(metadata) {
      metadata.sourcesOfTruth = buildSourcesOfTruth(3);
    }
  },
  {
    version: 4,
    description: "move drop boxes source of truth into SQLite and retire legacy files",
    up(metadata) {
      metadata.sourcesOfTruth = buildSourcesOfTruth(4);
    }
  },
  {
    version: 5,
    description: "persist sparse tile HP overrides separately from terrain",
    up(metadata) {
      metadata.sourcesOfTruth = buildSourcesOfTruth(5);
    }
  },
  {
    version: 6,
    description: "track explicit migration lifecycle separately from startup repair",
    up(metadata, context) {
      metadata.sourcesOfTruth = buildSourcesOfTruth(6);
      metadata.migrationState = {
        runner: "worldMigrations",
        repairSeparated: true,
        lastMigratedAt: context.now
      };
    }
  }
]);

function recoverAtomicBackup(filePath) {
  const backupPath = `${filePath}.bak`;
  if (!fs.existsSync(backupPath)) return false;
  try {
    if (!fs.existsSync(filePath)) {
      fs.renameSync(backupPath, filePath);
      return true;
    }
    fs.unlinkSync(backupPath);
  } catch {
    // keep going with the best file we have
  }
  return false;
}

function readJsonFile(filePath, fallback = null) {
  recoverAtomicBackup(filePath);
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeFileAtomic(filePath, contents, options = {}) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random()
      .toString(16)
      .slice(2)}.tmp`
  );
  const backupPath = `${filePath}.bak`;
  const hadOriginal = fs.existsSync(filePath);

  try {
    if (Buffer.isBuffer(contents) || contents instanceof Uint8Array) {
      fs.writeFileSync(tempPath, contents);
    } else {
      fs.writeFileSync(tempPath, contents, options);
    }

    if (hadOriginal) {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      fs.renameSync(filePath, backupPath);
    }

    fs.renameSync(tempPath, filePath);
    if (hadOriginal && fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // ignore temp cleanup failures
    }
    try {
      if (!fs.existsSync(filePath) && fs.existsSync(backupPath)) {
        fs.renameSync(backupPath, filePath);
      }
    } catch {
      // ignore backup restore failures
    }
    throw error;
  }
}

function writeJsonAtomic(filePath, value) {
  writeFileAtomic(filePath, JSON.stringify(value), { encoding: "utf-8" });
}

function isPositiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function normalizeMigrationHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory
    .filter((entry) => Number.isFinite(Number(entry?.version)))
    .map((entry) => ({
      version: Number(entry.version),
      description: String(entry.description || ""),
      appliedAt: isPositiveNumber(entry.appliedAt) ? Number(entry.appliedAt) : 0
    }));
}

function inferLegacyWorldVersion(dataDir) {
  if (fs.existsSync(path.join(dataDir, "tile_hp.json"))) return 5;
  if (fs.existsSync(path.join(dataDir, "themine.db"))) return 4;
  if (fs.existsSync(path.join(dataDir, "buildings.bin"))) return 2;
  if (
    fs.existsSync(path.join(dataDir, "buildings.json")) ||
    fs.existsSync(path.join(dataDir, "drop_boxes.json"))
  ) {
    return 1;
  }
  return 0;
}

function normalizeMetadataShape(existing, now, schemaVersion) {
  const createdAt = isPositiveNumber(existing?.createdAt)
    ? Number(existing.createdAt)
    : now;
  const updatedAt = isPositiveNumber(existing?.updatedAt)
    ? Number(existing.updatedAt)
    : createdAt;
  return {
    createdAt,
    updatedAt,
    schemaVersion,
    sourcesOfTruth:
      existing?.sourcesOfTruth && typeof existing.sourcesOfTruth === "object"
        ? existing.sourcesOfTruth
        : {},
    migrationHistory: normalizeMigrationHistory(existing?.migrationHistory),
    migrationState:
      existing?.migrationState && typeof existing.migrationState === "object"
        ? existing.migrationState
        : null
  };
}

function migrateWorldMetadata(dataDir, { logger = null } = {}) {
  const filePath = path.join(dataDir, WORLD_METADATA_FILE);
  const now = Date.now();
  const existing = readJsonFile(filePath, null);
  const inferredVersion = existing
    ? Number(existing.schemaVersion || 0)
    : inferLegacyWorldVersion(dataDir);
  const fromVersion = Math.max(0, Math.min(WORLD_SCHEMA_VERSION, inferredVersion));
  const metadata = normalizeMetadataShape(existing, now, fromVersion);
  const appliedMigrations = [];
  const adoptedLegacyVersion = !existing && fromVersion > 0 ? fromVersion : null;

  if (adoptedLegacyVersion) {
    logger?.(`[world] adopted legacy metadata baseline as v${adoptedLegacyVersion}`);
  }

  for (const migration of WORLD_MIGRATIONS) {
    if (migration.version <= metadata.schemaVersion) continue;
    migration.up(metadata, { dataDir, now });
    metadata.schemaVersion = migration.version;
    metadata.migrationHistory.push({
      version: migration.version,
      description: migration.description,
      appliedAt: now
    });
    appliedMigrations.push({
      version: migration.version,
      description: migration.description
    });
    logger?.(`[world] migrated to v${migration.version}: ${migration.description}`);
  }

  const canonicalSources = buildSourcesOfTruth(metadata.schemaVersion);
  const shouldNormalizeSources =
    JSON.stringify(metadata.sourcesOfTruth || {}) !== JSON.stringify(canonicalSources);
  if (shouldNormalizeSources) {
    metadata.sourcesOfTruth = canonicalSources;
  }

  if (metadata.schemaVersion >= 6) {
    metadata.migrationState = {
      runner: "worldMigrations",
      repairSeparated: true,
      lastMigratedAt:
        metadata.migrationState && isPositiveNumber(metadata.migrationState.lastMigratedAt)
          ? Number(metadata.migrationState.lastMigratedAt)
          : now
    };
  }

  const shouldWrite =
    !existing ||
    appliedMigrations.length > 0 ||
    shouldNormalizeSources ||
    !Array.isArray(existing?.migrationHistory) ||
    (metadata.schemaVersion >= 6 && !existing?.migrationState) ||
    !isPositiveNumber(existing?.createdAt) ||
    !isPositiveNumber(existing?.updatedAt);

  if (shouldWrite) {
    metadata.updatedAt = now;
    writeJsonAtomic(filePath, metadata);
  }

  return {
    filePath,
    metadata,
    fromVersion,
    toVersion: metadata.schemaVersion,
    adoptedLegacyVersion,
    appliedMigrations
  };
}

module.exports = {
  WORLD_SCHEMA_VERSION,
  WORLD_METADATA_FILE,
  WORLD_MIGRATIONS,
  WORLD_SOURCES_OF_TRUTH,
  recoverAtomicBackup,
  readJsonFile,
  writeFileAtomic,
  writeJsonAtomic,
  migrateWorldMetadata
};
