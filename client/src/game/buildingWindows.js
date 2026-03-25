function getOwnedBuildingEntry(building, username, respawnBuildingId) {
  const interaction =
    building.type === "storage"
      ? building.entrance || null
      : building.center || building.entrances?.[0] || null;
  return {
    id: building.id,
    type: building.type,
    hp: building.hp ?? 0,
    maxHp: building.maxHp ?? 0,
    inactive: Boolean(building.inactive),
    balance: Math.max(0, Number(building.balance || 0)),
    canCollectMoney: typeof building.balance === "number",
    isSelectedRespawn:
      building.type === "respawn" && building.id === respawnBuildingId,
    interaction
  };
}

function canUseBuildingAtPlayer(building, username) {
  const owner = building.owner || "";
  return (building.inactive && owner === username) || !building.inactive;
}

function isPlayerOnBuilding(building, player) {
  const point = building.type === "storage" ? building.entrance : building.center;
  return Boolean(point) && point.x === player.tx && point.y === player.ty;
}

export function getOwnedBuildings(buildings, username, respawnBuildingId) {
  return buildings
    .filter((building) => building.owner === username)
    .map((building) => getOwnedBuildingEntry(building, username, respawnBuildingId))
    .sort((a, b) => {
      const typeCompare = String(a.type).localeCompare(String(b.type));
      if (typeCompare !== 0) return typeCompare;
      return String(a.id).localeCompare(String(b.id));
    });
}

export function getTeleportTargets(buildings, teleportBuilding) {
  if (!teleportBuilding?.center) return [];
  return buildings
    .filter(
      (building) =>
        building.type === "teleport" &&
        !building.inactive &&
        building.center
    )
    .map((building) => {
      const dx = building.center.x - teleportBuilding.center.x;
      const dy = building.center.y - teleportBuilding.center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return {
        id: building.id,
        owner: building.owner || "",
        center: building.center,
        distance,
        isCurrent: building.id === teleportBuilding.id,
        inRange: building.id !== teleportBuilding.id && distance <= 1000
      };
    })
    .sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return a.distance - b.distance || String(a.id).localeCompare(String(b.id));
    });
}

export function getActiveBuildingWindows(buildings, player, username) {
  const next = {
    storage: null,
    shop: null,
    upgrade: null,
    respawn: null,
    teleport: null
  };

  for (const building of buildings) {
    if (!isPlayerOnBuilding(building, player)) continue;
    if (!canUseBuildingAtPlayer(building, username)) continue;
    if (building.type === "storage") next.storage = building;
    if (building.type === "shop") next.shop = building;
    if (building.type === "upgrade") next.upgrade = building;
    if (building.type === "respawn") next.respawn = building;
    if (building.type === "teleport") next.teleport = building;
  }

  return next;
}
