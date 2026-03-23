const { MAP_W, MAP_H } = require("../config");
const { hashNoise } = require("./noise");

function buildMacroSectors() {
  const sectors = [];
  const spacing = 190;
  for (let gy = -1; gy <= Math.ceil(MAP_H / spacing); gy += 1) {
    for (let gx = -1; gx <= Math.ceil(MAP_W / spacing); gx += 1) {
      const jitterX = Math.floor((hashNoise(gx, gy, 1) - 0.5) * 90);
      const jitterY = Math.floor((hashNoise(gx, gy, 2) - 0.5) * 90);
      const x = gx * spacing + spacing / 2 + jitterX;
      const y = gy * spacing + spacing / 2 + jitterY;
      if (x < -120 || x > MAP_W + 120 || y < -120 || y > MAP_H + 120) continue;
      const redMacro = false;
      const paletteRoll = hashNoise(gx, gy, 4);
      let paletteKey = "starter";
      if (redMacro) {
        paletteKey = "red_macro";
      } else if (paletteRoll < 0.23) {
        paletteKey = "starter";
      } else if (paletteRoll < 0.47) {
        paletteKey = "metal";
      } else if (paletteRoll < 0.71) {
        paletteKey = "acid";
      } else {
        paletteKey = "crystal";
      }
      const angle = hashNoise(gx, gy, 5) * Math.PI * 2;
      const angle2 = hashNoise(gx, gy, 6) * Math.PI * 2;
      const stretchX = 0.72 + hashNoise(gx, gy, 7) * 1.1;
      const stretchY = 0.72 + hashNoise(gx, gy, 8) * 1.1;
      const sizeRoll = hashNoise(gx, gy, 9);
      const shapeRoll = hashNoise(gx, gy, 10);
      let radius = 250;
      let shapeKind = "compact";
      if (sizeRoll < 0.18) {
        radius = 150 + hashNoise(gx, gy, 11) * 35;
        shapeKind = "pocket";
      } else if (sizeRoll < 0.42) {
        radius = 205 + hashNoise(gx, gy, 12) * 45;
        shapeKind = "narrow";
      } else if (sizeRoll < 0.76) {
        radius = 255 + hashNoise(gx, gy, 13) * 70;
        shapeKind = shapeRoll < 0.5 ? "compact" : "lobed";
      } else {
        radius = 325 + hashNoise(gx, gy, 14) * 95;
        shapeKind = shapeRoll < 0.5 ? "stretched" : "lobed";
      }
      const lobeAmp = 20 + hashNoise(gx, gy, 15) * 110;
      const lobeFreq = 2 + Math.floor(hashNoise(gx, gy, 16) * 4);
      const pinch = 0.08 + hashNoise(gx, gy, 17) * 0.32;
      sectors.push({
        id: `${gx},${gy}`,
        gx,
        gy,
        x,
        y,
        redMacro,
        paletteKey,
        angle,
        angle2,
        cos: Math.cos(angle),
        sin: Math.sin(angle),
        cos2: Math.cos(angle2),
        sin2: Math.sin(angle2),
        stretchX,
        stretchY,
        radius,
        shapeKind,
        lobeAmp,
        lobeFreq,
        pinch
      });
    }
  }
  return sectors;
}

module.exports = { buildMacroSectors };
