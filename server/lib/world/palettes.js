const { TILE_TYPES } = require("../config");

const palettes = {
  starter: {
    primary: TILE_TYPES.rock,
    materials: [
      { type: TILE_TYPES.rock, weight: 1 },
      { type: TILE_TYPES.crystalGreen, weight: 0.7 },
      { type: TILE_TYPES.crystalBlue, weight: 0.55 },
      { type: TILE_TYPES.sand, weight: 0.3 },
      { type: TILE_TYPES.semiMagneticRock, weight: 0.2 }
    ]
  },
  metal: {
    primary: TILE_TYPES.reinforcedRock,
    materials: [
      { type: TILE_TYPES.reinforcedRock, weight: 1 },
      { type: TILE_TYPES.ironRock, weight: 0.8 },
      { type: TILE_TYPES.steelRock, weight: 0.45 },
      { type: TILE_TYPES.crystalWhite, weight: 0.45 },
      { type: TILE_TYPES.crystalRed, weight: 0.35 },
      { type: TILE_TYPES.magneticRock, weight: 0.32 }
    ]
  },
  acid: {
    primary: TILE_TYPES.acidRock,
    materials: [
      { type: TILE_TYPES.acidRock, weight: 1 },
      { type: TILE_TYPES.slimeRock, weight: 0.72 },
      { type: TILE_TYPES.corrosiveRock, weight: 0.58 },
      { type: TILE_TYPES.radioactiveRock, weight: 0.34 },
      { type: TILE_TYPES.crystalCyan, weight: 0.36 },
      { type: TILE_TYPES.magma, weight: 0.18 }
    ]
  },
  crystal: {
    primary: TILE_TYPES.crystalPink,
    materials: [
      { type: TILE_TYPES.crystalWhite, weight: 0.55 },
      { type: TILE_TYPES.crystalRed, weight: 0.5 },
      { type: TILE_TYPES.crystalPink, weight: 1 },
      { type: TILE_TYPES.crystalCyan, weight: 0.8 },
      { type: TILE_TYPES.crystalBlue, weight: 0.4 },
      { type: TILE_TYPES.blackRock, weight: 0.18 }
    ]
  }
};

module.exports = { palettes };
