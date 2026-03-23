const { MAP_W, MAP_H, TILE_TYPES } = require("../config");
const { layeredNoise, hashNoise, chooseWinningType } = require("./noise");
const { palettes } = require("./palettes");
const { buildMacroSectors } = require("./sectors");
const { createFillLogic } = require("./fill");
const { createShellLogic } = require("./shells");

function layerIndex(x, y) {
  return y * MAP_W + x;
}

function fillRect(layerSetter, x0, y0, w, h, type) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
      layerSetter(x, y, type);
    }
  }
}

function rotateSectorPoint(sector, x, y, scale = 1, secondary = false) {
  const dx = (x - sector.x) * scale * (secondary ? sector.stretchY : sector.stretchX);
  const dy = (y - sector.y) * scale * (secondary ? sector.stretchX : sector.stretchY);
  const cos = secondary ? sector.cos2 : sector.cos;
  const sin = secondary ? sector.sin2 : sector.sin;
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos
  };
}

function createMacroWorld(setTile) {
  const sectors = buildMacroSectors();
  const ownership = new Array(MAP_W * MAP_H).fill(-1);
  const boundaryDelta = new Float32Array(MAP_W * MAP_H);
  const boundaryRival = new Int32Array(MAP_W * MAP_H).fill(-1);

  function sectorField(sector, x, y) {
    const cellBias = layeredNoise(x * 0.65, y * 0.65, sector.gx * 17 + sector.gy * 29 + 5) - 0.5;
    const warpX = (layeredNoise(x * 0.18, y * 0.18, sector.gx + 90) - 0.5) * 52;
    const warpY = (layeredNoise(x * 0.18, y * 0.18, sector.gy + 140) - 0.5) * 52;
    const localA = rotateSectorPoint(sector, x + warpX, y + warpY, 1, false);
    const localB = rotateSectorPoint(sector, x - warpY * 0.35, y + warpX * 0.35, 1, true);
    const ax = Math.abs(localA.x);
    const ay = Math.abs(localA.y);
    const bx = Math.abs(localB.x);
    const by = Math.abs(localB.y);
    let distanceMetric = 0;
    if (sector.shapeKind === "pocket") {
      distanceMetric = ax * 0.95 + ay * 1.35 + Math.max(ax, ay) * 0.35;
    } else if (sector.shapeKind === "narrow") {
      distanceMetric = ax * 0.7 + ay * 1.55 + bx * 0.15;
    } else if (sector.shapeKind === "stretched") {
      distanceMetric = ax * 1.28 + ay * 0.72 + by * 0.2;
    } else if (sector.shapeKind === "lobed") {
      distanceMetric = Math.max(ax, ay) * 0.78 + Math.min(ax, ay) * 0.46;
    } else {
      distanceMetric = ax + ay * 0.98;
    }
    const angle = Math.atan2(localA.y, localA.x);
    const radialNoise = layeredNoise(localA.x * 0.035, localA.y * 0.035, sector.gx * 37 + sector.gy * 41);
    const lobeWave = Math.sin(angle * sector.lobeFreq + sector.angle2 * 1.7) * sector.lobeAmp;
    const pinchWave = Math.cos(angle * (sector.lobeFreq + 1) - sector.angle) * (sector.radius * sector.pinch);
    const jagged = (radialNoise - 0.5) * (32 + sector.lobeAmp * 0.22);
    const shapeOffset = sector.shapeKind === "lobed"
      ? lobeWave + pinchWave * 0.45
      : sector.shapeKind === "narrow"
      ? pinchWave * 0.85
      : sector.shapeKind === "stretched"
      ? pinchWave * 0.6 + lobeWave * 0.18
      : sector.shapeKind === "pocket"
      ? -Math.abs(pinchWave) * 0.45
      : pinchWave * 0.3;
    const base = sector.radius - distanceMetric + shapeOffset + jagged;
    return base + cellBias * 105;
  }

  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      let bestIndex = -1;
      let bestValue = -Infinity;
      let secondIndex = -1;
      let secondValue = -Infinity;
      for (let i = 0; i < sectors.length; i += 1) {
        const value = sectorField(sectors[i], x, y);
        if (value > bestValue) {
          secondValue = bestValue;
          secondIndex = bestIndex;
          bestValue = value;
          bestIndex = i;
        } else if (value > secondValue) {
          secondValue = value;
          secondIndex = i;
        }
      }
      const idx = layerIndex(x, y);
      ownership[idx] = bestIndex;
      boundaryDelta[idx] = bestValue - secondValue;
      boundaryRival[idx] = secondIndex;
    }
  }


  const { dirtyField, dirtyFillType } = createFillLogic({ TILE_TYPES, rotateSectorPoint });
  const { boundaryStrength, resolveShellTile } = createShellLogic({
    MAP_W,
    MAP_H,
    TILE_TYPES,
    sectors,
    ownership,
    boundaryDelta,
    boundaryRival,
    layerIndex,
    dirtyField,
    dirtyFillType
  });

  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      const sector = sectors[ownership[layerIndex(x, y)]];
      if (!sector) continue;
      if (sector.redMacro) {
        setTile(x, y, TILE_TYPES.redRock);
        continue;
      }
      setTile(x, y, dirtyFillType(sector, x, y));
    }
  }

  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      const sector = sectors[ownership[layerIndex(x, y)]];
      if (!sector || sector.redMacro) continue;
      const shellStrength = boundaryStrength(x, y);
      if (shellStrength > 0.01) {
        const shellTile = resolveShellTile(x, y);
        if (shellTile !== null) {
          setTile(x, y, shellTile);
        }
      }
    }
  }

  function carveRedMacroMicrostructures() {
    for (const sector of sectors) {
      if (!sector.redMacro) continue;
      const pathCount = 2 + Math.floor(hashNoise(sector.gx, sector.gy, 500) * 3);
      for (let p = 0; p < pathCount; p += 1) {
        let x = Math.max(10, Math.min(MAP_W - 11, Math.floor(sector.x + (hashNoise(sector.gx, p, 520) - 0.5) * 110)));
        let y = Math.max(10, Math.min(MAP_H - 11, Math.floor(sector.y + (hashNoise(sector.gy, p, 560) - 0.5) * 110)));
        const steps = 180 + Math.floor(hashNoise(sector.gx, p, 590) * 140);
        for (let step = 0; step < steps; step += 1) {
          const turn = layeredNoise(x, y, sector.gx * 17 + p * 41) * Math.PI * 2;
          const dx = Math.round(Math.cos(turn));
          const dy = Math.round(Math.sin(turn));
          x = Math.max(10, Math.min(MAP_W - 11, x + dx));
          y = Math.max(10, Math.min(MAP_H - 11, y + dy));
          const owner = sectors[ownership[layerIndex(x, y)]];
          if (!owner || owner.id !== sector.id) continue;
          const radius = 1 + Math.floor(hashNoise(x, y, sector.gx * 97 + step) * 3);
          for (let oy = -radius; oy <= radius; oy += 1) {
            for (let ox = -radius; ox <= radius; ox += 1) {
              const tx = x + ox;
              const ty = y + oy;
              if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
              const localOwner = sectors[ownership[layerIndex(tx, ty)]];
              if (!localOwner || localOwner.id !== sector.id) continue;
              const radial = Math.sqrt(ox * ox + oy * oy) / Math.max(1, radius);
              if (radial > 1.15) continue;
              const choice = chooseWinningType([
                { type: TILE_TYPES.blackRock, weight: 1.15 - radial },
                { type: TILE_TYPES.crystalPink, weight: 0.35 },
                { type: TILE_TYPES.crystalCyan, weight: 0.22 },
                { type: TILE_TYPES.crystalWhite, weight: 0.18 }
              ], tx, ty, sector.gx * 211 + sector.gy * 131 + p * 17);
              setTile(tx, ty, choice);
            }
          }
        }
      }
    }
  }

  carveRedMacroMicrostructures();

  const livingTypes = [
    TILE_TYPES.liveCrystalBlue,
    TILE_TYPES.liveCrystalWhite,
    TILE_TYPES.liveCrystalPink,
    TILE_TYPES.liveCrystalRed,
    TILE_TYPES.liveCrystalCyan,
    TILE_TYPES.liveCrystalRainbow,
    TILE_TYPES.hypnoRock
  ];
  for (const sector of sectors) {
    if (sector.redMacro) continue;
    const livingCount = 2 + Math.floor(hashNoise(sector.gx, sector.gy, 620) * 4);
    for (let i = 0; i < livingCount; i += 1) {
      const angle = hashNoise(sector.gx + i, sector.gy, 640) * Math.PI * 2;
      const radius = 18 + hashNoise(sector.gx, sector.gy + i, 670) * 70;
      const x = Math.max(5, Math.min(MAP_W - 6, Math.floor(sector.x + Math.cos(angle) * radius)));
      const y = Math.max(5, Math.min(MAP_H - 6, Math.floor(sector.y + Math.sin(angle) * radius)));
      if (sectors[ownership[layerIndex(x, y)]]?.id !== sector.id) continue;
      setTile(x, y, livingTypes[(sector.gx + sector.gy + i) % livingTypes.length]);
    }
  }

  fillRect(setTile, 0, 0, 26, 26, TILE_TYPES.empty);
  fillRect(setTile, 4, 4, 5, 4, TILE_TYPES.rock);
  fillRect(setTile, 10, 4, 3, 3, TILE_TYPES.crystalGreen);
  fillRect(setTile, 14, 4, 3, 3, TILE_TYPES.crystalBlue);
  fillRect(setTile, 4, 10, 2, 2, TILE_TYPES.sand);
}

function generateInitialMap(setTile) {
  createMacroWorld(setTile);
}

module.exports = {
  generateInitialMap
};
