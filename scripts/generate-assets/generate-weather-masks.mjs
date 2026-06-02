import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT_DIR = path.join(process.cwd(), "public", "learning-space", "weather");
const WIDTH = 1024;
const HEIGHT = 512;

fs.mkdirSync(OUT_DIR, { recursive: true });

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(0.000001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoiseGrid(random, columns, rows) {
  const values = new Float32Array(columns * rows);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = random();
  }
  return { columns, rows, values };
}

function sampleNoise(grid, u, v) {
  const wrappedU = ((u % 1) + 1) % 1;
  const clampedV = clamp(v, 0, 0.999999);

  const x = wrappedU * grid.columns;
  const y = clampedV * grid.rows;

  const x0 = Math.floor(x) % grid.columns;
  const x1 = (x0 + 1) % grid.columns;
  const y0 = clamp(Math.floor(y), 0, grid.rows - 1);
  const y1 = clamp(y0 + 1, 0, grid.rows - 1);

  const tx = x - Math.floor(x);
  const ty = y - Math.floor(y);
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  const a = grid.values[y0 * grid.columns + x0];
  const b = grid.values[y0 * grid.columns + x1];
  const c = grid.values[y1 * grid.columns + x0];
  const d = grid.values[y1 * grid.columns + x1];

  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

function buildCrcTable() {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }

  return table;
}

const CRC_TABLE = buildCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scanlineLength = width * 4 + 1;
  const raw = Buffer.alloc(scanlineLength * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * scanlineLength;
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function writePng(filename, rgba) {
  const filePath = path.join(OUT_DIR, filename);
  fs.writeFileSync(filePath, encodePng(WIDTH, HEIGHT, rgba));
  console.log(`Wrote ${path.relative(process.cwd(), filePath)}`);
}

function makeCloudMask({
  seed,
  density,
  threshold,
  sharpness,
  wispy,
  stormy,
}) {
  const random = mulberry32(hashString(seed));
  const coarse = makeNoiseGrid(random, 18, 10);
  const mid = makeNoiseGrid(random, 52, 26);
  const fine = makeNoiseGrid(random, 132, 66);
  const micro = makeNoiseGrid(random, 260, 130);

  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);

  for (let y = 0; y < HEIGHT; y += 1) {
    const v = y / Math.max(1, HEIGHT - 1);
    const poleFade = 0.62 + 0.38 * Math.sin(Math.PI * clamp(v, 0, 1));

    for (let x = 0; x < WIDTH; x += 1) {
      const u = x / Math.max(1, WIDTH - 1);
      const driftU = u + Math.sin(v * Math.PI * 2.5) * 0.052;
      const driftV = v + Math.sin(u * Math.PI * 2.0) * 0.025;

      const n1 = sampleNoise(coarse, driftU, driftV);
      const n2 = sampleNoise(mid, driftU * 1.75 + 0.12, driftV * 1.35 + 0.04);
      const n3 = sampleNoise(fine, driftU * 3.5 + 0.33, driftV * 2.8 + 0.18);
      const n4 = sampleNoise(micro, driftU * 7.0 + 0.51, driftV * 5.5 + 0.37);

      const belts =
        0.5 +
        0.5 *
          Math.sin(
            v * Math.PI * (7.0 + stormy * 3.0) +
              n1 * 2.7 +
              Math.sin(u * Math.PI * 2) * 0.65,
          );

      const field =
        n1 * 0.34 +
        n2 * 0.3 +
        n3 * 0.22 +
        n4 * 0.14 +
        belts * (0.12 + stormy * 0.08) -
        Math.abs(v - 0.53) * 0.07;

      const core = smoothstep(threshold, threshold + sharpness, field);
      const edge = smoothstep(
        threshold - 0.075,
        threshold + sharpness * 1.6,
        field,
      );
      const wisp = smoothstep(0.6 - wispy * 0.08, 0.91, n4) * edge;

      const alpha = clamp(
        (edge * (0.55 + density * 0.45) + wisp * wispy * 0.55) *
          poleFade,
        0,
        1,
      );

      const shadow = sampleNoise(mid, driftU * 2.2 + 0.7, driftV * 1.9 + 0.2);
      const shadowAmount = smoothstep(0.58, 0.92, shadow) * stormy * edge;

      const white = 225 + core * 30;
      const blueShadow = 165 - shadowAmount * 42;
      const r = lerp(blueShadow, white, core * 0.82 + 0.18);
      const g = lerp(blueShadow + 8, white, core * 0.82 + 0.18);
      const b = lerp(210, 255, core * 0.7 + 0.3);

      const index = (y * WIDTH + x) * 4;
      rgba[index] = clamp(r, 0, 255);
      rgba[index + 1] = clamp(g, 0, 255);
      rgba[index + 2] = clamp(b, 0, 255);
      rgba[index + 3] = clamp(alpha * 255, 0, 255);
    }
  }

  return rgba;
}

function makeSunbreakMask(seed) {
  const random = mulberry32(hashString(seed));
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);

  const sunX = WIDTH * (0.2 + random() * 0.2);
  const sunY = HEIGHT * (0.14 + random() * 0.16);
  const radius = WIDTH * (0.18 + random() * 0.05);

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const dx = (x - sunX) / radius;
      const dy = (y - sunY) / (radius * 0.75);
      const radial = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      let alpha = smoothstep(0.0, 0.95, radial);

      const angle = Math.atan2(y - sunY, x - sunX);
      const distance = Math.sqrt(dx * dx + dy * dy);
      const ray =
        Math.max(0, Math.sin(angle * 9 + distance * 5.5)) *
        smoothstep(0.1, 1.1, 1 - distance);

      alpha = clamp(alpha * 0.72 + ray * 0.22, 0, 1);

      const index = (y * WIDTH + x) * 4;
      rgba[index] = 255;
      rgba[index + 1] = 236;
      rgba[index + 2] = 168;
      rgba[index + 3] = clamp(alpha * 255, 0, 255);
    }
  }

  return rgba;
}

writePng(
  "cloud-mask-soft.png",
  makeCloudMask({
    seed: "myway-cloud-soft-v1",
    density: 0.55,
    threshold: 0.49,
    sharpness: 0.075,
    wispy: 0.42,
    stormy: 0.18,
  }),
);

writePng(
  "cloud-mask-wispy.png",
  makeCloudMask({
    seed: "myway-cloud-wispy-v1",
    density: 0.36,
    threshold: 0.53,
    sharpness: 0.055,
    wispy: 0.9,
    stormy: 0.12,
  }),
);

writePng(
  "cloud-mask-dense.png",
  makeCloudMask({
    seed: "myway-cloud-dense-v1",
    density: 0.9,
    threshold: 0.43,
    sharpness: 0.065,
    wispy: 0.42,
    stormy: 0.55,
  }),
);

writePng("sunbreak-mask.png", makeSunbreakMask("myway-sunbreak-mask-v1"));

console.log("Done. These are original procedural masks generated locally.");