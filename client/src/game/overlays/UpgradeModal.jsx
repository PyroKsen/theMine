import React from "react";
import { BuildingManagePanel } from "./BuildingManagePanel.jsx";

export function UpgradeModal({
  open,
  upgradeTab,
  onTabChange,
  upgradeOwner,
  currentUsername,
  upgradeBuilding,
  inventoryBlue,
  skillSlots,
  skillConfig,
  visibleSkills,
  skills,
  selectedSlotIndex,
  setSelectedSlotIndex,
  setSelectedSkillId,
  selectedSlotSkill,
  slotSkills,
  slotCandidateId,
  setSlotCandidateId,
  slotCandidateSkill,
  canInstallSlotSkill,
  requestSkillSlotSet,
  activeCoreSkill,
  activeSkill,
  activeSkillState,
  activeSkillNeed,
  activeSkillCost,
  canUpgradeSkill,
  formatSkillTotal,
  onCollect,
  requestSkillUpgrade,
  isSkillAvailable,
  onRepair
}) {
  if (!open) return null;
  const manageOnly = Boolean(upgradeBuilding?.inactive);

  return (
    <div className="storage-backdrop">
      <div className="storage-modal">
        <div className="storage-title">Upgrade</div>
        <div className="shop-tabs">
          {!manageOnly ? (
            <button
              className={`shop-tab${upgradeTab === "upgrade" ? " is-active" : ""}`}
              type="button"
              onClick={() => onTabChange("upgrade")}
            >
              Upgrade
            </button>
          ) : null}
          {upgradeOwner && upgradeOwner === currentUsername ? (
            <button
              className={`shop-tab${upgradeTab === "manage" ? " is-active" : ""}`}
              type="button"
              onClick={() => onTabChange("manage")}
            >
              Manage
            </button>
          ) : null}
        </div>
        {upgradeTab === "manage" || manageOnly ? (
          <BuildingManagePanel
            building={upgradeBuilding}
            inventoryBlue={inventoryBlue}
            onCollect={onCollect}
            onRepair={onRepair}
          />
        ) : (
          <div className="upgrade-body">
            <div className="upgrade-ring">
              <div className="skill-ring">
                {Array.from({ length: 20 }).map((_, index) => {
                  const angle = (index / 20) * Math.PI * 2 - Math.PI / 2;
                  const radius = 98;
                  const x = 110 + radius * Math.cos(angle);
                  const y = 110 + radius * Math.sin(angle);
                  const slotSkillId = skillSlots[index];
                  const slotSkill = slotSkillId
                    ? skillConfig.find((skill) => skill.id === slotSkillId)
                    : null;
                  const isSelected = selectedSlotIndex === index;
                  return (
                    <button
                      key={`slot-${index}`}
                      className={`skill-ring-slot${slotSkill ? " has-skill" : ""}${isSelected ? " is-selected" : ""}`}
                      type="button"
                      style={{ left: `${x}px`, top: `${y}px` }}
                      onClick={() => {
                        setSelectedSlotIndex((prev) =>
                          prev === index ? null : index
                        );
                        if (!slotSkill) {
                          setSlotCandidateId(null);
                        }
                      }}
                    >
                      {slotSkill ? (
                        <span className="skill-ring-slot-label">
                          {slotSkill.short || "?"}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                <div className="skill-core">
                  {visibleSkills.map((skill, index) => {
                    const angle = (index / 5) * Math.PI * 2 - Math.PI / 2;
                    const radius = 52;
                    const x = 70 + radius * Math.cos(angle);
                    const y = 70 + radius * Math.sin(angle);
                    const level = skills[skill.id]?.level ?? 0;
                    const isSelected =
                      selectedSlotIndex === null &&
                      skill.id === activeCoreSkill?.id;
                    return (
                      <button
                        key={skill.id}
                        className={`skill-node${isSelected ? " is-selected" : ""}${skill.locked ? " is-locked" : ""}`}
                        type="button"
                        onClick={() => {
                          setSelectedSkillId(skill.id);
                          setSelectedSlotIndex(null);
                        }}
                        style={{ left: `${x}px`, top: `${y}px` }}
                      >
                        <div className="skill-node-label">
                          {skill.short || "?"}
                        </div>
                        <div className="skill-node-level">Lv {level}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="upgrade-panel">
              {selectedSlotIndex !== null && !selectedSlotSkill ? (
                <>
                  <div className="upgrade-skill-title">Choose Slot Skill</div>
                  <div className="slot-skill-list">
                    {slotSkills
                      .filter((skill) => !skillSlots.includes(skill.id))
                      .map((skill) => {
                        const available = isSkillAvailable(skill);
                        const isSelected = slotCandidateId === skill.id;
                        return (
                          <button
                            key={skill.id}
                            className={`slot-skill-item${available ? " is-available" : " is-locked"}${isSelected ? " is-selected" : ""}`}
                            type="button"
                            onClick={() => setSlotCandidateId(skill.id)}
                          >
                            <span className="slot-skill-name">{skill.name}</span>
                            <span className="slot-skill-short">{skill.short}</span>
                          </button>
                        );
                      })}
                  </div>
                  <div className="slot-skill-desc">
                    {slotCandidateSkill
                      ? slotCandidateSkill.desc
                      : "Select a skill on the right to see its description."}
                  </div>
                  <button
                    className="upgrade-btn"
                    type="button"
                    disabled={!canInstallSlotSkill}
                    onClick={() => {
                      if (!slotCandidateSkill) return;
                      requestSkillSlotSet(selectedSlotIndex, slotCandidateSkill.id);
                      setSlotCandidateId(null);
                    }}
                  >
                    Install
                  </button>
                </>
              ) : activeSkill ? (
                <>
                  <div className="upgrade-skill-title">{activeSkill.name}</div>
                  <div className="upgrade-skill-desc">{activeSkill.desc}</div>
                  <div className="upgrade-skill-stats">
                    <div>Level: {activeSkillState.level}</div>
                    <div>Total: {formatSkillTotal(activeSkill, activeSkillState.level)}</div>
                    <div>XP: {activeSkill.locked ? "-" : `${activeSkillState.xp} / ${activeSkillNeed}`}</div>
                    <div>Cost: {activeSkill.locked ? "-" : `$${activeSkillCost}`}</div>
                  </div>
                  <button
                    className="upgrade-btn"
                    type="button"
                    disabled={!canUpgradeSkill}
                    onClick={() => requestSkillUpgrade(activeSkill.id)}
                  >
                    {activeSkill.locked ? "Soon" : "Upgrade"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
