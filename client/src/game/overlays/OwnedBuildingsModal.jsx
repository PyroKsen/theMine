import React from "react";

function formatBuildingType(type) {
  if (type === "storage") return "Storage";
  if (type === "shop") return "Shop";
  if (type === "respawn") return "Respawn";
  if (type === "upgrade") return "Upgrade";
  if (type === "teleport") return "Teleport";
  return type || "Building";
}

export function OwnedBuildingsModal({
  open,
  buildings,
  onClose,
  onCollect,
  onCollectAll
}) {
  if (!open) return null;

  return (
    <div className="storage-backdrop">
      <div className="storage-modal">
        <div className="storage-title">My Buildings</div>
        <div className="drop-actions">
          <button className="storage-btn" type="button" onClick={onCollectAll}>
            Collect All Money
          </button>
        </div>
        <div className="storage-list">
          {buildings.length > 0 ? (
            buildings.map((building) => (
              <div key={building.id} className="storage-row">
                <div className="storage-info">
                  <span className="storage-name">
                    {formatBuildingType(building.type)}
                  </span>
                  <span className="storage-carry">ID: {building.id}</span>
                  <span className="storage-stored">
                    Coords:{" "}
                    {building.interaction
                      ? `X ${building.interaction.x} Y ${building.interaction.y}`
                      : "Unknown"}
                  </span>
                  <span className="storage-stored">
                    Status: {building.inactive ? "Inactive" : "Active"}
                  </span>
                  <span className="storage-stored">
                    HP: {building.hp}/{building.maxHp}
                  </span>
                  {building.type === "respawn" ? (
                    <span className="storage-stored">
                      Spawn: {building.isSelectedRespawn ? "Selected" : "Default"}
                    </span>
                  ) : null}
                  {building.canCollectMoney ? (
                    <span className="storage-stored">
                      Money: ${building.balance}
                    </span>
                  ) : null}
                </div>
                {building.canCollectMoney ? (
                  <div className="storage-actions">
                    <button
                      className="storage-btn"
                      type="button"
                      disabled={(building.balance ?? 0) <= 0}
                      onClick={() => onCollect(building.id)}
                    >
                      Collect
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="storage-row">
              <div className="storage-info">
                <span className="storage-stored">You have no buildings yet.</span>
              </div>
            </div>
          )}
        </div>
        <div className="drop-actions">
          <button className="storage-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
