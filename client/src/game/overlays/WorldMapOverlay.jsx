import React from "react";

export function WorldMapOverlay({
  mapOpen,
  mapPanning,
  mapWrapRef,
  mapCanvasRef,
  handleMapMouseDown,
  handleMapMouseMove,
  handleMapMouseUp,
  handleMapMouseLeave,
  coords,
  mapHover
}) {
  if (!mapOpen) return null;

  return (
    <div
      className={`world-map${mapPanning ? " is-panning" : ""}`}
      ref={mapWrapRef}
      onMouseDown={handleMapMouseDown}
      onMouseMove={handleMapMouseMove}
      onMouseUp={handleMapMouseUp}
      onMouseLeave={handleMapMouseLeave}
    >
      <canvas ref={mapCanvasRef} className="map-canvas" />
      <div className="map-header">
        <div className="map-hint">M or Esc to close / Wheel to zoom / Drag to pan</div>
        <div className="map-coords">
          <span className="map-coord">You: X {coords.x} Y {coords.y}</span>
          <span className="map-coord map-coord-hover">
            Hover: {mapHover.inside ? `X ${mapHover.x} Y ${mapHover.y}` : "X -- Y --"}
          </span>
        </div>
      </div>
    </div>
  );
}
