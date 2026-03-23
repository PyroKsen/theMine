function isBombSelected(selectedItemId) {
  return selectedItemId === "bomb" || selectedItemId === "plasmabomb" || selectedItemId === "electrobomb";
}

function isStorageSelected(selectedItemId) {
  return selectedItemId === "storage";
}

function isShopSelected(selectedItemId) {
  return selectedItemId === "shop";
}

function isUpgradeSelected(selectedItemId) {
  return selectedItemId === "upgrade";
}

function isRespawnSelected(selectedItemId) {
  return selectedItemId === "respawn";
}

function isTeleportSelected(selectedItemId) {
  return selectedItemId === "teleport";
}

function isBuildingSelected(selectedItemId) {
  return (
    isStorageSelected(selectedItemId) ||
    isShopSelected(selectedItemId) ||
    isRespawnSelected(selectedItemId) ||
    isTeleportSelected(selectedItemId) ||
    isUpgradeSelected(selectedItemId)
  );
}

function getFrontTile(localPlayer, map) {
  if (!localPlayer.ready) return null;
  const tx = localPlayer.tx + localPlayer.fx;
  const ty = localPlayer.ty + localPlayer.fy;
  if (tx < 0 || tx >= map.w || ty < 0 || ty >= map.h) {
    return null;
  }
  return { x: tx, y: ty };
}

function collectOccupiedCells(state) {
  const latest = state.snapshots[state.snapshots.length - 1];
  const occupied = new Set();
  if (!latest) return occupied;

  for (const p of latest.map.values()) {
    if (p.id !== state.playerId) {
      occupied.add(`${p.tx},${p.ty}`);
    }
  }
  return occupied;
}

export function updatePlacementPreview({
  selectedItemId,
  mapOpen,
  placement,
  placementLayer,
  localPlayer,
  state,
  isCellEmpty
}) {
  if (mapOpen || (!isBombSelected(selectedItemId) && !isBuildingSelected(selectedItemId))) {
    placement.valid = false;
    if (placementLayer) placementLayer.visible = false;
    return;
  }

  const front = getFrontTile(localPlayer, state.map);
  if (!front) {
    placement.valid = false;
    if (placementLayer) placementLayer.visible = false;
    return;
  }

  placement.x = front.x;
  placement.y = front.y;

  if (!placementLayer) return;
  const { tile } = state.map;
  placementLayer.clear();

  if (isBombSelected(selectedItemId)) {
    const valid = isCellEmpty(front.x, front.y);
    placement.valid = valid;
    placementLayer.beginFill(valid ? 0x38d86b : 0xff5d5d, 0.35);
    placementLayer.drawRect(front.x * tile, front.y * tile, tile, tile);
    placementLayer.endFill();
    placementLayer.visible = true;
    return;
  }

  if (!isBuildingSelected(selectedItemId)) {
    placement.valid = false;
    placementLayer.visible = false;
    return;
  }

  const facingUp = localPlayer.fx === 0 && localPlayer.fy === -1;
  const occupied = collectOccupiedCells(state);

  if (isStorageSelected(selectedItemId)) {
    const topLeftX = front.x - 1;
    const topLeftY = front.y - 1;
    const width = 3;
    const height = 2;
    let valid = facingUp;
    if (
      topLeftX < 0 ||
      topLeftY < 0 ||
      topLeftX + width > state.map.w ||
      topLeftY + height > state.map.h
    ) {
      valid = false;
    } else {
      const checkX0 = topLeftX - 1;
      const checkY0 = topLeftY - 1;
      const checkX1 = topLeftX + width;
      const checkY1 = topLeftY + height;
      if (
        checkX0 < 0 ||
        checkY0 < 0 ||
        checkX1 >= state.map.w ||
        checkY1 >= state.map.h
      ) {
        valid = false;
      } else {
        for (let y = checkY0; y <= checkY1; y += 1) {
          for (let x = checkX0; x <= checkX1; x += 1) {
            if (!isCellEmpty(x, y) || occupied.has(`${x},${y}`)) {
              valid = false;
              break;
            }
          }
          if (!valid) break;
        }
      }
    }

    placement.valid = valid;
    placementLayer.beginFill(valid ? 0x38d86b : 0xff5d5d, 0.35);
    for (let y = topLeftY; y < topLeftY + height; y += 1) {
      for (let x = topLeftX; x < topLeftX + width; x += 1) {
        if (x === front.x && y === front.y) continue;
        placementLayer.drawRect(x * tile, y * tile, tile, tile);
      }
    }
    placementLayer.endFill();
    placementLayer.visible = true;
    return;
  }

  if (isShopSelected(selectedItemId)) {
    const radius = 2;
    const topLeftX = front.x - radius;
    const topLeftY = front.y - radius;
    const size = radius * 2 + 1;
    let valid = facingUp;
    if (
      topLeftX < 0 ||
      topLeftY < 0 ||
      topLeftX + size > state.map.w ||
      topLeftY + size > state.map.h
    ) {
      valid = false;
    } else {
      const checkX0 = topLeftX - 1;
      const checkY0 = topLeftY - 1;
      const checkX1 = topLeftX + size;
      const checkY1 = topLeftY + size;
      if (
        checkX0 < 0 ||
        checkY0 < 0 ||
        checkX1 >= state.map.w ||
        checkY1 >= state.map.h
      ) {
        valid = false;
      } else {
        for (let y = checkY0; y <= checkY1; y += 1) {
          for (let x = checkX0; x <= checkX1; x += 1) {
            if (!isCellEmpty(x, y) || occupied.has(`${x},${y}`)) {
              valid = false;
              break;
            }
          }
          if (!valid) break;
        }
      }
    }

    placement.valid = valid;
    placementLayer.beginFill(valid ? 0x38d86b : 0xff5d5d, 0.35);
    for (let y = topLeftY; y < topLeftY + size; y += 1) {
      for (let x = topLeftX; x < topLeftX + size; x += 1) {
        const onCross =
          (x === front.x && Math.abs(y - front.y) <= radius) ||
          (y === front.y && Math.abs(x - front.x) <= radius);
        const isCorner =
          (x === topLeftX && y === topLeftY) ||
          (x === topLeftX && y === topLeftY + size - 1) ||
          (x === topLeftX + size - 1 && y === topLeftY) ||
          (x === topLeftX + size - 1 && y === topLeftY + size - 1);
        if (onCross || isCorner) continue;
        placementLayer.drawRect(x * tile, y * tile, tile, tile);
      }
    }
    placementLayer.endFill();
    placementLayer.visible = true;
    return;
  }

  if (isRespawnSelected(selectedItemId) || isTeleportSelected(selectedItemId)) {
    const topLeftX = front.x - 1;
    const topLeftY = front.y - 2;
    const width = 3;
    const height = 3;
    let valid = facingUp;
    if (
      topLeftX < 0 ||
      topLeftY < 0 ||
      topLeftX + width > state.map.w ||
      topLeftY + height > state.map.h
    ) {
      valid = false;
    } else {
      const checkX0 = topLeftX - 1;
      const checkY0 = topLeftY - 1;
      const checkX1 = topLeftX + width;
      const checkY1 = topLeftY + height;
      if (
        checkX0 < 0 ||
        checkY0 < 0 ||
        checkX1 >= state.map.w ||
        checkY1 >= state.map.h
      ) {
        valid = false;
      } else {
        for (let y = checkY0; y <= checkY1; y += 1) {
          for (let x = checkX0; x <= checkX1; x += 1) {
            if (!isCellEmpty(x, y) || occupied.has(`${x},${y}`)) {
              valid = false;
              break;
            }
          }
          if (!valid) break;
        }
      }
    }

    placement.valid = valid;
    placementLayer.beginFill(valid ? 0x38d86b : 0xff5d5d, 0.35);
    for (let y = topLeftY; y < topLeftY + height; y += 1) {
      for (let x = topLeftX; x < topLeftX + width; x += 1) {
        if (x === front.x && y === front.y - 1) continue;
        if (x === front.x && y === front.y) continue;
        placementLayer.drawRect(x * tile, y * tile, tile, tile);
      }
    }
    placementLayer.endFill();
    placementLayer.visible = true;
    return;
  }

  if (isUpgradeSelected(selectedItemId)) {
    const topLeftX = front.x - 1;
    const topLeftY = front.y - 2;
    const width = 3;
    const height = 3;
    const topRightX = topLeftX + width - 1;
    let valid = facingUp;
    if (
      topLeftX < 0 ||
      topLeftY < 0 ||
      topLeftX + width > state.map.w ||
      topLeftY + height > state.map.h
    ) {
      valid = false;
    } else {
      const checkX0 = topLeftX - 1;
      const checkY0 = topLeftY - 1;
      const checkX1 = topLeftX + width;
      const checkY1 = topLeftY + height;
      if (
        checkX0 < 0 ||
        checkY0 < 0 ||
        checkX1 >= state.map.w ||
        checkY1 >= state.map.h
      ) {
        valid = false;
      } else {
        for (let y = checkY0; y <= checkY1; y += 1) {
          for (let x = checkX0; x <= checkX1; x += 1) {
            if (!isCellEmpty(x, y) || occupied.has(`${x},${y}`)) {
              valid = false;
              break;
            }
          }
          if (!valid) break;
        }
      }
    }

    placement.valid = valid;
    placementLayer.beginFill(valid ? 0x38d86b : 0xff5d5d, 0.35);
    for (let y = topLeftY; y < topLeftY + height; y += 1) {
      for (let x = topLeftX; x < topLeftX + width; x += 1) {
        if (x === front.x && y === front.y) continue;
        if (x === front.x && y === front.y - 1) continue;
        if (y === topLeftY && (x === topLeftX || x === topRightX)) continue;
        placementLayer.drawRect(x * tile, y * tile, tile, tile);
      }
    }
    placementLayer.endFill();
    placementLayer.visible = true;
    return;
  }

  placement.valid = false;
  placementLayer.visible = false;
}
