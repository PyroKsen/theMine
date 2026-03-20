const { ITEM_DEFS, SKILL_DEFS } = require("./config");

const DB_SCHEMA_VERSION = 6;

const USER_PROGRESS_COLUMNS = Object.freeze([
  ["last_tx", "INTEGER"],
  ["last_ty", "INTEGER"],
  ["explored_chunks", "TEXT"],
  ["skill_slots", "TEXT"],
  ["respawn_building_id", "TEXT"],
  ["dollars", "INTEGER NOT NULL DEFAULT 0"],
  ["coins", "INTEGER NOT NULL DEFAULT 0"],
  ["hp", "INTEGER NOT NULL DEFAULT 100"],
  ["max_hp", "INTEGER NOT NULL DEFAULT 100"],
  ["crystal_green", "INTEGER NOT NULL DEFAULT 0"],
  ["crystal_blue", "INTEGER NOT NULL DEFAULT 0"],
  ["crystal_white", "INTEGER NOT NULL DEFAULT 0"],
  ["crystal_red", "INTEGER NOT NULL DEFAULT 0"],
  ["crystal_pink", "INTEGER NOT NULL DEFAULT 0"],
  ["crystal_cyan", "INTEGER NOT NULL DEFAULT 0"]
]);

function tableExists(db, tableName) {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
    )
    .get(tableName);
  return Boolean(row);
}

function getTableColumns(db, tableName) {
  if (!tableExists(db, tableName)) return new Set();
  return new Set(
    db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name)
  );
}

function addColumnIfMissing(db, tableName, knownColumns, columnName, definition) {
  if (knownColumns.has(columnName)) return false;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  knownColumns.add(columnName);
  return true;
}

function migrateToV1(db) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`
  );
}

function migrateToV2(db) {
  migrateToV1(db);
  const columns = getTableColumns(db, "users");
  for (const [columnName, definition] of USER_PROGRESS_COLUMNS) {
    addColumnIfMissing(db, "users", columns, columnName, definition);
  }
}

function migrateToV3(db) {
  migrateToV2(db);
  const columns = getTableColumns(db, "users");
  for (const item of ITEM_DEFS) {
    addColumnIfMissing(
      db,
      "users",
      columns,
      item.column,
      "INTEGER NOT NULL DEFAULT 0"
    );
  }
}

function migrateToV4(db) {
  migrateToV3(db);
  const columns = getTableColumns(db, "users");
  for (const skill of SKILL_DEFS) {
    addColumnIfMissing(
      db,
      "users",
      columns,
      `skill_${skill.id}_level`,
      "INTEGER NOT NULL DEFAULT 0"
    );
    addColumnIfMissing(
      db,
      "users",
      columns,
      `skill_${skill.id}_xp`,
      "INTEGER NOT NULL DEFAULT 0"
    );
  }
}

function migrateToV5(db) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS buildings (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      w INTEGER NOT NULL,
      h INTEGER NOT NULL,
      owner TEXT NOT NULL DEFAULT 'Admin',
      hp INTEGER NOT NULL,
      max_hp INTEGER NOT NULL,
      inactive INTEGER NOT NULL DEFAULT 0,
      destroy_at INTEGER,
      balance INTEGER NOT NULL DEFAULT 0,
      fee INTEGER NOT NULL DEFAULT 0,
      entrance_json TEXT,
      center_json TEXT,
      entrances_json TEXT,
      tiles_json TEXT NOT NULL,
      storage_json TEXT,
      created_at INTEGER NOT NULL DEFAULT 0
    )`
  );
  db.exec(
    `CREATE TABLE IF NOT EXISTS drop_boxes (
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      crystals_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (x, y)
    )`
  );
}

function migrateToV6(db) {
  migrateToV5(db);
  const columns = getTableColumns(db, "users");
  for (const item of ITEM_DEFS) {
    addColumnIfMissing(
      db,
      "users",
      columns,
      item.column,
      "INTEGER NOT NULL DEFAULT 0"
    );
  }
}

const DB_MIGRATIONS = Object.freeze([
  {
    version: 1,
    description: "create core users table",
    up: migrateToV1
  },
  {
    version: 2,
    description: "add user world-state, respawn, economy, and crystal columns",
    up: migrateToV2
  },
  {
    version: 3,
    description: "add item inventory columns",
    up: migrateToV3
  },
  {
    version: 4,
    description: "add skill progression columns",
    up: migrateToV4
  },
  {
    version: 5,
    description: "add SQLite-backed building and drop box tables",
    up: migrateToV5
  },
  {
    version: 6,
    description: "add geopak inventory columns",
    up: migrateToV6
  }
]);

function inferLegacyDbVersion(db) {
  if (!tableExists(db, "users")) return 0;

  let version = 1;
  const userColumns = getTableColumns(db, "users");
  const hasProgressColumns = USER_PROGRESS_COLUMNS.every(([columnName]) =>
    userColumns.has(columnName)
  );
  if (hasProgressColumns) {
    version = 2;
  }

  const hasItemColumns = ITEM_DEFS.every((item) => userColumns.has(item.column));
  if (hasItemColumns) {
    version = 3;
  }

  const hasSkillColumns = SKILL_DEFS.every(
    (skill) =>
      userColumns.has(`skill_${skill.id}_level`) &&
      userColumns.has(`skill_${skill.id}_xp`)
  );
  if (hasSkillColumns) {
    version = 4;
  }

  if (tableExists(db, "buildings") && tableExists(db, "drop_boxes")) {
    version = 5;
  }

  const hasAllCurrentItemColumns = ITEM_DEFS.every((item) => userColumns.has(item.column));
  if (version >= 5 && hasAllCurrentItemColumns) {
    version = 6;
  }

  return version;
}

function migrateDb(db, { logger = null } = {}) {
  let currentVersion = Number(db.pragma("user_version", { simple: true }) || 0);
  const fromVersion = currentVersion;
  let adoptedLegacyVersion = null;

  if (currentVersion === 0) {
    const inferredVersion = inferLegacyDbVersion(db);
    if (inferredVersion > 0) {
      db.pragma(`user_version = ${inferredVersion}`);
      currentVersion = inferredVersion;
      adoptedLegacyVersion = inferredVersion;
      logger?.(
        `[db] adopted legacy schema as v${inferredVersion} before migrations`
      );
    }
  }

  const appliedMigrations = [];
  for (const migration of DB_MIGRATIONS) {
    if (migration.version <= currentVersion) continue;
    db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    })();
    appliedMigrations.push({
      version: migration.version,
      description: migration.description
    });
    currentVersion = migration.version;
    logger?.(`[db] migrated to v${migration.version}: ${migration.description}`);
  }

  return {
    fromVersion,
    toVersion: currentVersion,
    adoptedLegacyVersion,
    appliedMigrations
  };
}

module.exports = {
  DB_SCHEMA_VERSION,
  DB_MIGRATIONS,
  migrateDb
};
