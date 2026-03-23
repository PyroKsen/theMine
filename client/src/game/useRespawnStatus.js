import { useRef } from "react";

export function useRespawnStatus({
  status,
  buildingsRef,
  respawnBuildingId,
  setConfirmState,
  resetRespawnSelection,
  forceDeath
}) {
  const lastKnownRespawnCoordsRef = useRef({ x: 1, y: 1 });

  const statusLabel =
    status === "connecting"
      ? "Connecting"
      : status === "online"
      ? "Online"
      : status === "offline"
      ? "Offline"
      : status === "unauthorized"
      ? "Unauthorized"
      : status === "already_online"
      ? "Already online"
      : status;

  const selectedRespawnBuilding = respawnBuildingId
    ? buildingsRef.current.find((building) => building.id === respawnBuildingId) || null
    : null;

  if (selectedRespawnBuilding?.center) {
    lastKnownRespawnCoordsRef.current = {
      x: selectedRespawnBuilding.center.x,
      y: selectedRespawnBuilding.center.y
    };
  } else if (!respawnBuildingId) {
    lastKnownRespawnCoordsRef.current = { x: 1, y: 1 };
  }

  const respawnCoords = respawnBuildingId
    ? lastKnownRespawnCoordsRef.current
    : { x: 1, y: 1 };

  function confirmResetRespawn() {
    setConfirmState({
      title: "Reset Respawn",
      message: "Reset respawn point to 1,1?",
      confirmLabel: "Reset",
      onConfirm: () => {
        setConfirmState(null);
        resetRespawnSelection();
      }
    });
  }

  function confirmForceDeath() {
    setConfirmState({
      title: "Force Death",
      message: "Kill the robot now?",
      confirmLabel: "Die",
      onConfirm: () => {
        setConfirmState(null);
        forceDeath();
      }
    });
  }

  return {
    statusLabel,
    respawnCoords,
    confirmResetRespawn,
    confirmForceDeath
  };
}
