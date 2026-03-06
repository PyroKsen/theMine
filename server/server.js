const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const PORT = Number(process.env.PORT || 8080);
const TICK_RATE = 20;
const MOVE_TILES_PER_SEC = 5;
const STEP_DELAY_MS = 1000 / MOVE_TILES_PER_SEC;
const MINE_HITS_PER_SEC = 4;
const MINE_COOLDOWN_MS = 1000 / MINE_HITS_PER_SEC;
const CHAT_MAX_LEN = 160;

const MAP_W = 50;
const MAP_H = 50;
const TILE_SIZE = 32;
const TILE_TYPES = {
  empty: 0,
  rock: 1,
  crystalGreen: 2,
  crystalBlue: 3,
  crystalWhite: 4,
  crystalRed: 5,
  crystalPink: 6,
  crystalCyan: 7
};

const TILE_HP = new Map([
  [TILE_TYPES.rock, 3],
  [TILE_TYPES.crystalGreen, 6],
  [TILE_TYPES.crystalBlue, 6],
  [TILE_TYPES.crystalWhite, 10],
  [TILE_TYPES.crystalRed, 10],
  [TILE_TYPES.crystalPink, 10],
  [TILE_TYPES.crystalCyan, 6]
]);

const mapTiles = Array.from({ length: MAP_H }, () =>
  Array.from({ length: MAP_W }, () => TILE_TYPES.empty)
);

function fillRect(x0, y0, w, h, type) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
      mapTiles[y][x] = type;
    }
  }
}

fillRect(8, 8, 10, 6, TILE_TYPES.rock);
fillRect(28, 16, 8, 10, TILE_TYPES.rock);
fillRect(14, 30, 12, 5, TILE_TYPES.rock);
fillRect(4, 4, 1, 1, TILE_TYPES.crystalGreen);
fillRect(5, 4, 1, 1, TILE_TYPES.crystalBlue);
fillRect(6, 4, 1, 1, TILE_TYPES.crystalWhite);
fillRect(7, 4, 1, 1, TILE_TYPES.crystalRed);
fillRect(8, 4, 1, 1, TILE_TYPES.crystalPink);
fillRect(9, 4, 1, 1, TILE_TYPES.crystalCyan);

const tileHp = new Map();
for (let y = 0; y < MAP_H; y += 1) {
  for (let x = 0; x < MAP_W; x += 1) {
    const type = mapTiles[y][x];
    const hp = TILE_HP.get(type);
    if (hp) {
      tileHp.set(`${x},${y}`, hp);
    }
  }
}

function isWalkable(x, y) {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
  return mapTiles[y][x] === TILE_TYPES.empty;
}

function damageTile(x, y, byId, onCrystalHit) {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H)
    return { hit: false, broken: false, type: TILE_TYPES.empty };
  const type = mapTiles[y][x];
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
    mapTiles[y][x] = TILE_TYPES.empty;
    tileHp.delete(key);
    broadcast({ t: "tile", x, y, value: TILE_TYPES.empty });
    return { hit: true, broken: true, type, amount };
  }
  tileHp.set(key, next);
  return { hit: true, broken: false, type, amount };
}

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "themine.db"));
db.exec(
  "CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_tx INTEGER, last_ty INTEGER, dollars INTEGER NOT NULL DEFAULT 0, coins INTEGER NOT NULL DEFAULT 0, hp INTEGER NOT NULL DEFAULT 100, max_hp INTEGER NOT NULL DEFAULT 100, crystal_green INTEGER NOT NULL DEFAULT 0, crystal_blue INTEGER NOT NULL DEFAULT 0, crystal_white INTEGER NOT NULL DEFAULT 0, crystal_red INTEGER NOT NULL DEFAULT 0, crystal_pink INTEGER NOT NULL DEFAULT 0, crystal_cyan INTEGER NOT NULL DEFAULT 0)"
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
const stmtInsertUser = db.prepare(
  "INSERT INTO users (username, password_hash, created_at, last_tx, last_ty, dollars, coins, hp, max_hp, crystal_green, crystal_blue, crystal_white, crystal_red, crystal_pink, crystal_cyan) VALUES (?, ?, ?, NULL, NULL, 0, 0, 100, 100, 0, 0, 0, 0, 0, 0)"
);
const stmtGetUser = db.prepare(
  "SELECT username, password_hash, last_tx, last_ty, dollars, coins, hp, max_hp, crystal_green, crystal_blue, crystal_white, crystal_red, crystal_pink, crystal_cyan FROM users WHERE username = ?"
);
const stmtUpdateUserPos = db.prepare(
  "UPDATE users SET last_tx = ?, last_ty = ? WHERE username = ?"
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

function sendToPlayer(player, payload) {
  if (!player?.ws || player.ws.readyState !== WebSocket.OPEN) return;
  player.ws.send(JSON.stringify(payload));
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
    }
  };
  players.set(id, player);
  ws.playerId = id;

  ws.send(
    JSON.stringify({
      t: "welcome",
      id,
      username: session.username,
      time: Date.now(),
      map: { w: MAP_W, h: MAP_H, tile: TILE_SIZE, tiles: mapTiles },
      wallet: { dollars: player.dollars, coins: player.coins },
      hp: { current: player.hp, max: player.maxHp },
      inventory: { ...player.inventory }
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
  });

  ws.on("close", () => {
    players.delete(id);
    stmtUpdateUserPos.run(player.tx, player.ty, player.username);
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
      const type = mapTiles[y][x];
      if (type !== TILE_TYPES.empty) {
        const result = damageTile(x, y, player.id, (hitType) =>
          awardCrystal(player, hitType)
        );
        if (result.hit) {
          player.mineCooldownMs = MINE_COOLDOWN_MS;
          return true;
        }
        return false;
      }
      broadcast({ t: "hit", x, y, by: player.id, type: TILE_TYPES.empty, amount: 0 });
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

server.listen(PORT, () => {
  console.log(`Server listening on ws://localhost:${PORT}`);
});
