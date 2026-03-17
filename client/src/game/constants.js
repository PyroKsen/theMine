export const DEFAULT_MAP = { w: 1000, h: 1000, tile: 32, chunk: 64 };
export const INTERPOLATION_DELAY = 100; // ms
export const CAMERA_ZOOM = 0.8;
export const VIEW_RADIUS_TILES = 128;

export const COLORS = {
  background: 0x0b1016,
  grid: 0x2a3a4f,
  rock: 0x2b0f4d,
  facing: 0xf1f5ff,
  name: 0xe8eef5,
  nameStroke: 0x0b1016,
  player: 0x4cc2ff,
  playerSelf: 0x53f5a5
};

export const SHOP_ITEMS = [
  { id: "green", name: "Green", price: 8, className: "crystal-green-text" },
  { id: "blue", name: "Blue", price: 12, className: "crystal-blue-text" },
  { id: "white", name: "White", price: 20, className: "crystal-white-text" },
  { id: "red", name: "Red", price: 15, className: "crystal-red-text" },
  { id: "pink", name: "Pink", price: 40, className: "crystal-pink-text" },
  { id: "cyan", name: "Cyan", price: 60, className: "crystal-cyan-text" }
];

export const STORAGE_ITEMS = [
  { id: "green", name: "Green", className: "crystal-green-text" },
  { id: "blue", name: "Blue", className: "crystal-blue-text" },
  { id: "white", name: "White", className: "crystal-white-text" },
  { id: "red", name: "Red", className: "crystal-red-text" },
  { id: "pink", name: "Pink", className: "crystal-pink-text" },
  { id: "cyan", name: "Cyan", className: "crystal-cyan-text" }
];

export const BASE_INVENTORY_CAPACITY = 100;
export const BASE_MAX_DEPTH_TILES = 100;
export const DEPTH_PER_LEVEL = 100;

export const DEFAULT_SKILL_CONFIG = [
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

export const TILE_TYPES = {
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
  acidRock: 16
};

export const FACING_ROTATIONS = new Map([
  ["0,-1", 0],
  ["1,0", Math.PI / 2],
  ["0,1", Math.PI],
  ["-1,0", -Math.PI / 2]
]);




