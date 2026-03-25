import { Graphics, Text } from "pixi.js";
import { crystalColor } from "../helpers.js";

export function createEffectHandlers({
  state,
  bombs,
  bombsLayer,
  effects,
  effectsLayer,
  tileHpRef,
  createBombSprite,
  updatePlacement
}) {
  function handleBombPlaced(msg) {
    if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
    const key = `${msg.x},${msg.y}`;
    if (bombs.has(key)) return;
    const sprite = createBombSprite(msg.x, msg.y, msg.type);
    bombsLayer.addChild(sprite);
    bombs.set(key, { id: msg.id, sprite, type: msg.type });
    updatePlacement();
  }

  function handleBombExplode(msg) {
    const key = `${msg.x},${msg.y}`;
    const entry = bombs.get(key);
    if (entry) {
      bombsLayer.removeChild(entry.sprite);
      entry.sprite.destroy();
      bombs.delete(key);
    }
    if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
      const { tile } = state.map;
      const blast = new Graphics();
      if (msg.type === "electrobomb") {
        const radius = Math.max(18, tile * (msg.r || 7));
        blast.beginFill(0x6ef2ff, 0.12);
        blast.drawCircle(0, 0, radius);
        blast.endFill();
        blast.lineStyle(4, 0x7ef7ff, 0.95);
        blast.drawCircle(0, 0, radius * 0.55);
        blast.lineStyle(2, 0x24cfff, 0.85);
        blast.drawCircle(0, 0, radius);
        for (let i = 0; i < 10; i += 1) {
          const angle = (Math.PI * 2 * i) / 10;
          const inner = radius * (0.2 + (i % 3) * 0.08);
          const outer = radius * (0.72 + (i % 2) * 0.12);
          blast.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
          blast.lineTo(
            Math.cos(angle + 0.14) * outer,
            Math.sin(angle + 0.14) * outer
          );
        }
        blast.position.set((msg.x + 0.5) * tile, (msg.y + 0.5) * tile);
        effectsLayer.addChild(blast);
        effects.push({
          sprite: blast,
          age: 0,
          duration: 420,
          kind: "spark"
        });

        for (let i = 0; i < 6; i += 1) {
          const arc = new Graphics();
          arc.lineStyle(2, 0xb8fcff, 0.9);
          const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.25;
          arc.moveTo(0, 0);
          arc.lineTo(
            Math.cos(angle) * radius * (0.45 + Math.random() * 0.2),
            Math.sin(angle) * radius * (0.45 + Math.random() * 0.2)
          );
          arc.lineTo(
            Math.cos(angle + 0.18) * radius * (0.8 + Math.random() * 0.12),
            Math.sin(angle + 0.18) * radius * (0.8 + Math.random() * 0.12)
          );
          arc.position.set((msg.x + 0.5) * tile, (msg.y + 0.5) * tile);
          effectsLayer.addChild(arc);
          effects.push({
            sprite: arc,
            age: 0,
            duration: 220 + i * 25,
            kind: "spark"
          });
        }
      } else {
        blast.lineStyle(3, 0xff8f4a, 0.9);
        if (msg.shape === "cross") {
          const radius = msg.r || 1;
          const len = tile * radius;
          blast.moveTo(-len, 0);
          blast.lineTo(len, 0);
          blast.moveTo(0, -len);
          blast.lineTo(0, len);
        } else {
          blast.drawCircle(0, 0, Math.max(12, tile * (msg.r || 4)));
        }
        blast.position.set((msg.x + 0.5) * tile, (msg.y + 0.5) * tile);
        effectsLayer.addChild(blast);
        effects.push({
          sprite: blast,
          age: 0,
          duration: 300,
          kind: "spark"
        });
      }
    }
    updatePlacement();
  }

  function handleHit(msg) {
    const { tile } = state.map;
    if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
    const spark = new Graphics();
    spark.lineStyle(2, 0xffc36a, 0.9);
    spark.drawCircle(0, 0, Math.max(4, tile * 0.2));
    spark.lineStyle(2, 0xfff2b0, 0.8);
    spark.moveTo(-tile * 0.2, 0);
    spark.lineTo(tile * 0.2, 0);
    spark.position.set((msg.x + 0.5) * tile, (msg.y + 0.5) * tile);
    effectsLayer.addChild(spark);
    effects.push({
      sprite: spark,
      age: 0,
      duration: 160,
      kind: "spark"
    });

    if (Number.isFinite(msg.hpCurrent) && Number.isFinite(msg.hpMax)) {
      tileHpRef.current.set(`${msg.x},${msg.y}`, {
        current: Math.max(0, Number(msg.hpCurrent)),
        max: Math.max(0, Number(msg.hpMax))
      });
    }

    if (msg.amount && msg.amount > 0) {
      const color = crystalColor(msg.type);
      if (color !== null) {
        const text = new Text(`+${msg.amount}`, {
          fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
          fontSize: 14,
          fill: color,
          stroke: 0x0b1016,
          strokeThickness: 3
        });
        if (text.anchor) {
          text.anchor.set(0.5);
        }
        text.position.set((msg.x + 0.5) * tile, (msg.y + 0.5) * tile - 6);
        effectsLayer.addChild(text);
        effects.push({
          sprite: text,
          age: 0,
          duration: 600,
          kind: "float",
          startY: text.y
        });
      }
    }
  }

  return {
    handleBombPlaced,
    handleBombExplode,
    handleHit
  };
}
