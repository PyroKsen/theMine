import React from "react";
import { STORAGE_ITEMS } from "../constants.js";

export function DropCrystalsModal({
  open,
  inventory,
  dropValues,
  dropError,
  dropTotal,
  onClose,
  onChange,
  onDropSelected,
  onDropAll
}) {
  if (!open) return null;

  return (
    <div className="storage-backdrop">
      <div className="storage-modal">
        <div className="storage-title">Drop Crystals</div>
        <div className="drop-list">
          {STORAGE_ITEMS.map((item) => {
            const have = inventory[item.id] ?? 0;
            const amount = dropValues[item.id] ?? 0;
            return (
              <div key={item.id} className="drop-row">
                <div className="drop-info">
                  <span className={`drop-name ${item.className}`}>
                    {item.name}
                  </span>
                  <span className="drop-have">You: {have}</span>
                </div>
                <input
                  className="drop-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={have}
                  step="1"
                  value={amount}
                  onChange={(event) => onChange(item.id, event.target.value)}
                />
              </div>
            );
          })}
        </div>
        {dropError ? <div className="drop-error">{dropError}</div> : null}
        <div className="drop-actions">
          <button className="storage-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="storage-btn"
            type="button"
            disabled={dropTotal <= 0}
            onClick={onDropSelected}
          >
            Drop Selected
          </button>
          <button
            className="shop-sell"
            type="button"
            disabled={Object.values(inventory).every((value) => (value ?? 0) <= 0)}
            onClick={onDropAll}
          >
            Drop All
          </button>
        </div>
      </div>
    </div>
  );
}
