const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const PORT = Number(process.env.PORT || 8080);
const TICK_RATE = 20;
const MOVE_TILES_PER_SEC = 10;
const STEP_DELAY_MS = 1000 / MOVE_TILES_PER_SEC;
const MINE_HITS_PER_SEC = 4;
const MINE_COOLDOWN_MS = 1000 / MINE_HITS_PER_SEC;
const CHAT_MAX_LEN = 160;
const BOMB_DELAY_MS = 5000;
const BOMB_DAMAGE = 30;
const VIEW_RADIUS_TILES = 128;
const CRYSTAL_PRICES = {
  green: 8,
  blue: 12,
  white: 20,
  red: 15,
  pink: 40,
  cyan: 60
};
const BUILDING_TYPES = {
  none: 0,
  storage: 1,
  shop: 2,
  upgrade: 3
};

const MAP_W = 1000;
const MAP_H = 1000;
const TILE_SIZE = 32;
const CHUNK_SIZE = 64;
const TILE_TYPES = {
  empty: 0,
  rock: 1,
  crystalGreen: 2,
  crystalBlue: 3,
  crystalWhite: 4,
  crystalRed: 5,
  crystalPink: 6,
  crystalCyan: 7,
  blackRock: 8,
  redRock: 9
};

const ITEM_DEFS = [
  { id: "medkit", name: "Medkit", column: "item_medkit" },
  { id: "bomb", name: "Bomb", column: "item_bomb" },
  { id: "plasmabomb", name: "Plasmabomb", column: "item_plasmabomb" },
  { id: "electrobomb", name: "Electrobomb", column: "item_electrobomb" },
  { id: "storage", name: "Склад", column: "item_storage" },
  { id: "shop", name: "Магазин", column: "item_shop" },
  { id: "respawn", name: "Респавн", column: "item_respawn" },
  { id: "upgrade", name: "Ап", column: "item_upgrade" },
  { id: "turret", name: "Пушка", column: "item_turret" },
  { id: "clan_hall", name: "Клановое здание", column: "item_clan_hall" }
];

const BOMB_TYPES = {
  bomb: { radius: 4, shape: "circle", breaksRedRock: false },
  plasmabomb: { radius: 1, shape: "cross", breaksRedRock: true }
};

const BOMB_ITEMS = new Set(Object.keys(BOMB_TYPES));
const BUILDING_ITEMS = new Set(["storage", "shop", "upgrade"]);

const TILE_HP = new Map([
  [TILE_TYPES.rock, 3],
  [TILE_TYPES.crystalGreen, 6],
  [TILE_TYPES.crystalBlue, 6],
  [TILE_TYPES.crystalWhite, 10],
  [TILE_TYPES.crystalRed, 10],
  [TILE_TYPES.crystalPink, 10],
  [TILE_TYPES.crystalCyan, 6]
]);

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const MAP_MAGIC = "TMAP";
const MAP_VERSION = 1;
const MAP_FILE = path.join(dataDir, "map.bin");
const BUILDINGS_FILE = path.join(dataDir, "buildings.bin");
const BUILDINGS_META_FILE = path.join(dataDir, "buildings.json");

function layerIndex(x, y) {
  return y * MAP_W + x;
}

function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadLayer(filePath, expectedW, expectedH) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 12) return null;
    const magic = buf.subarray(0, 4).toString("ascii");
    if (magic !== MAP_MAGIC) return null;
    const version = buf.readUInt16LE(4);
    const w = buf.readUInt16LE(6);
    const h = buf.readUInt16LE(8);
    if (version !== MAP_VERSION || w !== expectedW || h !== expectedH) {
      return null;
    }
    const data = buf.subarray(12);
    if (data.length !== w * h) return null;
    return new Uint8Array(data);
  } catch {
    return null;
  }
}

function saveLayer(filePath, layer, w, h) {
  const header = Buffer.alloc(12);
  header.write(MAP_MAGIC, 0, "ascii");
  header.writeUInt16LE(MAP_VERSION, 4);
  header.writeUInt16LE(w, 6);
  header.writeUInt16LE(h, 8);
  header.writeUInt16LE(0, 10);
  const body = Buffer.from(layer.buffer, layer.byteOffset, layer.byteLength);
  fs.writeFileSync(filePath, Buffer.concat([header, body]));
}

function loadBuildingsMeta() {
  if (!fs.existsSync(BUILDINGS_META_FILE)) return [];
  try {
    const raw = fs.readFileSync(BUILDINGS_META_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBuildingsMeta(list) {
  fs.writeFileSync(BUILDINGS_META_FILE, JSON.stringify(list));
}

function getTile(x, y) {
  return mapTiles[layerIndex(x, y)];
}

function setTile(x, y, type) {
  mapTiles[layerIndex(x, y)] = type;
  mapDirty = true;
}

function getBuilding(x, y) {
  return buildingTiles[layerIndex(x, y)];
}

function setBuilding(x, y, type) {
  buildingTiles[layerIndex(x, y)] = type;
  buildingDirty = true;
}

function fillRect(layerSetter, x0, y0, w, h, type) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
      layerSetter(x, y, type);
    }
  }
}

function generateInitialMap() {
  fillRect(setTile, 8, 8, 10, 6, TILE_TYPES.rock);
  fillRect(setTile, 28, 16, 8, 10, TILE_TYPES.rock);
  fillRect(setTile, 14, 30, 12, 5, TILE_TYPES.rock);
  fillRect(setTile, 4, 4, 1, 1, TILE_TYPES.crystalGreen);
  fillRect(setTile, 5, 4, 1, 1, TILE_TYPES.crystalBlue);
  fillRect(setTile, 6, 4, 1, 1, TILE_TYPES.crystalWhite);
  fillRect(setTile, 7, 4, 1, 1, TILE_TYPES.crystalRed);
  fillRect(setTile, 8, 4, 1, 1, TILE_TYPES.crystalPink);
  fillRect(setTile, 9, 4, 1, 1, TILE_TYPES.crystalCyan);
  fillRect(setTile, 10, 4, 1, 1, TILE_TYPES.blackRock);
  fillRect(setTile, 11, 4, 1, 1, TILE_TYPES.redRock);
}

let mapTiles = loadLayer(MAP_FILE, MAP_W, MAP_H);
let buildingTiles = loadLayer(BUILDINGS_FILE, MAP_W, MAP_H);
let mapDirty = false;
let buildingDirty = false;

if (!mapTiles) {
  mapTiles = new Uint8Array(MAP_W * MAP_H);
  generateInitialMap();
  mapDirty = true;
}
if (!buildingTiles) {
  buildingTiles = new Uint8Array(MAP_W * MAP_H);
  buildingDirty = true;
}

const tileHp = new Map();
for (let y = 0; y < MAP_H; y += 1) {
  for (let x = 0; x < MAP_W; x += 1) {
    const type = getTile(x, y);
    const hp = TILE_HP.get(type);
    if (hp) {
      tileHp.set(`${x},${y}`, hp);
    }
  }
}

function isWalkable(x, y) {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
  if (getTile(x, y) !== TILE_TYPES.empty) return false;
  return getBuilding(x, y) === BUILDING_TYPES.none;
}

function damageTile(x, y, byId, onCrystalHit) {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H)
    return { hit: false, broken: false, type: TILE_TYPES.empty };
  const type = getTile(x, y);
  const hpMax = TILE_HP.get(type);
  if (!hpMax) {
    return { hit: false, broken: false, type };
  }
  const key = `${x},${y}`;
  const current = tileHp.get(key) ?? hpMax;
  const next = current - 1;
  let amount = 0;
  if (type !== TILE_TYPES.rock && typeof onCrystalHit === "function") {
    amount = Number(onCrystalHit(type) || 0);
  }
  broadcast({ t: "hit", x, y, by: byId, type, amount });
  if (next <= 0) {
    setTile(x, y, TILE_TYPES.empty);
    tileHp.delete(key);
    broadcast({ t: "tile", x, y, value: TILE_TYPES.empty });
    return { hit: true, broken: true, type, amount };
  }
  tileHp.set(key, next);
  return { hit: true, broken: false, type, amount };
}

function isBombBreakable(type, breaksRedRock) {
  return (
    type === TILE_TYPES.rock ||
    type === TILE_TYPES.blackRock ||
    type === TILE_TYPES.crystalGreen ||
    type === TILE_TYPES.crystalBlue ||
    type === TILE_TYPES.crystalWhite ||
    type === TILE_TYPES.crystalRed ||
    type === TILE_TYPES.crystalPink ||
    type === TILE_TYPES.crystalCyan ||
    (breaksRedRock && type === TILE_TYPES.redRock)
  );
}

function explodeBomb(bombId) {
  const bomb = bombs.get(bombId);
  if (!bomb) return;
  bombs.delete(bombId);
  bombByTile.delete(`${bomb.x},${bomb.y}`);

  const config = BOMB_TYPES[bomb.type] || BOMB_TYPES.bomb;
  const radius = config.radius;
  const shape = config.shape;

  broadcast({
    t: "bomb_explode",
    id: bomb.id,
    x: bomb.x,
    y: bomb.y,
    r: radius,
    shape,
    type: bomb.type
  });

  const isInBlast = (tx, ty) => {
    const dx = tx - bomb.x;
    const dy = ty - bomb.y;
    if (shape === "cross") {
      return (
        (dx === 0 && Math.abs(dy) <= radius) ||
        (dy === 0 && Math.abs(dx) <= radius)
      );
    }
    return dx * dx + dy * dy <= radius * radius;
  };

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const tx = bomb.x + dx;
      const ty = bomb.y + dy;
      if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) continue;
      if (!isInBlast(tx, ty)) continue;
      const type = getTile(tx, ty);
      if (!isBombBreakable(type, config.breaksRedRock)) continue;
      setTile(tx, ty, TILE_TYPES.empty);
      tileHp.delete(`${tx},${ty}`);
      broadcast({ t: "tile", x: tx, y: ty, value: TILE_TYPES.empty });
    }
  }

  for (const player of players.values()) {
    if (isInBlast(player.tx, player.ty)) {
      applyDamageToPlayer(player, BOMB_DAMAGE);
    }
  }
}

const db = new Database(path.join(dataDir, "themine.db"));
db.exec(
  "CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_tx INTEGER, last_ty INTEGER, explored_chunks TEXT, dollars INTEGER NOT NULL DEFAULT 0, coins INTEGER NOT NULL DEFAULT 0, hp INTEGER NOT NULL DEFAULT 100, max_hp INTEGER NOT NULL DEFAULT 100, crystal_green INTEGER NOT NULL DEFAULT 0, crystal_blue INTEGER NOT NULL DEFAULT 0, crystal_white INTEGER NOT NULL DEFAULT 0, crystal_red INTEGER NOT NULL DEFAULT 0, crystal_pink INTEGER NOT NULL DEFAULT 0, crystal_cyan INTEGER NOT NULL DEFAULT 0, item_medkit INTEGER NOT NULL DEFAULT 0, item_bomb INTEGER NOT NULL DEFAULT 0, item_plasmabomb INTEGER NOT NULL DEFAULT 0, item_electrobomb INTEGER NOT NULL DEFAULT 0, item_storage INTEGER NOT NULL DEFAULT 0, item_shop INTEGER NOT NULL DEFAULT 0, item_respawn INTEGER NOT NULL DEFAULT 0, item_upgrade INTEGER NOT NULL DEFAULT 0, item_turret INTEGER NOT NULL DEFAULT 0, item_clan_hall INTEGER NOT NULL DEFAULT 0)"
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
  db.exec("ALTER TABLE users ADD COLUMN crystal_blue INTEGER NOT NULL DEFAULT 0");
}
if (!userColumns.has("crystal_white")) {
  db.exec(
    "ALTER TABLE users ADD COLUMN crystal_white INTEGER NOT NULL DEFAULT 0"
  );
}
if (!userColumns.has("crystal_red")) {
  db.exec("ALTER TABLE users ADD COLUMN crystal_red INTEGER NOT NULL DEFAULT 0");
}
if (!userColumns.has("crystal_pink")) {
  db.exec("ALTER TABLE users ADD COLUMN crystal_pink INTEGER NOT NULL DEFAULT 0");
}
if (!userColumns.has("crystal_cyan")) {
  db.exec("ALTER TABLE users ADD COLUMN crystal_cyan INTEGER NOT NULL DEFAULT 0");
}
for (const item of ITEM_DEFS) {
  if (!userColumns.has(item.column)) {
    db.exec(
      `ALTER TABLE users ADD COLUMN ${item.column} INTEGER NOT NULL DEFAULT 0`
    );
  }
}
const stmtInsertUser = db.prepare(
  "INSERT INTO users (username, password_hash, created_at, last_tx, last_ty, explored_chunks, dollars, coins, hp, max_hp, crystal_green, crystal_blue, crystal_white, crystal_red, crystal_pink, crystal_cyan) VALUES (?, ?, ?, NULL, NULL, NULL, 0, 0, 100, 100, 0, 0, 0, 0, 0, 0)"
);
const stmtGetUser = db.prepare(
  "SELECT username, password_hash, last_tx, last_ty, explored_chunks, dollars, coins, hp, max_hp, crystal_green, crystal_blue, crystal_white, crystal_red, crystal_pink, crystal_cyan, item_medkit, item_bomb, item_plasmabomb, item_electrobomb, item_storage, item_shop, item_respawn, item_upgrade, item_turret, item_clan_hall FROM users WHERE username = ?"
);
const stmtUpdateUserPos = db.prepare(
  "UPDATE users SET last_tx = ?, last_ty = ? WHERE username = ?"
);
const stmtUpdateExplored = db.prepare(
  "UPDATE users SET explored_chunks = ? WHERE username = ?"
);
const stmtUpdateDollars = db.prepare(
  "UPDATE users SET dollars = ? WHERE username = ?"
);
const stmtUpdateHp = db.prepare(
  "UPDATE users SET hp = ? WHERE username = ?"
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

const sessions = new Map();

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || (url.pathname !== "/login" && url.pathname !== "/register")) {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    let payload;
    try {
      payload = JSON.parse(body || "{}");
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "invalid_json" }));
      return;
    }

    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");

    if (username.length < 3 || username.length > 20) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "bad_username" }));
      return;
    }
    if (password.length < 4 || password.length > 64) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "bad_password" }));
      return;
    }

    const hash = crypto
      .createHash("sha256")
      .update(`${username}:${password}`)
      .digest("hex");

    if (url.pathname === "/register") {
      try {
        stmtInsertUser.run(username, hash, Date.now());
      } catch (err) {
        if (String(err?.code || "").includes("SQLITE_CONSTRAINT")) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "user_exists" }));
          return;
        }
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "db_error" }));
        return;
      }
    } else {
      const existing = stmtGetUser.get(username);
      if (!existing || existing.password_hash !== hash) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid_credentials" }));
        return;
      }
    }

    const token = crypto.randomUUID();
    sessions.set(token, { username, createdAt: Date.now() });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, token, username }));
  });
});
const wss = new WebSocket.Server({ server });

const players = new Map();
const bombs = new Map();
const bombByTile = new Map();
let bombSeq = 1;
const buildings = loadBuildingsMeta();
let buildingSeq = 1;
for (const building of buildings) {
  const match = String(building?.id || "").match(/\d+/);
  if (match) {
    const num = Number(match[0]);
    if (Number.isFinite(num)) {
      buildingSeq = Math.max(buildingSeq, num + 1);
    }
  }
}
let buildingsMetaDirty = false;
for (const building of buildings) {
  if (building.type === "storage" && !building.storage) {
    building.storage = {
      green: 0,
      blue: 0,
      white: 0,
      red: 0,
      pink: 0,
      cyan: 0
    };
    buildingsMetaDirty = true;
  }
  if (!building.owner) {
    building.owner = "Admin";
    buildingsMetaDirty = true;
  }
}

function randomSpawn() {
  for (let i = 0; i < 200; i += 1) {
    const tx = Math.floor(Math.random() * MAP_W);
    const ty = Math.floor(Math.random() * MAP_H);
    if (isWalkable(tx, ty)) {
      return { tx, ty };
    }
  }
  return { tx: 0, ty: 0 };
}

function validSavedSpawn(tx, ty) {
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) return false;
  return isWalkable(tx, ty);
}

function normalizeDir(dir) {
  let x = Number(dir?.x || 0);
  let y = Number(dir?.y || 0);
  if (!Number.isFinite(x)) x = 0;
  if (!Number.isFinite(y)) y = 0;
  x = Math.sign(x);
  y = Math.sign(y);
  if (x !== 0 && y !== 0) {
    y = 0;
  }
  return { x, y };
}

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function encodeChunk(layer, cx, cy) {
  const startX = cx * CHUNK_SIZE;
  const startY = cy * CHUNK_SIZE;
  if (startX >= MAP_W || startY >= MAP_H || startX < 0 || startY < 0) {
    return null;
  }
  const w = Math.min(CHUNK_SIZE, MAP_W - startX);
  const h = Math.min(CHUNK_SIZE, MAP_H - startY);
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const srcStart = (startY + y) * MAP_W + startX;
    data.set(layer.subarray(srcStart, srcStart + w), y * w);
  }
  return { w, h, data };
}

function encodeBuildingChunk(cx, cy) {
  return encodeChunk(buildingTiles, cx, cy);
}

function sendMapChunk(ws, cx, cy) {
  const chunk = encodeChunk(mapTiles, cx, cy);
  const buildingChunk = encodeBuildingChunk(cx, cy);
  if (!chunk || !buildingChunk) return;
  ws.send(
    JSON.stringify({
      t: "map_chunk",
      cx,
      cy,
      w: chunk.w,
      h: chunk.h,
      tiles: Buffer.from(chunk.data).toString("base64"),
      buildings: Buffer.from(buildingChunk.data).toString("base64")
    })
  );
}

function sendToPlayer(player, payload) {
  if (!player?.ws || player.ws.readyState !== WebSocket.OPEN) return;
  player.ws.send(JSON.stringify(payload));
}

function applyDamageToPlayer(player, amount) {
  if (!amount || amount <= 0) return;
  player.hp = Math.max(0, player.hp - amount);
  stmtUpdateHp.run(player.hp, player.username);
  sendToPlayer(player, {
    t: "hp",
    current: player.hp,
    max: player.maxHp
  });
}

function applyHealToPlayer(player, amount) {
  if (!amount || amount <= 0) return;
  const next = Math.min(player.maxHp, player.hp + amount);
  if (next === player.hp) return;
  player.hp = next;
  stmtUpdateHp.run(player.hp, player.username);
  sendToPlayer(player, {
    t: "hp",
    current: player.hp,
    max: player.maxHp
  });
}

function awardCrystal(player, type) {
  switch (type) {
    case TILE_TYPES.crystalGreen:
      player.inventory.green += 1;
      stmtUpdateCrystalGreen.run(player.inventory.green, player.username);
      sendToPlayer(player, { t: "inventory", inventory: player.inventory });
      return 1;
    case TILE_TYPES.crystalBlue:
      player.inventory.blue += 1;
      stmtUpdateCrystalBlue.run(player.inventory.blue, player.username);
      sendToPlayer(player, { t: "inventory", inventory: player.inventory });
      return 1;
    case TILE_TYPES.crystalWhite:
      player.inventory.white += 1;
      stmtUpdateCrystalWhite.run(player.inventory.white, player.username);
      sendToPlayer(player, { t: "inventory", inventory: player.inventory });
      return 1;
    case TILE_TYPES.crystalRed:
      player.inventory.red += 1;
      stmtUpdateCrystalRed.run(player.inventory.red, player.username);
      sendToPlayer(player, { t: "inventory", inventory: player.inventory });
      return 1;
    case TILE_TYPES.crystalPink:
      player.inventory.pink += 1;
      stmtUpdateCrystalPink.run(player.inventory.pink, player.username);
      sendToPlayer(player, { t: "inventory", inventory: player.inventory });
      return 1;
    case TILE_TYPES.crystalCyan:
      player.inventory.cyan += 1;
      stmtUpdateCrystalCyan.run(player.inventory.cyan, player.username);
      sendToPlayer(player, { t: "inventory", inventory: player.inventory });
      return 1;
    default:
      return 0;
  }
}

function setCrystalCount(player, color, count) {
  const safeCount = Math.max(0, Math.floor(count || 0));
  player.inventory[color] = safeCount;
  if (color === "green") {
    stmtUpdateCrystalGreen.run(safeCount, player.username);
  } else if (color === "blue") {
    stmtUpdateCrystalBlue.run(safeCount, player.username);
  } else if (color === "white") {
    stmtUpdateCrystalWhite.run(safeCount, player.username);
  } else if (color === "red") {
    stmtUpdateCrystalRed.run(safeCount, player.username);
  } else if (color === "pink") {
    stmtUpdateCrystalPink.run(safeCount, player.username);
  } else if (color === "cyan") {
    stmtUpdateCrystalCyan.run(safeCount, player.username);
  }
}

function parseExplored(raw) {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const set = new Set();
    for (const entry of parsed) {
      if (Array.isArray(entry) && entry.length >= 2) {
        const cx = Number(entry[0]);
        const cy = Number(entry[1]);
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
          set.add(chunkKey(cx, cy));
        }
      } else if (typeof entry === "string") {
        const parts = entry.split(",");
        const cx = Number(parts[0]);
        const cy = Number(parts[1]);
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
          set.add(chunkKey(cx, cy));
        }
      }
    }
    return set;
  } catch {
    return new Set();
  }
}

function encodeExplored(set) {
  const list = [];
  for (const key of set) {
    const parts = key.split(",");
    const cx = Number(parts[0]);
    const cy = Number(parts[1]);
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
      list.push([cx, cy]);
    }
  }
  return JSON.stringify(list);
}

function chunkIntersectsView(player, cx, cy) {
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;
  const x1 = Math.min(x0 + CHUNK_SIZE - 1, MAP_W - 1);
  const y1 = Math.min(y0 + CHUNK_SIZE - 1, MAP_H - 1);
  const nx = clamp(player.tx, x0, x1);
  const ny = clamp(player.ty, y0, y1);
  const dx = player.tx - nx;
  const dy = player.ty - ny;
  return dx * dx + dy * dy <= VIEW_RADIUS_TILES * VIEW_RADIUS_TILES;
}

function exploredPayload(set) {
  const list = [];
  for (const key of set) {
    const parts = key.split(",");
    const cx = Number(parts[0]);
    const cy = Number(parts[1]);
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
      list.push({ cx, cy });
    }
  }
  return list;
}

function updateExplored(player) {
  const maxCx = Math.ceil(MAP_W / CHUNK_SIZE) - 1;
  const maxCy = Math.ceil(MAP_H / CHUNK_SIZE) - 1;
  const minX = Math.max(0, player.tx - VIEW_RADIUS_TILES);
  const maxX = Math.min(MAP_W - 1, player.tx + VIEW_RADIUS_TILES);
  const minY = Math.max(0, player.ty - VIEW_RADIUS_TILES);
  const maxY = Math.min(MAP_H - 1, player.ty + VIEW_RADIUS_TILES);
  const minCx = Math.floor(minX / CHUNK_SIZE);
  const maxCxView = Math.floor(maxX / CHUNK_SIZE);
  const minCy = Math.floor(minY / CHUNK_SIZE);
  const maxCyView = Math.floor(maxY / CHUNK_SIZE);
  const prev = player.exploreBounds;
  if (
    prev &&
    prev.minCx === minCx &&
    prev.maxCx === maxCxView &&
    prev.minCy === minCy &&
    prev.maxCy === maxCyView
  ) {
    return;
  }
  player.exploreBounds = {
    minCx,
    maxCx: maxCxView,
    minCy,
    maxCy: maxCyView
  };
  let changed = false;
  for (let ny = minCy; ny <= maxCyView; ny += 1) {
    if (ny < 0 || ny > maxCy) continue;
    for (let nx = minCx; nx <= maxCxView; nx += 1) {
      if (nx < 0 || nx > maxCx) continue;
      if (!chunkIntersectsView(player, nx, ny)) continue;
      const key = chunkKey(nx, ny);
      if (!player.exploredChunks.has(key)) {
        player.exploredChunks.add(key);
        changed = true;
      }
    }
  }
  if (changed) {
    player.exploredDirty = true;
  }
}

function buildItemsPayload(items) {
  return ITEM_DEFS.map((item) => ({
    id: item.id,
    name: item.name,
    count: items[item.id] ?? 0
  }));
}

function setItemCount(player, itemId, count) {
  const stmt = itemUpdateStmts.get(itemId);
  if (!stmt) return;
  const safeCount = Math.max(0, Math.floor(count || 0));
  player.items[itemId] = safeCount;
  stmt.run(safeCount, player.username);
}

function grantAdminItems(player) {
  if (player.username !== "Admin") return;
  for (const item of ITEM_DEFS) {
    setItemCount(player, item.id, 5);
  }
}

function placeBomb(player, x, y, type) {
  if (!BOMB_TYPES[type]) return false;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
  if (getTile(x, y) !== TILE_TYPES.empty) return false;
  if (getBuilding(x, y) !== BUILDING_TYPES.none) return false;
  if (bombByTile.has(`${x},${y}`)) return false;
  if ((player.items[type] ?? 0) <= 0) return false;

  setItemCount(player, type, (player.items[type] ?? 0) - 1);
  sendToPlayer(player, { t: "items", items: buildItemsPayload(player.items) });

  const id = `b${bombSeq++}`;
  const bomb = { id, x, y, ownerId: player.id, type };
  bombs.set(id, bomb);
  bombByTile.set(`${x},${y}`, id);
  broadcast({ t: "bomb_placed", id, x, y, by: player.id, type });
  setTimeout(() => explodeBomb(id), BOMB_DELAY_MS);
  return true;
}

function canPlaceStorage(entranceX, entranceY, player) {
  const width = 3;
  const height = 2;
  const topLeftX = entranceX - 1;
  const topLeftY = entranceY - 1;
  if (
    topLeftX < 0 ||
    topLeftY < 0 ||
    topLeftX + width > MAP_W ||
    topLeftY + height > MAP_H
  ) {
    return false;
  }
  const occupied = new Set();
  for (const p of players.values()) {
    if (player && p.id === player.id) continue;
    occupied.add(`${p.tx},${p.ty}`);
  }
  const checkX0 = topLeftX - 1;
  const checkY0 = topLeftY - 1;
  const checkX1 = topLeftX + width;
  const checkY1 = topLeftY + height;
  if (
    checkX0 < 0 ||
    checkY0 < 0 ||
    checkX1 >= MAP_W ||
    checkY1 >= MAP_H
  ) {
    return false;
  }
  for (let y = checkY0; y <= checkY1; y += 1) {
    for (let x = checkX0; x <= checkX1; x += 1) {
      if (getTile(x, y) !== TILE_TYPES.empty) return false;
      if (getBuilding(x, y) !== BUILDING_TYPES.none) return false;
      if (bombByTile.has(`${x},${y}`)) return false;
      if (occupied.has(`${x},${y}`)) return false;
    }
  }
  return true;
}

function placeStorage(player, entranceX, entranceY) {
  if (!Number.isInteger(entranceX) || !Number.isInteger(entranceY)) return false;
  if (player.facingX !== 0 || player.facingY !== -1) return false;
  if (!canPlaceStorage(entranceX, entranceY, player)) return false;
  if ((player.items.storage ?? 0) <= 0) return false;

  setItemCount(player, "storage", (player.items.storage ?? 0) - 1);
  sendToPlayer(player, { t: "items", items: buildItemsPayload(player.items) });

  const width = 3;
  const height = 2;
  const topLeftX = entranceX - 1;
  const topLeftY = entranceY - 1;
  const tiles = [];
  for (let y = topLeftY; y < topLeftY + height; y += 1) {
    for (let x = topLeftX; x < topLeftX + width; x += 1) {
      if (x === entranceX && y === entranceY) continue;
      setBuilding(x, y, BUILDING_TYPES.storage);
      tiles.push({ x, y, value: BUILDING_TYPES.storage });
    }
  }

  const building = {
    id: `s${buildingSeq++}`,
    type: "storage",
    x: topLeftX,
    y: topLeftY,
    w: width,
    h: height,
    entrance: { x: entranceX, y: entranceY },
    owner: player.username,
    storage: {
      green: 0,
      blue: 0,
      white: 0,
      red: 0,
      pink: 0,
      cyan: 0
    }
  };
  buildings.push(building);
  buildingsMetaDirty = true;
  broadcast({ t: "building_place", building, tiles });
  return true;
}

function canPlaceShop(centerX, centerY, player) {
  const radius = 2;
  const topLeftX = centerX - radius;
  const topLeftY = centerY - radius;
  const size = radius * 2 + 1;
  if (
    topLeftX < 0 ||
    topLeftY < 0 ||
    topLeftX + size > MAP_W ||
    topLeftY + size > MAP_H
  ) {
    return false;
  }
  const occupied = new Set();
  for (const p of players.values()) {
    if (player && p.id === player.id) continue;
    occupied.add(`${p.tx},${p.ty}`);
  }
  const checkX0 = topLeftX - 1;
  const checkY0 = topLeftY - 1;
  const checkX1 = topLeftX + size;
  const checkY1 = topLeftY + size;
  if (
    checkX0 < 0 ||
    checkY0 < 0 ||
    checkX1 >= MAP_W ||
    checkY1 >= MAP_H
  ) {
    return false;
  }
  for (let y = checkY0; y <= checkY1; y += 1) {
    for (let x = checkX0; x <= checkX1; x += 1) {
      if (getTile(x, y) !== TILE_TYPES.empty) return false;
      if (getBuilding(x, y) !== BUILDING_TYPES.none) return false;
      if (bombByTile.has(`${x},${y}`)) return false;
      if (occupied.has(`${x},${y}`)) return false;
    }
  }
  return true;
}

function placeShop(player, centerX, centerY) {
  if (!Number.isInteger(centerX) || !Number.isInteger(centerY)) return false;
  if (player.facingX !== 0 || player.facingY !== -1) return false;
  if (!canPlaceShop(centerX, centerY, player)) return false;
  if ((player.items.shop ?? 0) <= 0) return false;

  setItemCount(player, "shop", (player.items.shop ?? 0) - 1);
  sendToPlayer(player, { t: "items", items: buildItemsPayload(player.items) });

  const radius = 2;
  const topLeftX = centerX - radius;
  const topLeftY = centerY - radius;
  const tiles = [];
  for (let y = topLeftY; y <= centerY + radius; y += 1) {
    for (let x = topLeftX; x <= centerX + radius; x += 1) {
      const onCross =
        (x === centerX && Math.abs(y - centerY) <= radius) ||
        (y === centerY && Math.abs(x - centerX) <= radius);
      const isCorner =
        (x === topLeftX && y === topLeftY) ||
        (x === topLeftX && y === centerY + radius) ||
        (x === centerX + radius && y === topLeftY) ||
        (x === centerX + radius && y === centerY + radius);
      if (onCross || isCorner) continue;
      setBuilding(x, y, BUILDING_TYPES.shop);
      tiles.push({ x, y, value: BUILDING_TYPES.shop });
    }
  }

  const entrances = [
    { x: centerX, y: centerY - radius },
    { x: centerX, y: centerY + radius },
    { x: centerX - radius, y: centerY },
    { x: centerX + radius, y: centerY }
  ];

  const building = {
    id: `m${buildingSeq++}`,
    type: "shop",
    x: topLeftX,
    y: topLeftY,
    w: radius * 2 + 1,
    h: radius * 2 + 1,
    center: { x: centerX, y: centerY },
    entrances,
    owner: player.username
  };
  buildings.push(building);
  buildingsMetaDirty = true;
  broadcast({ t: "building_place", building, tiles });
  return true;
}

function canPlaceUpgrade(entranceX, entranceY, player) {
  const width = 3;
  const height = 3;
  const topLeftX = entranceX - 1;
  const topLeftY = entranceY - 2;
  if (
    topLeftX < 0 ||
    topLeftY < 0 ||
    topLeftX + width > MAP_W ||
    topLeftY + height > MAP_H
  ) {
    return false;
  }
  const occupied = new Set();
  for (const p of players.values()) {
    if (player && p.id === player.id) continue;
    occupied.add(`${p.tx},${p.ty}`);
  }
  const checkX0 = topLeftX - 1;
  const checkY0 = topLeftY - 1;
  const checkX1 = topLeftX + width;
  const checkY1 = topLeftY + height;
  if (
    checkX0 < 0 ||
    checkY0 < 0 ||
    checkX1 >= MAP_W ||
    checkY1 >= MAP_H
  ) {
    return false;
  }
  for (let y = checkY0; y <= checkY1; y += 1) {
    for (let x = checkX0; x <= checkX1; x += 1) {
      if (getTile(x, y) !== TILE_TYPES.empty) return false;
      if (getBuilding(x, y) !== BUILDING_TYPES.none) return false;
      if (bombByTile.has(`${x},${y}`)) return false;
      if (occupied.has(`${x},${y}`)) return false;
    }
  }
  return true;
}

function placeUpgrade(player, entranceX, entranceY) {
  if (!Number.isInteger(entranceX) || !Number.isInteger(entranceY)) return false;
  if (player.facingX !== 0 || player.facingY !== -1) return false;
  if (!canPlaceUpgrade(entranceX, entranceY, player)) return false;
  if ((player.items.upgrade ?? 0) <= 0) return false;

  setItemCount(player, "upgrade", (player.items.upgrade ?? 0) - 1);
  sendToPlayer(player, { t: "items", items: buildItemsPayload(player.items) });

  const width = 3;
  const height = 3;
  const topLeftX = entranceX - 1;
  const topLeftY = entranceY - 2;
  const centerX = entranceX;
  const centerY = entranceY - 1;
  const tiles = [];
  for (let y = topLeftY; y < topLeftY + height; y += 1) {
    for (let x = topLeftX; x < topLeftX + width; x += 1) {
      if (x === entranceX && y === entranceY) continue;
      if (x === centerX && y === centerY) continue;
      setBuilding(x, y, BUILDING_TYPES.upgrade);
      tiles.push({ x, y, value: BUILDING_TYPES.upgrade });
    }
  }

  const building = {
    id: `u${buildingSeq++}`,
    type: "upgrade",
    x: topLeftX,
    y: topLeftY,
    w: width,
    h: height,
    entrance: { x: entranceX, y: entranceY },
    center: { x: centerX, y: centerY },
    owner: player.username
  };
  buildings.push(building);
  buildingsMetaDirty = true;
  broadcast({ t: "building_place", building, tiles });
  return true;
}

function isPlayerInShopCenter(player) {
  if (!player) return false;
  for (const building of buildings) {
    if (building.type !== "shop") continue;
    if (building.center?.x === player.tx && building.center?.y === player.ty) {
      return true;
    }
  }
  return false;
}

function storageAtPlayer(player) {
  if (!player) return null;
  for (const building of buildings) {
    if (building.type !== "storage") continue;
    if (
      building.entrance?.x === player.tx &&
      building.entrance?.y === player.ty
    ) {
      if (building.owner && building.owner !== player.username) {
        return null;
      }
      if (!building.storage) {
        building.storage = {
          green: 0,
          blue: 0,
          white: 0,
          red: 0,
          pink: 0,
          cyan: 0
        };
        buildingsMetaDirty = true;
      }
      return building;
    }
  }
  return null;
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "/", "http://localhost");
  const token = url.searchParams.get("token");
  const session = token ? sessions.get(token) : null;
  if (!session) {
    ws.close(4001, "unauthorized");
    return;
  }

  const id = crypto.randomUUID();
  const saved = stmtGetUser.get(session.username);
  const spawn = validSavedSpawn(saved?.last_tx, saved?.last_ty)
    ? { tx: saved.last_tx, ty: saved.last_ty }
    : randomSpawn();
  const player = {
    id,
    username: session.username,
    ws,
    tx: spawn.tx,
    ty: spawn.ty,
    inputDirX: 0,
    inputDirY: 0,
    inputCtrl: false,
    inputMine: false,
    facingX: 0,
    facingY: 1,
    moveCooldownMs: 0,
    mineCooldownMs: 0,
    dollars: saved?.dollars ?? 0,
    coins: saved?.coins ?? 0,
    hp: saved?.hp ?? 100,
    maxHp: saved?.max_hp ?? 100,
    inventory: {
      green: saved?.crystal_green ?? 0,
      blue: saved?.crystal_blue ?? 0,
      white: saved?.crystal_white ?? 0,
      red: saved?.crystal_red ?? 0,
      pink: saved?.crystal_pink ?? 0,
      cyan: saved?.crystal_cyan ?? 0
    },
    exploredChunks: parseExplored(saved?.explored_chunks),
    exploredDirty: false,
    exploreBounds: null,
    items: {
      medkit: saved?.item_medkit ?? 0,
      bomb: saved?.item_bomb ?? 0,
      plasmabomb: saved?.item_plasmabomb ?? 0,
      electrobomb: saved?.item_electrobomb ?? 0,
      storage: saved?.item_storage ?? 0,
      shop: saved?.item_shop ?? 0,
      respawn: saved?.item_respawn ?? 0,
      upgrade: saved?.item_upgrade ?? 0,
      turret: saved?.item_turret ?? 0,
      clan_hall: saved?.item_clan_hall ?? 0
    }
  };
  updateExplored(player);
  grantAdminItems(player);
  players.set(id, player);
  ws.playerId = id;

  ws.send(
    JSON.stringify({
      t: "welcome",
      id,
      username: session.username,
      time: Date.now(),
      map: {
        w: MAP_W,
        h: MAP_H,
        tile: TILE_SIZE,
        chunk: CHUNK_SIZE
      },
      wallet: { dollars: player.dollars, coins: player.coins },
      hp: { current: player.hp, max: player.maxHp },
      inventory: { ...player.inventory },
      items: buildItemsPayload(player.items),
      buildings,
      explored: exploredPayload(player.exploredChunks)
    })
  );

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.t === "input") {
      const dir = normalizeDir(msg.dir);
      player.inputCtrl = Boolean(msg.ctrl);
      player.inputMine = Boolean(msg.mine);
      player.inputDirX = dir.x;
      player.inputDirY = dir.y;
    }

    if (msg.t === "map_chunk_req") {
      const chunks = Array.isArray(msg.chunks) ? msg.chunks : [];
      for (const entry of chunks) {
        const cx = Math.floor(Number(entry?.cx));
        const cy = Math.floor(Number(entry?.cy));
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
        const maxCx = Math.ceil(MAP_W / CHUNK_SIZE) - 1;
        const maxCy = Math.ceil(MAP_H / CHUNK_SIZE) - 1;
        if (cx < 0 || cy < 0 || cx > maxCx || cy > maxCy) continue;
        const key = chunkKey(cx, cy);
        if (!player.exploredChunks.has(key)) continue;
        if (!chunkIntersectsView(player, cx, cy)) continue;
        sendMapChunk(ws, cx, cy);
      }
    }

    if (msg.t === "chat") {
      const text = String(msg.msg || "").trim();
      if (!text) return;
      const safe = text.length > CHAT_MAX_LEN ? text.slice(0, CHAT_MAX_LEN) : text;
      broadcast({
        t: "chat",
        from: player.username,
        msg: safe,
        time: Date.now()
      });
    }

    if (msg.t === "use_item") {
      const id = String(msg.id || "");
      if (BOMB_ITEMS.has(id)) return;
      if (BUILDING_ITEMS.has(id)) return;
      if (!itemUpdateStmts.has(id)) return;
      const current = player.items[id] ?? 0;
      if (current <= 0) return;
      setItemCount(player, id, current - 1);
      sendToPlayer(player, { t: "items", items: buildItemsPayload(player.items) });
      if (id === "medkit") {
        applyHealToPlayer(player, 250);
      }
    }

    if (msg.t === "place_bomb") {
      const x = Number(msg.x);
      const y = Number(msg.y);
      const type = String(msg.id || "bomb");
      placeBomb(player, x, y, type);
    }

    if (msg.t === "place_building") {
      const type = String(msg.type || "");
      const entranceX = Number(msg.x);
      const entranceY = Number(msg.y);
      if (type === "storage") {
        placeStorage(player, entranceX, entranceY);
        return;
      }
      if (type === "shop") {
        placeShop(player, entranceX, entranceY);
        return;
      }
      if (type === "upgrade") {
        placeUpgrade(player, entranceX, entranceY);
      }
    }

    if (msg.t === "shop_sell") {
      if (!isPlayerInShopCenter(player)) return;
      const crystal = String(msg.crystal || "");
      const price = CRYSTAL_PRICES[crystal];
      if (!price) return;
      const amount = Math.max(1, Math.floor(Number(msg.amount || 1)));
      const current = player.inventory[crystal] ?? 0;
      if (current < amount) return;
      const next = current - amount;
      setCrystalCount(player, crystal, next);
      player.dollars += price * amount;
      stmtUpdateDollars.run(player.dollars, player.username);
      sendToPlayer(player, {
        t: "wallet",
        dollars: player.dollars,
        coins: player.coins
      });
      sendToPlayer(player, { t: "inventory", inventory: player.inventory });
    }

    if (msg.t === "shop_buy") {
      if (!isPlayerInShopCenter(player)) return;
      const crystal = String(msg.crystal || "");
      const basePrice = CRYSTAL_PRICES[crystal];
      if (!basePrice) return;
      const amount = Math.max(1, Math.floor(Number(msg.amount || 1)));
      const price = basePrice * 2;
      const cost = price * amount;
      if (player.dollars < cost) return;
      const current = player.inventory[crystal] ?? 0;
      const next = current + amount;
      setCrystalCount(player, crystal, next);
      player.dollars -= cost;
      stmtUpdateDollars.run(player.dollars, player.username);
      sendToPlayer(player, {
        t: "wallet",
        dollars: player.dollars,
        coins: player.coins
      });
      sendToPlayer(player, { t: "inventory", inventory: player.inventory });
    }

    if (msg.t === "storage_open") {
      const id = String(msg.id || "");
      const storage = storageAtPlayer(player);
      if (!storage || storage.id !== id) return;
      sendToPlayer(player, {
        t: "storage_state",
        id: storage.id,
        storage: { ...storage.storage }
      });
    }

    if (msg.t === "storage_move") {
      const id = String(msg.id || "");
      const storage = storageAtPlayer(player);
      if (!storage || storage.id !== id) return;
      const crystal = String(msg.crystal || "");
      if (!CRYSTAL_PRICES[crystal]) return;
      const amount = Math.max(1, Math.floor(Number(msg.amount || 1)));
      const dir = String(msg.dir || "");
      const store = storage.storage;
      const currentPlayer = player.inventory[crystal] ?? 0;
      const currentStore = store[crystal] ?? 0;
      if (dir === "deposit") {
        if (currentPlayer < amount) return;
        setCrystalCount(player, crystal, currentPlayer - amount);
        store[crystal] = currentStore + amount;
      } else if (dir === "withdraw") {
        if (currentStore < amount) return;
        setCrystalCount(player, crystal, currentPlayer + amount);
        store[crystal] = currentStore - amount;
      } else {
        return;
      }
      buildingsMetaDirty = true;
      sendToPlayer(player, { t: "inventory", inventory: player.inventory });
      sendToPlayer(player, {
        t: "storage_state",
        id: storage.id,
        storage: { ...storage.storage }
      });
    }
  });

  ws.on("close", () => {
    players.delete(id);
    stmtUpdateUserPos.run(player.tx, player.ty, player.username);
    if (player.exploredDirty) {
      stmtUpdateExplored.run(
        encodeExplored(player.exploredChunks),
        player.username
      );
      player.exploredDirty = false;
    }
    player.ws = null;
  });
});

const tickIntervalMs = 1000 / TICK_RATE;
setInterval(() => {
  const dt = 1 / TICK_RATE;
  const dtMs = 1000 * dt;

  for (const player of players.values()) {
    if (player.moveCooldownMs > 0) {
      player.moveCooldownMs = Math.max(0, player.moveCooldownMs - dtMs);
    }
    if (player.mineCooldownMs > 0) {
      player.mineCooldownMs = Math.max(0, player.mineCooldownMs - dtMs);
    }

    const wantsMove =
      player.inputDirX !== 0 || player.inputDirY !== 0;

    const desiredX = player.inputDirX;
    const desiredY = player.inputDirY;

    const tryMine = (x, y) => {
      if (player.mineCooldownMs > 0) return false;
      if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
      const type = getTile(x, y);
      if (type !== TILE_TYPES.empty) {
        const hpMax = TILE_HP.get(type);
        if (hpMax) {
          const result = damageTile(x, y, player.id, (hitType) =>
            awardCrystal(player, hitType)
          );
          if (result.hit) {
            player.mineCooldownMs = MINE_COOLDOWN_MS;
            return true;
          }
          return false;
        }
        broadcast({
          t: "hit",
          x,
          y,
          by: player.id,
          type,
          amount: 0
        });
        if (type === TILE_TYPES.redRock) {
          applyDamageToPlayer(player, 1);
        }
        player.mineCooldownMs = MINE_COOLDOWN_MS;
        return true;
      }
      broadcast({
        t: "hit",
        x,
        y,
        by: player.id,
        type: TILE_TYPES.empty,
        amount: 0
      });
      player.mineCooldownMs = MINE_COOLDOWN_MS;
      return true;
    };

    if (player.inputCtrl) {
      if (wantsMove) {
        if (player.facingX !== desiredX || player.facingY !== desiredY) {
          player.facingX = desiredX;
          player.facingY = desiredY;
        }
      }
      if (player.inputMine && player.mineCooldownMs === 0) {
        const mineX = player.tx + player.facingX;
        const mineY = player.ty + player.facingY;
        tryMine(mineX, mineY);
      }
      continue;
    }

    if (wantsMove) {
      player.facingX = desiredX;
      player.facingY = desiredY;
    }

    if (wantsMove && player.moveCooldownMs === 0) {
      const nextX = player.tx + desiredX;
      const nextY = player.ty + desiredY;
      let moved = false;
      if (desiredX !== 0 && isWalkable(nextX, player.ty)) {
        player.tx = nextX;
        moved = true;
      }
      if (desiredY !== 0 && isWalkable(player.tx, nextY)) {
        player.ty = nextY;
        moved = true;
      }
      if (moved) {
        player.moveCooldownMs = STEP_DELAY_MS;
      } else {
        const mineX = player.tx + desiredX;
        const mineY = player.ty + desiredY;
        tryMine(mineX, mineY);
      }
    } else if (!wantsMove && player.inputMine && player.mineCooldownMs === 0) {
      const mineX = player.tx + player.facingX;
      const mineY = player.ty + player.facingY;
      tryMine(mineX, mineY);
    }

    updateExplored(player);
  }

  const snapshot = {
    t: "state",
    time: Date.now(),
    players: Array.from(players.values()).map((p) => ({
      id: p.id,
      tx: p.tx,
      ty: p.ty,
      fx: p.facingX,
      fy: p.facingY,
      name: p.username
    }))
  };

  broadcast(snapshot);
}, tickIntervalMs);

setInterval(() => {
  if (mapDirty) {
    saveLayer(MAP_FILE, mapTiles, MAP_W, MAP_H);
    mapDirty = false;
  }
  if (buildingDirty) {
    saveLayer(BUILDINGS_FILE, buildingTiles, MAP_W, MAP_H);
    buildingDirty = false;
  }
  if (buildingsMetaDirty) {
    saveBuildingsMeta(buildings);
    buildingsMetaDirty = false;
  }
  for (const player of players.values()) {
    if (player.exploredDirty) {
      stmtUpdateExplored.run(
        encodeExplored(player.exploredChunks),
        player.username
      );
      player.exploredDirty = false;
    }
  }
}, 2000);

server.listen(PORT, () => {
  console.log(`Server listening on ws://localhost:${PORT}`);
});
