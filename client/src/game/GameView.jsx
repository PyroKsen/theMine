import React, { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";

const DEFAULT_MAP = { w: 1000, h: 1000, tile: 32, chunk: 64 };
const INTERPOLATION_DELAY = 100; // ms
const CAMERA_ZOOM = 0.8;
const VIEW_RADIUS_TILES = 128;

const COLORS = {
  background: 0x0b1016,
  grid: 0x2a3a4f,
  rock: 0x2b0f4d,
  facing: 0xf1f5ff,
  name: 0xe8eef5,
  nameStroke: 0x0b1016,
  player: 0x4cc2ff,
  playerSelf: 0x53f5a5
};

const SHOP_ITEMS = [
  { id: "green", name: "Green", price: 8, className: "crystal-green-text" },
  { id: "blue", name: "Blue", price: 12, className: "crystal-blue-text" },
  { id: "white", name: "White", price: 20, className: "crystal-white-text" },
  { id: "red", name: "Red", price: 15, className: "crystal-red-text" },
  { id: "pink", name: "Pink", price: 40, className: "crystal-pink-text" },
  { id: "cyan", name: "Cyan", price: 60, className: "crystal-cyan-text" }
];

const STORAGE_ITEMS = [
  { id: "green", name: "Green", className: "crystal-green-text" },
  { id: "blue", name: "Blue", className: "crystal-blue-text" },
  { id: "white", name: "White", className: "crystal-white-text" },
  { id: "red", name: "Red", className: "crystal-red-text" },
  { id: "pink", name: "Pink", className: "crystal-pink-text" },
  { id: "cyan", name: "Cyan", className: "crystal-cyan-text" }
];
const BASE_INVENTORY_CAPACITY = 100;
const BASE_MAX_DEPTH_TILES = 100;
const DEPTH_PER_LEVEL = 100;

const DEFAULT_SKILL_CONFIG = [
  {
    id: "hp",
    name: "ХП",
    short: "HP",
    desc: "+1 к макс ХП за уровень",
    xpBase: 8,
    xpGrowth: 4,
    dollarBase: 120,
    dollarGrowth: 60,
    locked: false
  },
  {
    id: "mining",
    name: "Копание",
    short: "DIG",
    desc: "+0.1 урона за удар",
    xpBase: 6,
    xpGrowth: 3,
    dollarBase: 140,
    dollarGrowth: 70,
    locked: false
  },
  {
    id: "move",
    name: "Скорость",
    short: "SPD",
    desc: "+1% скорости передвижения",
    xpBase: 6,
    xpGrowth: 3,
    dollarBase: 130,
    dollarGrowth: 65,
    locked: false
  },
  {
    id: "inventory",
    name: "Инвентарь",
    short: "BAG",
    desc: "+100 к вместимости каждого кристалла",
    xpBase: 8,
    xpGrowth: 4,
    dollarBase: 160,
    dollarGrowth: 80,
    locked: false
  },
  {
    id: "depth",
    name: "Глубина",
    short: "DEP",
    desc: "+100 глубины за уровень",
    xpBase: 8,
    xpGrowth: 4,
    dollarBase: 170,
    dollarGrowth: 85,
    locked: false
  },
  {
    id: "build1",
    name: "Стройка I",
    short: "B1",
    desc: "Строит зелёные блоки (5 ХП +1/ур., трата 3 зелёных -0.01/ур. до 1)",
    xpBase: 8,
    xpGrowth: 4,
    dollarBase: 140,
    dollarGrowth: 70,
    locked: false,
    slotOnly: true
  },
  {
    id: "build2",
    name: "Стройка II",
    short: "B2",
    desc: "Улучшает зелёный блок до жёлтого (+50 ХП +1/ур., трата 3 зелёных -0.01/ур. до 1 +1 белый)",
    xpBase: 8,
    xpGrowth: 4,
    dollarBase: 160,
    dollarGrowth: 80,
    locked: false,
    slotOnly: true,
    requires: [{ id: "build1", level: 3 }]
  },
  {
    id: "build3",
    name: "Стройка III",
    short: "B3",
    desc: "Улучшает жёлтый блок до красного (+100 ХП +1/ур., трата 10 зелёных -0.01/ур. до 1 +1 синий +1 белый +1 красный)",
    xpBase: 8,
    xpGrowth: 4,
    dollarBase: 180,
    dollarGrowth: 90,
    locked: false,
    slotOnly: true,
    requires: [{ id: "build2", level: 3 }]
  },
  {
    id: "demolisher",
    name: "Демонтажник",
    short: "DMS",
    desc: "+0.5 урона по строительным блокам за уровень",
    xpBase: 8,
    xpGrowth: 4,
    dollarBase: 150,
    dollarGrowth: 75,
    locked: false,
    slotOnly: true
  }
];

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
  redRock: 9,
  buildGreen: 10,
  buildYellow: 11,
  buildRed: 12,
  dropBox: 13
};

function crystalColor(type) {
  switch (type) {
    case TILE_TYPES.crystalGreen:
      return 0x38d86b;
    case TILE_TYPES.crystalBlue:
      return 0x4da3ff;
    case TILE_TYPES.crystalWhite:
      return 0xf0f4ff;
    case TILE_TYPES.crystalRed:
      return 0xff5d5d;
    case TILE_TYPES.crystalPink:
      return 0xff7fd6;
    case TILE_TYPES.crystalCyan:
      return 0x5ee9ff;
    default:
      return null;
  }
}

const FACING_ROTATIONS = new Map([
  ["0,-1", 0],
  ["1,0", Math.PI / 2],
  ["0,1", Math.PI],
  ["-1,0", -Math.PI / 2]
]);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothTowards(current, target, dtMs, smoothMs) {
  const alpha = 1 - Math.exp(-dtMs / smoothMs);
  return current + (target - current) * alpha;
}

export default function GameView({ token, onAuthExpired }) {
  const containerRef = useRef(null);
  const mapWrapRef = useRef(null);
  const mapCanvasRef = useRef(null);
  const mapDrawRafRef = useRef(null);
  const mapOpenRef = useRef(false);
  const socketRef = useRef(null);
  const chatFocusRef = useRef(false);
  const placementRef = useRef({ x: null, y: null, valid: false });
  const loadedChunksRef = useRef(new Set());
  const staleChunksRef = useRef(new Set());
  const exploredChunksRef = useRef(new Set());
  const hydrateCacheRef = useRef(null);
  const usernameRef = useRef("");
  const chunkRequestTimeRef = useRef(new Map());
  const localPlayerRef = useRef({
    tx: 0,
    ty: 0,
    fx: 0,
    fy: 1,
    ready: false
  });
  const buildingsRef = useRef([]);
  const mapViewRef = useRef({ zoom: 1, panX: 0, panY: 0, lastX: 0, lastY: 0 });
  const mapDataRef = useRef({
    w: DEFAULT_MAP.w,
    h: DEFAULT_MAP.h,
    chunk: DEFAULT_MAP.chunk,
    tiles: new Map(),
    buildings: new Map(),
    players: new Map(),
    playerId: null
  });
  const mapHoverRef = useRef({ x: null, y: null, inside: false });
  const [status, setStatus] = useState("connecting");
  const [playerCount, setPlayerCount] = useState(0);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [wallet, setWallet] = useState({ dollars: 0, coins: 0 });
  const [hp, setHp] = useState({ current: 100, max: 100 });
  const [inventory, setInventory] = useState({
    green: 0,
    blue: 0,
    white: 0,
    red: 0,
    pink: 0,
    cyan: 0
  });
  const [dropOpen, setDropOpen] = useState(false);
  const [dropError, setDropError] = useState("");
  const [dropValues, setDropValues] = useState({
    green: 0,
    blue: 0,
    white: 0,
    red: 0,
    pink: 0,
    cyan: 0
  });
  const [skills, setSkills] = useState({});
  const [skillConfig, setSkillConfig] = useState(DEFAULT_SKILL_CONFIG);
  const [skillSlots, setSkillSlots] = useState(Array(20).fill(null));
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(null);
  const [slotCandidateId, setSlotCandidateId] = useState(null);
  const [selectedSkillId, setSelectedSkillId] = useState(
    DEFAULT_SKILL_CONFIG[0]?.id || null
  );
  const [itemInventory, setItemInventory] = useState([
    { id: "medkit", name: "Medkit", count: 0 },
    { id: "bomb", name: "Bomb", count: 0 },
    { id: "plasmabomb", name: "Plasmabomb", count: 0 },
    { id: "electrobomb", name: "Electrobomb", count: 0 },
    { id: "storage", name: "Склад", count: 0 },
    { id: "shop", name: "Магазин", count: 0 },
    { id: "respawn", name: "Респавн", count: 0 },
    { id: "upgrade", name: "Ап", count: 0 },
    { id: "turret", name: "Пушка", count: 0 },
    { id: "clan_hall", name: "Клановое здание", count: 0 }
  ]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const selectedItemRef = useRef(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatFocused, setChatFocused] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapPanning, setMapPanning] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopTab, setShopTab] = useState("sell");
  const [storageTab, setStorageTab] = useState("storage");
  const [storageOwner, setStorageOwner] = useState(null);
  const [shopOwner, setShopOwner] = useState(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeOwner, setUpgradeOwner] = useState(null);
  const [upgradeTab, setUpgradeTab] = useState("upgrade");
  const [storageId, setStorageId] = useState(null);
  const storageIdRef = useRef(null);
  const [storageState, setStorageState] = useState({
    green: 0,
    blue: 0,
    white: 0,
    red: 0,
    pink: 0,
    cyan: 0
  });
  const [storageTransfer, setStorageTransfer] = useState({
    green: 0,
    blue: 0,
    white: 0,
    red: 0,
    pink: 0,
    cyan: 0
  });
  const [shopSell, setShopSell] = useState({
    green: 0,
    blue: 0,
    white: 0,
    red: 0,
    pink: 0,
    cyan: 0
  });
  const [shopBuy, setShopBuy] = useState({
    green: 0,
    blue: 0,
    white: 0,
    red: 0,
    pink: 0,
    cyan: 0
  });

  const sortedItems = itemInventory
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => {
      const aHas = a.count > 0 ? 1 : 0;
      const bHas = b.count > 0 ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return a.index - b.index;
    });
  const [mapHover, setMapHover] = useState({ x: null, y: null, inside: false });
  const baseSkills = skillConfig.filter((skill) => !skill.slotOnly);
  const slotSkills = skillConfig.filter((skill) => skill.slotOnly);
  const visibleSkills = baseSkills.slice(0, 5);
  const selectedSlotSkillId =
    selectedSlotIndex !== null ? skillSlots[selectedSlotIndex] : null;
  const selectedSlotSkill = selectedSlotSkillId
    ? skillConfig.find((skill) => skill.id === selectedSlotSkillId)
    : null;
  const activeCoreSkill =
    visibleSkills.find((skill) => skill.id === selectedSkillId) ||
    visibleSkills[0] ||
    null;
  const activeSkill = selectedSlotSkill || activeCoreSkill;
  const activeSkillState = activeSkill
    ? skills[activeSkill.id] || { level: 0, xp: 0 }
    : { level: 0, xp: 0 };
  const activeSkillNeed = activeSkill
    ? calcSkillNeed(activeSkill, activeSkillState.level)
    : 0;
  const activeSkillCost = activeSkill
    ? calcSkillCost(activeSkill, activeSkillState.level)
    : 0;
  const inventoryCapacity =
    BASE_INVENTORY_CAPACITY + (skills.inventory?.level ?? 0) * 100;
  const dropTotal = Object.values(dropValues).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );
  const canUpgradeSkill =
    activeSkill &&
    !activeSkill.locked &&
    activeSkillState.xp >= activeSkillNeed &&
    wallet.dollars >= activeSkillCost &&
    (!activeSkill.slotOnly || skillSlots.includes(activeSkill.id));
  const slotCandidateSkill = slotCandidateId
    ? slotSkills.find((skill) => skill.id === slotCandidateId)
    : null;
  const canInstallSlotSkill =
    selectedSlotIndex !== null &&
    !selectedSlotSkill &&
    slotCandidateSkill &&
    isSkillAvailable(slotCandidateSkill) &&
    !skillSlots.includes(slotCandidateSkill.id);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeSkillConfig(raw) {
    if (!Array.isArray(raw) || raw.length === 0) {
      return DEFAULT_SKILL_CONFIG;
    }
    return raw.map((entry) => ({
      id: String(entry.id || ""),
      name: String(entry.name || ""),
      short: String(entry.short || "?"),
      desc: String(entry.desc || ""),
      xpBase: Number(entry.xpBase || 0),
      xpGrowth: Number(entry.xpGrowth || 0),
      dollarBase: Number(entry.dollarBase || 0),
      dollarGrowth: Number(entry.dollarGrowth || 0),
      locked: Boolean(entry.locked),
      slotOnly: Boolean(entry.slotOnly),
      requires: Array.isArray(entry.requires) ? entry.requires : []
    }));
  }

  function normalizeSkillSlots(raw) {
    const size = 20;
    const slots = Array.isArray(raw)
      ? raw.map((id) => (id ? String(id) : null))
      : [];
    while (slots.length < size) {
      slots.push(null);
    }
    return slots.slice(0, size);
  }

  function isSkillAvailable(skill) {
    if (!skill || skill.locked) return false;
    if (!Array.isArray(skill.requires) || skill.requires.length === 0) {
      return true;
    }
    return skill.requires.every((req) => {
      const level = skills[req.id]?.level ?? 0;
      return level >= Number(req.level || 0);
    });
  }

  function calcSkillNeed(skill, level) {
    if (!skill || skill.locked) return Infinity;
    return Math.max(1, skill.xpBase + skill.xpGrowth * level);
  }

  function calcSkillCost(skill, level) {
    if (!skill || skill.locked) return Infinity;
    return Math.max(0, skill.dollarBase + skill.dollarGrowth * level);
  }

  function formatSkillTotal(skill, level) {
    if (!skill || skill.locked) return "—";
    const safeLevel = Math.max(0, Number(level) || 0);
    if (skill.id === "hp") {
      return `+${safeLevel} max HP`;
    }
    if (skill.id === "mining") {
      return `+${(safeLevel * 0.1).toFixed(1)} dmg/удар`;
    }
    if (skill.id === "move") {
      return `+${safeLevel}% скорость`;
    }
    if (skill.id === "inventory") {
      return `+${safeLevel * 100} вместимости`;
    }
    if (skill.id === "depth") {
      return `до ${BASE_MAX_DEPTH_TILES + safeLevel * DEPTH_PER_LEVEL} глубины`;
    }
    if (skill.id === "build1") {
      return `HP блока: ${5 + safeLevel}`;
    }
    if (skill.id === "build2") {
      return `+${50 + safeLevel} HP`;
    }
    if (skill.id === "build3") {
      return `+${100 + safeLevel} HP`;
    }
    if (skill.id === "demolisher") {
      return `+${(safeLevel * 0.5).toFixed(1)} урона`;
    }
    return "—";
  }

  function chunkKey(cx, cy) {
    return `${cx},${cy}`;
  }

  function chunkStorageKey(cx, cy) {
    const user = usernameRef.current || "guest";
    return `themine:${user}:chunk:${cx},${cy}`;
  }

  function saveChunkCache(cx, cy, tiles, buildings) {
    try {
      localStorage.setItem(
        chunkStorageKey(cx, cy),
        JSON.stringify({ tiles, buildings })
      );
    } catch {
      // ignore storage errors
    }
  }

  function loadChunkCache(cx, cy) {
    try {
      const raw = localStorage.getItem(chunkStorageKey(cx, cy));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.tiles || !parsed?.buildings) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function decodeBase64(base64) {
    const binary = window.atob(base64 || "");
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function requestChunks(chunks, options = {}) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const { w, h, chunk } = mapDataRef.current;
    if (!chunk) return;
    const force = Boolean(options.force);
    const maxCx = Math.ceil(w / chunk) - 1;
    const maxCy = Math.ceil(h / chunk) - 1;
    const pending = [];
    for (const entry of chunks) {
      const cx = Number(entry.cx);
      const cy = Number(entry.cy);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      if (cx < 0 || cy < 0 || cx > maxCx || cy > maxCy) continue;
      const key = chunkKey(cx, cy);
      if (!force && loadedChunksRef.current.has(key)) continue;
      pending.push({ cx, cy });
      if (pending.length >= 32) {
        socket.send(JSON.stringify({ t: "map_chunk_req", chunks: pending }));
        pending.length = 0;
      }
    }
    if (pending.length > 0) {
      socket.send(JSON.stringify({ t: "map_chunk_req", chunks: pending }));
    }
  }

  function requestMapDraw() {
    if (!mapOpenRef.current) return;
    if (mapDrawRafRef.current) return;
    mapDrawRafRef.current = window.requestAnimationFrame(() => {
      mapDrawRafRef.current = null;
      drawWorldMap();
    });
  }

  function isTileWithinView(tx, ty) {
    const player = localPlayerRef.current;
    if (!player.ready) return false;
    const dx = tx - player.tx;
    const dy = ty - player.ty;
    return dx * dx + dy * dy <= VIEW_RADIUS_TILES * VIEW_RADIUS_TILES;
  }

  function chunkIntersectsView(cx, cy) {
    const player = localPlayerRef.current;
    if (!player.ready) return false;
    const { w, h, chunk } = mapDataRef.current;
    const chunkSize = chunk || DEFAULT_MAP.chunk;
    const x0 = cx * chunkSize;
    const y0 = cy * chunkSize;
    const x1 = Math.min(x0 + chunkSize - 1, w - 1);
    const y1 = Math.min(y0 + chunkSize - 1, h - 1);
    const nx = clamp(player.tx, x0, x1);
    const ny = clamp(player.ty, y0, y1);
    const dx = player.tx - nx;
    const dy = player.ty - ny;
    return dx * dx + dy * dy <= VIEW_RADIUS_TILES * VIEW_RADIUS_TILES;
  }

  function drawWorldMap() {
    const wrap = mapWrapRef.current;
    const canvas = mapCanvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    if (width === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);

    const {
      w,
      h,
      chunk: chunkSize,
      tiles,
      buildings,
      players,
      playerId
    } = mapDataRef.current;
    if (!w || !h) return;
    const baseScale = Math.min(width / w, height / h);
    const zoom = mapViewRef.current.zoom;
    const scale = baseScale * zoom;
    const panX = mapViewRef.current.panX;
    const panY = mapViewRef.current.panY;
    const originX = (width - w * scale) / 2 + panX;
    const originY = (height - h * scale) / 2 + panY;

    ctx.fillStyle = "#141c25";
    ctx.fillRect(originX, originY, w * scale, h * scale);

    if (tiles) {
      for (const chunk of tiles.values()) {
        const startX = chunk.cx * chunkSize;
        const startY = chunk.cy * chunkSize;
        for (let y = 0; y < chunk.h; y += 1) {
          for (let x = 0; x < chunk.w; x += 1) {
            const type = chunk.data[y * chunk.w + x];
            let color = null;
            if (type === TILE_TYPES.rock) color = "#2b0f4d";
            if (type === TILE_TYPES.crystalGreen) color = "#38d86b";
            if (type === TILE_TYPES.crystalBlue) color = "#4da3ff";
            if (type === TILE_TYPES.crystalWhite) color = "#f0f4ff";
            if (type === TILE_TYPES.crystalRed) color = "#ff5d5d";
            if (type === TILE_TYPES.crystalPink) color = "#ff7fd6";
            if (type === TILE_TYPES.crystalCyan) color = "#5ee9ff";
            if (type === TILE_TYPES.blackRock) color = "#0b0b0f";
            if (type === TILE_TYPES.redRock) color = "#7a0f0f";
            if (type === TILE_TYPES.buildGreen) color = "#3bd97a";
            if (type === TILE_TYPES.buildYellow) color = "#f9c74f";
            if (type === TILE_TYPES.buildRed) color = "#ff6b6b";
            if (type === TILE_TYPES.dropBox) {
              const cx = originX + (startX + x + 0.5) * scale;
              const cy = originY + (startY + y + 0.5) * scale;
              const half = Math.max(0.5, scale / 2);
              ctx.beginPath();
              ctx.moveTo(cx, cy - half);
              ctx.lineTo(cx + half, cy);
              ctx.lineTo(cx, cy + half);
              ctx.lineTo(cx - half, cy);
              ctx.closePath();
              ctx.fillStyle = "#d4b468";
              ctx.fill();
              continue;
            }
            if (color) {
              ctx.fillStyle = color;
              ctx.fillRect(
                originX + (startX + x) * scale,
                originY + (startY + y) * scale,
                scale,
                scale
              );
            }
          }
        }
      }
    }

    if (buildings) {
      ctx.fillStyle = "#c8ced9";
      for (const chunk of buildings.values()) {
        const startX = chunk.cx * chunkSize;
        const startY = chunk.cy * chunkSize;
        for (let y = 0; y < chunk.h; y += 1) {
          for (let x = 0; x < chunk.w; x += 1) {
            if (chunk.data[y * chunk.w + x]) {
              ctx.fillRect(
                originX + (startX + x) * scale,
                originY + (startY + y) * scale,
                scale,
                scale
              );
            }
          }
        }
      }
    }

    const maxCx = Math.ceil(w / chunkSize);
    const maxCy = Math.ceil(h / chunkSize);
    ctx.fillStyle = "#000000";
    for (let cy = 0; cy < maxCy; cy += 1) {
      for (let cx = 0; cx < maxCx; cx += 1) {
        if (exploredChunksRef.current.has(chunkKey(cx, cy))) continue;
        const startX = cx * chunkSize * scale + originX;
        const startY = cy * chunkSize * scale + originY;
        const width = Math.min(chunkSize, w - cx * chunkSize) * scale;
        const height = Math.min(chunkSize, h - cy * chunkSize) * scale;
        ctx.fillRect(startX, startY, width, height);
      }
    }

    const radius = Math.max(2, Math.min(6, scale * 0.4));
    const player = localPlayerRef.current;
    for (const [id, p] of players.entries()) {
      if (!player.ready) continue;
      const dx = p.tx - player.tx;
      const dy = p.ty - player.ty;
      if (dx * dx + dy * dy > VIEW_RADIUS_TILES * VIEW_RADIUS_TILES) continue;
      const px = originX + (p.tx + 0.5) * scale;
      const py = originY + (p.ty + 0.5) * scale;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = id === playerId ? "#ff4d4d" : "#7dd3fc";
      ctx.fill();
    }
  }

  function zoomMapAt(clientX, clientY, factor) {
    const wrap = mapWrapRef.current;
    if (!wrap) return;
    const { w, h } = mapDataRef.current;
    if (!w || !h) return;

    const rect = wrap.getBoundingClientRect();
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    const baseScale = Math.min(width / w, height / h);
    const view = mapViewRef.current;
    const prevScale = baseScale * view.zoom;
    const originX = (width - w * prevScale) / 2 + view.panX;
    const originY = (height - h * prevScale) / 2 + view.panY;

    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const worldX = (screenX - originX) / prevScale;
    const worldY = (screenY - originY) / prevScale;

    const nextZoom = clamp(view.zoom * factor, 0.1, 12);
    const nextScale = baseScale * nextZoom;
    const nextOriginX = screenX - worldX * nextScale;
    const nextOriginY = screenY - worldY * nextScale;
    view.panX = nextOriginX - (width - w * nextScale) / 2;
    view.panY = nextOriginY - (height - h * nextScale) / 2;
    view.zoom = nextZoom;
    requestMapDraw();
  }

  function handleMapWheel(event) {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    zoomMapAt(event.clientX, event.clientY, factor);
  }

  function handleMapMouseDown(event) {
    if (event.button !== 0) return;
    mapViewRef.current.lastX = event.clientX;
    mapViewRef.current.lastY = event.clientY;
    setMapPanning(true);
    updateMapHover(event.clientX, event.clientY);
  }

  function handleMapMouseMove(event) {
    if (mapPanning) {
      const view = mapViewRef.current;
      const dx = event.clientX - view.lastX;
      const dy = event.clientY - view.lastY;
      view.panX += dx;
      view.panY += dy;
      view.lastX = event.clientX;
      view.lastY = event.clientY;
      requestMapDraw();
    }
    updateMapHover(event.clientX, event.clientY);
  }

  function handleMapMouseUp() {
    setMapPanning(false);
  }

  function handleMapMouseLeave() {
    setMapPanning(false);
    if (mapHoverRef.current.inside) {
      mapHoverRef.current = { x: null, y: null, inside: false };
      setMapHover({ x: null, y: null, inside: false });
    }
  }

  function updateMapHover(clientX, clientY) {
    const wrap = mapWrapRef.current;
    if (!wrap) return;
    const { w, h } = mapDataRef.current;
    if (!w || !h) return;
    const rect = wrap.getBoundingClientRect();
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    if (width === 0 || height === 0) return;
    const baseScale = Math.min(width / w, height / h);
    const view = mapViewRef.current;
    const scale = baseScale * view.zoom;
    const originX = (width - w * scale) / 2 + view.panX;
    const originY = (height - h * scale) / 2 + view.panY;
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const worldX = (screenX - originX) / scale;
    const worldY = (screenY - originY) / scale;
    const inside =
      worldX >= 0 && worldY >= 0 && worldX < w && worldY < h;
    if (!inside) {
      if (mapHoverRef.current.inside) {
        mapHoverRef.current = { x: null, y: null, inside: false };
        setMapHover({ x: null, y: null, inside: false });
      }
      return;
    }
    const nextX = Math.floor(worldX);
    const nextY = Math.floor(worldY);
    const prev = mapHoverRef.current;
    if (prev.x !== nextX || prev.y !== nextY || !prev.inside) {
      mapHoverRef.current = { x: nextX, y: nextY, inside: true };
      setMapHover({ x: nextX, y: nextY, inside: true });
    }
  }

  useEffect(() => {
    mapOpenRef.current = mapOpen;
    if (mapOpen) {
      mapViewRef.current.zoom = 1;
      mapViewRef.current.panX = 0;
      mapViewRef.current.panY = 0;
      if (hydrateCacheRef.current) {
        hydrateCacheRef.current();
      }
      requestMapDraw();
    } else {
      setMapPanning(false);
    }
  }, [mapOpen]);

  useEffect(() => {
    chatFocusRef.current = chatFocused;
  }, [chatFocused]);

  function updateBuildingWindows() {
    const player = localPlayerRef.current;
    if (!player.ready) {
      setStorageOpen(false);
      setShopOpen(false);
      setStorageId(null);
      setStorageOwner(null);
      setShopOwner(null);
      setUpgradeOpen(false);
      setUpgradeOwner(null);
      return;
    }
    let insideStorage = false;
    let currentStorageId = null;
    let currentStorageOwner = null;
    let insideShop = false;
    let currentShopOwner = null;
    let insideUpgrade = false;
    let currentUpgradeOwner = null;
    for (const building of buildingsRef.current) {
      if (building.type === "storage" && building.entrance) {
        if (
          building.entrance.x === player.tx &&
          building.entrance.y === player.ty
        ) {
          const owner = building.owner || "";
          const me = usernameRef.current || "";
          if (!owner || owner === me) {
            insideStorage = true;
            currentStorageId = building.id || null;
            currentStorageOwner = owner || null;
          }
        }
      }
      if (building.type === "shop") {
        if (
          building.center &&
          building.center.x === player.tx &&
          building.center.y === player.ty
        ) {
          insideShop = true;
          currentShopOwner = building.owner || null;
        }
      }
      if (building.type === "upgrade") {
        if (
          building.center &&
          building.center.x === player.tx &&
          building.center.y === player.ty
        ) {
          insideUpgrade = true;
          currentUpgradeOwner = building.owner || null;
        }
      }
    }
    setStorageOpen(insideStorage);
    setShopOpen(insideShop);
    setStorageId(insideStorage ? currentStorageId : null);
    setStorageOwner(insideStorage ? currentStorageOwner : null);
    setShopOwner(insideShop ? currentShopOwner : null);
    setUpgradeOpen(insideUpgrade);
    setUpgradeOwner(insideUpgrade ? currentUpgradeOwner : null);
  }

  useEffect(() => {
    selectedItemRef.current = selectedItemId;
  }, [selectedItemId]);

  useEffect(() => {
    if (!baseSkills.length) return;
    const exists = baseSkills.some((skill) => skill.id === selectedSkillId);
    if (!exists) {
      setSelectedSkillId(baseSkills[0].id);
    }
  }, [baseSkills, selectedSkillId]);

  useEffect(() => {
    if (selectedSlotIndex == null) return;
    if (selectedSlotIndex < 0 || selectedSlotIndex >= skillSlots.length) {
      setSelectedSlotIndex(null);
    }
  }, [selectedSlotIndex, skillSlots.length]);

  useEffect(() => {
    storageIdRef.current = storageId;
  }, [storageId]);

  useEffect(() => {
    setShopSell((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of SHOP_ITEMS) {
        const max = Number(inventory[item.id] || 0);
        const current = Number(prev[item.id] || 0);
        const clamped = Math.max(0, Math.min(current, max));
        if (clamped !== current) {
          next[item.id] = clamped;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [inventory]);

  function applyItems(items) {
    let next = [];
    setItemInventory((prev) => {
      const nameMap = new Map(prev.map((item) => [item.id, item.name]));
      next = items.map((item) => ({
        id: String(item.id || ""),
        name: nameMap.get(String(item.id || "")) || String(item.name || ""),
        count: Number(item.count || 0)
      }));
      return next;
    });
    setSelectedItemId((prev) => {
      if (!prev) return null;
      const found = next.find((item) => item.id === prev);
      if (!found || found.count <= 0) return null;
      return prev;
    });
  }

  useEffect(() => {
    if (!mapOpen) return undefined;
    const handleResize = () => requestMapDraw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mapOpen]);

  useEffect(() => {
    if (!storageOpen || !storageId) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ t: "storage_open", id: storageId }));
  }, [storageOpen, storageId]);

  useEffect(() => {
    if (storageOpen) return;
    setStorageState({
      green: 0,
      blue: 0,
      white: 0,
      red: 0,
      pink: 0,
      cyan: 0
    });
    setStorageTransfer({
      green: 0,
      blue: 0,
      white: 0,
      red: 0,
      pink: 0,
      cyan: 0
    });
    setStorageTab("storage");
    return;
  }, [storageOpen]);

  useEffect(() => {
    const me = usernameRef.current || "";
    if (storageOpen && storageTab === "manage" && storageOwner !== me) {
      setStorageTab("storage");
    }
  }, [storageOpen, storageTab, storageOwner]);

  useEffect(() => {
    if (!shopOpen) {
      setShopTab("sell");
      return;
    }
    const me = usernameRef.current || "";
    if (shopTab === "manage" && shopOwner !== me) {
      setShopTab("sell");
    }
  }, [shopOpen, shopTab, shopOwner]);

  useEffect(() => {
    if (!upgradeOpen) {
      setUpgradeTab("upgrade");
      return;
    }
    const me = usernameRef.current || "";
    if (upgradeTab === "manage" && upgradeOwner !== me) {
      setUpgradeTab("upgrade");
    }
  }, [upgradeOpen, upgradeTab, upgradeOwner]);

  useEffect(() => {
    if (!token) return undefined;

    let app;
    let world;
    let grid;
    let gridLines;
    let terrain;
    let effectsLayer;
    let bombsLayer;
    let placementLayer;
    let buildingLayer;
    let playersLayer;
    const camera = { x: 0, y: 0, ready: false };
    let resizeObserver;
    let socket;
    let inputInterval;
    const effects = [];
    const bombs = new Map();

    const state = {
      playerId: null,
      map: { ...DEFAULT_MAP },
      serverTimeOffset: 0,
      snapshots: [],
      players: new Map(),
      keys: {
        up: false,
        down: false,
        left: false,
        right: false,
        ctrl: false,
        mine: false
      }
    };
    const terrainChunks = new Map();
    const buildingChunks = new Map();

    function storeChunk(map, cx, cy, w, h, data) {
      const key = chunkKey(cx, cy);
      map.set(key, { cx, cy, w, h, data });
    }

    function clearChunkGraphics(chunks, layer) {
      for (const graphic of chunks.values()) {
        layer.removeChild(graphic);
        graphic.destroy();
      }
      chunks.clear();
    }

    function drawTerrainChunk(cx, cy) {
      const key = chunkKey(cx, cy);
      const chunk = mapDataRef.current.tiles.get(key);
      if (!chunk || !terrain) return;
      let graphic = terrainChunks.get(key);
      if (!graphic) {
        graphic = new Graphics();
        terrainChunks.set(key, graphic);
        terrain.addChild(graphic);
      }
      graphic.clear();
      const { tile } = state.map;
      const chunkSize = state.map.chunk || DEFAULT_MAP.chunk;
      const originX = cx * chunkSize * tile;
      const originY = cy * chunkSize * tile;
      for (let y = 0; y < chunk.h; y += 1) {
        for (let x = 0; x < chunk.w; x += 1) {
          const type = chunk.data[y * chunk.w + x];
          let color = null;
          if (type === TILE_TYPES.dropBox) {
            const cx = originX + x * tile + tile / 2;
            const cy = originY + y * tile + tile / 2;
            const half = tile / 2;
            graphic.beginFill(0xd4b468);
            graphic.drawPolygon([
              cx,
              cy - half,
              cx + half,
              cy,
              cx,
              cy + half,
              cx - half,
              cy
            ]);
            graphic.endFill();
            continue;
          }
          if (type === TILE_TYPES.rock) color = COLORS.rock;
          if (type === TILE_TYPES.crystalGreen) color = 0x38d86b;
          if (type === TILE_TYPES.crystalBlue) color = 0x4da3ff;
          if (type === TILE_TYPES.crystalWhite) color = 0xf0f4ff;
          if (type === TILE_TYPES.crystalRed) color = 0xff5d5d;
          if (type === TILE_TYPES.crystalPink) color = 0xff7fd6;
          if (type === TILE_TYPES.crystalCyan) color = 0x5ee9ff;
          if (type === TILE_TYPES.blackRock) color = 0x0b0b0f;
          if (type === TILE_TYPES.redRock) color = 0x7a0f0f;
          if (type === TILE_TYPES.buildGreen) color = 0x3bd97a;
          if (type === TILE_TYPES.buildYellow) color = 0xf9c74f;
          if (type === TILE_TYPES.buildRed) color = 0xff6b6b;
          if (color !== null) {
            graphic.beginFill(color);
            graphic.drawRect(
              originX + x * tile,
              originY + y * tile,
              tile,
              tile
            );
            graphic.endFill();
          }
        }
      }
    }

    function drawBuildingChunk(cx, cy) {
      const key = chunkKey(cx, cy);
      const chunk = mapDataRef.current.buildings.get(key);
      if (!chunk || !buildingLayer) return;
      let graphic = buildingChunks.get(key);
      if (!graphic) {
        graphic = new Graphics();
        buildingChunks.set(key, graphic);
        buildingLayer.addChild(graphic);
      }
      graphic.clear();
      const { tile } = state.map;
      const chunkSize = state.map.chunk || DEFAULT_MAP.chunk;
      const originX = cx * chunkSize * tile;
      const originY = cy * chunkSize * tile;
      graphic.beginFill(0xc8ced9, 0.85);
      for (let y = 0; y < chunk.h; y += 1) {
        for (let x = 0; x < chunk.w; x += 1) {
          if (chunk.data[y * chunk.w + x]) {
            graphic.drawRect(
              originX + x * tile,
              originY + y * tile,
              tile,
              tile
            );
          }
        }
      }
      graphic.endFill();
    }

    function setChunkValue(map, x, y, value) {
      const chunkSize = state.map.chunk || DEFAULT_MAP.chunk;
      const cx = Math.floor(x / chunkSize);
      const cy = Math.floor(y / chunkSize);
      const key = chunkKey(cx, cy);
      const chunk = map.get(key);
      if (!chunk) return null;
      const lx = x - cx * chunkSize;
      const ly = y - cy * chunkSize;
      if (lx < 0 || ly < 0 || lx >= chunk.w || ly >= chunk.h) return null;
      chunk.data[ly * chunk.w + lx] = value;
      return { cx, cy };
    }

    function hydrateExploredCache() {
      const chunkSize = state.map.chunk || DEFAULT_MAP.chunk;
      const { w, h } = mapDataRef.current;
      for (const key of exploredChunksRef.current) {
        if (staleChunksRef.current.has(key)) continue;
        if (loadedChunksRef.current.has(key)) continue;
        const parts = key.split(",");
        const cx = Number(parts[0]);
        const cy = Number(parts[1]);
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
        const cached = loadChunkCache(cx, cy);
        if (!cached) continue;
        const chunkW = Math.min(chunkSize, w - cx * chunkSize);
        const chunkH = Math.min(chunkSize, h - cy * chunkSize);
        if (chunkW <= 0 || chunkH <= 0) continue;
        const tiles = decodeBase64(cached.tiles);
        const buildings = decodeBase64(cached.buildings);
        storeChunk(mapDataRef.current.tiles, cx, cy, chunkW, chunkH, tiles);
        storeChunk(
          mapDataRef.current.buildings,
          cx,
          cy,
          chunkW,
          chunkH,
          buildings
        );
        loadedChunksRef.current.add(key);
        drawTerrainChunk(cx, cy);
        drawBuildingChunk(cx, cy);
      }
      requestMapDraw();
    }

    hydrateCacheRef.current = hydrateExploredCache;

    function drawGrid() {
      const { w, h, tile } = state.map;
      grid.clear();
      grid.beginFill(COLORS.background);
      grid.drawRect(0, 0, w * tile, h * tile);
      grid.endFill();
      gridLines.clear();
      gridLines.lineStyle(1, COLORS.grid, 0.9);
      for (let x = 0; x <= w; x += 1) {
        gridLines.moveTo(x * tile, 0);
        gridLines.lineTo(x * tile, h * tile);
      }
      for (let y = 0; y <= h; y += 1) {
        gridLines.moveTo(0, y * tile);
        gridLines.lineTo(w * tile, y * tile);
      }
    }

    function drawTerrain() {
      clearChunkGraphics(terrainChunks, terrain);
    }

    function drawBuildings() {
      if (!buildingLayer) return;
      clearChunkGraphics(buildingChunks, buildingLayer);
    }

    function isCellEmpty(tx, ty) {
      const chunkSize = state.map.chunk || DEFAULT_MAP.chunk;
      const cx = Math.floor(tx / chunkSize);
      const cy = Math.floor(ty / chunkSize);
      const key = chunkKey(cx, cy);
      const tileChunk = mapDataRef.current.tiles.get(key);
      const buildingChunk = mapDataRef.current.buildings.get(key);
      if (!tileChunk || !buildingChunk) return false;
      const lx = tx - cx * chunkSize;
      const ly = ty - cy * chunkSize;
      if (lx < 0 || ly < 0 || lx >= tileChunk.w || ly >= tileChunk.h)
        return false;
      if (tileChunk.data[ly * tileChunk.w + lx] !== TILE_TYPES.empty)
        return false;
      if (buildingChunk.data[ly * buildingChunk.w + lx]) return false;
      return !bombs.has(`${tx},${ty}`);
    }

    function isBombSelected() {
      const id = selectedItemRef.current;
      return id === "bomb" || id === "plasmabomb";
    }

    function isStorageSelected() {
      return selectedItemRef.current === "storage";
    }

    function isShopSelected() {
      return selectedItemRef.current === "shop";
    }

    function isUpgradeSelected() {
      return selectedItemRef.current === "upgrade";
    }

    function isBuildingSelected() {
      return isStorageSelected() || isShopSelected() || isUpgradeSelected();
    }

    function getFrontTile() {
      const player = localPlayerRef.current;
      if (!player.ready) return null;
      const tx = player.tx + player.fx;
      const ty = player.ty + player.fy;
      if (tx < 0 || tx >= state.map.w || ty < 0 || ty >= state.map.h) {
        return null;
      }
      return { x: tx, y: ty };
    }

    function updatePlacement() {
      const placement = placementRef.current;
      if (mapOpenRef.current || (!isBombSelected() && !isBuildingSelected())) {
        placement.valid = false;
        if (placementLayer) placementLayer.visible = false;
        return;
      }
      const front = getFrontTile();
      if (!front) {
        placement.valid = false;
        if (placementLayer) placementLayer.visible = false;
        return;
      }

      placement.x = front.x;
      placement.y = front.y;

      if (!placementLayer) return;
      const { tile } = state.map;
      placementLayer.clear();

      if (isBombSelected()) {
        const valid = isCellEmpty(front.x, front.y);
        placement.valid = valid;
        placementLayer.beginFill(valid ? 0x38d86b : 0xff5d5d, 0.35);
        placementLayer.drawRect(front.x * tile, front.y * tile, tile, tile);
        placementLayer.endFill();
        placementLayer.visible = true;
        return;
      }

        if (isStorageSelected() || isShopSelected() || isUpgradeSelected()) {
          const facingUp =
            localPlayerRef.current.fx === 0 && localPlayerRef.current.fy === -1;
          const latest = state.snapshots[state.snapshots.length - 1];
          const occupied = new Set();
        if (latest) {
          for (const p of latest.map.values()) {
            if (p.id !== state.playerId) {
              occupied.add(`${p.tx},${p.ty}`);
            }
          }
        }

        if (isStorageSelected()) {
          const topLeftX = front.x - 1;
          const topLeftY = front.y - 1;
          const width = 3;
          const height = 2;
          let valid = facingUp;
          if (
            topLeftX < 0 ||
            topLeftY < 0 ||
            topLeftX + width > state.map.w ||
            topLeftY + height > state.map.h
          ) {
            valid = false;
          } else {
            const checkX0 = topLeftX - 1;
            const checkY0 = topLeftY - 1;
            const checkX1 = topLeftX + width;
            const checkY1 = topLeftY + height;
            if (
              checkX0 < 0 ||
              checkY0 < 0 ||
              checkX1 >= state.map.w ||
              checkY1 >= state.map.h
            ) {
              valid = false;
            } else {
              for (let y = checkY0; y <= checkY1; y += 1) {
                for (let x = checkX0; x <= checkX1; x += 1) {
                  if (!isCellEmpty(x, y) || occupied.has(`${x},${y}`)) {
                    valid = false;
                    break;
                  }
                }
                if (!valid) break;
              }
            }
          }

          placement.valid = valid;
          placementLayer.beginFill(valid ? 0x38d86b : 0xff5d5d, 0.35);
          for (let y = topLeftY; y < topLeftY + height; y += 1) {
            for (let x = topLeftX; x < topLeftX + width; x += 1) {
              if (x === front.x && y === front.y) continue;
              placementLayer.drawRect(x * tile, y * tile, tile, tile);
            }
          }
          placementLayer.endFill();
          placementLayer.visible = true;
          return;
        }

        if (isShopSelected()) {
          const radius = 2;
          const topLeftX = front.x - radius;
          const topLeftY = front.y - radius;
          const size = radius * 2 + 1;
          let valid = facingUp;
          if (
            topLeftX < 0 ||
            topLeftY < 0 ||
            topLeftX + size > state.map.w ||
            topLeftY + size > state.map.h
          ) {
            valid = false;
          } else {
            const checkX0 = topLeftX - 1;
            const checkY0 = topLeftY - 1;
            const checkX1 = topLeftX + size;
            const checkY1 = topLeftY + size;
            if (
              checkX0 < 0 ||
              checkY0 < 0 ||
              checkX1 >= state.map.w ||
              checkY1 >= state.map.h
            ) {
              valid = false;
            } else {
              for (let y = checkY0; y <= checkY1; y += 1) {
                for (let x = checkX0; x <= checkX1; x += 1) {
                  if (!isCellEmpty(x, y) || occupied.has(`${x},${y}`)) {
                    valid = false;
                    break;
                  }
                }
                if (!valid) break;
              }
            }
          }

          placement.valid = valid;
          placementLayer.beginFill(valid ? 0x38d86b : 0xff5d5d, 0.35);
          for (let y = topLeftY; y < topLeftY + size; y += 1) {
            for (let x = topLeftX; x < topLeftX + size; x += 1) {
              const onCross =
                (x === front.x && Math.abs(y - front.y) <= radius) ||
                (y === front.y && Math.abs(x - front.x) <= radius);
              const isCorner =
                (x === topLeftX && y === topLeftY) ||
                (x === topLeftX && y === topLeftY + size - 1) ||
                (x === topLeftX + size - 1 && y === topLeftY) ||
                (x === topLeftX + size - 1 && y === topLeftY + size - 1);
              if (onCross || isCorner) continue;
              placementLayer.drawRect(x * tile, y * tile, tile, tile);
            }
          }
          placementLayer.endFill();
          placementLayer.visible = true;
        }
        if (isUpgradeSelected()) {
          const topLeftX = front.x - 1;
          const topLeftY = front.y - 2;
          const width = 3;
          const height = 3;
          const topRightX = topLeftX + width - 1;
          let valid = facingUp;
          if (
            topLeftX < 0 ||
            topLeftY < 0 ||
            topLeftX + width > state.map.w ||
            topLeftY + height > state.map.h
          ) {
            valid = false;
          } else {
            const checkX0 = topLeftX - 1;
            const checkY0 = topLeftY - 1;
            const checkX1 = topLeftX + width;
            const checkY1 = topLeftY + height;
            if (
              checkX0 < 0 ||
              checkY0 < 0 ||
              checkX1 >= state.map.w ||
              checkY1 >= state.map.h
            ) {
              valid = false;
            } else {
              for (let y = checkY0; y <= checkY1; y += 1) {
                for (let x = checkX0; x <= checkX1; x += 1) {
                  if (!isCellEmpty(x, y) || occupied.has(`${x},${y}`)) {
                    valid = false;
                    break;
                  }
                }
                if (!valid) break;
              }
            }
          }

          placement.valid = valid;
          placementLayer.beginFill(valid ? 0x38d86b : 0xff5d5d, 0.35);
          for (let y = topLeftY; y < topLeftY + height; y += 1) {
            for (let x = topLeftX; x < topLeftX + width; x += 1) {
              if (x === front.x && y === front.y) continue;
              if (x === front.x && y === front.y - 1) continue;
              if (y === topLeftY && (x === topLeftX || x === topRightX)) continue;
              placementLayer.drawRect(x * tile, y * tile, tile, tile);
            }
          }
          placementLayer.endFill();
          placementLayer.visible = true;
        }
      }
    }

    function createBombSprite(x, y, type) {
      const { tile } = state.map;
      const sprite = new Graphics();
      const color = type === "plasmabomb" ? 0x6f5bff : 0x1b1f24;
      sprite.beginFill(color, 0.95);
      sprite.drawCircle(0, 0, Math.max(4, tile * 0.2));
      sprite.endFill();
      sprite.lineStyle(2, 0xff8f4a, 0.9);
      sprite.drawCircle(0, 0, Math.max(5, tile * 0.24));
      sprite.position.set((x + 0.5) * tile, (y + 0.5) * tile);
      return sprite;
    }

    function getPlayerSprite(id) {
      let sprite = state.players.get(id);
      if (!sprite) {
        sprite = new Container();
        const body = new Graphics();
        const color = id === state.playerId ? COLORS.playerSelf : COLORS.player;
        body.beginFill(color);
        body.drawRect(-12, -12, 24, 24);
        body.endFill();
        const facing = new Graphics();
        facing.beginFill(COLORS.facing);
        facing.drawPolygon([
          0,
          -18,
          -5,
          -10,
          5,
          -10
        ]);
        facing.endFill();
        const label = new Text("", {
          fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
          fontSize: 12,
          fill: COLORS.name,
          stroke: COLORS.nameStroke,
          strokeThickness: 3,
          align: "center"
        });
        if (label.anchor) {
          label.anchor.set(0.5);
        }
        label.position.set(0, -22);
        sprite.body = body;
        sprite.facingGraphic = facing;
        sprite.label = label;
        sprite.renderPos = { x: 0, y: 0, ready: false };
        sprite.addChild(body);
        sprite.addChild(facing);
        sprite.addChild(label);
        playersLayer.addChild(sprite);
        state.players.set(id, sprite);
      }
      return sprite;
    }

    function removeMissingPlayers(activeIds) {
      for (const [id, sprite] of state.players.entries()) {
        if (!activeIds.has(id)) {
          playersLayer.removeChild(sprite);
          sprite.destroy({ children: true });
          state.players.delete(id);
        }
      }
    }

    function updateInputKey(key, pressed) {
      if (chatFocusRef.current) return;
      if (key === "KeyW" || key === "ArrowUp") state.keys.up = pressed;
      if (key === "KeyS" || key === "ArrowDown") state.keys.down = pressed;
      if (key === "KeyA" || key === "ArrowLeft") state.keys.left = pressed;
      if (key === "KeyD" || key === "ArrowRight") state.keys.right = pressed;
      if (key === "ShiftLeft" || key === "ShiftRight")
        state.keys.shift = pressed;
      if (key === "KeyZ") state.keys.mine = pressed;
    }

    function currentDir() {
      let x = 0;
      let y = 0;
      if (state.keys.left) x -= 1;
      if (state.keys.right) x += 1;
      if (state.keys.up) y -= 1;
      if (state.keys.down) y += 1;
      if (x !== 0 && y !== 0) {
        y = 0;
      }
      return { x, y };
    }

    function pushSnapshot(msg) {
      const map = new Map();
      for (const p of msg.players) {
        map.set(p.id, p);
      }
      state.snapshots.push({ time: msg.time, map });
      mapDataRef.current.players = map;
      mapDataRef.current.playerId = state.playerId;
      requestMapDraw();
      if (state.snapshots.length > 30) {
        state.snapshots.shift();
      }
      setPlayerCount(map.size);
      const me = state.playerId ? map.get(state.playerId) : null;
      if (me) {
        setCoords({ x: me.tx, y: me.ty });
        localPlayerRef.current = {
          tx: me.tx,
          ty: me.ty,
          fx: me.fx ?? localPlayerRef.current.fx,
          fy: me.fy ?? localPlayerRef.current.fy,
          ready: true
        };
        const chunkSize = state.map.chunk || DEFAULT_MAP.chunk;
        const minX = Math.max(0, me.tx - VIEW_RADIUS_TILES);
        const maxX = Math.min(state.map.w - 1, me.tx + VIEW_RADIUS_TILES);
        const minY = Math.max(0, me.ty - VIEW_RADIUS_TILES);
        const maxY = Math.min(state.map.h - 1, me.ty + VIEW_RADIUS_TILES);
        const minCx = Math.floor(minX / chunkSize);
        const maxCx = Math.floor(maxX / chunkSize);
        const minCy = Math.floor(minY / chunkSize);
        const maxCy = Math.floor(maxY / chunkSize);
        const now = performance.now();
        const request = [];
          for (let cy = minCy; cy <= maxCy; cy += 1) {
            for (let cx = minCx; cx <= maxCx; cx += 1) {
              if (!chunkIntersectsView(cx, cy)) continue;
              const key = chunkKey(cx, cy);
              const isStale = staleChunksRef.current.has(key);
              if (loadedChunksRef.current.has(key) && !isStale) continue;
              const last = chunkRequestTimeRef.current.get(key) || 0;
              if (now - last < 800) continue;
              chunkRequestTimeRef.current.set(key, now);
              request.push({ cx, cy });
            }
          }
          if (request.length > 0) {
            const force = request.some(({ cx, cy }) =>
              staleChunksRef.current.has(chunkKey(cx, cy))
            );
            requestChunks(request, { force });
          }
        updateBuildingWindows();
      }
    }

    function render() {
      const dtMs = app?.ticker?.deltaMS ?? 16;
      for (let i = effects.length - 1; i >= 0; i -= 1) {
        const effect = effects[i];
        effect.age += dtMs;
        const t = Math.min(1, effect.age / effect.duration);
        if (t >= 1) {
          effectsLayer.removeChild(effect.sprite);
          effect.sprite.destroy();
          effects.splice(i, 1);
        } else if (effect.kind === "float") {
          effect.sprite.alpha = 1 - t;
          effect.sprite.y = effect.startY - t * 14;
        } else {
          effect.sprite.alpha = 1 - t;
          const scale = 1 + t * 0.6;
          effect.sprite.scale.set(scale);
        }
      }

      if (state.snapshots.length === 0) return;

      const now = performance.now();
      const serverNow = now - state.serverTimeOffset;
      const renderTime = serverNow - INTERPOLATION_DELAY;

      let older = null;
      let newer = null;

      for (let i = state.snapshots.length - 1; i >= 0; i -= 1) {
        const snap = state.snapshots[i];
        if (snap.time <= renderTime) {
          older = snap;
          newer = state.snapshots[i + 1] || snap;
          break;
        }
      }

      if (!older) {
        older = state.snapshots[0];
        newer = state.snapshots[1] || older;
      }

      const span = newer.time - older.time || 1;
      const t = Math.max(0, Math.min(1, (renderTime - older.time) / span));

      const ids = new Set();
      for (const id of older.map.keys()) ids.add(id);
      for (const id of newer.map.keys()) ids.add(id);

      const activeIds = new Set();
      let localPosition = null;
      const selfId = state.playerId;
      const selfA = selfId ? older.map.get(selfId) || newer.map.get(selfId) : null;
      const selfB = selfId ? newer.map.get(selfId) || selfA : null;
      const selfTx =
        selfA && selfB ? lerp(selfA.tx, selfB.tx, t) : null;
      const selfTy =
        selfA && selfB ? lerp(selfA.ty, selfB.ty, t) : null;
      const radiusSq = VIEW_RADIUS_TILES * VIEW_RADIUS_TILES;

      const { tile } = state.map;
      for (const id of ids) {
        const a = older.map.get(id) || newer.map.get(id);
        const b = newer.map.get(id) || a;
        if (!a || !b) continue;
        const x = (lerp(a.tx, b.tx, t) + 0.5) * tile;
        const y = (lerp(a.ty, b.ty, t) + 0.5) * tile;
        const sprite = getPlayerSprite(id);
        if (selfTx != null && selfTy != null && id !== selfId) {
          const dx = lerp(a.tx, b.tx, t) - selfTx;
          const dy = lerp(a.ty, b.ty, t) - selfTy;
          sprite.visible = dx * dx + dy * dy <= radiusSq;
        } else {
          sprite.visible = true;
        }
        if (!sprite.renderPos.ready) {
          sprite.renderPos.x = x;
          sprite.renderPos.y = y;
          sprite.renderPos.ready = true;
        } else {
        sprite.renderPos.x = smoothTowards(
          sprite.renderPos.x,
          x,
          dtMs,
          90
        );
          sprite.renderPos.y = smoothTowards(
            sprite.renderPos.y,
            y,
            dtMs,
            90
          );
        }
        sprite.position.set(sprite.renderPos.x, sprite.renderPos.y);

        const fx = b.fx ?? a.fx;
        const fy = b.fy ?? a.fy;
        if (fx !== undefined && fy !== undefined && (fx !== 0 || fy !== 0)) {
          const rot = FACING_ROTATIONS.get(`${fx},${fy}`) ?? 0;
          if (sprite.facingGraphic) {
            sprite.facingGraphic.rotation = rot;
          }
        }
        const name =
          id === state.playerId ? "" : b.name || a.name || "";
        if (sprite.label && sprite.label.text !== name) {
          sprite.label.text = name;
          if (sprite.label.anchor) {
            sprite.label.anchor.set(0.5);
          } else {
            sprite.label.position.set(-sprite.label.width / 2, -22);
          }
        }

        activeIds.add(id);
        if (id === state.playerId) {
          localPosition = { x: sprite.renderPos.x, y: sprite.renderPos.y };
        }
      }

      removeMissingPlayers(activeIds);

      if (localPosition && app) {
        if (!camera.ready) {
          camera.x = localPosition.x;
          camera.y = localPosition.y;
          camera.ready = true;
        } else {
          const smoothTimeMs = 320;
          const alpha = 1 - Math.exp(-dtMs / smoothTimeMs);
          camera.x += (localPosition.x - camera.x) * alpha;
          camera.y += (localPosition.y - camera.y) * alpha;
        }
        world.pivot.set(camera.x, camera.y);
        world.position.set(app.renderer.width / 2, app.renderer.height / 2);
      }

      updatePlacement();
    }

    async function setup() {
      const container = containerRef.current;
      if (!container) return;

      app = new Application({
        width: container.clientWidth,
        height: container.clientHeight,
        backgroundColor: COLORS.background,
        antialias: true
      });
      container.appendChild(app.view);

      world = new Container();
      grid = new Graphics();
      gridLines = new Graphics();
      terrain = new Container();
      buildingLayer = new Container();
      placementLayer = new Graphics();
      placementLayer.visible = false;
      bombsLayer = new Container();
      effectsLayer = new Container();
      playersLayer = new Container();

      drawGrid();
      drawTerrain();
      drawBuildings();

      world.addChild(grid);
      world.addChild(terrain);
      world.addChild(buildingLayer);
      world.addChild(placementLayer);
      world.addChild(effectsLayer);
      world.addChild(gridLines);
      world.addChild(bombsLayer);
      world.addChild(playersLayer);
      world.scale.set(CAMERA_ZOOM);
      app.stage.addChild(world);

      const handleResize = () => {
        if (!app || !container) return;
        app.renderer.resize(container.clientWidth, container.clientHeight);
      };

      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);

      const onKeyDown = (event) => {
        if (event.code === "KeyM" && !event.repeat) {
          setMapOpen((prev) => !prev);
          return;
        }
        if (event.code === "Escape" && mapOpenRef.current) {
          setMapOpen(false);
          return;
        }
        if (event.code === "KeyF" && !event.repeat && !chatFocusRef.current) {
          useSelectedItem();
          return;
        }
        if (event.code === "KeyR" && !event.repeat && !chatFocusRef.current) {
          const socket = socketRef.current;
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ t: "build_action" }));
          }
          return;
        }
        if (
          (event.code === "ControlLeft" || event.code === "ControlRight") &&
          !event.repeat &&
          !chatFocusRef.current
        ) {
          state.keys.slow = !state.keys.slow;
          return;
        }
        updateInputKey(event.code, true);
      };
      const onKeyUp = (event) => updateInputKey(event.code, false);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);

      // bomb placement via F only

      const baseUrl =
        import.meta.env.VITE_SERVER_URL || "ws://localhost:8080";
      const serverUrl = `${baseUrl}?token=${encodeURIComponent(token)}`;
      socket = new WebSocket(serverUrl);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        setStatus("online");
      });

      socket.addEventListener("close", (event) => {
        if (event.code === 4001) {
          setStatus("unauthorized");
          if (onAuthExpired) onAuthExpired();
          return;
        }
        setStatus("offline");
      });

      socket.addEventListener("message", (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.t === "welcome") {
          if (msg.username) {
            usernameRef.current = String(msg.username);
          }
          state.playerId = msg.id;
          mapDataRef.current.playerId = msg.id;
          state.serverTimeOffset = performance.now() - msg.time;
          if (msg.map) {
            state.map = { ...state.map, ...msg.map };
            mapDataRef.current.w = state.map.w;
            mapDataRef.current.h = state.map.h;
            mapDataRef.current.chunk = state.map.chunk || DEFAULT_MAP.chunk;
            mapDataRef.current.tiles = new Map();
            mapDataRef.current.buildings = new Map();
            loadedChunksRef.current.clear();
            exploredChunksRef.current.clear();
            chunkRequestTimeRef.current.clear();
            drawGrid();
            drawTerrain();
            drawBuildings();
            requestMapDraw();
          }
          if (msg.wallet) {
            setWallet({
              dollars: Number(msg.wallet.dollars || 0),
              coins: Number(msg.wallet.coins || 0)
            });
          }
          if (msg.hp) {
            setHp({
              current: Number(msg.hp.current || 0),
              max: Number(msg.hp.max || 0)
            });
          }
          if (msg.inventory) {
            setInventory({
              green: Number(msg.inventory.green || 0),
              blue: Number(msg.inventory.blue || 0),
              white: Number(msg.inventory.white || 0),
              red: Number(msg.inventory.red || 0),
              pink: Number(msg.inventory.pink || 0),
              cyan: Number(msg.inventory.cyan || 0)
            });
          }
          if (msg.skillConfig) {
            setSkillConfig(normalizeSkillConfig(msg.skillConfig));
          }
          if (msg.skills) {
            setSkills(msg.skills);
          }
          if (Array.isArray(msg.skillSlots)) {
            setSkillSlots(normalizeSkillSlots(msg.skillSlots));
          }
          if (Array.isArray(msg.items)) {
            applyItems(msg.items);
          }
          if (Array.isArray(msg.buildings)) {
            buildingsRef.current = msg.buildings;
            updateBuildingWindows();
          }
          if (Array.isArray(msg.explored)) {
            exploredChunksRef.current = new Set(
              msg.explored
                .map((entry) => {
                  const cx = Number(entry?.cx);
                  const cy = Number(entry?.cy);
                  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
                  return chunkKey(cx, cy);
                })
                .filter(Boolean)
            );
            if (mapOpenRef.current && hydrateCacheRef.current) {
              hydrateCacheRef.current();
            } else if (mapOpenRef.current) {
              requestMapDraw();
            }
          }
        }

        if (msg.t === "state") {
          pushSnapshot(msg);
        }

        if (msg.t === "map_chunk") {
          const cx = Number(msg.cx);
          const cy = Number(msg.cy);
          const w = Number(msg.w);
          const h = Number(msg.h);
          if (
            Number.isFinite(cx) &&
            Number.isFinite(cy) &&
            Number.isFinite(w) &&
            Number.isFinite(h) &&
            msg.tiles &&
            msg.buildings
          ) {
            const tiles = decodeBase64(msg.tiles);
            const buildings = decodeBase64(msg.buildings);
            storeChunk(mapDataRef.current.tiles, cx, cy, w, h, tiles);
            storeChunk(mapDataRef.current.buildings, cx, cy, w, h, buildings);
            loadedChunksRef.current.add(chunkKey(cx, cy));
            staleChunksRef.current.delete(chunkKey(cx, cy));
            exploredChunksRef.current.add(chunkKey(cx, cy));
            saveChunkCache(cx, cy, msg.tiles, msg.buildings);
            drawTerrainChunk(cx, cy);
            drawBuildingChunk(cx, cy);
            requestMapDraw();
          }
        }

        if (msg.t === "tile") {
          const inView = isTileWithinView(msg.x, msg.y);
          if (inView) {
            const updated = setChunkValue(
              mapDataRef.current.tiles,
              msg.x,
              msg.y,
              msg.value
            );
            if (updated) {
              drawTerrainChunk(updated.cx, updated.cy);
              requestMapDraw();
            }
          } else {
            const chunkSize = mapDataRef.current.chunk || DEFAULT_MAP.chunk;
            const cx = Math.floor(msg.x / chunkSize);
            const cy = Math.floor(msg.y / chunkSize);
            const key = chunkKey(cx, cy);
            loadedChunksRef.current.delete(key);
            staleChunksRef.current.add(key);
          }
        }

        if (msg.t === "building_place") {
          if (Array.isArray(msg.tiles)) {
            const touched = new Set();
            for (const tile of msg.tiles) {
              if (!isTileWithinView(tile.x, tile.y)) continue;
              const updated = setChunkValue(
                mapDataRef.current.buildings,
                tile.x,
                tile.y,
                tile.value
              );
              if (updated) {
                touched.add(chunkKey(updated.cx, updated.cy));
              }
            }
            for (const key of touched) {
              const [cx, cy] = key.split(",").map((v) => Number(v));
              if (Number.isFinite(cx) && Number.isFinite(cy)) {
                drawBuildingChunk(cx, cy);
              }
            }
            if (touched.size > 0) {
              requestMapDraw();
            }
          }
          if (msg.building) {
            buildingsRef.current = [...buildingsRef.current, msg.building];
            updateBuildingWindows();
          }
        }

        if (msg.t === "bomb_placed") {
          if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
            const key = `${msg.x},${msg.y}`;
            if (!bombs.has(key)) {
              const sprite = createBombSprite(msg.x, msg.y, msg.type);
              bombsLayer.addChild(sprite);
              bombs.set(key, { id: msg.id, sprite, type: msg.type });
              updatePlacement();
            }
          }
        }

        if (msg.t === "bomb_explode") {
          const key = `${msg.x},${msg.y}`;
          const entry = bombs.get(key);
          if (entry) {
            bombsLayer.removeChild(entry.sprite);
            entry.sprite.destroy();
            bombs.delete(key);
          }
          if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
            const { tile } = state.map;
            const blast = new Graphics();
            blast.lineStyle(3, 0xff8f4a, 0.9);
            if (msg.shape === "cross") {
              const r = msg.r || 1;
              const len = tile * r;
              blast.moveTo(-len, 0);
              blast.lineTo(len, 0);
              blast.moveTo(0, -len);
              blast.lineTo(0, len);
            } else {
              blast.drawCircle(0, 0, Math.max(12, tile * (msg.r || 4)));
            }
            blast.position.set((msg.x + 0.5) * tile, (msg.y + 0.5) * tile);
            effectsLayer.addChild(blast);
            effects.push({
              sprite: blast,
              age: 0,
              duration: 300,
              kind: "spark"
            });
          }
          updatePlacement();
        }

        if (msg.t === "inventory" && msg.inventory) {
          setInventory({
            green: Number(msg.inventory.green || 0),
            blue: Number(msg.inventory.blue || 0),
            white: Number(msg.inventory.white || 0),
            red: Number(msg.inventory.red || 0),
            pink: Number(msg.inventory.pink || 0),
            cyan: Number(msg.inventory.cyan || 0)
          });
        }

        if (msg.t === "drop_ok") {
          setDropOpen(false);
          resetDropValues();
          setDropError("");
        }

        if (msg.t === "drop_error") {
          const text = msg.message ? String(msg.message) : "Drop failed";
          setDropError(text);
        }

        if (msg.t === "items" && Array.isArray(msg.items)) {
          applyItems(msg.items);
        }

        if (msg.t === "hit") {
          const { tile } = state.map;
          if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
            const spark = new Graphics();
            spark.lineStyle(2, 0xffc36a, 0.9);
            spark.drawCircle(0, 0, Math.max(4, tile * 0.2));
            spark.lineStyle(2, 0xfff2b0, 0.8);
            spark.moveTo(-tile * 0.2, 0);
            spark.lineTo(tile * 0.2, 0);
            spark.position.set(
              (msg.x + 0.5) * tile,
              (msg.y + 0.5) * tile
            );
            effectsLayer.addChild(spark);
            effects.push({
              sprite: spark,
              age: 0,
              duration: 160,
              kind: "spark"
            });

            if (msg.amount && msg.amount > 0) {
              const color = crystalColor(msg.type);
              if (color !== null) {
                const text = new Text(`+${msg.amount}`, {
                  fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
                  fontSize: 14,
                  fill: color,
                  stroke: 0x0b1016,
                  strokeThickness: 3
                });
                if (text.anchor) {
                  text.anchor.set(0.5);
                }
                text.position.set(
                  (msg.x + 0.5) * tile,
                  (msg.y + 0.5) * tile - 6
                );
                effectsLayer.addChild(text);
                effects.push({
                  sprite: text,
                  age: 0,
                  duration: 600,
                  kind: "float",
                  startY: text.y
                });
              }
            }
          }
        }

        if (msg.t === "chat") {
          setChatMessages((prev) => {
            const next = [
              ...prev,
              {
                from: msg.from || "unknown",
                text: msg.msg || "",
                time: msg.time || Date.now()
              }
            ];
            return next.slice(-60);
          });
        }

        if (msg.t === "hp") {
          setHp({
            current: Number(msg.current || 0),
            max: Number(msg.max || 0)
          });
        }

        if (msg.t === "wallet") {
          setWallet({
            dollars: Number(msg.dollars || 0),
            coins: Number(msg.coins || 0)
          });
        }

        if (msg.t === "items" && Array.isArray(msg.items)) {
          applyItems(msg.items);
        }

        if (msg.t === "skills" && msg.skills) {
          setSkills(msg.skills);
        }
        if (msg.t === "skill_slots" && Array.isArray(msg.slots)) {
          setSkillSlots(normalizeSkillSlots(msg.slots));
        }

        if (msg.t === "storage_state" && msg.storage) {
          const id = String(msg.id || "");
          if (storageIdRef.current && id !== storageIdRef.current) return;
          setStorageState({
            green: Number(msg.storage.green || 0),
            blue: Number(msg.storage.blue || 0),
            white: Number(msg.storage.white || 0),
            red: Number(msg.storage.red || 0),
            pink: Number(msg.storage.pink || 0),
            cyan: Number(msg.storage.cyan || 0)
          });
        }
      });

      inputInterval = setInterval(() => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            t: "input",
            dir: currentDir(),
            ctrl: state.keys.slow,
            shift: state.keys.shift,
            mine: state.keys.mine
          })
        );
      }, 50);

      app.ticker.add(render);

      return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      };
    }

    let cleanupKeys;
    setup().then((cleanup) => {
      cleanupKeys = cleanup;
    });

    return () => {
      if (cleanupKeys) cleanupKeys();
      if (inputInterval) clearInterval(inputInterval);
      if (socket) socket.close();
      socketRef.current = null;
      if (resizeObserver) resizeObserver.disconnect();
      if (app) {
        app.destroy(true, { children: true });
      }
    };
  }, [token, onAuthExpired]);

  function submitChat(event) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ t: "chat", msg: text }));
    setChatInput("");
  }

  function requestSkillUpgrade(id) {
    if (!id) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ t: "skill_upgrade", id }));
  }

  function requestSkillSlotSet(slot, id) {
    if (slot == null || !id) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ t: "skill_slot_set", slot, id }));
  }

  function resetDropValues() {
    setDropValues({
      green: 0,
      blue: 0,
      white: 0,
      red: 0,
      pink: 0,
      cyan: 0
    });
  }

  function updateDropValue(id, value) {
    const max = inventory[id] ?? 0;
    let next = Math.floor(Number(value) || 0);
    if (!Number.isFinite(next)) next = 0;
    next = clamp(next, 0, max);
    setDropValues((prev) => ({ ...prev, [id]: next }));
  }

  function submitDrop(all = false) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    setDropError("");
    if (all) {
      socket.send(JSON.stringify({ t: "drop_crystals", all: true }));
      return;
    }
    if (dropTotal <= 0) return;
    socket.send(JSON.stringify({ t: "drop_crystals", crystals: dropValues }));
  }

  function useSelectedItem() {
    const id = selectedItemRef.current;
    if (!id) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (id === "bomb" || id === "plasmabomb") {
      const placement = placementRef.current;
      if (!placement.valid) return;
      socket.send(
        JSON.stringify({
          t: "place_bomb",
          x: placement.x,
          y: placement.y,
          id
        })
      );
      return;
    }
    if (id === "storage") {
      const placement = placementRef.current;
      if (!placement.valid) return;
      socket.send(
        JSON.stringify({
          t: "place_building",
          type: "storage",
          x: placement.x,
          y: placement.y
        })
      );
      return;
    }
    if (id === "shop") {
      const placement = placementRef.current;
      if (!placement.valid) return;
      socket.send(
        JSON.stringify({
          t: "place_building",
          type: "shop",
          x: placement.x,
          y: placement.y
        })
      );
      return;
    }
    if (id === "upgrade") {
      const placement = placementRef.current;
      if (!placement.valid) return;
      socket.send(
        JSON.stringify({
          t: "place_building",
          type: "upgrade",
          x: placement.x,
          y: placement.y
        })
      );
      return;
    }
    socket.send(JSON.stringify({ t: "use_item", id }));
  }

  function sellCrystal(id, amount = 1) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        t: "shop_sell",
        crystal: id,
        amount
      })
    );
  }

  function updateShopSell(id, value, max) {
    const numeric = Math.floor(Number(value) || 0);
    const clamped = Math.max(0, Math.min(numeric, max));
    setShopSell((prev) => ({
      ...prev,
      [id]: clamped
    }));
  }

  function updateShopBuy(id, value) {
    const numeric = Math.floor(Number(value) || 0);
    const clamped = Math.max(0, Number.isFinite(numeric) ? numeric : 0);
    setShopBuy((prev) => ({
      ...prev,
      [id]: clamped
    }));
  }

  function sellSelectedCrystals() {
    if (sellCountTotal <= 0) return;
    for (const item of SHOP_ITEMS) {
      const amount = shopSell[item.id] ?? 0;
      if (amount > 0) {
        sellCrystal(item.id, amount);
      }
    }
    setShopSell({
      green: 0,
      blue: 0,
      white: 0,
      red: 0,
      pink: 0,
      cyan: 0
    });
  }

  function updateStorageTransferValue(id, value) {
    const numeric = Math.floor(Number(value) || 0);
    const clamped = Math.max(0, Number.isFinite(numeric) ? numeric : 0);
    setStorageTransfer((prev) => ({
      ...prev,
      [id]: clamped
    }));
  }

  function moveStorageCrystal(id, dir) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const storageIdValue = storageIdRef.current;
    if (!storageIdValue) return;
    const desired = Math.floor(Number(storageTransfer[id] || 0));
    if (!Number.isFinite(desired) || desired <= 0) return;
    const max =
      dir === "deposit" ? inventory[id] ?? 0 : storageState[id] ?? 0;
    const amount = Math.min(max, desired);
    if (amount <= 0) return;
    socket.send(
      JSON.stringify({
        t: "storage_move",
        id: storageIdValue,
        crystal: id,
        amount,
        dir
      })
    );
    setStorageTransfer((prev) => ({ ...prev, [id]: 0 }));
  }

  function buySelectedCrystals() {
    if (buyCountTotal <= 0) return;
    for (const item of SHOP_ITEMS) {
      const amount = shopBuy[item.id] ?? 0;
      if (amount > 0) {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            t: "shop_buy",
            crystal: item.id,
            amount
          })
        );
      }
    }
    setShopBuy({
      green: 0,
      blue: 0,
      white: 0,
      red: 0,
      pink: 0,
      cyan: 0
    });
  }

  const sellCountTotal = SHOP_ITEMS.reduce(
    (sum, item) => sum + (shopSell[item.id] ?? 0),
    0
  );
  const buyCountTotal = SHOP_ITEMS.reduce(
    (sum, item) => sum + (shopBuy[item.id] ?? 0),
    0
  );
  const sellTotal = SHOP_ITEMS.reduce(
    (sum, item) => sum + (shopSell[item.id] ?? 0) * item.price,
    0
  );
  const buyTotal = SHOP_ITEMS.reduce(
    (sum, item) => sum + (shopBuy[item.id] ?? 0) * item.price * 2,
    0
  );

  return (
    <div className="game-wrap">
      <div ref={containerRef} className="game-wrap" />
      <div className="hud-stack">
        <div className="game-overlay">
          <div className="hud-currency">
            <div className="currency-item">
              <span className="currency-dot currency-dollar" />
              ${wallet.dollars}
            </div>
            <div className="currency-item">
              <span className="currency-dot currency-coin" />
              {wallet.coins} coins
            </div>
            <div className="currency-item hp-item">
              <span className="hp-label">HP</span>
              <span className="hp-value">
                {hp.current}/{hp.max}
              </span>
            </div>
          </div>
          <div>Status: {status}</div>
          <div>Players: {playerCount}</div>
          <div>
            X: {coords.x} Y: {coords.y}
          </div>
        </div>
        <div className="game-overlay inventory-overlay">
          <div className="inventory-header">
            <div className="inventory-title">Inventory</div>
            <button
              className="inventory-drop-btn"
              type="button"
              onClick={() => {
                resetDropValues();
                setDropError("");
                setDropOpen(true);
              }}
            >
              Drop
            </button>
          </div>
          <div className="inventory-list">
            <div className="inventory-line">
              <span className="inventory-label">Green</span>
              <span className="inventory-value crystal-green-text">
                {inventory.green}/{inventoryCapacity}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">Blue</span>
              <span className="inventory-value crystal-blue-text">
                {inventory.blue}/{inventoryCapacity}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">White</span>
              <span className="inventory-value crystal-white-text">
                {inventory.white}/{inventoryCapacity}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">Red</span>
              <span className="inventory-value crystal-red-text">
                {inventory.red}/{inventoryCapacity}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">Pink</span>
              <span className="inventory-value crystal-pink-text">
                {inventory.pink}/{inventoryCapacity}
              </span>
            </div>
            <div className="inventory-line">
              <span className="inventory-label">Cyan</span>
              <span className="inventory-value crystal-cyan-text">
                {inventory.cyan}/{inventoryCapacity}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="game-overlay items-overlay">
        <div className="items-header">
          <div className="items-title">Items</div>
          <div className="items-selected">
            {itemInventory.find((item) => item.id === selectedItemId)?.name ||
              "None"}
          </div>
        </div>
        <div className="items-grid">
          {sortedItems.map((item) => (
            <button
              key={item.id}
              className={`item-slot${
                selectedItemId === item.id ? " is-selected" : ""
              }${item.count > 0 ? "" : " is-disabled"}`}
              type="button"
              disabled={item.count <= 0}
              onClick={() =>
                setSelectedItemId((prev) => (prev === item.id ? null : item.id))
              }
            >
              <div className="item-name">{item.name}</div>
              <div className="item-count">x{item.count}</div>
            </button>
          ))}
        </div>
      </div>
      {dropOpen ? (
        <div className="storage-backdrop">
          <div className="storage-modal">
            <div className="storage-title">Drop crystals</div>
            <div className="drop-list">
              {STORAGE_ITEMS.map((item) => {
                const have = inventory[item.id] ?? 0;
                const amount = dropValues[item.id] ?? 0;
                return (
                  <div key={item.id} className="drop-row">
                    <div className="drop-info">
                      <span className={`drop-name ${item.className}`}>
                        {item.name}
                      </span>
                      <span className="drop-have">You: {have}</span>
                    </div>
                    <input
                      className="drop-input"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max={have}
                      step="1"
                      value={amount}
                      onChange={(event) =>
                        updateDropValue(item.id, event.target.value)
                      }
                    />
                  </div>
                );
              })}
            </div>
            {dropError ? (
              <div className="drop-error">{dropError}</div>
            ) : null}
            <div className="drop-actions">
              <button
                className="storage-btn"
                type="button"
                onClick={() => {
                  setDropOpen(false);
                  setDropError("");
                }}
              >
                Cancel
              </button>
              <button
                className="storage-btn"
                type="button"
                disabled={dropTotal <= 0}
                onClick={() => submitDrop(false)}
              >
                Drop selected
              </button>
              <button
                className="shop-sell"
                type="button"
                disabled={Object.values(inventory).every((v) => (v ?? 0) <= 0)}
                onClick={() => submitDrop(true)}
              >
                Drop all
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {storageOpen ? (
        <div className="storage-backdrop">
          <div className="storage-modal">
            <div className="storage-title">Storage</div>
            <div className="shop-tabs">
              <button
                className={`shop-tab${
                  storageTab === "storage" ? " is-active" : ""
                }`}
                type="button"
                onClick={() => setStorageTab("storage")}
              >
                Storage
              </button>
              {storageOwner && storageOwner === (usernameRef.current || "") ? (
                <button
                  className={`shop-tab${
                    storageTab === "manage" ? " is-active" : ""
                  }`}
                  type="button"
                  onClick={() => setStorageTab("manage")}
                >
                  Управление
                </button>
              ) : null}
            </div>
            {storageTab === "storage" ? (
              <div className="storage-list">
                {STORAGE_ITEMS.map((item) => {
                  const carry = inventory[item.id] ?? 0;
                  const stored = storageState[item.id] ?? 0;
                  const amount = storageTransfer[item.id] ?? 0;
                  return (
                    <div key={item.id} className="storage-row">
                      <div className="storage-info">
                        <span className={`storage-name ${item.className}`}>
                          {item.name}
                        </span>
                        <span className="storage-carry">You: {carry}</span>
                        <span className="storage-stored">Store: {stored}</span>
                      </div>
                      <input
                        className="storage-input"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={amount}
                        onChange={(event) =>
                          updateStorageTransferValue(item.id, event.target.value)
                        }
                      />
                      <div className="storage-actions">
                        <button
                          className="storage-btn"
                          type="button"
                          disabled={carry <= 0 || amount <= 0}
                          onClick={() => moveStorageCrystal(item.id, "deposit")}
                        >
                          Put
                        </button>
                        <button
                          className="storage-btn"
                          type="button"
                          disabled={stored <= 0 || amount <= 0}
                          onClick={() => moveStorageCrystal(item.id, "withdraw")}
                        >
                          Take
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="storage-manage" />
            )}
          </div>
        </div>
      ) : null}
      {shopOpen ? (
        <div className="storage-backdrop">
          <div className="storage-modal">
            <div className="storage-title">Shop</div>
            <div className="shop-tabs">
              <button
                className={`shop-tab${shopTab === "sell" ? " is-active" : ""}`}
                type="button"
                onClick={() => setShopTab("sell")}
              >
                Sell
              </button>
              <button
                className={`shop-tab${shopTab === "buy" ? " is-active" : ""}`}
                type="button"
                onClick={() => setShopTab("buy")}
              >
                Buy
              </button>
              {shopOwner && shopOwner === (usernameRef.current || "") ? (
                <button
                  className={`shop-tab${
                    shopTab === "manage" ? " is-active" : ""
                  }`}
                  type="button"
                  onClick={() => setShopTab("manage")}
                >
                  Управление
                </button>
              ) : null}
            </div>
            {shopTab === "sell" ? (
              <>
                <div className="shop-list">
                  {SHOP_ITEMS.map((item) => {
                    const count = inventory[item.id] ?? 0;
                    const sellCount = shopSell[item.id] ?? 0;
                    return (
                      <div key={item.id} className="shop-row">
                        <div className="shop-info">
                          <span className={`shop-name ${item.className}`}>
                            {item.name}
                          </span>
                          <span className="shop-count">x{count}</span>
                        </div>
                        <input
                          className="shop-slider"
                          type="range"
                          min="0"
                          max={count}
                          step="1"
                          value={sellCount}
                          disabled={count <= 0}
                          onChange={(event) =>
                            updateShopSell(item.id, event.target.value, count)
                          }
                        />
                        <input
                          className="shop-input"
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max={count}
                          step="1"
                          value={sellCount}
                          disabled={count <= 0}
                          onChange={(event) =>
                            updateShopSell(item.id, event.target.value, count)
                          }
                        />
                        <div className="shop-price">${item.price}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="shop-footer">
                  <div className="shop-total">Total: ${sellTotal}</div>
                  <button
                    className="shop-sell"
                    type="button"
                    disabled={sellCountTotal <= 0}
                    onClick={sellSelectedCrystals}
                  >
                    Sell
                  </button>
                </div>
              </>
            ) : (
              <>
                {shopTab === "buy" ? (
                  <>
                    <div className="shop-list">
                      {SHOP_ITEMS.map((item) => {
                        const count = inventory[item.id] ?? 0;
                        const buyCount = shopBuy[item.id] ?? 0;
                        return (
                          <div key={item.id} className="shop-row is-buy">
                            <div className="shop-info">
                              <span className={`shop-name ${item.className}`}>
                                {item.name}
                              </span>
                              <span className="shop-count">x{count}</span>
                            </div>
                            <input
                              className="shop-input"
                              type="number"
                              inputMode="numeric"
                              min="0"
                              step="1"
                              value={buyCount}
                              onChange={(event) =>
                                updateShopBuy(item.id, event.target.value)
                              }
                            />
                            <div className="shop-price">${item.price * 2}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="shop-footer">
                      <div className="shop-total">Total: ${buyTotal}</div>
                      <button
                        className="shop-sell"
                        type="button"
                        disabled={buyCountTotal <= 0}
                        onClick={buySelectedCrystals}
                      >
                        Buy
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="shop-manage" />
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
      {upgradeOpen ? (
        <div className="storage-backdrop">
          <div className="storage-modal">
            <div className="storage-title">Ап</div>
            <div className="shop-tabs">
              <button
                className={`shop-tab${
                  upgradeTab === "upgrade" ? " is-active" : ""
                }`}
                type="button"
                onClick={() => setUpgradeTab("upgrade")}
              >
                Ап
              </button>
              {upgradeOwner && upgradeOwner === (usernameRef.current || "") ? (
                <button
                  className={`shop-tab${
                    upgradeTab === "manage" ? " is-active" : ""
                  }`}
                  type="button"
                  onClick={() => setUpgradeTab("manage")}
                >
                  Управление
                </button>
              ) : null}
            </div>
            {upgradeTab === "manage" ? (
              <div className="upgrade-manage" />
            ) : (
              <div className="upgrade-body">
                <div className="upgrade-ring">
                  <div className="skill-ring">
                    {Array.from({ length: 20 }).map((_, index) => {
                      const angle = (index / 20) * Math.PI * 2 - Math.PI / 2;
                      const radius = 98;
                      const x = 110 + radius * Math.cos(angle);
                      const y = 110 + radius * Math.sin(angle);
                      const slotSkillId = skillSlots[index];
                      const slotSkill = slotSkillId
                        ? skillConfig.find((skill) => skill.id === slotSkillId)
                        : null;
                      const isSelected = selectedSlotIndex === index;
                      return (
                        <button
                          key={`slot-${index}`}
                          className={`skill-ring-slot${
                            slotSkill ? " has-skill" : ""
                          }${isSelected ? " is-selected" : ""}`}
                          type="button"
                          style={{ left: `${x}px`, top: `${y}px` }}
                          onClick={() => {
                            setSelectedSlotIndex((prev) =>
                              prev === index ? null : index
                            );
                            if (!slotSkill) {
                              setSlotCandidateId(null);
                            }
                          }}
                        >
                          {slotSkill ? (
                            <span className="skill-ring-slot-label">
                              {slotSkill.short || "?"}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                    <div className="skill-core">
                      {visibleSkills.map((skill, index) => {
                        const angle = (index / 5) * Math.PI * 2 - Math.PI / 2;
                        const radius = 52;
                        const x = 70 + radius * Math.cos(angle);
                        const y = 70 + radius * Math.sin(angle);
                        const level = skills[skill.id]?.level ?? 0;
                        const isSelected =
                          selectedSlotIndex === null &&
                          skill.id === activeCoreSkill?.id;
                        return (
                          <button
                            key={skill.id}
                            className={`skill-node${
                              isSelected ? " is-selected" : ""
                            }${skill.locked ? " is-locked" : ""}`}
                            type="button"
                            onClick={() => {
                              setSelectedSkillId(skill.id);
                              setSelectedSlotIndex(null);
                            }}
                            style={{ left: `${x}px`, top: `${y}px` }}
                          >
                            <div className="skill-node-label">
                              {skill.short || "?"}
                            </div>
                            <div className="skill-node-level">Lv {level}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="upgrade-panel">
                  {selectedSlotIndex !== null && !selectedSlotSkill ? (
                    <>
                      <div className="upgrade-skill-title">Выбор слота</div>
                      <div className="slot-skill-list">
                        {slotSkills
                          .filter((skill) => !skillSlots.includes(skill.id))
                          .map((skill) => {
                          const available = isSkillAvailable(skill);
                          const isSelected = slotCandidateId === skill.id;
                          return (
                            <button
                              key={skill.id}
                              className={`slot-skill-item${
                                available ? " is-available" : " is-locked"
                              }${isSelected ? " is-selected" : ""}`}
                              type="button"
                              onClick={() => setSlotCandidateId(skill.id)}
                            >
                              <span className="slot-skill-name">
                                {skill.name}
                              </span>
                              <span className="slot-skill-short">
                                {skill.short}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="slot-skill-desc">
                        {slotCandidateSkill
                          ? slotCandidateSkill.desc
                          : "Выберите навык справа, чтобы увидеть описание."}
                      </div>
                      <button
                        className="upgrade-btn"
                        type="button"
                        disabled={!canInstallSlotSkill}
                        onClick={() => {
                          if (!slotCandidateSkill) return;
                          requestSkillSlotSet(
                            selectedSlotIndex,
                            slotCandidateSkill.id
                          );
                          setSlotCandidateId(null);
                        }}
                      >
                        Установить
                      </button>
                    </>
                  ) : activeSkill ? (
                    <>
                      <div className="upgrade-skill-title">
                        {activeSkill.name}
                      </div>
                      <div className="upgrade-skill-desc">
                        {activeSkill.desc}
                      </div>
                      <div className="upgrade-skill-stats">
                        <div>Уровень: {activeSkillState.level}</div>
                        <div>
                          Итого: {formatSkillTotal(activeSkill, activeSkillState.level)}
                        </div>
                        <div>
                          Опыт:{" "}
                          {activeSkill.locked
                            ? "—"
                            : `${activeSkillState.xp} / ${activeSkillNeed}`}
                        </div>
                        <div>
                          Стоимость:{" "}
                          {activeSkill.locked
                            ? "—"
                            : `$${activeSkillCost}`}
                        </div>
                      </div>
                      <button
                        className="upgrade-btn"
                        type="button"
                        disabled={!canUpgradeSkill}
                        onClick={() => requestSkillUpgrade(activeSkill.id)}
                      >
                        {activeSkill.locked ? "Скоро" : "Улучшить"}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
      <div className={`chat-panel${chatOpen ? "" : " is-collapsed"}`}>
        <div className="chat-header">
          <div className="chat-title">Chat</div>
          <button
            className="chat-toggle"
            type="button"
            onClick={() => setChatOpen((prev) => !prev)}
          >
            {chatOpen ? "Hide" : "Show"}
          </button>
        </div>
        <div className="chat-messages">
          {chatMessages.map((msg, index) => (
            <div key={`${msg.time}-${index}`} className="chat-line">
              <span className="chat-name">{msg.from}:</span>
              <span className="chat-text">{msg.text}</span>
            </div>
          ))}
        </div>
        {chatOpen ? (
          <form className="chat-input-row" onSubmit={submitChat}>
            <input
              className="chat-input"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onFocus={() => setChatFocused(true)}
              onBlur={() => setChatFocused(false)}
              placeholder="Type message..."
              maxLength={160}
            />
          </form>
        ) : null}
      </div>
      {mapOpen ? (
        <div
          className={`world-map${mapPanning ? " is-panning" : ""}`}
          ref={mapWrapRef}
          onMouseDown={handleMapMouseDown}
          onMouseMove={handleMapMouseMove}
          onMouseUp={handleMapMouseUp}
          onMouseLeave={handleMapMouseLeave}
          onWheel={handleMapWheel}
        >
          <canvas ref={mapCanvasRef} className="map-canvas" />
          <div className="map-header">
            <div className="map-hint">
              M or Esc to close / Wheel to zoom / Drag to pan
            </div>
            <div className="map-coords">
              <span className="map-coord">
                You: X {coords.x} Y {coords.y}
              </span>
              <span className="map-coord map-coord-hover">
                Hover:{" "}
                {mapHover.inside
                  ? `X ${mapHover.x} Y ${mapHover.y}`
                  : "X -- Y --"}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
