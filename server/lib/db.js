const path = require("path");
const Database = require("better-sqlite3");
const { ITEM_DEFS, SKILL_DEFS } = require("./config");

function buildSkillColumns() {
  return SKILL_DEFS.flatMap((skill) => [
    `skill_${skill.id}_level INTEGER NOT NULL DEFAULT 0`,
    `skill_${skill.id}_xp INTEGER NOT NULL DEFAULT 0`
  ]);
}

function createDb(dataDir) {
  const db = new Database(path.join(dataDir, "themine.db"));
  const skillColumns = buildSkillColumns();
  db.exec(
    `CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_tx INTEGER, last_ty INTEGER, explored_chunks TEXT, skill_slots TEXT, respawn_building_id TEXT, dollars INTEGER NOT NULL DEFAULT 0, coins INTEGER NOT NULL DEFAULT 0, hp INTEGER NOT NULL DEFAULT 100, max_hp INTEGER NOT NULL DEFAULT 100, crystal_green INTEGER NOT NULL DEFAULT 0, crystal_blue INTEGER NOT NULL DEFAULT 0, crystal_white INTEGER NOT NULL DEFAULT 0, crystal_red INTEGER NOT NULL DEFAULT 0, crystal_pink INTEGER NOT NULL DEFAULT 0, crystal_cyan INTEGER NOT NULL DEFAULT 0, item_medkit INTEGER NOT NULL DEFAULT 0, item_bomb INTEGER NOT NULL DEFAULT 0, item_plasmabomb INTEGER NOT NULL DEFAULT 0, item_electrobomb INTEGER NOT NULL DEFAULT 0, item_storage INTEGER NOT NULL DEFAULT 0, item_shop INTEGER NOT NULL DEFAULT 0, item_respawn INTEGER NOT NULL DEFAULT 0, item_upgrade INTEGER NOT NULL DEFAULT 0, item_turret INTEGER NOT NULL DEFAULT 0, item_clan_hall INTEGER NOT NULL DEFAULT 0, ${skillColumns.join(
      ", "
    )})`
  );
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

  const userColumns = new Set(
    db.prepare("PRAGMA table_info(users)").all().map((row) => row.name)
  );
  if (!userColumns.has("last_tx")) {
    db.exec("ALTER TABLE users ADD COLUMN last_tx INTEGER");
  }
  if (!userColumns.has("last_ty")) {
    db.exec("ALTER TABLE users ADD COLUMN last_ty INTEGER");
  }
  if (!userColumns.has("explored_chunks")) {
    db.exec("ALTER TABLE users ADD COLUMN explored_chunks TEXT");
  }
  if (!userColumns.has("skill_slots")) {
    db.exec("ALTER TABLE users ADD COLUMN skill_slots TEXT");
  }
  if (!userColumns.has("respawn_building_id")) {
    db.exec("ALTER TABLE users ADD COLUMN respawn_building_id TEXT");
  }
  if (!userColumns.has("dollars")) {
    db.exec("ALTER TABLE users ADD COLUMN dollars INTEGER NOT NULL DEFAULT 0");
  }
  if (!userColumns.has("coins")) {
    db.exec("ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 0");
  }
  if (!userColumns.has("hp")) {
    db.exec("ALTER TABLE users ADD COLUMN hp INTEGER NOT NULL DEFAULT 100");
  }
  if (!userColumns.has("max_hp")) {
    db.exec("ALTER TABLE users ADD COLUMN max_hp INTEGER NOT NULL DEFAULT 100");
  }
  if (!userColumns.has("crystal_green")) {
    db.exec(
      "ALTER TABLE users ADD COLUMN crystal_green INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!userColumns.has("crystal_blue")) {
    db.exec(
      "ALTER TABLE users ADD COLUMN crystal_blue INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!userColumns.has("crystal_white")) {
    db.exec(
      "ALTER TABLE users ADD COLUMN crystal_white INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!userColumns.has("crystal_red")) {
    db.exec(
      "ALTER TABLE users ADD COLUMN crystal_red INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!userColumns.has("crystal_pink")) {
    db.exec(
      "ALTER TABLE users ADD COLUMN crystal_pink INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!userColumns.has("crystal_cyan")) {
    db.exec(
      "ALTER TABLE users ADD COLUMN crystal_cyan INTEGER NOT NULL DEFAULT 0"
    );
  }
  for (const item of ITEM_DEFS) {
    if (!userColumns.has(item.column)) {
      db.exec(
        `ALTER TABLE users ADD COLUMN ${item.column} INTEGER NOT NULL DEFAULT 0`
      );
    }
  }
  for (const skill of SKILL_DEFS) {
    const levelColumn = `skill_${skill.id}_level`;
    const xpColumn = `skill_${skill.id}_xp`;
    if (!userColumns.has(levelColumn)) {
      db.exec(
        `ALTER TABLE users ADD COLUMN ${levelColumn} INTEGER NOT NULL DEFAULT 0`
      );
    }
    if (!userColumns.has(xpColumn)) {
      db.exec(
        `ALTER TABLE users ADD COLUMN ${xpColumn} INTEGER NOT NULL DEFAULT 0`
      );
    }
  }

  const insertColumns = [
    "username",
    "password_hash",
    "created_at",
    "last_tx",
    "last_ty",
    "explored_chunks",
    "skill_slots",
    "respawn_building_id",
    "dollars",
    "coins",
    "hp",
    "max_hp",
    "crystal_green",
    "crystal_blue",
    "crystal_white",
    "crystal_red",
    "crystal_pink",
    "crystal_cyan",
    ...SKILL_DEFS.flatMap((skill) => [
      `skill_${skill.id}_level`,
      `skill_${skill.id}_xp`
    ])
  ];
  const insertValues = insertColumns.map(() => "?");
  const stmtInsertUser = db.prepare(
    `INSERT INTO users (${insertColumns.join(
      ", "
    )}) VALUES (${insertValues.join(", ")})`
  );

  const selectColumns = [
    "username",
    "password_hash",
    "last_tx",
    "last_ty",
    "explored_chunks",
    "skill_slots",
    "respawn_building_id",
    "dollars",
    "coins",
    "hp",
    "max_hp",
    "crystal_green",
    "crystal_blue",
    "crystal_white",
    "crystal_red",
    "crystal_pink",
    "crystal_cyan",
    ...ITEM_DEFS.map((item) => item.column),
    ...SKILL_DEFS.flatMap((skill) => [
      `skill_${skill.id}_level`,
      `skill_${skill.id}_xp`
    ])
  ];
  const stmtGetUser = db.prepare(
    `SELECT ${selectColumns.join(", ")} FROM users WHERE username = ?`
  );

  const stmtUpdateUserPos = db.prepare(
    "UPDATE users SET last_tx = ?, last_ty = ? WHERE username = ?"
  );
  const stmtUpdateExplored = db.prepare(
    "UPDATE users SET explored_chunks = ? WHERE username = ?"
  );
  const stmtUpdateSkillSlots = db.prepare(
    "UPDATE users SET skill_slots = ? WHERE username = ?"
  );
  const stmtSelectUsersWithRespawnBuildingId = db.prepare(
    `SELECT username, respawn_building_id
    FROM users
    WHERE respawn_building_id IS NOT NULL AND TRIM(respawn_building_id) <> ''`
  );
  const stmtUpdateRespawnBuildingId = db.prepare(
    "UPDATE users SET respawn_building_id = ? WHERE username = ?"
  );
  const stmtUpdateDollars = db.prepare(
    "UPDATE users SET dollars = ? WHERE username = ?"
  );
  const stmtUpdateHp = db.prepare("UPDATE users SET hp = ? WHERE username = ?");
  const stmtUpdateMaxHp = db.prepare(
    "UPDATE users SET max_hp = ? WHERE username = ?"
  );
  const itemUpdateStmts = new Map(
    ITEM_DEFS.map((item) => [
      item.id,
      db.prepare(`UPDATE users SET ${item.column} = ? WHERE username = ?`)
    ])
  );
  const stmtUpdateCrystalGreen = db.prepare(
    "UPDATE users SET crystal_green = ? WHERE username = ?"
  );
  const stmtUpdateCrystalBlue = db.prepare(
    "UPDATE users SET crystal_blue = ? WHERE username = ?"
  );
  const stmtUpdateCrystalWhite = db.prepare(
    "UPDATE users SET crystal_white = ? WHERE username = ?"
  );
  const stmtUpdateCrystalRed = db.prepare(
    "UPDATE users SET crystal_red = ? WHERE username = ?"
  );
  const stmtUpdateCrystalPink = db.prepare(
    "UPDATE users SET crystal_pink = ? WHERE username = ?"
  );
  const stmtUpdateCrystalCyan = db.prepare(
    "UPDATE users SET crystal_cyan = ? WHERE username = ?"
  );

  const skillUpdateStmts = new Map(
    SKILL_DEFS.map((skill) => [
      skill.id,
      {
        level: db.prepare(
          `UPDATE users SET skill_${skill.id}_level = ? WHERE username = ?`
        ),
        xp: db.prepare(
          `UPDATE users SET skill_${skill.id}_xp = ? WHERE username = ?`
        )
      }
    ])
  );
  const stmtCountBuildings = db.prepare("SELECT COUNT(*) AS count FROM buildings");
  const stmtSelectAllBuildings = db.prepare(
    `SELECT
      id,
      type,
      x,
      y,
      w,
      h,
      owner,
      hp,
      max_hp,
      inactive,
      destroy_at,
      balance,
      fee,
      entrance_json,
      center_json,
      entrances_json,
      tiles_json,
      storage_json,
      created_at
    FROM buildings
    ORDER BY created_at ASC, id ASC`
  );
  const stmtInsertOrReplaceBuilding = db.prepare(
    `INSERT INTO buildings (
      id,
      type,
      x,
      y,
      w,
      h,
      owner,
      hp,
      max_hp,
      inactive,
      destroy_at,
      balance,
      fee,
      entrance_json,
      center_json,
      entrances_json,
      tiles_json,
      storage_json,
      created_at
    ) VALUES (
      @id,
      @type,
      @x,
      @y,
      @w,
      @h,
      @owner,
      @hp,
      @maxHp,
      @inactive,
      @destroyAt,
      @balance,
      @fee,
      @entranceJson,
      @centerJson,
      @entrancesJson,
      @tilesJson,
      @storageJson,
      @createdAt
    )
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      x = excluded.x,
      y = excluded.y,
      w = excluded.w,
      h = excluded.h,
      owner = excluded.owner,
      hp = excluded.hp,
      max_hp = excluded.max_hp,
      inactive = excluded.inactive,
      destroy_at = excluded.destroy_at,
      balance = excluded.balance,
      fee = excluded.fee,
      entrance_json = excluded.entrance_json,
      center_json = excluded.center_json,
      entrances_json = excluded.entrances_json,
      tiles_json = excluded.tiles_json,
      storage_json = excluded.storage_json,
      created_at = excluded.created_at`
  );
  const stmtDeleteBuilding = db.prepare("DELETE FROM buildings WHERE id = ?");
  const stmtDeleteAllBuildings = db.prepare("DELETE FROM buildings");
  const stmtCountDropBoxes = db.prepare("SELECT COUNT(*) AS count FROM drop_boxes");
  const stmtSelectAllDropBoxes = db.prepare(
    `SELECT x, y, crystals_json, created_at
    FROM drop_boxes
    ORDER BY created_at ASC, x ASC, y ASC`
  );
  const stmtInsertOrReplaceDropBox = db.prepare(
    `INSERT INTO drop_boxes (x, y, crystals_json, created_at)
    VALUES (@x, @y, @crystalsJson, @createdAt)
    ON CONFLICT(x, y) DO UPDATE SET
      crystals_json = excluded.crystals_json,
      created_at = excluded.created_at`
  );
  const stmtDeleteDropBox = db.prepare(
    "DELETE FROM drop_boxes WHERE x = ? AND y = ?"
  );
  const stmtDeleteAllDropBoxes = db.prepare("DELETE FROM drop_boxes");

  return {
    db,
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
    buildingDb: {
      db,
      stmtCountBuildings,
      stmtSelectAllBuildings,
      stmtInsertOrReplaceBuilding,
      stmtDeleteBuilding,
      stmtDeleteAllBuildings
    },
    dropBoxDb: {
      db,
      stmtCountDropBoxes,
      stmtSelectAllDropBoxes,
      stmtInsertOrReplaceDropBox,
      stmtDeleteDropBox,
      stmtDeleteAllDropBoxes
    }
  };
}

module.exports = {
  createDb
};
