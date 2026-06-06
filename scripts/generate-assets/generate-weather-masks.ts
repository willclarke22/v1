import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT_DIR = path.join(process.cwd(), "public", "learning-space", "weather");
const WIDTH = 1024;
const HEIGHT = 512;

type RandomFn = () => number;

type NoiseGrid = {
  columns: number;
  rows: number;
  values: Float32Array;
};

type EllipseBlob = {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  angle: number;
  strength: number;
};

type CloudContinent = {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  angle: number;
  strength: number;
  satelliteCount: number;
};

type CloudMaskConfig = {
  seed: string;
  continentCount: number;
  satellitesPerContinent: number;
  strayBlobCount: number;
  clearHoleCount: number;
  baseRadiusX: number;
  baseRadiusY: number;
  radiusVariance: number;
  coverage: number;
  threshold: number;
  edgeSoftness: number;
  billow: number;
  wispy: number;
  stormy: number;
  alphaPower: number;
};

fs.mkdirSync(OUT_DIR, { recursive: true });

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(0.000001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): RandomFn {
  return function random(): number {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoiseGrid(
  random: RandomFn,
  columns: number,
  rows: number,
): NoiseGrid {
  const values = new Float32Array(columns * rows);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = random();
  }
  return { columns, rows, values };
}

function sampleNoise(grid: NoiseGrid, u: number, v: number): number {
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

  const a = grid.values[y0 * grid.columns + x0] ?? 0;
  const b = grid.values[y0 * grid.columns + x1] ?? 0;
  const c = grid.values[y1 * grid.columns + x0] ?? 0;
  const d = grid.values[y1 * grid.columns + x1] ?? 0;

  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

function fbm(
  grids: NoiseGrid[],
  u: number,
  v: number,
  amplitudes: number[],
): number {
  let value = 0;
  let total = 0;

  for (let index = 0; index < grids.length; index += 1) {
    const grid = grids[index];
    const amplitude = amplitudes[index] ?? 1;
    if (!grid) continue;
    value += sampleNoise(grid, u * (index + 1.35), v * (index + 1.15)) * amplitude;
    total += amplitude;
  }

  return total <= 0 ? 0 : value / total;
}

function buildCrcTable(): Uint32Array {
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

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index] ?? 0;
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
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

function writePng(filename: string, rgba: Buffer): void {
  const filePath = path.join(OUT_DIR, filename);
  fs.writeFileSync(filePath, encodePng(WIDTH, HEIGHT, rgba));
  console.log(`Wrote ${path.relative(process.cwd(), filePath)}`);
}

function randomRange(random: RandomFn, min: number, max: number): number {
  return min + (max - min) * random();
}

function makeContinents(
  random: RandomFn,
  config: CloudMaskConfig,
): CloudContinent[] {
  const continents: CloudContinent[] = [];

  for (let index = 0; index < config.continentCount; index += 1) {
    /**
     * Deliberately avoid row placement. These are broad irregular cloud
     * "continents" that wrap around the sphere without forming obvious
     * horizontal latitude bands.
     */
    continents.push({
      centerX: random(),
      centerY: randomRange(random, 0.12, 0.88),
      radiusX:
        config.baseRadiusX *
        randomRange(random, 0.72, config.radiusVariance) *
        (0.9 + config.coverage * 0.32),
      radiusY: config.baseRadiusY * randomRange(random, 0.72, config.radiusVariance),
      angle: randomRange(random, -0.65, 0.65),
      strength: randomRange(random, 0.72, 1.18),
      satelliteCount: Math.max(
        2,
        Math.round(config.satellitesPerContinent * randomRange(random, 0.72, 1.32)),
      ),
    });
  }

  return continents;
}

function makeBlobAroundContinent(
  random: RandomFn,
  continent: CloudContinent,
  config: CloudMaskConfig,
): EllipseBlob {
  const theta = randomRange(random, 0, Math.PI * 2);
  const distance = Math.pow(random(), 0.72);
  const cos = Math.cos(continent.angle);
  const sin = Math.sin(continent.angle);
  const localX = Math.cos(theta) * continent.radiusX * distance;
  const localY = Math.sin(theta) * continent.radiusY * distance;
  const rotatedX = localX * cos - localY * sin;
  const rotatedY = localX * sin + localY * cos;

  return {
    x: ((continent.centerX + rotatedX) % 1 + 1) % 1,
    y: clamp(continent.centerY + rotatedY, 0.035, 0.965),
    radiusX:
      config.baseRadiusX *
      randomRange(random, 0.18, 0.58) *
      (1 + config.billow * 0.25),
    radiusY: config.baseRadiusY * randomRange(random, 0.16, 0.48),
    angle: continent.angle + randomRange(random, -0.85, 0.85),
    strength: continent.strength * randomRange(random, 0.55, 1.05),
  };
}

function makeCloudBlobs(random: RandomFn, config: CloudMaskConfig): EllipseBlob[] {
  const blobs: EllipseBlob[] = [];
  const continents = makeContinents(random, config);

  for (const continent of continents) {
    /**
     * The continent itself gives the cloud bank a broad mass. The satellites
     * create billowy lobes inside and around it.
     */
    blobs.push({
      x: continent.centerX,
      y: continent.centerY,
      radiusX: continent.radiusX,
      radiusY: continent.radiusY,
      angle: continent.angle,
      strength: continent.strength,
    });

    for (let index = 0; index < continent.satelliteCount; index += 1) {
      blobs.push(makeBlobAroundContinent(random, continent, config));
    }
  }

  for (let index = 0; index < config.strayBlobCount; index += 1) {
    blobs.push({
      x: random(),
      y: randomRange(random, 0.08, 0.92),
      radiusX: config.baseRadiusX * randomRange(random, 0.12, 0.42),
      radiusY: config.baseRadiusY * randomRange(random, 0.1, 0.34),
      angle: randomRange(random, -0.9, 0.9),
      strength: randomRange(random, 0.22, 0.64),
    });
  }

  return blobs;
}

function makeClearHoles(random: RandomFn, config: CloudMaskConfig): EllipseBlob[] {
  const holes: EllipseBlob[] = [];

  for (let index = 0; index < config.clearHoleCount; index += 1) {
    holes.push({
      x: random(),
      y: randomRange(random, 0.1, 0.9),
      radiusX: randomRange(random, 0.055, 0.22),
      radiusY: randomRange(random, 0.035, 0.16),
      angle: randomRange(random, -0.9, 0.9),
      strength: randomRange(random, 0.18, 0.62),
    });
  }

  return holes;
}

function ellipticalGaussian(blob: EllipseBlob, u: number, v: number): number {
  let dx = u - blob.x;
  if (dx > 0.5) dx -= 1;
  if (dx < -0.5) dx += 1;

  const dy = v - blob.y;
  const cos = Math.cos(blob.angle);
  const sin = Math.sin(blob.angle);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;

  const q =
    (localX * localX) / Math.max(0.000001, blob.radiusX * blob.radiusX) +
    (localY * localY) / Math.max(0.000001, blob.radiusY * blob.radiusY);

  return Math.exp(-q * 2.2) * blob.strength;
}

function writeRgbaPixel(
  rgba: Buffer,
  dataIndex: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  rgba[dataIndex] = Math.round(clamp(r, 0, 255));
  rgba[dataIndex + 1] = Math.round(clamp(g, 0, 255));
  rgba[dataIndex + 2] = Math.round(clamp(b, 0, 255));
  rgba[dataIndex + 3] = Math.round(clamp(a, 0, 255));
}

function makeCloudMask(config: CloudMaskConfig): Buffer {
  const random = mulberry32(hashString(config.seed));
  const coarse = makeNoiseGrid(random, 18, 10);
  const mid = makeNoiseGrid(random, 54, 30);
  const fine = makeNoiseGrid(random, 150, 82);
  const micro = makeNoiseGrid(random, 340, 180);
  const blobs = makeCloudBlobs(random, config);
  const holes = makeClearHoles(random, config);
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);

  for (let y = 0; y < HEIGHT; y += 1) {
    const v = y / Math.max(1, HEIGHT - 1);
    const polarFade = 0.72 + 0.28 * Math.sin(Math.PI * clamp(v, 0, 1));

    for (let x = 0; x < WIDTH; x += 1) {
      const u = x / Math.max(1, WIDTH - 1);

      let blobField = 0;
      for (const blob of blobs) {
        blobField += ellipticalGaussian(blob, u, v);
      }

      let holeField = 0;
      for (const hole of holes) {
        holeField += ellipticalGaussian(hole, u, v);
      }

      const warpA =
        sampleNoise(coarse, u * 1.15 + 0.13, v * 1.05 + 0.21) - 0.5;
      const warpB =
        sampleNoise(coarse, u * 1.08 + 0.47, v * 1.24 + 0.36) - 0.5;
      const domainWarpU = u + warpA * (0.08 + config.billow * 0.05);
      const domainWarpV = v + warpB * (0.055 + config.billow * 0.035);

      const n1 = sampleNoise(mid, domainWarpU * 1.6 + 0.17, domainWarpV * 1.35 + 0.09);
      const n2 = sampleNoise(fine, domainWarpU * 3.6 + 0.32, domainWarpV * 3.0 + 0.18);
      const n3 = sampleNoise(micro, domainWarpU * 7.4 + 0.44, domainWarpV * 6.7 + 0.29);
      const billowNoise = fbm([mid, fine, micro], domainWarpU * 2.2, domainWarpV * 2.0, [
        0.45,
        0.36,
        0.19,
      ]);

      /**
       * No latitude-row sinusoid here. The cloud mass comes from continents,
       * with noise only breaking up the edges and interiors.
       */
      const breakup =
        n1 * 0.28 +
        n2 * 0.34 +
        n3 * 0.18 +
        billowNoise * (0.2 + config.billow * 0.18);

      const cloudField =
        blobField * (0.76 + config.coverage * 0.42) +
        breakup * (0.34 + config.wispy * 0.18) -
        holeField * (0.5 + (1 - config.coverage) * 0.2);

      const edge = smoothstep(
        config.threshold,
        config.threshold + config.edgeSoftness,
        cloudField,
      );

      const core = smoothstep(
        config.threshold + config.edgeSoftness * 0.5,
        config.threshold + config.edgeSoftness * 2.25,
        cloudField,
      );

      const feather = smoothstep(0.12, 0.85, blobField);
      const wisp =
        smoothstep(0.58 - config.wispy * 0.12, 0.96, n3) *
        smoothstep(0.08, 0.88, feather) *
        config.wispy;

      let alpha =
        edge * (0.56 + config.coverage * 0.46) +
        wisp * 0.26 -
        holeField * 0.12;

      alpha = Math.pow(clamp(alpha * polarFade, 0, 1), config.alphaPower);

      const stormNoise = sampleNoise(
        mid,
        domainWarpU * 2.2 + 0.51,
        domainWarpV * 1.8 + 0.15,
      );
      const stormShadow = smoothstep(0.52, 0.91, stormNoise) * config.stormy * edge;

      const bright = 232 + core * 22;
      const shadow = 150 - stormShadow * 54;
      const tint = 0.18 + core * 0.82;

      const r = lerp(shadow, bright, tint);
      const g = lerp(shadow + 12, bright + 2, tint);
      const b = lerp(202, 255, tint);
      const dataIndex = (y * WIDTH + x) * 4;

      writeRgbaPixel(rgba, dataIndex, r, g, b, alpha * 255);
    }
  }

  return rgba;
}

function makeSunbreakMask(seed: string): Buffer {
  const random = mulberry32(hashString(seed));
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
  const sunX = WIDTH * randomRange(random, 0.14, 0.42);
  const sunY = HEIGHT * randomRange(random, 0.12, 0.36);
  const radius = WIDTH * randomRange(random, 0.12, 0.19);
  const rayGrid = makeNoiseGrid(random, 80, 40);

  for (let y = 0; y < HEIGHT; y += 1) {
    const v = y / Math.max(1, HEIGHT - 1);

    for (let x = 0; x < WIDTH; x += 1) {
      const u = x / Math.max(1, WIDTH - 1);
      const dx = (x - sunX) / radius;
      const dy = (y - sunY) / (radius * 0.78);
      const distance = Math.sqrt(dx * dx + dy * dy);
      const radial = Math.max(0, 1 - distance);
      const angle = Math.atan2(y - sunY, x - sunX);

      const mottled =
        sampleNoise(rayGrid, u * 1.8 + 0.24, v * 1.2 + 0.11) * 0.52 +
        sampleNoise(rayGrid, u * 3.5 + 0.61, v * 2.7 + 0.43) * 0.48;

      let alpha = smoothstep(0, 1, radial) * 0.78;
      const raySeed =
        Math.sin(angle * 7.5 + distance * 4.2) * 0.44 +
        Math.sin(angle * 14.0 - distance * 3.1) * 0.3 +
        mottled * 0.5;

      const ray =
        smoothstep(0.5, 1.08, raySeed) *
        smoothstep(0.08, 1, 1 - distance) *
        smoothstep(0.12, 0.94, distance);

      alpha = clamp(alpha * 0.72 + ray * 0.34, 0, 1);
      const dataIndex = (y * WIDTH + x) * 4;

      writeRgbaPixel(rgba, dataIndex, 255, 238, 170, alpha * 255);
    }
  }

  return rgba;
}

writePng(
  "cloud-mask-soft.png",
  makeCloudMask({
    seed: "myway-cloud-soft-continent-v3",
    continentCount: 5,
    satellitesPerContinent: 11,
    strayBlobCount: 18,
    clearHoleCount: 16,
    baseRadiusX: 0.2,
    baseRadiusY: 0.12,
    radiusVariance: 1.45,
    coverage: 0.46,
    threshold: 0.58,
    edgeSoftness: 0.28,
    billow: 0.72,
    wispy: 0.36,
    stormy: 0.08,
    alphaPower: 1.12,
  }),
);

writePng(
  "cloud-mask-wispy.png",
  makeCloudMask({
    seed: "myway-cloud-wispy-continent-v3",
    continentCount: 6,
    satellitesPerContinent: 9,
    strayBlobCount: 34,
    clearHoleCount: 22,
    baseRadiusX: 0.16,
    baseRadiusY: 0.085,
    radiusVariance: 1.55,
    coverage: 0.3,
    threshold: 0.66,
    edgeSoftness: 0.24,
    billow: 0.52,
    wispy: 0.92,
    stormy: 0.04,
    alphaPower: 1.28,
  }),
);

writePng(
  "cloud-mask-dense.png",
  makeCloudMask({
    seed: "myway-cloud-dense-continent-v3",
    continentCount: 7,
    satellitesPerContinent: 13,
    strayBlobCount: 20,
    clearHoleCount: 10,
    baseRadiusX: 0.22,
    baseRadiusY: 0.13,
    radiusVariance: 1.36,
    coverage: 0.78,
    threshold: 0.5,
    edgeSoftness: 0.24,
    billow: 0.86,
    wispy: 0.4,
    stormy: 0.46,
    alphaPower: 0.92,
  }),
);

writePng("sunbreak-mask.png", makeSunbreakMask("myway-sunbreak-mask-v3"));

console.log("Done. Generated v3 sphere-friendly weather masks with less banding.");
