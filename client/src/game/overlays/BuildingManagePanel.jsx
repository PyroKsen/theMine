import React, { useEffect, useState } from "react";

function formatTimeLeft(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "00:00";
  }
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function BuildingManagePanel({
  building,
  inventoryBlue,
  onCollect,
  onRepair
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!building?.destroyAt) return undefined;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [building?.destroyAt]);

  if (!building) {
    return <div className="storage-manage" />;
  }

  const maxRepair = Math.min(
    inventoryBlue ?? 0,
    Math.max(0, (building.maxHp ?? 0) - (building.hp ?? 0))
  );
  const timeLeft =
    building.inactive && Number.isFinite(Number(building.destroyAt))
      ? Math.max(0, Number(building.destroyAt) - now)
      : 0;

  const repairOptions = [1, 10, 100, 1000];

  return (
    <div className="storage-manage">
      <div className="upgrade-skill-stats">
        <div>Status: {building.inactive ? "Inactive" : "Active"}</div>
        <div>
          HP: {building.hp ?? 0} / {building.maxHp ?? 0}
        </div>
        {typeof building.balance === "number" ? (
          <div>Money: ${building.balance}</div>
        ) : null}
        <div>Blue crystals: {inventoryBlue ?? 0}</div>
        {building.inactive ? (
          <div>Time left: {formatTimeLeft(timeLeft)}</div>
        ) : (
          <div>Time left: --:--</div>
        )}
      </div>
      <div className="storage-actions">
        {typeof building.balance === "number" ? (
          <button
            className="storage-btn"
            type="button"
            disabled={(building.balance ?? 0) <= 0}
            onClick={onCollect}
          >
            Collect
          </button>
        ) : null}
        {repairOptions.map((amount) => (
          <button
            key={amount}
            className="storage-btn"
            type="button"
            disabled={maxRepair < 1}
            onClick={() => onRepair(amount)}
          >
            +{amount}
          </button>
        ))}
        <button
          className="storage-btn"
          type="button"
          disabled={maxRepair < 1}
          onClick={() => onRepair(maxRepair)}
        >
          Full
        </button>
      </div>
      <div className="drop-have">1 blue crystal = 1 HP</div>
    </div>
  );
}
