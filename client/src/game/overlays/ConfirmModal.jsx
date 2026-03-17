import React from "react";

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel
}) {
  if (!open) return null;

  return (
    <div className="storage-backdrop">
      <div className="storage-modal">
        <div className="storage-title">{title}</div>
        <div className="upgrade-skill-desc">{message}</div>
        <div className="storage-actions">
          <button className="storage-btn" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="storage-btn" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
