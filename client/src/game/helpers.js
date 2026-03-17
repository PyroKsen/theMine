import {
  BASE_MAX_DEPTH_TILES,
  DEFAULT_SKILL_CONFIG,
  DEPTH_PER_LEVEL,
  TILE_TYPES
} from "./constants.js";

export function crystalColor(type) {
  switch (type) {
    case TILE_TYPES.crystalGreen:
      return 0x38d86b;
    case TILE_TYPES.crystalBlue:
      return 0x4da3ff;
    case TILE_TYPES.crystalWhite:
      return 0xf0f4ff;
    case TILE_TYPES.crystalRed:
      return 0xff5d5d;
    case TILE_TYPES.crystalPink:
      return 0xff7fd6;
    case TILE_TYPES.crystalCyan:
      return 0x5ee9ff;
    default:
      return null;
  }
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothTowards(current, target, dtMs, smoothMs) {
  const alpha = 1 - Math.exp(-dtMs / smoothMs);
  return current + (target - current) * alpha;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeSkillConfig(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_SKILL_CONFIG;
  }
  return raw.map((entry) => ({
    id: String(entry.id || ""),
    name: String(entry.name || ""),
    short: String(entry.short || "?"),
    desc: String(entry.desc || ""),
    xpBase: Number(entry.xpBase || 0),
    xpGrowth: Number(entry.xpGrowth || 0),
    dollarBase: Number(entry.dollarBase || 0),
    dollarGrowth: Number(entry.dollarGrowth || 0),
    locked: Boolean(entry.locked),
    slotOnly: Boolean(entry.slotOnly),
    requires: Array.isArray(entry.requires) ? entry.requires : []
  }));
}

export function normalizeSkillSlots(raw) {
  const size = 20;
  const slots = Array.isArray(raw)
    ? raw.map((id) => (id ? String(id) : null))
    : [];
  while (slots.length < size) {
    slots.push(null);
  }
  return slots.slice(0, size);
}

export function calcSkillNeed(skill, level) {
  if (!skill || skill.locked) return Infinity;
  return Math.max(1, skill.xpBase + skill.xpGrowth * level);
}

export function calcSkillCost(skill, level) {
  if (!skill || skill.locked) return Infinity;
  return Math.max(0, skill.dollarBase + skill.dollarGrowth * level);
}

export function formatSkillTotal(skill, level) {
  if (!skill || skill.locked) return "-";
  const safeLevel = Math.max(0, Number(level) || 0);
  if (skill.id === "hp") {
    return `+${safeLevel} max HP`;
  }
  if (skill.id === "mining") {
    return `+${(safeLevel * 0.1).toFixed(1)} damage per hit`;
  }
  if (skill.id === "move") {
    return `+${safeLevel}% speed`;
  }
  if (skill.id === "inventory") {
    return `+${safeLevel * 100} capacity`;
  }
  if (skill.id === "depth") {
    return `up to ${BASE_MAX_DEPTH_TILES + safeLevel * DEPTH_PER_LEVEL} depth`;
  }
  if (skill.id === "build1") {
    return `Block HP: ${5 + safeLevel}`;
  }
  if (skill.id === "build2") {
    return `+${50 + safeLevel} HP`;
  }
  if (skill.id === "build3") {
    return `+${100 + safeLevel} HP`;
  }
  if (skill.id === "demolisher") {
    return `+${(safeLevel * 0.5).toFixed(1)} damage`;
  }
  return "-";
}

export function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

export function decodeBase64(base64) {
  const binary = window.atob(base64 || "");
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let index = 0; index < len; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
