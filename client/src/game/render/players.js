import { Container, Graphics, Text } from "pixi.js";
import { COLORS, FACING_ROTATIONS, VIEW_RADIUS_TILES } from "../constants.js";
import { lerp, smoothTowards } from "../helpers.js";

function getPlayerSprite({ id, state, playersLayer }) {
  let sprite = state.players.get(id);
  if (!sprite) {
    sprite = new Container();
    const body = new Graphics();
    const color = id === state.playerId ? COLORS.playerSelf : COLORS.player;
    body.beginFill(color);
    body.drawRect(-12, -12, 24, 24);
    body.endFill();
    const facing = new Graphics();
    facing.beginFill(COLORS.facing);
    facing.drawPolygon([0, -18, -5, -10, 5, -10]);
    facing.endFill();
    const label = new Text("", {
      fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
      fontSize: 12,
      fill: COLORS.name,
      stroke: COLORS.nameStroke,
      strokeThickness: 3,
      align: "center"
    });
    if (label.anchor) {
      label.anchor.set(0.5);
    }
    label.position.set(0, -22);
    sprite.body = body;
    sprite.facingGraphic = facing;
    sprite.label = label;
    sprite.renderPos = { x: 0, y: 0, ready: false };
    sprite.addChild(body);
    sprite.addChild(facing);
    sprite.addChild(label);
    playersLayer.addChild(sprite);
    state.players.set(id, sprite);
  }
  return sprite;
}

function removeMissingPlayers({ activeIds, state, playersLayer }) {
  for (const [id, sprite] of state.players.entries()) {
    if (!activeIds.has(id)) {
      playersLayer.removeChild(sprite);
      sprite.destroy({ children: true });
      state.players.delete(id);
    }
  }
}

export function updatePlayers({ older, newer, t, dtMs, state, playersLayer }) {
  const ids = new Set();
  for (const id of older.map.keys()) ids.add(id);
  for (const id of newer.map.keys()) ids.add(id);

  const activeIds = new Set();
  let localPosition = null;
  const selfId = state.playerId;
  const selfA = selfId ? older.map.get(selfId) || newer.map.get(selfId) : null;
  const selfB = selfId ? newer.map.get(selfId) || selfA : null;
  const selfTx = selfA && selfB ? lerp(selfA.tx, selfB.tx, t) : null;
  const selfTy = selfA && selfB ? lerp(selfA.ty, selfB.ty, t) : null;
  const radiusSq = VIEW_RADIUS_TILES * VIEW_RADIUS_TILES;

  const { tile } = state.map;
  for (const id of ids) {
    const a = older.map.get(id) || newer.map.get(id);
    const b = newer.map.get(id) || a;
    if (!a || !b) continue;
    const nextX = lerp(a.tx, b.tx, t);
    const nextY = lerp(a.ty, b.ty, t);
    const x = (nextX + 0.5) * tile;
    const y = (nextY + 0.5) * tile;
    const sprite = getPlayerSprite({ id, state, playersLayer });

    if (selfTx != null && selfTy != null && id !== selfId) {
      const dx = nextX - selfTx;
      const dy = nextY - selfTy;
      sprite.visible = dx * dx + dy * dy <= radiusSq;
    } else {
      sprite.visible = true;
    }

    if (!sprite.renderPos.ready) {
      sprite.renderPos.x = x;
      sprite.renderPos.y = y;
      sprite.renderPos.ready = true;
    } else {
      sprite.renderPos.x = smoothTowards(sprite.renderPos.x, x, dtMs, 90);
      sprite.renderPos.y = smoothTowards(sprite.renderPos.y, y, dtMs, 90);
    }
    sprite.position.set(sprite.renderPos.x, sprite.renderPos.y);

    const fx = b.fx ?? a.fx;
    const fy = b.fy ?? a.fy;
    if (fx !== undefined && fy !== undefined && (fx !== 0 || fy !== 0)) {
      const rot = FACING_ROTATIONS.get(`${fx},${fy}`) ?? 0;
      if (sprite.facingGraphic) {
        sprite.facingGraphic.rotation = rot;
      }
    }

    const name = id === state.playerId ? "" : b.name || a.name || "";
    if (sprite.label && sprite.label.text !== name) {
      sprite.label.text = name;
      if (sprite.label.anchor) {
        sprite.label.anchor.set(0.5);
      } else {
        sprite.label.position.set(-sprite.label.width / 2, -22);
      }
    }

    activeIds.add(id);
    if (id === state.playerId) {
      localPosition = { x: sprite.renderPos.x, y: sprite.renderPos.y };
    }
  }

  removeMissingPlayers({ activeIds, state, playersLayer });
  return { localPosition };
}
