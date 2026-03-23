const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { createMapStore } = require("../lib/mapStore");
const { MAP_W, MAP_H, TILE_TYPES } = require("../lib/config");

const COLOR_BY_TILE = new Map([
  [TILE_TYPES.empty, [11, 16, 22]],
  [TILE_TYPES.rock, [43, 15, 77]],
  [TILE_TYPES.crystalGreen, [56, 216, 107]],
  [TILE_TYPES.crystalBlue, [77, 163, 255]],
  [TILE_TYPES.crystalWhite, [240, 244, 255]],
  [TILE_TYPES.crystalRed, [255, 93, 93]],
  [TILE_TYPES.crystalPink, [255, 127, 214]],
  [TILE_TYPES.crystalCyan, [94, 233, 255]],
  [TILE_TYPES.blackRock, [11, 11, 15]],
  [TILE_TYPES.redRock, [122, 15, 15]],
  [TILE_TYPES.buildGreen, [59, 217, 122]],
  [TILE_TYPES.buildYellow, [249, 199, 79]],
  [TILE_TYPES.buildRed, [255, 107, 107]],
  [TILE_TYPES.dropBox, [212, 180, 104]],
  [TILE_TYPES.semiMagneticRock, [95, 75, 43]],
  [TILE_TYPES.magneticRock, [127, 104, 22]],
  [TILE_TYPES.acidRock, [29, 79, 47]],
  [TILE_TYPES.reinforcedRock, [58, 39, 44]],
  [TILE_TYPES.ironRock, [45, 49, 53]],
  [TILE_TYPES.steelRock, [30, 33, 37]],
  [TILE_TYPES.slimeRock, [47, 111, 68]],
  [TILE_TYPES.corrosiveRock, [116, 212, 79]],
  [TILE_TYPES.radioactiveRock, [157, 255, 47]],
  [TILE_TYPES.sand, [212, 178, 74]],
  [TILE_TYPES.steelSand, [127, 201, 255]],
  [TILE_TYPES.magma, [106, 27, 8]],
  [TILE_TYPES.liveCrystalBlue, [46, 99, 255]],
  [TILE_TYPES.liveCrystalWhite, [255, 242, 168]],
  [TILE_TYPES.liveCrystalPink, [168, 92, 255]],
  [TILE_TYPES.liveCrystalRed, [255, 63, 82]],
  [TILE_TYPES.liveCrystalCyan, [86, 240, 255]],
  [TILE_TYPES.hypnoRock, [21, 32, 58]],
  [TILE_TYPES.liveCrystalRainbow, [255, 207, 90]]
]);

function darken(rgb, factor) {
  return rgb.map((value) => Math.max(0, Math.min(255, Math.round(value * factor))));
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  const crcValue = crc32(Buffer.concat([typeBuffer, data]));
  crcBuffer.writeUInt32BE(crcValue >>> 0, 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function main() {
  const dataDir = path.resolve(__dirname, "..", "data");
  const outArg = process.argv[2];
  const scaleArg = Number(process.argv[3] || 1);
  const scale = Number.isFinite(scaleArg) && scaleArg >= 1 ? Math.floor(scaleArg) : 1;
  const outputPath = outArg
    ? path.resolve(process.cwd(), outArg)
    : path.join(dataDir, "world-map.png");

  const mapStore = createMapStore(dataDir);
  const width = MAP_W * scale;
  const height = MAP_H * scale;
  const rgba = Buffer.alloc(width * height * 4);

  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      const tileType = mapStore.getTile(x, y);
      const building = mapStore.getBuilding(x, y);
      let color = COLOR_BY_TILE.get(tileType) || [255, 0, 255];
      if (building) {
        color = darken([200, 206, 217], 0.92);
      }
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const px = x * scale + sx;
          const py = y * scale + sy;
          const idx = (py * width + px) * 4;
          rgba[idx] = color[0];
          rgba[idx + 1] = color[1];
          rgba[idx + 2] = color[2];
          rgba[idx + 3] = 255;
        }
      }
    }
  }

  fs.writeFileSync(outputPath, encodePng(width, height, rgba));
  console.log(`Exported world map to ${outputPath} (${width}x${height})`);
}

main();
