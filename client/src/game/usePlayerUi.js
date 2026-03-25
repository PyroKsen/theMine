import { useEffect, useMemo, useRef, useState } from "react";
import { clamp } from "./helpers.js";
import {
  DEFAULT_ITEMS,
  mapIncomingItems,
  normalizeSelectedItem,
  sortItems,
  useInventoryItem
} from "./playerItems.js";
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

  const sortedItems = useMemo(() => sortItems(itemInventory), [itemInventory]);

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
      next = mapIncomingItems(items, prev);
      return next;
    });
    setSelectedItemId((prev) => normalizeSelectedItem(prev, next));
  }

  function useSelectedItem() {
    const id = selectedItemRef.current;
    if (!id) return;
    const socket = socketRef.current;
    if (!isSocketOpen(socket)) return;
    useInventoryItem({
      id,
      socket,
      placement: placementRef.current,
      placeBomb,
      placeBuilding,
      sendUseItem
    });
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
