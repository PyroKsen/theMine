import React from "react";
import { BuildingManagePanel } from "./BuildingManagePanel.jsx";

export function RespawnModal({
  open,
  respawnTab,
  onTabChange,
  respawnOwner,
  currentUsername,
  respawnBuilding,
  respawnBuildingId,
  inventoryBlue,
  onSetRespawnHere,
  onResetRespawn,
  onForceDeath,
  onRepair
}) {
  if (!open) return null;
  const manageOnly = Boolean(respawnBuilding?.inactive);
  const isOwner = respawnOwner && respawnOwner === currentUsername;
  const isSelected = respawnBuilding?.id && respawnBuilding.id === respawnBuildingId;

  return (
    <div className="storage-backdrop">
      <div className="storage-modal">
        <div className="storage-title">Respawn</div>
        <div className="shop-tabs">
          {!manageOnly ? (
            <button
              className={`shop-tab${respawnTab === "respawn" ? " is-active" : ""}`}
              type="button"
              onClick={() => onTabChange("respawn")}
            >
              Respawn
            </button>
          ) : null}
          {isOwner ? (
            <button
              className={`shop-tab${respawnTab === "manage" ? " is-active" : ""}`}
              type="button"
              onClick={() => onTabChange("manage")}
            >
              Manage
            </button>
          ) : null}
        </div>
        {respawnTab === "manage" || manageOnly ? (
          <BuildingManagePanel
            building={respawnBuilding}
            inventoryBlue={inventoryBlue}
            onRepair={onRepair}
          />
        ) : (
          <div className="storage-manage">
            <div className="upgrade-skill-stats">
              <div>
                Spawn point: {isSelected ? "This respawn" : "Default (1, 1)"}
              </div>
              <div>
                Exit tile: X {respawnBuilding?.entrance?.x ?? "-"} Y{" "}
                {respawnBuilding?.entrance?.y ?? "-"}
              </div>
            </div>
            <div className="storage-actions">
              <button className="storage-btn" type="button" onClick={onSetRespawnHere}>
                Spawn Here
              </button>
              <button className="storage-btn" type="button" onClick={onResetRespawn}>
                Reset Respawn
              </button>
              <button className="storage-btn" type="button" onClick={onForceDeath}>
                Force Death
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
