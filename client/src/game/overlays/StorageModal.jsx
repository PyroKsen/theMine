import React from "react";
import { STORAGE_ITEMS } from "../constants.js";
import { BuildingManagePanel } from "./BuildingManagePanel.jsx";

export function StorageModal({
  open,
  storageTab,
  onTabChange,
  storageOwner,
  currentUsername,
  storageBuilding,
  inventory,
  storageState,
  storageTransfer,
  onTransferChange,
  onMoveCrystal,
  onRepair
}) {
  if (!open) return null;
  const manageOnly = Boolean(storageBuilding?.inactive);

  return (
    <div className="storage-backdrop">
      <div className="storage-modal">
        <div className="storage-title">Storage</div>
        <div className="shop-tabs">
          {!manageOnly ? (
            <button
              className={`shop-tab${storageTab === "storage" ? " is-active" : ""}`}
              type="button"
              onClick={() => onTabChange("storage")}
            >
              Storage
            </button>
          ) : null}
          {storageOwner && storageOwner === currentUsername ? (
            <button
              className={`shop-tab${storageTab === "manage" ? " is-active" : ""}`}
              type="button"
              onClick={() => onTabChange("manage")}
            >
              Manage
            </button>
          ) : null}
        </div>
        {storageTab === "storage" && !manageOnly ? (
          <div className="storage-list">
            {STORAGE_ITEMS.map((item) => {
              const carry = inventory[item.id] ?? 0;
              const stored = storageState[item.id] ?? 0;
              const amount = storageTransfer[item.id] ?? 0;
              return (
                <div key={item.id} className="storage-row">
                  <div className="storage-info">
                    <span className={`storage-name ${item.className}`}>
                      {item.name}
                    </span>
                    <span className="storage-carry">You: {carry}</span>
                    <span className="storage-stored">Store: {stored}</span>
                  </div>
                  <input
                    className="storage-input"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={amount}
                    onChange={(event) =>
                      onTransferChange(item.id, event.target.value)
                    }
                  />
                  <div className="storage-actions">
                    <button
                      className="storage-btn"
                      type="button"
                      disabled={carry <= 0 || amount <= 0}
                      onClick={() => onMoveCrystal(item.id, "deposit")}
                    >
                      Put
                    </button>
                    <button
                      className="storage-btn"
                      type="button"
                      disabled={stored <= 0 || amount <= 0}
                      onClick={() => onMoveCrystal(item.id, "withdraw")}
                    >
                      Take
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <BuildingManagePanel
            building={storageBuilding}
            inventoryBlue={inventory.blue}
            onRepair={onRepair}
          />
        )}
      </div>
    </div>
  );
}
