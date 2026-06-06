import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

type SharpInput = Buffer | Uint8Array | string | { create: unknown };
type RawInfo = { width: number; height: number; channels: number };
type SharpInstance = {
  ensureAlpha(): SharpInstance;
  raw(): SharpInstance;
  png(options?: unknown): SharpInstance;
  resize(options: unknown): SharpInstance;
  rotate(angle?: number, options?: unknown): SharpInstance;
  composite(inputs: unknown[]): SharpInstance;
  blur(sigma?: number): SharpInstance;
  extend(options: unknown): SharpInstance;
  extract(options: unknown): SharpInstance;
  toBuffer(options?: {
    resolveWithObject?: boolean;
  }): Promise<Buffer | { data: Buffer; info: RawInfo }>;
};
type SharpFn = (input?: SharpInput, options?: unknown) => SharpInstance;

type RandomFn = () => number;

type SpritePlan = {
  input: Buffer;
  left: number;
  top: number;
};

type WeatherLayerConfig = {
  filename: string;
  seed: string;
  cloudCount: number;
  minWidth: number;
  maxWidth: number;
  minAlpha: number;
  maxAlpha: number;
  blackPoint: number;
  whitePoint: number;
  blurPx: number;
  brightness: number;
};

const require = createRequire(import.meta.url);

let sharp: SharpFn;
try {
  sharp = require("sharp") as SharpFn;
} catch {
  console.error("");
  console.error("Missing dependency: sharp");
  console.error("Install it once with:");
  console.error("  pnpm add -D sharp");
  console.error("");
  process.exit(1);
}

const PROJECT_ROOT = process.cwd();
const RAW_DIR = path.join(PROJECT_ROOT, "assets", "raw", "weather-clouds");
const OUT_DIR = path.join(PROJECT_ROOT, "public", "learning-space", "weather");

const WIDTH = 1024;
const HEIGHT = 512;
const MAX_SPRITE_WIDTH = Math.round(WIDTH * 0.92);
const MAX_SPRITE_HEIGHT = Math.round(HEIGHT * 0.82);

const CLOUD_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

fs.mkdirSync(OUT_DIR, { recursive: true });

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(0.000001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
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

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const output: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      output.push(...walkFiles(fullPath));
      continue;
    }

    if (
      entry.isFile() &&
      CLOUD_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      output.push(fullPath);
    }
  }

  return output.sort((a, b) => a.localeCompare(b));
}

function shuffleDeterministic<T>(items: T[], random: RandomFn): T[] {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const temp = copy[index];
    copy[index] = copy[swapIndex] as T;
    copy[swapIndex] = temp as T;
  }

  return copy;
}

async function getImageInfo(input: Buffer): Promise<RawInfo> {
  const result = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (Buffer.isBuffer(result)) {
    throw new Error("Expected sharp metadata but received only a Buffer.");
  }

  return result.info;
}

async function fitSpriteInsideCanvas(input: Buffer): Promise<Buffer> {
  const info = await getImageInfo(input);

  if (info.width <= MAX_SPRITE_WIDTH && info.height <= MAX_SPRITE_HEIGHT) {
    return input;
  }

  return (await sharp(input)
    .resize({
      width: MAX_SPRITE_WIDTH,
      height: MAX_SPRITE_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer()) as Buffer;
}

async function convertBlackBackgroundToAlpha(
  filePath: string,
  options: {
    blackPoint: number;
    whitePoint: number;
    alphaMultiplier: number;
    brightness: number;
    blurPx: number;
  },
): Promise<Buffer> {
  const rawResult = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (Buffer.isBuffer(rawResult)) {
    throw new Error("Expected sharp raw metadata but received only a Buffer.");
  }

  const { data, info } = rawResult;
  const channels = info.channels;

  if (channels < 4) {
    throw new Error(`Expected 4 channels after ensureAlpha for ${filePath}.`);
  }

  const out = Buffer.alloc(info.width * info.height * 4);

  for (let src = 0, dst = 0; src < data.length; src += channels, dst += 4) {
    const r = data[src] ?? 0;
    const g = data[src + 1] ?? 0;
    const b = data[src + 2] ?? 0;
    const originalAlpha = (data[src + 3] ?? 255) / 255;

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const alpha =
      smoothstep(options.blackPoint, options.whitePoint, luminance) *
      originalAlpha *
      options.alphaMultiplier;

    /**
     * Lift near-black cloud shadow slightly so black-background JPGs do not
     * leave a visible black card on the sphere.
     */
    const lifted = smoothstep(options.blackPoint * 0.65, 1, luminance);
    const liftAmount = 30 * (1 - lifted);

    out[dst] = Math.round(clamp(r * options.brightness + liftAmount, 0, 255));
    out[dst + 1] = Math.round(
      clamp(g * options.brightness + liftAmount, 0, 255),
    );
    out[dst + 2] = Math.round(
      clamp(b * options.brightness + liftAmount, 0, 255),
    );
    out[dst + 3] = Math.round(clamp(alpha * 255, 0, 255));
  }

  let image = sharp(out, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  }).png();

  if (options.blurPx >= 0.3) {
    image = image.blur(options.blurPx).png();
  }

  return (await image.toBuffer()) as Buffer;
}

async function prepareSprite(
  filePath: string,
  config: WeatherLayerConfig,
  random: RandomFn,
): Promise<SpritePlan[]> {
  const targetWidth = Math.round(
    config.minWidth + random() * (config.maxWidth - config.minWidth),
  );
  const alphaMultiplier =
    config.minAlpha + random() * (config.maxAlpha - config.minAlpha);
  const angle = -10 + random() * 20;

  const sprite = await convertBlackBackgroundToAlpha(filePath, {
    blackPoint: config.blackPoint,
    whitePoint: config.whitePoint,
    alphaMultiplier,
    brightness: config.brightness,
    blurPx: config.blurPx,
  });

  const transformedBeforeFit = (await sharp(sprite)
    .resize({
      width: targetWidth,
      withoutEnlargement: false,
    })
    .rotate(angle, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()) as Buffer;

  /**
   * Sharp composite requires each input image to be no larger than the base
   * canvas. Rotation can make a cloud sprite larger than expected, especially
   * for wide cloud JPGs, so clamp after rotation.
   */
  const transformed = await fitSpriteInsideCanvas(transformedBeforeFit);
  const info = await getImageInfo(transformed);

  const spriteWidth = info.width;
  const spriteHeight = info.height;

  /**
   * Clamp vertical placement so sharp never receives an invalid top coordinate
   * that pushes a too-large sprite awkwardly outside the canvas. Horizontal
   * wrap duplicates are still allowed.
   */
  const left = Math.round(
    -spriteWidth * 0.18 + random() * (WIDTH + spriteWidth * 0.36),
  );
  const rawTop = Math.round(
    HEIGHT * 0.06 + random() * (HEIGHT * 0.82) - spriteHeight * 0.5,
  );
  const top = Math.round(clamp(rawTop, -spriteHeight * 0.15, HEIGHT - spriteHeight * 0.85));

  const placements: SpritePlan[] = [
    {
      input: transformed,
      left,
      top,
    },
  ];

  if (left < 0) {
    placements.push({
      input: transformed,
      left: left + WIDTH,
      top,
    });
  }

  if (left + spriteWidth > WIDTH) {
    placements.push({
      input: transformed,
      left: left - WIDTH,
      top,
    });
  }

  /**
   * Sharp also dislikes compositing an input that is larger than the base after
   * placement edge cases. Filter anything still invalid.
   */
  return placements.filter(
    (placement) =>
      spriteWidth <= WIDTH &&
      spriteHeight <= HEIGHT &&
      placement.left > -spriteWidth &&
      placement.left < WIDTH &&
      placement.top > -spriteHeight &&
      placement.top < HEIGHT,
  );
}

async function createCloudLayer(
  files: string[],
  config: WeatherLayerConfig,
): Promise<void> {
  const random = mulberry32(hashString(config.seed));
  const chosen = shuffleDeterministic(files, random).slice(
    0,
    Math.min(files.length, config.cloudCount),
  );
  const composites: SpritePlan[] = [];

  for (const filePath of chosen) {
    composites.push(...(await prepareSprite(filePath, config, random)));
  }

  const output = (await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer()) as Buffer;

  const outPath = path.join(OUT_DIR, config.filename);
  fs.writeFileSync(outPath, output);
  console.log(
    `Wrote ${path.relative(PROJECT_ROOT, outPath)} from ${chosen.length} source clouds`,
  );
}

async function createSunbreakMask(): Promise<void> {
  const width = WIDTH;
  const height = HEIGHT;
  const random = mulberry32(hashString("myway-cloud-pack-sunbreak-preview"));
  const rgba = Buffer.alloc(width * height * 4);

  const sunX = width * (0.18 + random() * 0.22);
  const sunY = height * (0.14 + random() * 0.18);
  const radius = width * (0.12 + random() * 0.05);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - sunX) / radius;
      const dy = (y - sunY) / (radius * 0.76);
      const distance = Math.sqrt(dx * dx + dy * dy);
      const radial = Math.max(0, 1 - distance);
      const angle = Math.atan2(y - sunY, x - sunX);

      let alpha = smoothstep(0, 1, radial) * 0.8;
      const raySeed =
        Math.sin(angle * 7.5 + distance * 4.2) * 0.45 +
        Math.sin(angle * 14.0 - distance * 2.8) * 0.28 +
        0.48;
      const ray =
        smoothstep(0.48, 0.98, raySeed) *
        smoothstep(0.08, 1, 1 - distance) *
        smoothstep(0.1, 0.95, distance);

      alpha = clamp(alpha * 0.7 + ray * 0.26, 0, 1);
      const index = (y * width + x) * 4;

      rgba[index] = 255;
      rgba[index + 1] = 238;
      rgba[index + 2] = 170;
      rgba[index + 3] = Math.round(alpha * 255);
    }
  }

  const output = (await sharp(rgba, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .blur(2.0)
    .png()
    .toBuffer()) as Buffer;

  const outPath = path.join(OUT_DIR, "sunbreak-mask.png");
  fs.writeFileSync(outPath, output);
  console.log(`Wrote ${path.relative(PROJECT_ROOT, outPath)}`);
}

async function main(): Promise<void> {
  const files = walkFiles(RAW_DIR);

  if (files.length === 0) {
    console.error("");
    console.error(
      `No cloud images found in: ${path.relative(PROJECT_ROOT, RAW_DIR)}`,
    );
    console.error("");
    console.error("Put the downloaded VFX cloud JPG/PNG/WebP files there first.");
    console.error("Example:");
    console.error("  assets/raw/weather-clouds/Cloud_0001.jpg");
    console.error("");
    process.exit(1);
  }

  console.log(`Found ${files.length} cloud source images.`);

  /**
   * No classification yet. These layers sample from the same source folder with
   * different scales/thresholds so you can quickly preview whether the pack
   * works visually inside the existing MyWay weather system.
   */
  await createCloudLayer(files, {
    filename: "cloud-mask-soft.png",
    seed: "myway-vfx-pack-preview-soft",
    cloudCount: 12,
    minWidth: 300,
    maxWidth: 650,
    minAlpha: 0.34,
    maxAlpha: 0.66,
    blackPoint: 0.025,
    whitePoint: 0.42,
    blurPx: 0.5,
    brightness: 1.16,
  });

  await createCloudLayer(files, {
    filename: "cloud-mask-wispy.png",
    seed: "myway-vfx-pack-preview-wispy",
    cloudCount: 9,
    minWidth: 250,
    maxWidth: 560,
    minAlpha: 0.2,
    maxAlpha: 0.48,
    blackPoint: 0.02,
    whitePoint: 0.34,
    blurPx: 0,
    brightness: 1.22,
  });

  await createCloudLayer(files, {
    filename: "cloud-mask-dense.png",
    seed: "myway-vfx-pack-preview-dense",
    cloudCount: 14,
    minWidth: 320,
    maxWidth: 700,
    minAlpha: 0.38,
    maxAlpha: 0.76,
    blackPoint: 0.03,
    whitePoint: 0.48,
    blurPx: 0.7,
    brightness: 1.1,
  });

  await createSunbreakMask();

  console.log("");
  console.log("Done. Generated preview masks from the raw VFX cloud pack.");
  console.log("This intentionally does not classify clouds yet.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
