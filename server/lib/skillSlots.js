const SKILL_SLOT_COUNT = 20;
const EMPTY_SKILL_SLOTS = Array.from({ length: SKILL_SLOT_COUNT }, () => null);

function normalizeSkillSlots(raw) {
  if (!raw) return [...EMPTY_SKILL_SLOTS];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...EMPTY_SKILL_SLOTS];
    return Array.from({ length: SKILL_SLOT_COUNT }, (_, index) => {
      const value = parsed[index];
      return typeof value === "string" && value ? value : null;
    });
  } catch {
    return [...EMPTY_SKILL_SLOTS];
  }
}

function serializeSkillSlots(slots) {
  const normalized = Array.from({ length: SKILL_SLOT_COUNT }, (_, index) => {
    const value = slots?.[index];
    return typeof value === "string" && value ? value : null;
  });
  return JSON.stringify(normalized);
}

function isSkillSlotted(player, skillId) {
  return Array.isArray(player?.skillSlots) && player.skillSlots.includes(skillId);
}

function isSkillAvailable(player, skill) {
  if (!skill || skill.locked) return false;
  if (!Array.isArray(skill.requires) || skill.requires.length === 0) return true;
  return skill.requires.every((req) => {
    const level = player.skills?.[req.id]?.level ?? 0;
    const need = Number(req.level || 0);
    return level >= need;
  });
}

module.exports = {
  SKILL_SLOT_COUNT,
  EMPTY_SKILL_SLOTS,
  normalizeSkillSlots,
  serializeSkillSlots,
  isSkillSlotted,
  isSkillAvailable
};
