const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const { DB_SCHEMA_VERSION } = require("../lib/dbMigrations");
const {
  WORLD_SCHEMA_VERSION,
  WORLD_METADATA_FILE,
  readJsonFile
} = require("../lib/persistence");

const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "themine.db");
const worldMetaPath = path.join(dataDir, WORLD_METADATA_FILE);

function printSection(title) {
  console.log(`\n[${title}]`);
}

function printKv(key, value) {
  console.log(`${key}: ${value}`);
}

function tableExists(db, tableName) {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
    )
    .get(tableName);
  return Boolean(row);
}

function countRowsIfTableExists(db, tableName) {
  if (!tableExists(db, tableName)) return "missing_table";
  return Number(
    db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get()?.count || 0
  );
}

printSection("paths");
printKv("dataDir", dataDir);
printKv("dbPath", dbPath);
printKv("worldMetaPath", worldMetaPath);

printSection("db");
printKv("expectedSchemaVersion", DB_SCHEMA_VERSION);
if (!fs.existsSync(dbPath)) {
  printKv("status", "missing");
} else {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const userVersion = Number(db.pragma("user_version", { simple: true }) || 0);
    printKv("userVersion", userVersion);
    printKv("users", countRowsIfTableExists(db, "users"));
    printKv("buildings", countRowsIfTableExists(db, "buildings"));
    printKv("dropBoxes", countRowsIfTableExists(db, "drop_boxes"));
    printKv(
      "status",
      userVersion === DB_SCHEMA_VERSION ? "up_to_date" : "out_of_date_or_legacy"
    );
  } finally {
    db.close();
  }
}

printSection("world");
printKv("expectedSchemaVersion", WORLD_SCHEMA_VERSION);
if (!fs.existsSync(worldMetaPath)) {
  printKv("status", "missing");
} else {
  const metadata = readJsonFile(worldMetaPath, null);
  if (!metadata) {
    printKv("status", "unreadable");
  } else {
    const schemaVersion = Number(metadata.schemaVersion || 0);
    const migrationHistory = Array.isArray(metadata.migrationHistory)
      ? metadata.migrationHistory.length
      : 0;
    printKv("schemaVersion", schemaVersion);
    printKv("createdAt", metadata.createdAt || "unknown");
    printKv("updatedAt", metadata.updatedAt || "unknown");
    printKv("migrationHistoryEntries", migrationHistory);
    printKv(
      "status",
      schemaVersion === WORLD_SCHEMA_VERSION ? "up_to_date" : "out_of_date_or_legacy"
    );
    if (metadata.sourcesOfTruth && typeof metadata.sourcesOfTruth === "object") {
      printSection("sourcesOfTruth");
      for (const [key, value] of Object.entries(metadata.sourcesOfTruth)) {
        printKv(key, value);
      }
    }
  }
}
