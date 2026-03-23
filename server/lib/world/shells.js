const { hashNoise, chooseWinningType } = require("./noise");

function createShellLogic({ MAP_W, MAP_H, TILE_TYPES, sectors, ownership, boundaryDelta, boundaryRival, layerIndex, dirtyField, dirtyFillType }) {
  function boundaryStrength(x, y) {
    const delta = boundaryDelta[layerIndex(x, y)];
    return Math.max(0, Math.min(1, 1 - delta / 108));
  }

  function isComplexJunction(x, y) {
    const owners = new Set();
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const tx = x + ox;
        const ty = y + oy;
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        owners.add(ownership[layerIndex(tx, ty)]);
        if (owners.size >= 3) return true;
      }
    }
    return false;
  }

  function shellType(sector, x, y) {
    const shellNoise = dirtyField(sector, x, y, sector.gx * 211 + sector.gy * 157 + 9);
    const shellGrain = dirtyField(sector, x + 17, y - 13, sector.gx * 223 + sector.gy * 167 + 21);
    const edgeFray = (shellNoise - 0.5) * 0.34 + (shellGrain - 0.5) * 0.22 + (hashNoise(x, y, sector.gx * 233 + sector.gy * 181) - 0.5) * 0.16;
    const boundary = Math.max(0, Math.min(1, boundaryStrength(x, y) + edgeFray));
    const fillType = dirtyFillType(sector, x, y);
    const complexJunction = isComplexJunction(x, y);
    const redField = dirtyField(sector, x, y, sector.gx * 173 + sector.gy * 139 + 1);
    const blackFieldA = dirtyField(sector, x + 43, y - 19, sector.gx * 173 + sector.gy * 139 + 2);
    const blackFieldB = dirtyField(sector, x - 27, y + 37, sector.gx * 173 + sector.gy * 139 + 3);
    const redBand = Math.max(0, 1 - Math.abs(boundary - 0.84) / 0.12);
    const blackBandInner = Math.max(0, 1 - Math.abs(boundary - 0.58) / 0.12);
    let redWeight = redBand * (0.82 + redField * 1.05);
    let blackWeight = blackBandInner * (0.62 + blackFieldA * 0.95 + blackFieldB * 0.45);
    let fillWeight = Math.max(0.2, 1 - Math.max(redBand, blackBandInner * 0.9) * 1.18);
    if (complexJunction) {
      redWeight *= 0.4;
      blackWeight *= 1.22;
      fillWeight *= 0.82;
    }
    const shellPresence = Math.max(redBand, blackBandInner);
    if (shellPresence > 0.05) {
      return redWeight >= blackWeight ? TILE_TYPES.redRock : TILE_TYPES.blackRock;
    }
    const entries = [
      { type: TILE_TYPES.blackRock, weight: blackWeight },
      { type: TILE_TYPES.redRock, weight: redWeight },
      { type: fillType, weight: fillWeight }
    ];
    return chooseWinningType(entries, x, y, sector.gx * 73 + sector.gy * 47 + 700);
  }

  function resolveShellTile(x, y) {
    const idx = layerIndex(x, y);
    const owner = sectors[ownership[idx]];
    if (!owner || owner.redMacro) return null;
    const candidates = [];
    const primary = shellType(owner, x, y);
    if (primary === TILE_TYPES.redRock || primary === TILE_TYPES.blackRock) {
      candidates.push(primary);
    }
    const rivalIndex = boundaryRival[idx];
    if (rivalIndex >= 0) {
      const rival = sectors[rivalIndex];
      if (rival && !rival.redMacro) {
        const secondary = shellType(rival, x, y);
        if (secondary === TILE_TYPES.redRock || secondary === TILE_TYPES.blackRock) {
          candidates.push(secondary);
        }
      }
    }
    if (candidates.includes(TILE_TYPES.redRock)) return TILE_TYPES.redRock;
    if (candidates.includes(TILE_TYPES.blackRock)) return TILE_TYPES.blackRock;
    return null;
  }

  return {
    boundaryStrength,
    isComplexJunction,
    shellType,
    resolveShellTile
  };
}

module.exports = {
  createShellLogic
};
