import { useCallback } from "react";
import { applyMapZoom, drawWorldMapCanvas, getMapHoverPosition } from "./worldMap.js";

export function useWorldMapUi({
  setMapWrapEl,
  setMapPanning,
  setMapHover,
  mapWrapRef,
  mapCanvasRef,
  mapDrawRafRef,
  mapOpenRef,
  mapViewRef,
  mapDataRef,
  exploredChunksRef,
  localPlayerRef,
  mapHoverRef,
  chunkKey
}) {
  const handleMapWrapRef = useCallback((node) => {
    mapWrapRef.current = node;
    setMapWrapEl(node);
  }, [mapWrapRef, setMapWrapEl]);

  const drawWorldMap = useCallback(() => {
    drawWorldMapCanvas({
      wrap: mapWrapRef.current,
      canvas: mapCanvasRef.current,
      mapData: mapDataRef.current,
      mapView: mapViewRef.current,
      exploredChunks: exploredChunksRef.current,
      localPlayer: localPlayerRef.current,
      chunkKey
    });
  }, [chunkKey, exploredChunksRef, localPlayerRef, mapCanvasRef, mapDataRef, mapViewRef, mapWrapRef]);

  const requestMapDraw = useCallback(() => {
    if (!mapOpenRef.current) return;
    if (mapDrawRafRef.current) return;
    mapDrawRafRef.current = window.requestAnimationFrame(() => {
      mapDrawRafRef.current = null;
      drawWorldMap();
    });
  }, [drawWorldMap, mapDrawRafRef, mapOpenRef]);

  const updateMapHover = useCallback((clientX, clientY) => {
    const next = getMapHoverPosition({
      wrap: mapWrapRef.current,
      mapData: mapDataRef.current,
      mapView: mapViewRef.current,
      clientX,
      clientY
    });
    const prev = mapHoverRef.current;
    if (prev.x !== next.x || prev.y !== next.y || prev.inside !== next.inside) {
      mapHoverRef.current = next;
      setMapHover(next);
    }
  }, [mapDataRef, mapHoverRef, mapViewRef, mapWrapRef, setMapHover]);

  const zoomMapAt = useCallback((clientX, clientY, factor) => {
    const changed = applyMapZoom({
      wrap: mapWrapRef.current,
      mapData: mapDataRef.current,
      mapView: mapViewRef.current,
      clientX,
      clientY,
      factor
    });
    if (changed) {
      requestMapDraw();
    }
  }, [mapDataRef, mapViewRef, mapWrapRef, requestMapDraw]);

  const handleMapMouseDown = useCallback((event) => {
    if (event.button !== 0) return;
    mapViewRef.current.lastX = event.clientX;
    mapViewRef.current.lastY = event.clientY;
    setMapPanning(true);
    updateMapHover(event.clientX, event.clientY);
  }, [mapViewRef, setMapPanning, updateMapHover]);

  const handleMapMouseMove = useCallback((event, mapPanning) => {
    if (mapPanning) {
      const view = mapViewRef.current;
      const dx = event.clientX - view.lastX;
      const dy = event.clientY - view.lastY;
      view.panX += dx;
      view.panY += dy;
      view.lastX = event.clientX;
      view.lastY = event.clientY;
      requestMapDraw();
    }
    updateMapHover(event.clientX, event.clientY);
  }, [mapViewRef, requestMapDraw, updateMapHover]);

  const handleMapMouseUp = useCallback(() => {
    setMapPanning(false);
  }, [setMapPanning]);

  const handleMapMouseLeave = useCallback(() => {
    setMapPanning(false);
    if (mapHoverRef.current.inside) {
      mapHoverRef.current = { x: null, y: null, inside: false };
      setMapHover({ x: null, y: null, inside: false });
    }
  }, [mapHoverRef, setMapHover, setMapPanning]);

  return {
    handleMapWrapRef,
    requestMapDraw,
    drawWorldMap,
    zoomMapAt,
    handleMapMouseDown,
    handleMapMouseMove,
    handleMapMouseUp,
    handleMapMouseLeave
  };
}
