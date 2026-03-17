export function isSocketOpen(socket) {
  return Boolean(socket) && socket.readyState === WebSocket.OPEN;
}

export function sendSocketMessage(socket, payload) {
  if (!isSocketOpen(socket)) return false;
  socket.send(JSON.stringify(payload));
  return true;
}

export function requestMapChunks(socket, chunks) {
  return sendSocketMessage(socket, { t: "map_chunk_req", chunks });
}

export function sendBuildAction(socket) {
  return sendSocketMessage(socket, { t: "build_action" });
}

export function openStorage(socket, id) {
  return sendSocketMessage(socket, { t: "storage_open", id });
}

export function sendChatMessage(socket, text) {
  return sendSocketMessage(socket, { t: "chat", msg: text });
}

export function requestSkillUpgrade(socket, id) {
  return sendSocketMessage(socket, { t: "skill_upgrade", id });
}

export function requestSkillSlotSet(socket, slot, id) {
  return sendSocketMessage(socket, { t: "skill_slot_set", slot, id });
}

export function dropAllCrystals(socket) {
  return sendSocketMessage(socket, { t: "drop_crystals", all: true });
}

export function dropSelectedCrystals(socket, crystals) {
  return sendSocketMessage(socket, { t: "drop_crystals", crystals });
}

export function sendUseItem(socket, id) {
  return sendSocketMessage(socket, { t: "use_item", id });
}

export function placeBomb(socket, x, y, id) {
  return sendSocketMessage(socket, { t: "place_bomb", x, y, id });
}

export function placeBuilding(socket, type, x, y) {
  return sendSocketMessage(socket, { t: "place_building", type, x, y });
}

export function setRespawnHere(socket) {
  return sendSocketMessage(socket, { t: "respawn_set" });
}

export function resetRespawn(socket) {
  return sendSocketMessage(socket, { t: "respawn_reset" });
}

export function forceDeath(socket) {
  return sendSocketMessage(socket, { t: "force_death" });
}

export function useTeleport(socket, id) {
  return sendSocketMessage(socket, { t: "teleport_use", id });
}

export function sellCrystal(socket, crystal, amount) {
  return sendSocketMessage(socket, { t: "shop_sell", crystal, amount });
}

export function buyCrystal(socket, crystal, amount) {
  return sendSocketMessage(socket, { t: "shop_buy", crystal, amount });
}

export function moveStorageCrystal(socket, id, crystal, amount, dir) {
  return sendSocketMessage(socket, { t: "storage_move", id, crystal, amount, dir });
}

export function repairBuilding(socket, id, amount) {
  return sendSocketMessage(socket, { t: "repair_building", id, amount });
}

export function collectBuildingMoney(socket, id) {
  return sendSocketMessage(socket, { t: "collect_building_money", id });
}

export function collectAllBuildingMoney(socket) {
  return sendSocketMessage(socket, { t: "collect_all_building_money" });
}

export function sendInput(socket, dir, ctrl, shift, mine) {
  return sendSocketMessage(socket, {
    t: "input",
    dir,
    ctrl,
    shift,
    mine
  });
}
