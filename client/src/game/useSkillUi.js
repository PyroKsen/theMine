import { useEffect, useMemo, useState } from "react";
import { BASE_INVENTORY_CAPACITY, DEFAULT_SKILL_CONFIG } from "./constants.js";
import { calcSkillCost, calcSkillNeed } from "./helpers.js";

export function useSkillUi({ skillConfig, skillSlots, skills, wallet }) {
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(null);
  const [slotCandidateId, setSlotCandidateId] = useState(null);
  const [selectedSkillId, setSelectedSkillId] = useState(
    DEFAULT_SKILL_CONFIG[0]?.id || null
  );

  const baseSkills = useMemo(
    () => skillConfig.filter((skill) => !skill.slotOnly),
    [skillConfig]
  );
  const slotSkills = useMemo(
    () => skillConfig.filter((skill) => skill.slotOnly),
    [skillConfig]
  );
  const visibleSkills = useMemo(() => baseSkills.slice(0, 5), [baseSkills]);

  const selectedSlotSkillId =
    selectedSlotIndex !== null ? skillSlots[selectedSlotIndex] : null;
  const selectedSlotSkill = selectedSlotSkillId
    ? skillConfig.find((skill) => skill.id === selectedSlotSkillId)
    : null;
  const activeCoreSkill =
    visibleSkills.find((skill) => skill.id === selectedSkillId) ||
    visibleSkills[0] ||
    null;
  const activeSkill = selectedSlotSkill || activeCoreSkill;
  const activeSkillState = activeSkill
    ? skills[activeSkill.id] || { level: 0, xp: 0 }
    : { level: 0, xp: 0 };
  const activeSkillNeed = activeSkill
    ? calcSkillNeed(activeSkill, activeSkillState.level)
    : 0;
  const activeSkillCost = activeSkill
    ? calcSkillCost(activeSkill, activeSkillState.level)
    : 0;
  const inventoryCapacity =
    BASE_INVENTORY_CAPACITY + (skills.inventory?.level ?? 0) * 100;

  function isSkillAvailable(skill) {
    if (!skill || skill.locked) return false;
    if (!Array.isArray(skill.requires) || skill.requires.length === 0) {
      return true;
    }
    return skill.requires.every((req) => {
      const level = skills[req.id]?.level ?? 0;
      return level >= Number(req.level || 0);
    });
  }

  const canUpgradeSkill =
    activeSkill &&
    !activeSkill.locked &&
    activeSkillState.xp >= activeSkillNeed &&
    wallet.dollars >= activeSkillCost &&
    (!activeSkill.slotOnly || skillSlots.includes(activeSkill.id));
  const slotCandidateSkill = slotCandidateId
    ? slotSkills.find((skill) => skill.id === slotCandidateId)
    : null;
  const canInstallSlotSkill =
    selectedSlotIndex !== null &&
    !selectedSlotSkill &&
    slotCandidateSkill &&
    isSkillAvailable(slotCandidateSkill) &&
    !skillSlots.includes(slotCandidateSkill.id);

  useEffect(() => {
    if (!baseSkills.length) return;
    const exists = baseSkills.some((skill) => skill.id === selectedSkillId);
    if (!exists) {
      setSelectedSkillId(baseSkills[0].id);
    }
  }, [baseSkills, selectedSkillId]);

  useEffect(() => {
    if (selectedSlotIndex == null) return;
    if (selectedSlotIndex < 0 || selectedSlotIndex >= skillSlots.length) {
      setSelectedSlotIndex(null);
    }
  }, [selectedSlotIndex, skillSlots.length]);

  return {
    activeCoreSkill,
    activeSkill,
    activeSkillCost,
    activeSkillNeed,
    activeSkillState,
    baseSkills,
    canInstallSlotSkill,
    canUpgradeSkill,
    inventoryCapacity,
    isSkillAvailable,
    selectedSlotIndex,
    selectedSlotSkill,
    setSelectedSkillId,
    setSelectedSlotIndex,
    setSlotCandidateId,
    slotCandidateId,
    slotCandidateSkill,
    slotSkills,
    visibleSkills
  };
}
