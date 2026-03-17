const {
  MAP_W,
  MAP_H,
  TILE_TYPES,
  BUILDING_TYPES,
  BOMB_TYPES,
  BOMB_DELAY_MS,
  BOMB_DAMAGE
} = require("./config");

function createBombManager({ mapStore, players, broadcast, applyDamageToPlayer }) {
  if (!mapStore) throw new Error("mapStore is required");
  const { getTile, getBuilding, setTile, deleteTileHp } = mapStore;

  const bombs = new Map();
  const bombByTile = new Map();
  let bombSeq = 1;
  let getBuildingAtTile = null;
  let damageBuilding = null;

  function setBuildingHooks(hooks = {}) {
    getBuildingAtTile =
      typeof hooks.getBuildingAtTile === "function" ? hooks.getBuildingAtTile : null;
    damageBuilding =
      typeof hooks.damageBuilding === "function" ? hooks.damageBuilding : null;
  }

  function isBombBreakable(type, config) {
    return (
      type === TILE_TYPES.rock ||
      type === TILE_TYPES.blackRock ||
      type === TILE_TYPES.semiMagneticRock ||
      type === TILE_TYPES.magneticRock ||
      type === TILE_TYPES.acidRock ||
      type === TILE_TYPES.reinforcedRock ||
      type === TILE_TYPES.ironRock ||
      type === TILE_TYPES.steelRock ||
      type === TILE_TYPES.slimeRock ||
      type === TILE_TYPES.corrosiveRock ||
      type === TILE_TYPES.radioactiveRock ||
      type === TILE_TYPES.sand ||
      type === TILE_TYPES.steelSand ||
      type === TILE_TYPES.magma ||
      type === TILE_TYPES.crystalGreen ||
      type === TILE_TYPES.crystalBlue ||
      type === TILE_TYPES.crystalWhite ||
      type === TILE_TYPES.crystalRed ||
      type === TILE_TYPES.crystalPink ||
      type === TILE_TYPES.crystalCyan ||
      (config.breaksRedRock && type === TILE_TYPES.redRock) ||
      (config.breaksBuiltBlocks &&
        (type === TILE_TYPES.buildGreen ||
          type === TILE_TYPES.buildYellow ||
          type === TILE_TYPES.buildRed))
    );
  }

  function explodeBomb(bombId) {
    const bomb = bombs.get(bombId);
    if (!bomb) return;
    bombs.delete(bombId);
    bombByTile.delete(`${bomb.x},${bomb.y}`);

    const config = BOMB_TYPES[bomb.type] || BOMB_TYPES.bomb;
    const radius = config.radius;
    const shape = config.shape;
    const playerDamage = Number(config.playerDamage ?? BOMB_DAMAGE) || 0;
    const buildingDamage = Number(config.buildingDamage || 0);
    const breaksTerrain = config.breaksTerrain !== false;

    broadcast?.({
      t: "bomb_explode",
      id: bomb.id,
      x: bomb.x,
      y: bomb.y,
      r: radius,
      shape,
      type: bomb.type
    });

    const isInBlast = (tx, ty) => {
      const dx = tx - bomb.x;
      const dy = ty - bomb.y;
      if (shape === "cross") {
        return (
          (dx === 0 && Math.abs(dy) <= radius) ||
          (dy === 0 && Math.abs(dx) <= radius)
        );
      }
      return dx * dx + dy * dy <= radius * radius;
    };

    const damagedBuildingIds = new Set();

    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const tx = bomb.x + dx;
        const ty = bomb.y + dy;
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) continue;
        if (!isInBlast(tx, ty)) continue;

        if (buildingDamage > 0 && getBuildingAtTile && damageBuilding) {
          const building = getBuildingAtTile(tx, ty);
          if (building?.id) {
            damagedBuildingIds.add(building.id);
          }
        }

        if (!breaksTerrain) continue;
        const type = getTile(tx, ty);
        if (!isBombBreakable(type, config)) continue;
        setTile(tx, ty, TILE_TYPES.empty);
        deleteTileHp(tx, ty);
        broadcast?.({ t: "tile", x: tx, y: ty, value: TILE_TYPES.empty });
      }
    }

    if (buildingDamage > 0 && damageBuilding) {
      for (const buildingId of damagedBuildingIds) {
        damageBuilding(buildingId, buildingDamage);
      }
    }

    if (players && playerDamage > 0) {
      for (const player of players.values()) {
        if (isInBlast(player.tx, player.ty)) {
          applyDamageToPlayer?.(player, playerDamage);
        }
      }
    }
  }

  function placeBomb(player, x, y, type, consumeItem) {
    if (!BOMB_TYPES[type]) return false;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
    if (getTile(x, y) !== TILE_TYPES.empty) return false;
    if (getBuilding(x, y) !== BUILDING_TYPES.none) return false;
    if (bombByTile.has(`${x},${y}`)) return false;
    if (typeof consumeItem === "function") {
      const ok = consumeItem(player, type);
      if (!ok) return false;
    }

    const id = `b${bombSeq++}`;
    const bomb = { id, x, y, ownerId: player.id, type };
    bombs.set(id, bomb);
    bombByTile.set(`${x},${y}`, id);
    broadcast?.({ t: "bomb_placed", id, x, y, by: player.id, type });
    setTimeout(() => explodeBomb(id), BOMB_DELAY_MS);
    return true;
  }

  return {
    bombByTile,
    placeBomb,
    setBuildingHooks
  };
}

module.exports = {
  createBombManager
};










