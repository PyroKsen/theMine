import { normalizeSkillSlots } from "../helpers.js";
import { toHp, toInventory, toStorage, toWallet } from "./stateMappers.js";

export function createUiMessageHandlers({
  storageIdRef,
  setWallet,
  setHp,
  setInventory,
  setSuppressRespawnAutoOpen,
  setRespawnBuildingId,
  setSkills,
  setSkillSlots,
  setDropOpen,
  setDropError,
  setChatMessages,
  setStorageState,
  setTeleportError,
  applyItems,
  resetDropValues
}) {
  function handleInventory(msg) {
    setInventory(toInventory(msg.inventory));
  }

  function handleDropOk() {
    setDropOpen(false);
    resetDropValues();
    setDropError("");
  }

  function handleDropError(msg) {
    const text = msg.message ? String(msg.message) : "Drop failed";
    setDropError(text);
  }

  function handleTeleportError(msg) {
    const text = msg.message ? String(msg.message) : "Teleport failed";
    setTeleportError(text);
  }

  function handleItems(msg) {
    applyItems(msg.items);
  }

  function handleChat(msg) {
    setChatMessages((prev) => {
      const next = [
        ...prev,
        {
          from: msg.from || "unknown",
          text: msg.msg || "",
          time: msg.time || Date.now()
        }
      ];
      return next.slice(-60);
    });
  }

  function handleHp(msg) {
    setHp(toHp(msg));
  }

  function handleWallet(msg) {
    setWallet(toWallet(msg));
  }

  function handleRespawnSelection(msg) {
    setRespawnBuildingId(String(msg.id || "") || null);
  }

  function handlePlayerRespawned() {
    setSuppressRespawnAutoOpen(true);
  }

  function handleSkills(msg) {
    setSkills(msg.skills);
  }

  function handleSkillSlots(msg) {
    setSkillSlots(normalizeSkillSlots(msg.slots));
  }

  function handleStorageState(msg) {
    const id = String(msg.id || "");
    if (storageIdRef.current && id !== storageIdRef.current) return;
    setStorageState(toStorage(msg.storage));
  }

  return {
    handleInventory,
    handleDropOk,
    handleDropError,
    handleTeleportError,
    handleItems,
    handleChat,
    handleHp,
    handleWallet,
    handleRespawnSelection,
    handlePlayerRespawned,
    handleSkills,
    handleSkillSlots,
    handleStorageState
  };
}
