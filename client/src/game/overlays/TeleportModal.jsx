import React from "react";
import { BuildingManagePanel } from "./BuildingManagePanel.jsx";

const MAP_SIZE = 420;
const MAP_PADDING = 36;

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

export function TeleportModal({
  open,
  teleportTab,
  onTabChange,
  teleportOwner,
  currentUsername,
  teleportBuilding,
  teleportTargets,
  teleportError,
  inventoryBlue,
  onCollect,
  onRepair,
  onTeleport
}) {
  if (!open) return null;

  const manageOnly = Boolean(teleportBuilding?.inactive);
  const isOwner = teleportOwner && teleportOwner === currentUsername;
  const fee = Math.max(0, Number(teleportBuilding?.fee || 100));
  const points = Array.isArray(teleportTargets) ? teleportTargets : [];
  const currentPoint = points.find((point) => point.isCurrent) || null;

  const bounds = points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.center.x),
      maxX: Math.max(acc.maxX, point.center.x),
      minY: Math.min(acc.minY, point.center.y),
      maxY: Math.max(acc.maxY, point.center.y)
    }),
    {
      minX: currentPoint?.center?.x ?? 0,
      maxX: currentPoint?.center?.x ?? 1,
      minY: currentPoint?.center?.y ?? 0,
      maxY: currentPoint?.center?.y ?? 1
    }
  );

  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const innerSize = MAP_SIZE - MAP_PADDING * 2;

  function project(center) {
    const x = MAP_PADDING + ((center.x - bounds.minX) / spanX) * innerSize;
    const y = MAP_PADDING + ((center.y - bounds.minY) / spanY) * innerSize;
    return {
      x,
      y,
      left: `${clampPercent((x / MAP_SIZE) * 100)}%`,
      top: `${clampPercent((y / MAP_SIZE) * 100)}%`
    };
  }

  const renderedPoints = points.map((point) => ({
    ...point,
    position: project(point.center)
  }));

  const renderedLines = currentPoint
    ? renderedPoints.filter((point) => point.inRange && !point.isCurrent)
    : [];

  return (
    <div className="storage-backdrop">
      <div className="storage-modal teleport-modal">
        <div className="storage-title">Teleport</div>
        <div className="shop-tabs">
          {!manageOnly ? (
            <button
              className={`shop-tab${teleportTab === "use" ? " is-active" : ""}`}
              type="button"
              onClick={() => onTabChange("use")}
            >
              Use
            </button>
          ) : null}
          {isOwner ? (
            <button
              className={`shop-tab${teleportTab === "manage" ? " is-active" : ""}`}
              type="button"
              onClick={() => onTabChange("manage")}
            >
              Manage
            </button>
          ) : null}
        </div>
        {teleportTab === "manage" || manageOnly ? (
          <BuildingManagePanel
            building={teleportBuilding}
            inventoryBlue={inventoryBlue}
            onCollect={onCollect}
            onRepair={onRepair}
          />
        ) : (
          <div className="storage-manage teleport-body">
            <div className="upgrade-skill-stats teleport-meta">
              <div>Teleport cost: ${fee}</div>
              <div>Range: 1000 tiles</div>
              <div>
                Current teleport: X {teleportBuilding?.center?.x ?? "-"} Y{" "}
                {teleportBuilding?.center?.y ?? "-"}
              </div>
              <div>Click a linked teleport to jump.</div>
            </div>
            {teleportError ? <div className="auth-error">{teleportError}</div> : null}
            <div className="teleport-map-shell">
              <div className="teleport-map" role="presentation">
                <svg
                  className="teleport-map-lines"
                  viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
                  aria-hidden="true"
                >
                  {currentPoint
                    ? renderedLines.map((point) => (
                        <line
                          key={point.id}
                          x1={project(currentPoint.center).x}
                          y1={project(currentPoint.center).y}
                          x2={point.position.x}
                          y2={point.position.y}
                        />
                      ))
                    : null}
                </svg>
                {renderedPoints.map((point) => (
                  <button
                    key={point.id}
                    className={`teleport-node${
                      point.isCurrent ? " is-current" : ""
                    }${point.inRange ? " is-linked" : " is-distant"}`}
                    type="button"
                    style={{ left: point.position.left, top: point.position.top }}
                    disabled={point.isCurrent || !point.inRange}
                    title={`${point.id} | X ${point.center.x} Y ${point.center.y} | ${
                      point.owner || "Unknown"
                    }`}
                    onClick={() => onTeleport(point.id)}
                  >
                    <span className="teleport-node-dot" />
                    <span className="teleport-node-label">
                      X {point.center.x} Y {point.center.y}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="teleport-legend">
              <span className="teleport-legend-item">
                <span className="teleport-legend-dot is-current" /> Current
              </span>
              <span className="teleport-legend-item">
                <span className="teleport-legend-dot is-linked" /> Reachable
              </span>
              <span className="teleport-legend-item">
                <span className="teleport-legend-dot is-distant" /> Too far
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

