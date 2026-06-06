import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

type SharpInput = Buffer | Uint8Array | string | { create: unknown };
type RawInfo = { width: number; height: number; channels: number };
type SharpInstance = {
  ensureAlpha(): SharpInstance;
  raw(): SharpInstance;
  png(options?: unknown): SharpInstance;
  jpeg(options?: unknown): SharpInstance;
  resize(options: unknown): SharpInstance;
  extract(options: unknown): SharpInstance;
  blur(sigma?: number): SharpInstance;
  composite(inputs: unknown[]): SharpInstance;
  toBuffer(options?: {
    resolveWithObject?: boolean;
  }): Promise<Buffer | { data: Buffer; info: RawInfo }>;
};
type SharpFn = (input?: SharpInput, options?: unknown) => SharpInstance;

type SunSourcePlan = {
  cropTop: number;
  cropHeight: number;
  threshold: number;
  softness: number;
  rayBoost: number;
  glowBoost: number;
  warmth: number;
  opacity: number;
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
const RAW_DIR = path.join(PROJECT_ROOT, "assets", "raw", "weather-sun");
const OUT_DIR = path.join(PROJECT_ROOT, "public", "learning-space", "weather");

const WIDTH = 1024;
const HEIGHT = 512;
const SUN_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

fs.mkdirSync(OUT_DIR, { recursive: true });

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
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

function mulberry32(seed: number) {
  return function random() {
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

    if (entry.isFile() && SUN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      output.push(fullPath);
    }
  }

  return output.sort((a, b) => a.localeCompare(b));
}

async function readImageAsFittedRaw(
  filePath: string,
  cropTop: number,
  cropHeight: number,
): Promise<{ data: Buffer; info: RawInfo }> {
  const initial = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (Buffer.isBuffer(initial)) {
    throw new Error("Expected sharp metadata for initial image read.");
  }

  const sourceWidth = initial.info.width;
  const sourceHeight = initial.info.height;
  const safeTop = Math.round(clamp(cropTop * sourceHeight, 0, sourceHeight - 8));
  const safeHeight = Math.round(
    clamp(cropHeight * sourceHeight, 8, sourceHeight - safeTop),
  );

  const cropped = await sharp(filePath)
    .extract({
      left: 0,
      top: safeTop,
      width: sourceWidth,
      height: safeHeight,
    })
    .resize({
      width: WIDTH,
      height: HEIGHT,
      fit: "cover",
      position: "centre",
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (Buffer.isBuffer(cropped)) {
    throw new Error("Expected sharp metadata for cropped image read.");
  }

  return cropped;
}

function makeSunLayerFromRaw(
  raw: { data: Buffer; info: RawInfo },
  plan: SunSourcePlan,
): Buffer {
  const { data, info } = raw;
  const channels = info.channels;
  const out = Buffer.alloc(WIDTH * HEIGHT * 4);

  for (let src = 0, dst = 0; src < data.length; src += channels, dst += 4) {
    const r = data[src] ?? 0;
    const g = data[src + 1] ?? 0;
    const b = data[src + 2] ?? 0;
    const a = (data[src + 3] ?? 255) / 255;

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const warmthSignal = clamp01((r - b + 64) / 160);
    const highlight = smoothstep(plan.threshold, plan.threshold + plan.softness, luminance);
    const warmHighlight = smoothstep(0.28, 0.92, warmthSignal) * highlight;

    const alpha =
      (highlight * (0.55 + plan.glowBoost * 0.3) +
        warmHighlight * (0.18 + plan.rayBoost * 0.25)) *
      a *
      plan.opacity;

    const outR = 255;
    const outG = 232 + plan.warmth * 18;
    const outB = 150 + plan.warmth * 46;

    out[dst] = Math.round(clamp(outR, 0, 255));
    out[dst + 1] = Math.round(clamp(outG, 0, 255));
    out[dst + 2] = Math.round(clamp(outB, 0, 255));
    out[dst + 3] = Math.round(clamp(alpha * 255, 0, 255));
  }

  return out;
}

function makeRadialEnhancement(seed: string): Buffer {
  const random = mulberry32(hashString(seed));
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
  const sunX = WIDTH * (0.23 + random() * 0.22);
  const sunY = HEIGHT * (0.18 + random() * 0.18);
  const radius = WIDTH * (0.17 + random() * 0.06);

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const dx = (x - sunX) / radius;
      const dy = (y - sunY) / (radius * 0.72);
      const distance = Math.sqrt(dx * dx + dy * dy);
      const radial = Math.max(0, 1 - distance);
      const angle = Math.atan2(y - sunY, x - sunX);

      const raySeed =
        Math.sin(angle * 7.2 + distance * 4.4) * 0.42 +
        Math.sin(angle * 13.6 - distance * 2.8) * 0.28 +
        0.48;

      const ray =
        smoothstep(0.48, 0.98, raySeed) *
        smoothstep(0.08, 1, 1 - distance) *
        smoothstep(0.08, 0.96, distance);

      const alpha = clamp01(smoothstep(0, 1, radial) * 0.34 + ray * 0.16);

      const index = (y * WIDTH + x) * 4;
      rgba[index] = 255;
      rgba[index + 1] = 239;
      rgba[index + 2] = 176;
      rgba[index + 3] = Math.round(alpha * 255);
    }
  }

  return rgba;
}

async function pngFromRaw(rgba: Buffer, blurPx = 0): Promise<Buffer> {
  let image = sharp(rgba, {
    raw: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
    },
  }).png();

  if (blurPx >= 0.3) {
    image = image.blur(blurPx).png();
  }

  return (await image.toBuffer()) as Buffer;
}

async function writePreviewBackground(
  filename: string,
  sunbreakBuffer: Buffer,
): Promise<void> {
  const sky = (await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 84, g: 168, b: 238, alpha: 1 },
    },
  })
    .composite([{ input: sunbreakBuffer, left: 0, top: 0, blend: "screen" }])
    .jpeg({ quality: 92 })
    .toBuffer()) as Buffer;

  fs.writeFileSync(path.join(OUT_DIR, filename), sky);
}

async function main(): Promise<void> {
  const files = walkFiles(RAW_DIR);

  if (files.length === 0) {
    console.error("");
    console.error(`No sun images found in: ${path.relative(PROJECT_ROOT, RAW_DIR)}`);
    console.error("");
    console.error("Put the downloaded sun/god-ray JPG/PNG/WebP files there first.");
    console.error("Example:");
    console.error("  assets/raw/weather-sun/sun-rays-01.jpg");
    console.error("");
    process.exit(1);
  }

  console.log(`Found ${files.length} sun source images.`);

  const composites: Array<{ input: Buffer; left: number; top: number; blend?: string }> = [];
  const random = mulberry32(hashString(`myway-preview-sunbreak:${files.join("|")}`));

  for (const filePath of files) {
    const filename = path.basename(filePath).toLowerCase();

    const dramatic =
      filename.includes("dramatic") ||
      filename.includes("dark") ||
      filename.includes("storm") ||
      filename.includes("ray");
    const sunrise =
      filename.includes("sunrise") ||
      filename.includes("sunset") ||
      filename.includes("gold");

    const plan: SunSourcePlan = {
      cropTop: 0,
      cropHeight: dramatic ? 0.68 : 0.72,
      threshold: dramatic ? 0.42 : sunrise ? 0.48 : 0.55,
      softness: dramatic ? 0.34 : 0.38,
      rayBoost: dramatic ? 0.95 : 0.55,
      glowBoost: sunrise ? 0.95 : 0.65,
      warmth: sunrise ? 0.9 : dramatic ? 0.55 : 0.68,
      opacity: dramatic ? 0.78 : sunrise ? 0.62 : 0.52,
    };

    const raw = await readImageAsFittedRaw(filePath, plan.cropTop, plan.cropHeight);
    const rgba = makeSunLayerFromRaw(raw, plan);
    const layer = await pngFromRaw(rgba, dramatic ? 1.2 : 2.4);

    composites.push({
      input: layer,
      left: 0,
      top: 0,
      blend: "screen",
    });
  }

  const radial = await pngFromRaw(
    makeRadialEnhancement(`myway-preview-sunbreak-radial:${files.length}:${random()}`),
    2.2,
  );
  composites.push({ input: radial, left: 0, top: 0, blend: "screen" });

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

  const outPath = path.join(OUT_DIR, "sunbreak-mask.png");
  fs.writeFileSync(outPath, output);
  await writePreviewBackground("sunbreak-mask-preview.jpg", output);

  console.log(`Wrote ${path.relative(PROJECT_ROOT, outPath)}`);
  console.log(
    `Wrote ${path.relative(PROJECT_ROOT, path.join(OUT_DIR, "sunbreak-mask-preview.jpg"))}`,
  );
  console.log("");
  console.log("Done. Generated preview sunbreak mask from raw sun photos.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
