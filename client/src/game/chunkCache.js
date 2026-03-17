export function chunkStorageKey(username, cx, cy) {
  const user = username || "guest";
  return `themine:${user}:chunk:${cx},${cy}`;
}

export function saveChunkCache(username, cx, cy, tiles, buildings) {
  try {
    localStorage.setItem(
      chunkStorageKey(username, cx, cy),
      JSON.stringify({ tiles, buildings })
    );
  } catch {
    // ignore storage errors
  }
}

export function loadChunkCache(username, cx, cy) {
  try {
    const raw = localStorage.getItem(chunkStorageKey(username, cx, cy));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.tiles || !parsed?.buildings) return null;
    return parsed;
  } catch {
    return null;
  }
}
