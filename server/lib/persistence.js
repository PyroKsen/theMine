const fs = require("fs");
const path = require("path");

const WORLD_SCHEMA_VERSION = 4;
const WORLD_METADATA_FILE = "world_meta.json";
const WORLD_SOURCES_OF_TRUTH = Object.freeze({
  terrain: "map.bin",
  buildings: "themine.db::buildings",
  buildingLayer: "buildings.bin (derived cache repaired from SQLite buildings at startup)",
  dropBoxes: "themine.db::drop_boxes",
  legacyFiles: "removed from runtime persistence"
});

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

function ensureWorldMetadata(dataDir) {
  const filePath = path.join(dataDir, WORLD_METADATA_FILE);
  const now = Date.now();
  const existing = readJsonFile(filePath, {});
  const next = {
    createdAt:
      Number.isFinite(Number(existing?.createdAt)) && Number(existing.createdAt) > 0
        ? Number(existing.createdAt)
        : now,
    updatedAt: now,
    schemaVersion: WORLD_SCHEMA_VERSION,
    sourcesOfTruth: WORLD_SOURCES_OF_TRUTH
  };

  const shouldWrite =
    !existing ||
    existing.schemaVersion !== next.schemaVersion ||
    JSON.stringify(existing.sourcesOfTruth || {}) !==
      JSON.stringify(next.sourcesOfTruth);

  if (shouldWrite) {
    writeJsonAtomic(filePath, next);
  }

  return { filePath, metadata: next };
}

module.exports = {
  WORLD_SCHEMA_VERSION,
  WORLD_METADATA_FILE,
  WORLD_SOURCES_OF_TRUTH,
  recoverAtomicBackup,
  readJsonFile,
  writeFileAtomic,
  writeJsonAtomic,
  ensureWorldMetadata
};
