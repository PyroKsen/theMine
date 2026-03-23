export function updateCamera({ camera, localPosition, world, app, dtMs }) {
  if (!localPosition || !world || !app) return;

  if (!camera.ready) {
    camera.x = localPosition.x;
    camera.y = localPosition.y;
    camera.ready = true;
  } else {
    const smoothTimeMs = 320;
    const alpha = 1 - Math.exp(-dtMs / smoothTimeMs);
    camera.x += (localPosition.x - camera.x) * alpha;
    camera.y += (localPosition.y - camera.y) * alpha;
  }

  world.pivot.set(camera.x, camera.y);
  world.position.set(app.renderer.width / 2, app.renderer.height / 2);
}
