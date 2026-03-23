import { Graphics } from "pixi.js";

function buildingSmokeAnchor(building) {
  if (building.type === "storage" && building.entrance) return building.entrance;
  if (building.type === "shop" && building.center) return building.center;
  if (building.type === "upgrade" && building.center) return building.center;
  if (building.center) return building.center;
  if (building.entrance) return building.entrance;
  return {
    x: (building.x ?? 0) + (building.w ?? 1) / 2,
    y: (building.y ?? 0) + (building.h ?? 1) / 2
  };
}

export function emitBuildingSmoke({ building, effectsLayer, effects, tile }) {
  if (!effectsLayer) return;

  const anchor = buildingSmokeAnchor(building);
  const puff = new Graphics();
  const radius = Math.max(6, tile * (0.18 + Math.random() * 0.12));
  puff.beginFill(0x535860, 0.42);
  puff.drawCircle(0, 0, radius);
  puff.drawCircle(radius * 0.55, -radius * 0.15, radius * 0.8);
  puff.drawCircle(-radius * 0.45, -radius * 0.2, radius * 0.75);
  puff.endFill();
  puff.position.set(
    (anchor.x + 0.5) * tile + (Math.random() - 0.5) * tile * 0.45,
    (anchor.y + 0.5) * tile - tile * (0.05 + Math.random() * 0.18)
  );
  effectsLayer.addChild(puff);
  effects.push({
    sprite: puff,
    age: 0,
    duration: 3800 + Math.random() * 1800,
    kind: "smoke",
    startX: puff.x,
    startY: puff.y,
    driftX: (Math.random() - 0.5) * tile * 0.6,
    driftY: tile * (1.15 + Math.random() * 0.8),
    startScale: 0.68 + Math.random() * 0.18
  });
}

export function syncBuildingSmokeEmitters({ buildings, smokeEmitters }) {
  const nextIds = new Set();
  for (const building of buildings || []) {
    if (!building?.id || !building.inactive || (building.hp ?? 0) > 0) {
      continue;
    }
    nextIds.add(building.id);
    if (!smokeEmitters.has(building.id)) {
      smokeEmitters.set(building.id, {
        buildingId: building.id,
        cooldownMs: 40 + Math.random() * 90
      });
    }
  }
  for (const id of smokeEmitters.keys()) {
    if (!nextIds.has(id)) {
      smokeEmitters.delete(id);
    }
  }
}

export function updateEffects({
  dtMs,
  effects,
  effectsLayer,
  smokeEmitters,
  buildings,
  tile
}) {
  syncBuildingSmokeEmitters({ buildings, smokeEmitters });

  for (const emitter of smokeEmitters.values()) {
    emitter.cooldownMs -= dtMs;
    if (emitter.cooldownMs > 0) continue;

    const building = (buildings || []).find((entry) => entry.id === emitter.buildingId);
    if (building && building.inactive && (building.hp ?? 0) <= 0) {
      emitBuildingSmoke({ building, effectsLayer, effects, tile });
      if (Math.random() > 0.35) {
        emitBuildingSmoke({ building, effectsLayer, effects, tile });
      }
    }
    emitter.cooldownMs = 80 + Math.random() * 140;
  }

  for (let i = effects.length - 1; i >= 0; i -= 1) {
    const effect = effects[i];
    effect.age += dtMs;
    const t = Math.min(1, effect.age / effect.duration);
    if (t >= 1) {
      effectsLayer.removeChild(effect.sprite);
      effect.sprite.destroy();
      effects.splice(i, 1);
    } else if (effect.kind === "float") {
      effect.sprite.alpha = 1 - t;
      effect.sprite.y = effect.startY - t * 14;
    } else if (effect.kind === "smoke") {
      effect.sprite.alpha = (1 - t) * 0.72;
      effect.sprite.x = effect.startX + effect.driftX * t;
      effect.sprite.y = effect.startY - effect.driftY * t;
      const scale = effect.startScale + t * 1.3;
      effect.sprite.scale.set(scale);
    } else {
      effect.sprite.alpha = 1 - t;
      const scale = 1 + t * 0.6;
      effect.sprite.scale.set(scale);
    }
  }
}
