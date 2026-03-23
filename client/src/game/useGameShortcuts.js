import { useEffect } from "react";
import { isSocketOpen, sendBuildAction } from "./socketApi.js";

export function useGameShortcuts({
  runtimeRef,
  socketRef,
  chatFocusRef,
  mapOpenRef,
  dropOpenRef,
  ownedBuildingsOpenRef,
  setMapOpen,
  setDropOpen,
  setDropError,
  setOwnedBuildingsOpen,
  useSelectedItem
}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      const runtime = runtimeRef.current;
      if (!runtime) return;

      if (event.code === "KeyM" && !event.repeat) {
        setMapOpen((prev) => !prev);
        return;
      }
      if (event.code === "Escape" && mapOpenRef.current) {
        setMapOpen(false);
        return;
      }
      if (event.code === "Escape" && dropOpenRef.current) {
        setDropOpen(false);
        setDropError("");
        return;
      }
      if (event.code === "Escape" && ownedBuildingsOpenRef.current) {
        setOwnedBuildingsOpen(false);
        return;
      }
      if (event.code === "KeyF" && !event.repeat && !chatFocusRef.current) {
        useSelectedItem();
        return;
      }
      if (event.code === "KeyR" && !event.repeat && !chatFocusRef.current) {
        const currentSocket = socketRef.current;
        if (isSocketOpen(currentSocket)) {
          sendBuildAction(currentSocket);
        }
        return;
      }
      if (
        (event.code === "ControlLeft" || event.code === "ControlRight") &&
        !event.repeat &&
        !chatFocusRef.current
      ) {
        runtime.state.keys.slow = !runtime.state.keys.slow;
        return;
      }
      runtime.updateInputKey(event.code, true);
    };

    const onKeyUp = (event) => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.updateInputKey(event.code, false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    runtimeRef,
    socketRef,
    chatFocusRef,
    mapOpenRef,
    dropOpenRef,
    ownedBuildingsOpenRef,
    setMapOpen,
    setDropOpen,
    setDropError,
    setOwnedBuildingsOpen,
    useSelectedItem
  ]);
}
