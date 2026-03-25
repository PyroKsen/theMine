export const DEFAULT_ITEMS = [
  { id: "medkit", name: "Medkit", count: 0 },
  { id: "bomb", name: "Bomb", count: 0 },
  { id: "plasmabomb", name: "Plasmabomb", count: 0 },
  { id: "electrobomb", name: "Electrobomb", count: 0 },
  { id: "storage", name: "Storage", count: 0 },
  { id: "shop", name: "Shop", count: 0 },
  { id: "respawn", name: "Respawn", count: 0 },
  { id: "upgrade", name: "Upgrade", count: 0 },
  { id: "teleport", name: "Teleport", count: 0 },
  { id: "turret", name: "Turret", count: 0 },
  { id: "clan_hall", name: "Clan Hall", count: 0 },
  { id: "geopak_empty", name: "Geopak", count: 0 },
  { id: "geopak_blue", name: "Geopak: Blue Living", count: 0 },
  { id: "geopak_white", name: "Geopak: White Living", count: 0 },
  { id: "geopak_pink", name: "Geopak: Pink Living", count: 0 },
  { id: "geopak_red", name: "Geopak: Red Living", count: 0 },
  { id: "geopak_cyan", name: "Geopak: Cyan Living", count: 0 },
  { id: "geopak_rainbow", name: "Geopak: Rainbow Living", count: 0 },
  { id: "geopak_hypno", name: "Geopak: Hypno Rock", count: 0 }
];

export function sortItems(itemInventory) {
  return itemInventory
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => {
      const aHas = a.count > 0 ? 1 : 0;
      const bHas = b.count > 0 ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return a.index - b.index;
    });
}

export function mapIncomingItems(items, previousItems) {
  const nameMap = new Map(previousItems.map((item) => [item.id, item.name]));
  return items.map((item) => ({
    id: String(item.id || ""),
    name: nameMap.get(String(item.id || "")) || String(item.name || ""),
    count: Number(item.count || 0)
  }));
}

export function normalizeSelectedItem(selectedItemId, nextItems) {
  if (!selectedItemId) return null;
  const found = nextItems.find((item) => item.id === selectedItemId);
  if (!found || found.count <= 0) return null;
  return selectedItemId;
}

export function useInventoryItem({
  id,
  socket,
  placement,
  placeBomb,
  placeBuilding,
  sendUseItem
}) {
  if (!id) return;
  if (id === "bomb" || id === "plasmabomb" || id === "electrobomb") {
    if (!placement.valid) return;
    placeBomb(socket, placement.x, placement.y, id);
    return;
  }
  if (
    id === "storage" ||
    id === "shop" ||
    id === "respawn" ||
    id === "upgrade" ||
    id === "teleport"
  ) {
    if (!placement.valid) return;
    placeBuilding(socket, id, placement.x, placement.y);
    return;
  }
  sendUseItem(socket, id);
}
