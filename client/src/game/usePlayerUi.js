import { useEffect, useMemo, useRef, useState } from "react";
import { clamp } from "./helpers.js";
import {
  dropAllCrystals,
  dropSelectedCrystals,
  isSocketOpen,
  placeBomb,
  placeBuilding,
  sendChatMessage,
  sendUseItem
} from "./socketApi.js";

const EMPTY_CRYSTALS = {
  green: 0,
  blue: 0,
  white: 0,
  red: 0,
  pink: 0,
  cyan: 0
};

const DEFAULT_ITEMS = [
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
  { id: "clan_hall", name: "Clan Hall", count: 0 }
];

export function usePlayerUi({
  chatFocusRef,
  inventory,
  placementRef,
  socketRef
}) {
  const [dropOpen, setDropOpen] = useState(false);
  const [dropError, setDropError] = useState("");
  const [dropValues, setDropValues] = useState(EMPTY_CRYSTALS);
  const [itemInventory, setItemInventory] = useState(DEFAULT_ITEMS);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const selectedItemRef = useRef(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatFocused, setChatFocused] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);

  useEffect(() => {
    chatFocusRef.current = chatFocused;
  }, [chatFocusRef, chatFocused]);

  useEffect(() => {
    selectedItemRef.current = selectedItemId;
  }, [selectedItemId]);

  const sortedItems = useMemo(
    () =>
      itemInventory
        .map((item, index) => ({ ...item, index }))
        .sort((a, b) => {
          const aHas = a.count > 0 ? 1 : 0;
          const bHas = b.count > 0 ? 1 : 0;
          if (aHas !== bHas) return bHas - aHas;
          return a.index - b.index;
        }),
    [itemInventory]
  );

  const dropTotal = useMemo(
    () =>
      Object.values(dropValues).reduce(
        (sum, value) => sum + (Number(value) || 0),
        0
      ),
    [dropValues]
  );

  function resetDropValues() {
    setDropValues(EMPTY_CRYSTALS);
  }

  function updateDropValue(id, value) {
    const max = inventory[id] ?? 0;
    let next = Math.floor(Number(value) || 0);
    if (!Number.isFinite(next)) next = 0;
    next = clamp(next, 0, max);
    setDropValues((prev) => ({ ...prev, [id]: next }));
  }

  function submitDrop(all = false) {
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    setDropError("");
    if (all) {
      dropAllCrystals(socket);
      return;
    }
    if (dropTotal <= 0) return;
    dropSelectedCrystals(socket, dropValues);
  }

  function applyItems(items) {
    let next = [];
    setItemInventory((prev) => {
      const nameMap = new Map(prev.map((item) => [item.id, item.name]));
      next = items.map((item) => ({
        id: String(item.id || ""),
        name: nameMap.get(String(item.id || "")) || String(item.name || ""),
        count: Number(item.count || 0)
      }));
      return next;
    });
    setSelectedItemId((prev) => {
      if (!prev) return null;
      const found = next.find((item) => item.id === prev);
      if (!found || found.count <= 0) return null;
      return prev;
    });
  }

  function useSelectedItem() {
    const id = selectedItemRef.current;
    if (!id) return;
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    if (id === "bomb" || id === "plasmabomb" || id === "electrobomb") {
      const placement = placementRef.current;
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
      const placement = placementRef.current;
      if (!placement.valid) return;
      placeBuilding(socket, id, placement.x, placement.y);
      return;
    }
    sendUseItem(socket, id);
  }

  function submitChat(event) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    sendChatMessage(socket, text);
    setChatInput("");
  }

  return {
    applyItems,
    chatInput,
    chatMessages,
    chatOpen,
    dropError,
    dropOpen,
    dropTotal,
    dropValues,
    itemInventory,
    resetDropValues,
    selectedItemId,
    selectedItemRef,
    setChatFocused,
    setChatInput,
    setChatMessages,
    setChatOpen,
    setDropError,
    setDropOpen,
    setSelectedItemId,
    sortedItems,
    submitChat,
    submitDrop,
    updateDropValue,
    useSelectedItem
  };
}
