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

export const TILE_BASE_HP = {
  [TILE_TYPES.rock]: 3,
  [TILE_TYPES.crystalGreen]: 6,
  [TILE_TYPES.crystalBlue]: 6,
  [TILE_TYPES.crystalWhite]: 10,
  [TILE_TYPES.crystalRed]: 10,
  [TILE_TYPES.crystalPink]: 10,
  [TILE_TYPES.crystalCyan]: 6,
  [TILE_TYPES.semiMagneticRock]: 20,
  [TILE_TYPES.magneticRock]: 50,
  [TILE_TYPES.acidRock]: 50,
  [TILE_TYPES.reinforcedRock]: 400,
  [TILE_TYPES.ironRock]: 1000,
  [TILE_TYPES.steelRock]: 2000,
  [TILE_TYPES.slimeRock]: 150,
  [TILE_TYPES.corrosiveRock]: 250,
  [TILE_TYPES.radioactiveRock]: 500,
  [TILE_TYPES.sand]: 3,
  [TILE_TYPES.steelSand]: 10,
  [TILE_TYPES.magma]: 5,
  [TILE_TYPES.liveCrystalBlue]: 10,
  [TILE_TYPES.liveCrystalWhite]: 10,
  [TILE_TYPES.liveCrystalPink]: 10,
  [TILE_TYPES.liveCrystalRed]: 10,
  [TILE_TYPES.liveCrystalCyan]: 10,
  [TILE_TYPES.liveCrystalRainbow]: 30,
  [TILE_TYPES.buildGreen]: 5,
  [TILE_TYPES.buildYellow]: 55,
  [TILE_TYPES.buildRed]: 155,
  [TILE_TYPES.dropBox]: 1
};

export const TILE_DISPLAY = {
  [TILE_TYPES.empty]: { name: "Empty", color: "#0b1016" },
  [TILE_TYPES.rock]: { name: "Rock", color: "#2b0f4d" },
  [TILE_TYPES.crystalGreen]: { name: "Green Crystal", color: "#38d86b" },
  [TILE_TYPES.crystalBlue]: { name: "Blue Crystal", color: "#4da3ff" },
  [TILE_TYPES.crystalWhite]: { name: "White Crystal", color: "#f0f4ff" },
  [TILE_TYPES.crystalRed]: { name: "Red Crystal", color: "#ff5d5d" },
  [TILE_TYPES.crystalPink]: { name: "Pink Crystal", color: "#ff7fd6" },
  [TILE_TYPES.crystalCyan]: { name: "Cyan Crystal", color: "#5ee9ff" },
  [TILE_TYPES.blackRock]: { name: "Black Rock", color: "#0b0b0f" },
  [TILE_TYPES.redRock]: { name: "Red Rock", color: "#7a0f0f" },
  [TILE_TYPES.buildGreen]: { name: "Green Build Block", color: "#3bd97a" },
  [TILE_TYPES.buildYellow]: { name: "Yellow Build Block", color: "#f9c74f" },
  [TILE_TYPES.buildRed]: { name: "Red Build Block", color: "#ff6b6b" },
  [TILE_TYPES.dropBox]: { name: "Drop Box", color: "#d4b468" },
  [TILE_TYPES.semiMagneticRock]: { name: "Semi-Magnetic Rock", color: "#5f4b2b" },
  [TILE_TYPES.magneticRock]: { name: "Magnetic Rock", color: "#7f6816" },
  [TILE_TYPES.acidRock]: { name: "Acid Rock", color: "#1d4f2f" },
  [TILE_TYPES.reinforcedRock]: { name: "Reinforced Rock", color: "#3a272c" },
  [TILE_TYPES.ironRock]: { name: "Iron Rock", color: "#2d3135" },
  [TILE_TYPES.steelRock]: { name: "Steel Rock", color: "#1e2125" },
  [TILE_TYPES.slimeRock]: { name: "Slime Rock", color: "#2f6f44" },
  [TILE_TYPES.corrosiveRock]: { name: "Corrosive Rock", color: "#74d44f" },
  [TILE_TYPES.radioactiveRock]: { name: "Radioactive Rock", color: "#9dff2f" },
  [TILE_TYPES.sand]: { name: "Sand", color: "#d4b24a" },
  [TILE_TYPES.steelSand]: { name: "Steel Sand", color: "#7fc9ff" },
  [TILE_TYPES.magma]: { name: "Magma", color: "#6a1b08" },
  [TILE_TYPES.liveCrystalBlue]: { name: "Blue Living Crystal", color: "#2e63ff" },
  [TILE_TYPES.liveCrystalWhite]: { name: "White Living Crystal", color: "#fff2a8" },
  [TILE_TYPES.liveCrystalPink]: { name: "Purple Living Crystal", color: "#a85cff" },
  [TILE_TYPES.liveCrystalRed]: { name: "Red Living Crystal", color: "#ff3f52" },
  [TILE_TYPES.liveCrystalCyan]: { name: "Cyan Living Crystal", color: "#56f0ff" },
  [TILE_TYPES.hypnoRock]: { name: "Hypno Rock", color: "#15203a" },
  [TILE_TYPES.liveCrystalRainbow]: { name: "Rainbow Living Crystal", color: "#ffcf5a" }
};

export const FACING_ROTATIONS = new Map([
  ["0,-1", 0],
  ["1,0", Math.PI / 2],
  ["0,1", Math.PI],
  ["-1,0", -Math.PI / 2]
]);


