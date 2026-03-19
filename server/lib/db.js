const path = require("path");
const Database = require("better-sqlite3");
const { ITEM_DEFS, SKILL_DEFS } = require("./config");
const { migrateDb } = require("./dbMigrations");

function createDb(dataDir, options = {}) {
  const db = new Database(path.join(dataDir, "themine.db"));
  const migrationResult = migrateDb(db, options);

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
    `INSERT INTO users (${insertColumns.join(", ")}) VALUES (${insertValues.join(", ")})`
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
    migrationResult,
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
