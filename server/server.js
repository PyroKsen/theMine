const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  BASE_HP,
  DEPTH_OVERLOAD_INTERVAL_MS,
  TICK_RATE,
  MINE_COOLDOWN_MS,
  CHAT_MAX_LEN,
  CRYSTAL_PRICES,
  BUILDING_TYPES,
  MAP_W,
  MAP_H,
  TILE_SIZE,
  CHUNK_SIZE,
  TILE_TYPES,
  CRYSTAL_TILE_TO_COLOR,
  BOMB_ITEMS,
  BUILDING_ITEMS,
  TILE_HP
} = require("./lib/config");
const {
  SKILL_DEFS,
  getSkillConfig,
  getSkillXpNeed,
  getSkillCost,
  getMoveStepDelayMs,
  getMiningDamage,
  getMaxDepth,
  getOverloadPercent,
  isInventoryNearCapacity
} = require("./lib/skills");
const { createDb } = require("./lib/db");
const { createBuildingManager } = require("./lib/buildings");
const { createBombManager } = require("./lib/bombs");
const { createPlayerService } = require("./lib/players");
const {
  chunkKey,
  parseExplored,
  encodeExplored,
  chunkIntersectsView,
  exploredPayload,
  updateExplored
} = require("./lib/exploration");

const PORT = Number(process.env.PORT || 8080);
const SKILL_DEFAULTS = SKILL_DEFS.flatMap(() => [0, 0]);
const SKILL_SLOT_COUNT = 20;
const EMPTY_SKILL_SLOTS = Array.from({ length: SKILL_SLOT_COUNT }, () => null);

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const { createMapStore } = require("./lib/mapStore");

const mapStore = createMapStore(dataDir);
const {
  getTile,
  setTile,
  getBuilding,
  setBuilding,
  getTileHp,
  setTileHp,
  deleteTileHp,
  encodeMapChunk,
  encodeBuildingChunk,
  flushDirty
} = mapStore;

const CRYSTAL_COLORS = Object.keys(CRYSTAL_PRICES || {});
const dropBoxesFile = path.join(dataDir, "drop_boxes.json");
const dropBoxes = new Map();
let dropBoxesDirty = false;

function loadDropBoxes() {
  if (!fs.existsSync(dropBoxesFile)) return;
  try {
    const raw = fs.readFileSync(dropBoxesFile, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const entry of parsed) {
      const x = Number(entry?.x);
      const y = Number(entry?.y);
      if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
      if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
      const crystals = {};
      let total = 0;
      for (const color of CRYSTAL_COLORS) {
        const value = Math.max(0, Math.floor(entry?.crystals?.[color] || 0));
        crystals[color] = value;
        total += value;
      }
      if (total <= 0) continue;
      if (getTile(x, y) === TILE_TYPES.empty || getTile(x, y) === TILE_TYPES.dropBox) {
        setTile(x, y, TILE_TYPES.dropBox);
        setTileHp(x, y, 1);
        dropBoxes.set(`${x},${y}`, crystals);
      }
    }
  } catch {
    // ignore
  }
}

function saveDropBoxes() {
  const list = Array.from(dropBoxes.entries()).map(([key, crystals]) => {
    const [x, y] = key.split(",").map((v) => Number(v));
    return { x, y, crystals };
  });
  fs.writeFileSync(dropBoxesFile, JSON.stringify(list));
  dropBoxesDirty = false;
}

loadDropBoxes();

function isWalkable(x, y) {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
  if (getTile(x, y) !== TILE_TYPES.empty) return false;
  return getBuilding(x, y) === BUILDING_TYPES.none;
}

function normalizeSkillSlots(raw) {
  if (!raw) return [...EMPTY_SKILL_SLOTS];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...EMPTY_SKILL_SLOTS];
    const slots = Array.from({ length: SKILL_SLOT_COUNT }, (_, index) => {
      const value = parsed[index];
      return typeof value === "string" && value ? value : null;
    });
    return slots;
  } catch {
    return [...EMPTY_SKILL_SLOTS];
  }
}

function serializeSkillSlots(slots) {
  const normalized = Array.from({ length: SKILL_SLOT_COUNT }, (_, index) => {
    const value = slots?.[index];
    return typeof value === "string" && value ? value : null;
  });
  return JSON.stringify(normalized);
}

function isSkillSlotted(player, skillId) {
  return Array.isArray(player?.skillSlots) && player.skillSlots.includes(skillId);
}

function isSkillAvailable(player, skill) {
  if (!skill || skill.locked) return false;
  if (!Array.isArray(skill.requires) || skill.requires.length === 0) return true;
  return skill.requires.every((req) => {
    const level = player.skills?.[req.id]?.level ?? 0;
    const need = Number(req.level || 0);
    return level >= need;
  });
}

function calcGreenCost(base, level) {
  return Math.max(1, Math.ceil(base - (Number(level) || 0) * 0.01));
}

function damageTile(x, y, byId, onCrystalHit, damage = 1) {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H)
    return { hit: false, broken: false, type: TILE_TYPES.empty };
  const type = getTile(x, y);
  const hpMax = TILE_HP.get(type);
  if (!hpMax) {
    return { hit: false, broken: false, type };
  }
  const key = `${x},${y}`;
  const current = getTileHp(x, y) ?? hpMax;
  const safeDamage = Math.max(0, Number(damage) || 0);
  const dealt = Math.min(current, safeDamage);
  const next = current - dealt;
  let amount = 0;
  if (dealt > 0 && type !== TILE_TYPES.rock && typeof onCrystalHit === "function") {
    amount = Number(onCrystalHit(type, dealt) || 0);
  }
  broadcast({ t: "hit", x, y, by: byId, type, amount });
  if (next <= 0) {
    setTile(x, y, TILE_TYPES.empty);
    deleteTileHp(x, y);
    broadcast({ t: "tile", x, y, value: TILE_TYPES.empty });
    return { hit: true, broken: true, type, amount };
  }
  setTileHp(x, y, next);
  return { hit: true, broken: false, type, amount };
}


const {
  db,
  stmtInsertUser,
  stmtGetUser,
  stmtUpdateUserPos,
  stmtUpdateExplored,
  stmtUpdateSkillSlots,
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
  skillUpdateStmts
} = createDb(dataDir);

const playerService = createPlayerService({
  mapWidth: MAP_W,
  mapHeight: MAP_H,
  isWalkable,
  getSkillConfig,
  getOverloadPercent,
  isInventoryNearCapacity,
  skillUpdateStmts,
  stmtUpdateHp,
  stmtUpdateCrystalGreen,
  stmtUpdateCrystalBlue,
  stmtUpdateCrystalWhite,
  stmtUpdateCrystalRed,
  stmtUpdateCrystalPink,
  stmtUpdateCrystalCyan,
  itemUpdateStmts,
  crystalTileToColor: CRYSTAL_TILE_TO_COLOR
});
const {
  sendToPlayer,
  sendSkills,
  syncHpLimits,
  grantSkillXp,
  applyDamageToPlayer,
  applyHealToPlayer,
  setCrystalCount,
  awardCrystal,
  handleMoveXp,
  buildItemsPayload,
  setItemCount,
  grantAdminItems,
  randomSpawn,
  validSavedSpawn,
  normalizeDir
} = playerService;

function canSpendCrystals(player, costs) {
  for (const [color, amount] of Object.entries(costs)) {
    const have = player.inventory?.[color] ?? 0;
    if (have < amount) return false;
  }
  return true;
}

function spendCrystals(player, costs) {
  for (const [color, amount] of Object.entries(costs)) {
    const have = player.inventory?.[color] ?? 0;
    setCrystalCount(player, color, have - amount);
  }
  sendToPlayer(player, { t: "inventory", inventory: player.inventory });
}

function dropCrystals(player, crystals, dropAll) {
  const targetX = player.tx + player.facingX;
  const targetY = player.ty + player.facingY;
  if (targetX < 0 || targetX >= MAP_W || targetY < 0 || targetY >= MAP_H) {
    sendToPlayer(player, { t: "drop_error", message: "Нет места для сброса." });
    return false;
  }
  if (getTile(targetX, targetY) !== TILE_TYPES.empty) {
    sendToPlayer(player, { t: "drop_error", message: "Клетка занята." });
    return false;
  }
  if (getBuilding(targetX, targetY) !== BUILDING_TYPES.none) {
    sendToPlayer(player, { t: "drop_error", message: "Клетка занята." });
    return false;
  }
  if (bombByTile?.has(`${targetX},${targetY}`)) {
    sendToPlayer(player, { t: "drop_error", message: "Клетка занята." });
    return false;
  }

  const payload = {};
  let total = 0;
  for (const color of CRYSTAL_COLORS) {
    const have = player.inventory?.[color] ?? 0;
    const want = dropAll
      ? have
      : Math.max(0, Math.floor(Number(crystals?.[color] || 0)));
    const amount = Math.min(have, want);
    payload[color] = amount;
    total += amount;
  }
  if (total <= 0) {
    sendToPlayer(player, { t: "drop_error", message: "Нечего сбрасывать." });
    return false;
  }

  for (const color of CRYSTAL_COLORS) {
    const amount = payload[color];
    if (amount > 0) {
      const have = player.inventory?.[color] ?? 0;
      setCrystalCount(player, color, have - amount);
    }
  }
  sendToPlayer(player, { t: "inventory", inventory: player.inventory });

  setTile(targetX, targetY, TILE_TYPES.dropBox);
  setTileHp(targetX, targetY, 1);
  dropBoxes.set(`${targetX},${targetY}`, payload);
  dropBoxesDirty = true;
  broadcast({ t: "tile", x: targetX, y: targetY, value: TILE_TYPES.dropBox });
  sendToPlayer(player, { t: "drop_ok" });
  return true;
}

function collectDropBox(player, x, y) {
  const key = `${x},${y}`;
  const stored = dropBoxes.get(key);
  if (!stored) return;
  for (const color of CRYSTAL_COLORS) {
    const amount = Math.max(0, Math.floor(Number(stored[color] || 0)));
    if (amount <= 0) continue;
    const have = player.inventory?.[color] ?? 0;
    setCrystalCount(player, color, have + amount);
  }
  sendToPlayer(player, { t: "inventory", inventory: player.inventory });
  dropBoxes.delete(key);
  dropBoxesDirty = true;
}

function dropCrystalsOnDeath(player) {
  const payload = {};
  let total = 0;
  for (const color of CRYSTAL_COLORS) {
    const amount = Math.max(0, Math.floor(player.inventory?.[color] || 0));
    payload[color] = amount;
    total += amount;
    if (amount > 0) {
      setCrystalCount(player, color, 0);
    }
  }
  sendToPlayer(player, { t: "inventory", inventory: player.inventory });
  if (total <= 0) return;

  const key = `${player.tx},${player.ty}`;
  setTile(player.tx, player.ty, TILE_TYPES.dropBox);
  setTileHp(player.tx, player.ty, 1);
  dropBoxes.set(key, payload);
  broadcast({
    t: "tile",
    x: player.tx,
    y: player.ty,
    value: TILE_TYPES.dropBox
  });
  dropBoxesDirty = true;
}

function handlePlayerDeath(player) {
  if (!player || player.hp > 0) return false;
  dropCrystalsOnDeath(player);
  player.tx = 1;
  player.ty = 1;
  player.facingX = 0;
  player.facingY = 1;
  player.moveCooldownMs = 0;
  player.mineCooldownMs = 0;
  player.depthOverTimerMs = null;
  player.depthXpTimerMs = null;
  player.crystalRemainder = {};
  player.hp = player.maxHp;
  stmtUpdateUserPos.run(player.tx, player.ty, player.username);
  stmtUpdateHp.run(player.hp, player.username);
  sendToPlayer(player, {
    t: "hp",
    current: player.hp,
    max: player.maxHp
  });
  return true;
}

function handleBuildAction(player) {
  const targetX = player.tx + player.facingX;
  const targetY = player.ty + player.facingY;
  if (targetX < 0 || targetX >= MAP_W || targetY < 0 || targetY >= MAP_H) return;
  if (getBuilding(targetX, targetY) !== BUILDING_TYPES.none) return;

  const type = getTile(targetX, targetY);
  if (type === TILE_TYPES.empty) {
    const config = getSkillConfig("build1");
    if (!config || !isSkillSlotted(player, "build1")) return;
    if (!isSkillAvailable(player, config)) return;
    const level = player.skills?.build1?.level ?? 0;
    const greenCost = calcGreenCost(3, level);
    const costs = { green: greenCost };
    if (!canSpendCrystals(player, costs)) return;
    spendCrystals(player, costs);
    setTile(targetX, targetY, TILE_TYPES.buildGreen);
    setTileHp(targetX, targetY, 5 + level);
    broadcast({ t: "tile", x: targetX, y: targetY, value: TILE_TYPES.buildGreen });
    grantSkillXp(player, "build1", 1);
    return;
  }

  if (type === TILE_TYPES.buildGreen) {
    const config = getSkillConfig("build2");
    if (!config || !isSkillSlotted(player, "build2")) return;
    if (!isSkillAvailable(player, config)) return;
    const level = player.skills?.build2?.level ?? 0;
    const greenCost = calcGreenCost(3, level);
    const costs = { green: greenCost, white: 1 };
    if (!canSpendCrystals(player, costs)) return;
    spendCrystals(player, costs);
    const currentHp = getTileHp(targetX, targetY) ?? TILE_HP.get(type) ?? 0;
    setTile(targetX, targetY, TILE_TYPES.buildYellow);
    setTileHp(targetX, targetY, currentHp + 50 + level);
    broadcast({ t: "tile", x: targetX, y: targetY, value: TILE_TYPES.buildYellow });
    grantSkillXp(player, "build2", 1);
    return;
  }

  if (type === TILE_TYPES.buildYellow) {
    const config = getSkillConfig("build3");
    if (!config || !isSkillSlotted(player, "build3")) return;
    if (!isSkillAvailable(player, config)) return;
    const level = player.skills?.build3?.level ?? 0;
    const greenCost = calcGreenCost(10, level);
    const costs = { green: greenCost, blue: 1, white: 1, red: 1 };
    if (!canSpendCrystals(player, costs)) return;
    spendCrystals(player, costs);
    const currentHp = getTileHp(targetX, targetY) ?? TILE_HP.get(type) ?? 0;
    setTile(targetX, targetY, TILE_TYPES.buildRed);
    setTileHp(targetX, targetY, currentHp + 100 + level);
    broadcast({ t: "tile", x: targetX, y: targetY, value: TILE_TYPES.buildRed });
    grantSkillXp(player, "build3", 1);
  }
}

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
        stmtInsertUser.run(
          username,
          hash,
          Date.now(),
          null,
          null,
          null,
          serializeSkillSlots(EMPTY_SKILL_SLOTS),
          0,
          0,
          BASE_HP,
          BASE_HP,
          0,
          0,
          0,
          0,
          0,
          0,
          ...SKILL_DEFAULTS
        );
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
const bombManager = createBombManager({
  mapStore,
  players,
  broadcast,
  applyDamageToPlayer
});
const { bombByTile, placeBomb } = bombManager;
const buildingManager = createBuildingManager({
  dataDir,
  mapStore,
  players,
  bombByTile,
  broadcast
});
const {
  buildings,
  placeStorage,
  placeShop,
  placeUpgrade,
  isPlayerInShopCenter,
  isPlayerInUpgradeCenter,
  storageAtPlayer,
  markDirty: markBuildingsDirty,
  flush: flushBuildings
} = buildingManager;

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function sendMapChunk(ws, cx, cy) {
  const chunk = encodeMapChunk(cx, cy, CHUNK_SIZE);
  const buildingChunk = encodeBuildingChunk(cx, cy, CHUNK_SIZE);
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
wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "/", "http://localhost");
  const token = url.searchParams.get("token");
  const session = token ? sessions.get(token) : null;
  if (!session) {
    ws.close(4001, "unauthorized");
    return;
  }
  for (const existing of players.values()) {
    if (existing.username === session.username) {
      ws.close(4002, "already_online");
      return;
    }
  }

  const id = crypto.randomUUID();
  const saved = stmtGetUser.get(session.username);
  const skills = {};
  for (const skill of SKILL_DEFS) {
    const levelKey = `skill_${skill.id}_level`;
    const xpKey = `skill_${skill.id}_xp`;
    skills[skill.id] = {
      level: saved?.[levelKey] ?? 0,
      xp: saved?.[xpKey] ?? 0
    };
  }
  const skillSlots = normalizeSkillSlots(saved?.skill_slots);
  const spawn = validSavedSpawn(saved?.last_tx, saved?.last_ty)
    ? { tx: saved.last_tx, ty: saved.last_ty }
    : randomSpawn();
  const savedHp = saved?.hp ?? BASE_HP;
  const savedMaxHp = saved?.max_hp ?? BASE_HP;
  const skillHpLevel = skills.hp?.level ?? 0;
  const computedMaxHp = Math.max(savedMaxHp, BASE_HP + skillHpLevel);
  const currentHp = Math.min(savedHp, computedMaxHp);
  const player = {
    id,
    username: session.username,
    ws,
    tx: spawn.tx,
    ty: spawn.ty,
    inputDirX: 0,
    inputDirY: 0,
    inputRotate: false,
    inputSlow: false,
    inputMine: false,
    facingX: 0,
    facingY: 1,
    moveCooldownMs: 0,
    mineCooldownMs: 0,
    dollars: saved?.dollars ?? 0,
    coins: saved?.coins ?? 0,
    hp: currentHp,
    maxHp: computedMaxHp,
    inventory: {
      green: saved?.crystal_green ?? 0,
      blue: saved?.crystal_blue ?? 0,
      white: saved?.crystal_white ?? 0,
      red: saved?.crystal_red ?? 0,
      pink: saved?.crystal_pink ?? 0,
      cyan: saved?.crystal_cyan ?? 0
    },
    skills,
    skillSlots,
    moveTilesSinceXp: 0,
    inventoryTilesSinceXp: 0,
    crystalRemainder: {},
    depthOverTimerMs: null,
    depthXpTimerMs: null,
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

  if (savedMaxHp !== computedMaxHp) {
    stmtUpdateMaxHp.run(computedMaxHp, player.username);
  }
  if (savedHp !== currentHp) {
    stmtUpdateHp.run(currentHp, player.username);
  }

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
      skills: player.skills,
      skillSlots: player.skillSlots,
      skillConfig: SKILL_DEFS,
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
      player.inputSlow = Boolean(msg.ctrl);
      player.inputRotate = Boolean(msg.shift);
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
      placeBomb(player, x, y, type, (p, itemId) => {
        if ((p.items[itemId] ?? 0) <= 0) return false;
        setItemCount(p, itemId, (p.items[itemId] ?? 0) - 1);
        sendToPlayer(p, { t: "items", items: buildItemsPayload(p.items) });
        return true;
      });
    }

    if (msg.t === "place_building") {
      const type = String(msg.type || "");
      const entranceX = Number(msg.x);
      const entranceY = Number(msg.y);
      if (type === "storage") {
        if ((player.items.storage ?? 0) <= 0) return;
        if (!placeStorage(player, entranceX, entranceY)) return;
        setItemCount(player, "storage", (player.items.storage ?? 0) - 1);
        sendToPlayer(player, { t: "items", items: buildItemsPayload(player.items) });
        return;
      }
      if (type === "shop") {
        if ((player.items.shop ?? 0) <= 0) return;
        if (!placeShop(player, entranceX, entranceY)) return;
        setItemCount(player, "shop", (player.items.shop ?? 0) - 1);
        sendToPlayer(player, { t: "items", items: buildItemsPayload(player.items) });
        return;
      }
      if (type === "upgrade") {
        if ((player.items.upgrade ?? 0) <= 0) return;
        if (!placeUpgrade(player, entranceX, entranceY)) return;
        setItemCount(player, "upgrade", (player.items.upgrade ?? 0) - 1);
        sendToPlayer(player, { t: "items", items: buildItemsPayload(player.items) });
      }
    }

    if (msg.t === "build_action") {
      handleBuildAction(player);
    }

    if (msg.t === "drop_crystals") {
      const all = Boolean(msg.all);
      const crystals = msg.crystals || {};
      dropCrystals(player, crystals, all);
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
      const current = player.inventory[crystal] ?? 0;
      const cost = price * amount;
      if (player.dollars < cost) return;
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
      markBuildingsDirty();
      sendToPlayer(player, { t: "inventory", inventory: player.inventory });
      sendToPlayer(player, {
        t: "storage_state",
        id: storage.id,
        storage: { ...storage.storage }
      });
    }

    if (msg.t === "skill_slot_set") {
      if (!isPlayerInUpgradeCenter(player)) return;
      const slot = Number(msg.slot);
      const id = String(msg.id || "");
      if (!Number.isInteger(slot) || slot < 0 || slot >= SKILL_SLOT_COUNT) return;
      const config = getSkillConfig(id);
      if (!config || !config.slotOnly) return;
      if (!isSkillAvailable(player, config)) return;
      const already = isSkillSlotted(player, id);
      if (already && player.skillSlots[slot] !== id) return;
      player.skillSlots[slot] = id;
      stmtUpdateSkillSlots.run(
        serializeSkillSlots(player.skillSlots),
        player.username
      );
      sendToPlayer(player, { t: "skill_slots", slots: player.skillSlots });
    }

    if (msg.t === "skill_upgrade") {
      if (!isPlayerInUpgradeCenter(player)) return;
      const id = String(msg.id || "");
      const config = getSkillConfig(id);
      if (!config || config.locked) return;
      if (config.slotOnly && !isSkillSlotted(player, id)) return;
      const skill = player.skills?.[id];
      if (!skill) return;
      const xpNeed = getSkillXpNeed(config, skill.level);
      const cost = getSkillCost(config, skill.level);
      if (skill.xp < xpNeed) return;
      if (player.dollars < cost) return;
      skill.xp -= xpNeed;
      skill.level += 1;
      const stmts = skillUpdateStmts.get(id);
      if (stmts?.xp) {
        stmts.xp.run(skill.xp, player.username);
      }
      if (stmts?.level) {
        stmts.level.run(skill.level, player.username);
      }
      player.dollars -= cost;
      stmtUpdateDollars.run(player.dollars, player.username);
      sendToPlayer(player, {
        t: "wallet",
        dollars: player.dollars,
        coins: player.coins
      });
      if (id === "hp") {
        const nextMax = Math.max(player.maxHp, BASE_HP + skill.level);
        if (nextMax !== player.maxHp) {
          player.maxHp = nextMax;
          stmtUpdateMaxHp.run(player.maxHp, player.username);
        }
        syncHpLimits(player);
      }
      sendSkills(player);
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

    const maxDepth = getMaxDepth(player);
    const overDepth = Math.max(0, player.ty - maxDepth);
    const nearDepth = player.ty >= maxDepth - 20;
    if (overDepth > 0) {
      if (player.depthOverTimerMs == null) {
        player.depthOverTimerMs = DEPTH_OVERLOAD_INTERVAL_MS;
      } else {
        player.depthOverTimerMs -= dtMs;
      }
      while (player.depthOverTimerMs != null && player.depthOverTimerMs <= 0) {
        applyDamageToPlayer(player, overDepth);
        player.depthOverTimerMs += DEPTH_OVERLOAD_INTERVAL_MS;
      }
    } else {
      player.depthOverTimerMs = null;
    }

    if (nearDepth) {
      if (player.depthXpTimerMs == null) {
        player.depthXpTimerMs = DEPTH_OVERLOAD_INTERVAL_MS;
      } else {
        player.depthXpTimerMs -= dtMs;
      }
      const multiplier = overDepth > 0 ? 2 : 1;
      while (player.depthXpTimerMs != null && player.depthXpTimerMs <= 0) {
        grantSkillXp(player, "depth", multiplier);
        player.depthXpTimerMs += DEPTH_OVERLOAD_INTERVAL_MS;
      }
    } else {
      player.depthXpTimerMs = null;
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
          const isBuildTile =
            type === TILE_TYPES.buildGreen ||
            type === TILE_TYPES.buildYellow ||
            type === TILE_TYPES.buildRed;
          const isDropBox = type === TILE_TYPES.dropBox;
          let damage = getMiningDamage(player);
          if (isBuildTile) {
            const demoLevel = player.skills?.demolisher?.level ?? 0;
            damage += demoLevel * 0.5;
          }
          const result = damageTile(
            x,
            y,
            player.id,
            (hitType, dealt) => awardCrystal(player, hitType, dealt),
            damage
          );
          if (result.hit) {
            if (result.broken) {
              if (isDropBox) {
                collectDropBox(player, x, y);
              } else {
                grantSkillXp(player, "mining", 1);
                if (isBuildTile) {
                  grantSkillXp(player, "demolisher", 1);
                }
              }
            }
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

    if (player.inputRotate) {
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
      let movedTiles = 0;
      if (desiredX !== 0 && isWalkable(nextX, player.ty)) {
        player.tx = nextX;
        movedTiles += 1;
      }
      if (desiredY !== 0 && isWalkable(player.tx, nextY)) {
        player.ty = nextY;
        movedTiles += 1;
      }
      if (movedTiles > 0) {
        player.moveCooldownMs = getMoveStepDelayMs(player);
        handleMoveXp(player, movedTiles);
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

    if (player.hp <= 0) {
      handlePlayerDeath(player);
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
  flushDirty();
  flushBuildings();
  if (dropBoxesDirty) {
    saveDropBoxes();
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
