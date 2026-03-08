const BASE_MOVE_TILES_PER_SEC = 10;
const BASE_HP = 100;
const BASE_INVENTORY_CAPACITY = 100;
const BASE_MINE_DAMAGE = 1;
const BASE_MAX_DEPTH_TILES = 100;
const DEPTH_PER_LEVEL = 100;
const DEPTH_OVERLOAD_INTERVAL_MS = 5000;

const TICK_RATE = 20;
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
  redRock: 9,
  buildGreen: 10,
  buildYellow: 11,
  buildRed: 12,
  dropBox: 13
};

const CRYSTAL_TILE_TO_COLOR = new Map([
  [TILE_TYPES.crystalGreen, "green"],
  [TILE_TYPES.crystalBlue, "blue"],
  [TILE_TYPES.crystalWhite, "white"],
  [TILE_TYPES.crystalRed, "red"],
  [TILE_TYPES.crystalPink, "pink"],
  [TILE_TYPES.crystalCyan, "cyan"]
]);

const ITEM_DEFS = [
  { id: "medkit", name: "Medkit", column: "item_medkit" },
  { id: "bomb", name: "Bomb", column: "item_bomb" },
  { id: "plasmabomb", name: "Plasmabomb", column: "item_plasmabomb" },
  { id: "electrobomb", name: "Electrobomb", column: "item_electrobomb" },
  { id: "storage", name: "РЎРєР»Р°Рґ", column: "item_storage" },
  { id: "shop", name: "РњР°РіР°Р·РёРЅ", column: "item_shop" },
  { id: "respawn", name: "Р РµСЃРїР°РІРЅ", column: "item_respawn" },
  { id: "upgrade", name: "РђРї", column: "item_upgrade" },
  { id: "turret", name: "РџСѓС€РєР°", column: "item_turret" },
  { id: "clan_hall", name: "РљР»Р°РЅРѕРІРѕРµ Р·РґР°РЅРёРµ", column: "item_clan_hall" }
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
  [TILE_TYPES.crystalCyan, 6],
  [TILE_TYPES.buildGreen, 5],
  [TILE_TYPES.buildYellow, 55],
  [TILE_TYPES.buildRed, 155],
  [TILE_TYPES.dropBox, 1]
]);

const SKILL_DEFS = [
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

module.exports = {
  BASE_MOVE_TILES_PER_SEC,
  BASE_HP,
  BASE_INVENTORY_CAPACITY,
  BASE_MINE_DAMAGE,
  BASE_MAX_DEPTH_TILES,
  DEPTH_PER_LEVEL,
  DEPTH_OVERLOAD_INTERVAL_MS,
  TICK_RATE,
  MINE_HITS_PER_SEC,
  MINE_COOLDOWN_MS,
  CHAT_MAX_LEN,
  BOMB_DELAY_MS,
  BOMB_DAMAGE,
  VIEW_RADIUS_TILES,
  CRYSTAL_PRICES,
  BUILDING_TYPES,
  MAP_W,
  MAP_H,
  TILE_SIZE,
  CHUNK_SIZE,
  TILE_TYPES,
  CRYSTAL_TILE_TO_COLOR,
  ITEM_DEFS,
  BOMB_TYPES,
  BOMB_ITEMS,
  BUILDING_ITEMS,
  TILE_HP,
  SKILL_DEFS
};
