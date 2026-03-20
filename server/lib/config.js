const BASE_MOVE_TILES_PER_SEC = 10;
const BASE_HP = 100;
const BASE_INVENTORY_CAPACITY = 100;
const BASE_MINE_DAMAGE = 1;
const BASE_MAX_DEPTH_TILES = 100;
const BASE_SPAWN_TX = 1;
const BASE_SPAWN_TY = 1;
const DEPTH_PER_LEVEL = 100;
const DEPTH_OVERLOAD_INTERVAL_MS = 5000;

const TICK_RATE = 20;
const MINE_HITS_PER_SEC = 4;
const MINE_COOLDOWN_MS = 1000 / MINE_HITS_PER_SEC;
const CHAT_MAX_LEN = 160;
const BOMB_DELAY_MS = 5000;
const BOMB_DAMAGE = 30;
const VIEW_RADIUS_TILES = 128;
const BUILDING_MAX_HP = 1000;
const BUILDING_DESTROY_TIMEOUT_MS = 5 * 60 * 1000;
const TELEPORT_PRICE = 100;
const TELEPORT_RANGE = 1000;
const LIVE_CRYSTAL_GROWTH_MS = 2 * 60 * 1000;

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
  upgrade: 3,
  respawn: 4,
  teleport: 5
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
  dropBox: 13,
  semiMagneticRock: 14,
  magneticRock: 15,
  acidRock: 16,
  reinforcedRock: 17,
  ironRock: 18,
  steelRock: 19,
  slimeRock: 20,
  corrosiveRock: 21,
  radioactiveRock: 22,
  sand: 23,
  steelSand: 24,
  magma: 25,
  liveCrystalBlue: 26,
  liveCrystalWhite: 27,
  liveCrystalPink: 28,
  liveCrystalRed: 29,
  liveCrystalCyan: 30,
  hypnoRock: 31,
  liveCrystalRainbow: 32
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
  { id: "storage", name: "Storage", column: "item_storage" },
  { id: "shop", name: "Shop", column: "item_shop" },
  { id: "respawn", name: "Respawn", column: "item_respawn" },
  { id: "upgrade", name: "Upgrade", column: "item_upgrade" },
  { id: "teleport", name: "Teleport", column: "item_teleport" },
  { id: "turret", name: "Turret", column: "item_turret" },
  { id: "clan_hall", name: "Clan Hall", column: "item_clan_hall" },
  { id: "geopak_empty", name: "Geopak", column: "item_geopak_empty" },
  { id: "geopak_blue", name: "Geopak: Blue Living", column: "item_geopak_blue" },
  { id: "geopak_white", name: "Geopak: White Living", column: "item_geopak_white" },
  { id: "geopak_pink", name: "Geopak: Pink Living", column: "item_geopak_pink" },
  { id: "geopak_red", name: "Geopak: Red Living", column: "item_geopak_red" },
  { id: "geopak_cyan", name: "Geopak: Cyan Living", column: "item_geopak_cyan" },
  { id: "geopak_rainbow", name: "Geopak: Rainbow Living", column: "item_geopak_rainbow" },
  { id: "geopak_hypno", name: "Geopak: Hypno Rock", column: "item_geopak_hypno" }
];

const BOMB_TYPES = {
  bomb: {
    radius: 4,
    shape: "circle",
    breaksRedRock: false,
    breaksBuiltBlocks: true,
    breaksTerrain: true,
    playerDamage: BOMB_DAMAGE,
    buildingDamage: 0
  },
  plasmabomb: {
    radius: 1,
    shape: "cross",
    breaksRedRock: true,
    breaksBuiltBlocks: true,
    breaksTerrain: true,
    playerDamage: BOMB_DAMAGE,
    buildingDamage: 0
  },
  electrobomb: {
    radius: 7,
    shape: "circle",
    breaksRedRock: false,
    breaksBuiltBlocks: false,
    breaksTerrain: false,
    playerDamage: 100,
    buildingDamage: 10
  }
};

const BOMB_ITEMS = new Set(Object.keys(BOMB_TYPES));
const BUILDING_ITEMS = new Set(["storage", "shop", "respawn", "upgrade", "teleport"]);

const TILE_HP = new Map([
  [TILE_TYPES.rock, 3],
  [TILE_TYPES.crystalGreen, 6],
  [TILE_TYPES.crystalBlue, 6],
  [TILE_TYPES.crystalWhite, 10],
  [TILE_TYPES.crystalRed, 10],
  [TILE_TYPES.crystalPink, 10],
  [TILE_TYPES.crystalCyan, 6],
  [TILE_TYPES.semiMagneticRock, 20],
  [TILE_TYPES.magneticRock, 50],
  [TILE_TYPES.acidRock, 50],
  [TILE_TYPES.reinforcedRock, 400],
  [TILE_TYPES.ironRock, 1000],
  [TILE_TYPES.steelRock, 2000],
  [TILE_TYPES.slimeRock, 150],
  [TILE_TYPES.corrosiveRock, 250],
  [TILE_TYPES.radioactiveRock, 500],
  [TILE_TYPES.sand, 3],
  [TILE_TYPES.steelSand, 10],
  [TILE_TYPES.magma, 5],
  [TILE_TYPES.liveCrystalBlue, 10],
  [TILE_TYPES.liveCrystalWhite, 10],
  [TILE_TYPES.liveCrystalPink, 10],
  [TILE_TYPES.liveCrystalRed, 10],
  [TILE_TYPES.liveCrystalCyan, 10],
  [TILE_TYPES.liveCrystalRainbow, 30],
  [TILE_TYPES.buildGreen, 5],
  [TILE_TYPES.buildYellow, 55],
  [TILE_TYPES.buildRed, 155],
  [TILE_TYPES.dropBox, 1]
]);

const SKILL_DEFS = [
  {
    id: "hp",
    name: "Health",
    short: "HP",
    desc: "+1 max HP per level",
    xpBase: 8,
    xpGrowth: 4,
    dollarBase: 120,
    dollarGrowth: 60,
    locked: false
  },
  {
    id: "mining",
    name: "Mining",
    short: "DIG",
    desc: "+0.1 mining damage per hit",
    xpBase: 6,
    xpGrowth: 3,
    dollarBase: 140,
    dollarGrowth: 70,
    locked: false
  },
  {
    id: "move",
    name: "Speed",
    short: "SPD",
    desc: "+1% movement speed per level",
    xpBase: 6,
    xpGrowth: 3,
    dollarBase: 130,
    dollarGrowth: 65,
    locked: false
  },
  {
    id: "inventory",
    name: "Inventory",
    short: "BAG",
    desc: "+100 capacity for each crystal type per level",
    xpBase: 8,
    xpGrowth: 4,
    dollarBase: 160,
    dollarGrowth: 80,
    locked: false
  },
  {
    id: "depth",
    name: "Depth",
    short: "DEP",
    desc: "+100 safe depth per level",
    xpBase: 8,
    xpGrowth: 4,
    dollarBase: 170,
    dollarGrowth: 85,
    locked: false
  },
  {
    id: "build1",
    name: "Builder I",
    short: "B1",
    desc: "Build green blocks. Block HP: 5 +1/level. Cost: 3 green, reduced by 0.01/level down to 1.",
    xpBase: 8,
    xpGrowth: 4,
    dollarBase: 140,
    dollarGrowth: 70,
    locked: false,
    slotOnly: true
  },
  {
    id: "build2",
    name: "Builder II",
    short: "B2",
    desc: "Upgrade a green block into a yellow block. Bonus HP: 50 +1/level. Cost: green + white crystals.",
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
    name: "Builder III",
    short: "B3",
    desc: "Upgrade a yellow block into a red block. Bonus HP: 100 +1/level. Cost: green, blue, white, and red crystals.",
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
    name: "Demolisher",
    short: "DMS",
    desc: "+0.5 damage against built blocks per level",
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
  BASE_SPAWN_TX,
  BASE_SPAWN_TY,
  DEPTH_PER_LEVEL,
  DEPTH_OVERLOAD_INTERVAL_MS,
  TICK_RATE,
  MINE_HITS_PER_SEC,
  MINE_COOLDOWN_MS,
  CHAT_MAX_LEN,
  BOMB_DELAY_MS,
  BOMB_DAMAGE,
  VIEW_RADIUS_TILES,
  BUILDING_MAX_HP,
  BUILDING_DESTROY_TIMEOUT_MS,
  TELEPORT_PRICE,
  TELEPORT_RANGE,
  LIVE_CRYSTAL_GROWTH_MS,
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


















