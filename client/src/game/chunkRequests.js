import { DEFAULT_MAP } from "./constants.js";
import { chunkKey } from "./helpers.js";
import { isSocketOpen, requestMapChunks } from "./socketApi.js";

export function requestVisibleChunks({ socketRef, mapDataRef, loadedChunksRef, chunks, options = {} }) {
  const socket = socketRef.current;
  if (!isSocketOpen(socket)) return;
  const { w, h, chunk } = mapDataRef.current;
  if (!chunk) return;
  const force = Boolean(options.force);
  const maxCx = Math.ceil(w / chunk) - 1;
  const maxCy = Math.ceil(h / chunk) - 1;
  const pending = [];
  for (const entry of chunks) {
    const cx = Number(entry.cx);
    const cy = Number(entry.cy);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    if (cx < 0 || cy < 0 || cx > maxCx || cy > maxCy) continue;
    const key = chunkKey(cx, cy);
    if (!force && loadedChunksRef.current.has(key)) continue;
    pending.push({ cx, cy });
    if (pending.length >= 32) {
      requestMapChunks(socket, pending);
      pending.length = 0;
    }
  }
  if (pending.length > 0) {
    requestMapChunks(socket, pending);
  }
}
