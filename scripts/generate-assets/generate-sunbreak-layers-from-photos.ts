import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

type RawInfo = { width: number; height: number; channels: number };
type SharpRawResult = { data: Buffer; info: RawInfo };

type LoadedImage = {
  data: Buffer;
  info: RawInfo;
};

type SourceRole = "dramatic" | "warm" | "bright";
type GlowVariant = "soft" | "strong";
type RayVariant = "soft" | "dramatic";
type OcclusionVariant = "soft" | "storm";

const require = createRequire(import.meta.url);

let sharp: any;
try {
  sharp = require("sharp");
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
const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

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

function mulberry32(seed: number) {
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
      EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      output.push(fullPath);
    }
  }

  return output.sort((a, b) => a.localeCompare(b));
}

function chooseSource(files: string[], role: SourceRole): string {
  const scored = files.map((file) => {
    const name = path.basename(file).toLowerCase();
    let score = 0;

    if (role === "dramatic") {
      if (name.includes("dramatic")) score += 18;
      if (name.includes("dark")) score += 14;
      if (name.includes("ray")) score += 12;
      if (name.includes("storm")) score += 10;
      if (name.includes("break")) score += 8;
      if (name.includes("cloud")) score += 6;
      if (name.includes("mountain")) score += 4;
    }

    if (role === "warm") {
      if (name.includes("warm")) score += 18;
      if (name.includes("sunrise")) score += 14;
      if (name.includes("sunset")) score += 12;
      if (name.includes("gold")) score += 10;
      if (name.includes("beach")) score += 8;
      if (name.includes("beautiful")) score += 4;
    }

    if (role === "bright") {
      if (name.includes("bright")) score += 18;
      if (name.includes("sun")) score += 10;
      if (name.includes("sea")) score += 8;
      if (name.includes("sky")) score += 8;
      if (name.includes("april")) score += 4;
    }

    return { file, score };
  });

  scored.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return scored[0]?.file ?? files[0];
}

async function readCropAsRaw(
  filePath: string,
  options: {
    topRatio: number;
    heightRatio: number;
    position?: "north" | "centre" | "south";
  },
): Promise<LoadedImage> {
  const metaResult = (await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })) as SharpRawResult;

  const sourceWidth = metaResult.info.width;
  const sourceHeight = metaResult.info.height;
  const top = Math.round(
    clamp(options.topRatio * sourceHeight, 0, sourceHeight - 8),
  );
  const height = Math.round(
    clamp(options.heightRatio * sourceHeight, 8, sourceHeight - top),
  );

  const fitted = (await sharp(filePath)
    .extract({
      left: 0,
      top,
      width: sourceWidth,
      height,
    })
    .resize({
      width: WIDTH,
      height: HEIGHT,
      fit: "cover",
      position: options.position ?? "centre",
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })) as SharpRawResult;

  return fitted;
}

async function pngFromRgba(rgba: Buffer, blurPx = 0): Promise<Buffer> {
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

function pixelLuminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function pixelWarmth(r: number, g: number, b: number): number {
  return clamp01((r - (b * 0.75 + g * 0.25) + 70) / 170);
}

function setPixel(
  rgba: Buffer,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  alpha01: number,
): void {
  const index = (y * WIDTH + x) * 4;
  const a = Math.round(clamp01(alpha01) * 255);

  if (a <= 0) {
    rgba[index] = 0;
    rgba[index + 1] = 0;
    rgba[index + 2] = 0;
    rgba[index + 3] = 0;
    return;
  }

  rgba[index] = Math.round(clamp(r, 0, 255));
  rgba[index + 1] = Math.round(clamp(g, 0, 255));
  rgba[index + 2] = Math.round(clamp(b, 0, 255));
  rgba[index + 3] = a;
}

function ensureBlackForTransparentPixels(rgba: Buffer): void {
  for (let index = 0; index < rgba.length; index += 4) {
    if ((rgba[index + 3] ?? 0) <= 1) {
      rgba[index] = 0;
      rgba[index + 1] = 0;
      rgba[index + 2] = 0;
    }
  }
}

function makeGlowLayer(seed: string, variant: GlowVariant): Buffer {
  const random = mulberry32(hashString(seed));
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);

  const sunX = WIDTH * (0.34 + random() * 0.2);
  const sunY = HEIGHT * (0.16 + random() * 0.14);

  const radiusX =
    variant === "soft"
      ? WIDTH * (0.36 + random() * 0.06)
      : WIDTH * (0.24 + random() * 0.05);
  const radiusY =
    variant === "soft"
      ? HEIGHT * (0.55 + random() * 0.12)
      : HEIGHT * (0.38 + random() * 0.08);

  const maxAlpha = variant === "soft" ? 0.18 : 0.33;

  for (let y = 0; y < HEIGHT; y += 1) {
    const v = y / Math.max(1, HEIGHT - 1);
    const upperFade = 1 - smoothstep(0.78, 1, v);

    for (let x = 0; x < WIDTH; x += 1) {
      const dx = (x - sunX) / radiusX;
      const dy = (y - sunY) / radiusY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const core = Math.max(0, 1 - distance);
      const bloom = Math.pow(core, variant === "soft" ? 2.5 : 2.0);
      const halo = Math.pow(Math.max(0, 1 - distance * 0.82), 4.5) * 0.35;
      const alpha = (bloom + halo) * maxAlpha * upperFade;

      const warmMix = variant === "soft" ? 0.38 : 0.5;
      const r = lerp(255, 255, warmMix);
      const g = lerp(248, 236, warmMix);
      const b = lerp(226, 186, warmMix);

      setPixel(rgba, x, y, r, g, b, alpha);
    }
  }

  ensureBlackForTransparentPixels(rgba);
  return rgba;
}

function findSunCentroid(raw: LoadedImage): { x: number; y: number } {
  const { data, info } = raw;
  const channels = info.channels;

  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;

  for (let y = 0; y < Math.floor(HEIGHT * 0.54); y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const src = (y * WIDTH + x) * channels;
      const r = data[src] ?? 0;
      const g = data[src + 1] ?? 0;
      const b = data[src + 2] ?? 0;
      const luminance = pixelLuminance(r, g, b);
      const warmth = pixelWarmth(r, g, b);
      const highlight = smoothstep(0.62, 0.99, luminance) * (0.45 + warmth * 0.55);

      totalWeight += highlight;
      weightedX += x * highlight;
      weightedY += y * highlight;
    }
  }

  return {
    x: totalWeight > 0 ? weightedX / totalWeight : WIDTH * 0.44,
    y: totalWeight > 0 ? weightedY / totalWeight : HEIGHT * 0.2,
  };
}

async function makeLuminanceBuffer(raw: LoadedImage, biasWarmth = 0.2): Promise<Buffer> {
  const { data, info } = raw;
  const channels = info.channels;
  const luminance = Buffer.alloc(WIDTH * HEIGHT);

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const src = (y * WIDTH + x) * channels;
      const r = data[src] ?? 0;
      const g = data[src + 1] ?? 0;
      const b = data[src + 2] ?? 0;
      const l = pixelLuminance(r, g, b);
      const warmth = pixelWarmth(r, g, b);
      const value = clamp01(l * (1 - biasWarmth) + warmth * biasWarmth);
      luminance[y * WIDTH + x] = Math.round(value * 255);
    }
  }

  return luminance;
}

async function blurMono(buffer: Buffer, sigma: number): Promise<Buffer> {
  return (await sharp(buffer, {
    raw: {
      width: WIDTH,
      height: HEIGHT,
      channels: 1,
    },
  })
    .blur(sigma)
    .raw()
    .toBuffer()) as Buffer;
}

async function makeRaysLayer(raw: LoadedImage, variant: RayVariant): Promise<Buffer> {
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
  const { x: sunX, y: sunY } = findSunCentroid(raw);

  const luminance = await makeLuminanceBuffer(raw, variant === "soft" ? 0.12 : 0.18);
  const blurNear = await blurMono(luminance, variant === "soft" ? 5.5 : 4.5);
  const blurWide = await blurMono(luminance, variant === "soft" ? 18 : 14);

  const shaftSeed = hashString(`sun-rays-v4:${variant}:${sunX.toFixed(1)}:${sunY.toFixed(1)}`);
  const random = mulberry32(shaftSeed);
  const phaseA = random() * Math.PI * 2;
  const phaseB = random() * Math.PI * 2;
  const phaseC = random() * Math.PI * 2;

  const alphaScale = variant === "soft" ? 0.14 : 0.22;
  const blurFriendlyLift = variant === "soft" ? 0.08 : 0.06;
  const shaftNarrowness = variant === "soft" ? 1.3 : 1.85;

  for (let y = 0; y < HEIGHT; y += 1) {
    const v = y / Math.max(1, HEIGHT - 1);
    const belowSun = smoothstep(0.0, 0.16, (y - sunY) / HEIGHT + 0.08);
    const horizonFade = 1 - smoothstep(0.9, 1, v);

    for (let x = 0; x < WIDTH; x += 1) {
      const monoIndex = y * WIDTH + x;
      const l = (luminance[monoIndex] ?? 0) / 255;
      const near = (blurNear[monoIndex] ?? 0) / 255;
      const wide = (blurWide[monoIndex] ?? 0) / 255;

      const highlightDetail = clamp01((near - wide * 0.93) / 0.22);
      const broadBrightness = smoothstep(0.42, 0.9, wide);
      const cloudMassSuppress = 1 - smoothstep(0.18, 0.62, near - highlightDetail * 0.4);

      const dx = x - sunX;
      const dy = y - sunY;
      const angle = Math.atan2(dy, dx);
      const distance = Math.sqrt(dx * dx + dy * dy) / WIDTH;

      const patternA = Math.sin(angle * 6.4 + distance * 10.0 + phaseA) * 0.5 + 0.5;
      const patternB = Math.sin(angle * 10.8 - distance * 6.0 + phaseB) * 0.5 + 0.5;
      const patternC = Math.sin(angle * 15.7 + distance * 14.0 + phaseC) * 0.5 + 0.5;

      const shaftBase =
        Math.pow(smoothstep(0.46, 0.9, patternA), shaftNarrowness) * 0.52 +
        Math.pow(smoothstep(0.54, 0.94, patternB), shaftNarrowness + 0.18) * 0.3 +
        Math.pow(smoothstep(0.62, 0.97, patternC), shaftNarrowness + 0.36) * 0.18;

      const distanceGate =
        smoothstep(0.035, 0.16, distance) *
        (1 - smoothstep(0.72, 1.08, distance));

      const photoEvidence =
        highlightDetail * 0.68 +
        broadBrightness * blurFriendlyLift +
        smoothstep(0.68, 0.96, l) * 0.06;

      const alpha =
        photoEvidence *
        shaftBase *
        cloudMassSuppress *
        belowSun *
        horizonFade *
        distanceGate *
        alphaScale;

      const colorWarmth = variant === "soft" ? 0.2 : 0.28;
      const r = 255;
      const g = lerp(248, 242, colorWarmth);
      const b = lerp(236, 218, colorWarmth);

      setPixel(rgba, x, y, r, g, b, alpha);
    }
  }

  ensureBlackForTransparentPixels(rgba);
  return rgba;
}

function makeOcclusionLayer(raw: LoadedImage, variant: OcclusionVariant): Buffer {
  const { data, info } = raw;
  const channels = info.channels;
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);

  for (let y = 0; y < HEIGHT; y += 1) {
    const v = y / Math.max(1, HEIGHT - 1);
    const upperBias = 1 - smoothstep(0.05, 0.82, v);
    const midCloudBias = smoothstep(0.08, 0.56, v) * (1 - smoothstep(0.76, 1, v));

    for (let x = 0; x < WIDTH; x += 1) {
      const src = (y * WIDTH + x) * channels;
      const r = data[src] ?? 0;
      const g = data[src + 1] ?? 0;
      const b = data[src + 2] ?? 0;

      const luminance = pixelLuminance(r, g, b);
      const darkness = smoothstep(0.68, 0.18, luminance);
      const alpha =
        darkness *
        (upperBias * 0.74 + midCloudBias * 0.26) *
        (variant === "soft" ? 0.18 : 0.46);

      const rr = variant === "soft" ? 26 : 14;
      const gg = variant === "soft" ? 40 : 22;
      const bb = variant === "soft" ? 64 : 38;
      setPixel(rgba, x, y, rr, gg, bb, alpha);
    }
  }

  ensureBlackForTransparentPixels(rgba);
  return rgba;
}

async function combineFallbackSunbreak(
  glowStrongPng: Buffer,
  raysSoftPng: Buffer,
  raysDramaticPng: Buffer,
): Promise<Buffer> {
  return (await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: glowStrongPng, left: 0, top: 0, blend: "screen" },
      { input: raysSoftPng, left: 0, top: 0, blend: "screen" },
      { input: raysDramaticPng, left: 0, top: 0, blend: "screen" },
    ])
    .png()
    .toBuffer()) as Buffer;
}

async function makePreviewPanel(input: Buffer, label: string): Promise<Buffer> {
  const panelW = 512;
  const panelH = 256;

  const checkerSvg = Buffer.from(`
    <svg width="${panelW}" height="${panelH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#0b1120"/>
      <rect x="0" y="0" width="${panelW / 2}" height="${panelH / 2}" fill="#111827"/>
      <rect x="${panelW / 2}" y="${panelH / 2}" width="${panelW / 2}" height="${panelH / 2}" fill="#111827"/>
    </svg>
  `);

  const labelOverlay = Buffer.from(`
    <svg width="${panelW}" height="48" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="300" height="28" rx="6" fill="rgba(0,0,0,0.62)" />
      <text x="18" y="29" font-size="17" font-family="Arial, sans-serif" fill="white">${label}</text>
    </svg>
  `);

  return (await sharp({
    create: {
      width: panelW,
      height: panelH,
      channels: 4,
      background: { r: 11, g: 17, b: 32, alpha: 1 },
    },
  })
    .composite([{ input: checkerSvg, left: 0, top: 0 }])
    .composite([
      {
        input: await sharp(input).resize({ width: panelW, height: panelH }).png().toBuffer(),
        left: 0,
        top: 0,
        blend: "over",
      },
      { input: labelOverlay, left: 0, top: 0 },
    ])
    .png()
    .toBuffer()) as Buffer;
}

async function makePreviewSheet(layers: Array<{ name: string; buffer: Buffer }>): Promise<Buffer> {
  const panelW = 512;
  const panelH = 256;
  const columns = 2;
  const rows = Math.ceil(layers.length / columns);

  const panels = await Promise.all(
    layers.map((layer) => makePreviewPanel(layer.buffer, layer.name)),
  );

  const composites = panels.map((panel, index) => ({
    input: panel,
    left: (index % columns) * panelW,
    top: Math.floor(index / columns) * panelH,
  }));

  return (await sharp({
    create: {
      width: panelW * columns,
      height: panelH * rows,
      channels: 4,
      background: { r: 10, g: 14, b: 24, alpha: 1 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer()) as Buffer;
}

async function writeFile(name: string, buffer: Buffer): Promise<void> {
  const outPath = path.join(OUT_DIR, name);
  fs.writeFileSync(outPath, buffer);
  console.log(`Wrote ${path.relative(PROJECT_ROOT, outPath)}`);
}

async function main(): Promise<void> {
  const files = walkFiles(RAW_DIR);

  if (files.length === 0) {
    console.error("");
    console.error(`No sun images found in: ${path.relative(PROJECT_ROOT, RAW_DIR)}`);
    console.error("");
    console.error("Put the sun/god-ray JPG/PNG/WebP files there first.");
    console.error("This script expects your raw source photos here:");
    console.error(`  ${path.relative(PROJECT_ROOT, RAW_DIR)}`);
    console.error("");
    process.exit(1);
  }

  console.log(`Found ${files.length} sun source image(s).`);

  const dramatic = chooseSource(files, "dramatic");
  const warm = chooseSource(files, "warm");
  const bright = chooseSource(files, "bright");

  console.log(`Using dramatic/rays source: ${path.relative(PROJECT_ROOT, dramatic)}`);
  console.log(`Using warm/glow source:     ${path.relative(PROJECT_ROOT, warm)}`);
  console.log(`Using bright source:        ${path.relative(PROJECT_ROOT, bright)}`);

  const dramaticRaw = await readCropAsRaw(dramatic, {
    topRatio: 0,
    heightRatio: 0.72,
    position: "north",
  });

  const warmRaw = await readCropAsRaw(warm, {
    topRatio: 0,
    heightRatio: 0.68,
    position: "north",
  });

  const brightRaw = await readCropAsRaw(bright, {
    topRatio: 0,
    heightRatio: 0.64,
    position: "north",
  });

  const glowSoftPng = await pngFromRgba(
    makeGlowLayer(`myway-sun-glow-soft-v4:${warm}:${bright}`, "soft"),
    8.0,
  );
  const glowStrongPng = await pngFromRgba(
    makeGlowLayer(`myway-sun-glow-strong-v4:${warm}:${bright}`, "strong"),
    6.2,
  );

  const raysSoftPng = await pngFromRgba(await makeRaysLayer(warmRaw, "soft"), 5.5);
  const raysDramaticPng = await pngFromRgba(
    await makeRaysLayer(dramaticRaw, "dramatic"),
    4.8,
  );

  const occlusionSoftPng = await pngFromRgba(
    makeOcclusionLayer(brightRaw, "soft"),
    2.6,
  );
  const occlusionStormPng = await pngFromRgba(
    makeOcclusionLayer(dramaticRaw, "storm"),
    2.1,
  );

  const fallbackPng = await combineFallbackSunbreak(
    glowStrongPng,
    raysSoftPng,
    raysDramaticPng,
  );

  const previewSheet = await makePreviewSheet([
    { name: "sun-glow-soft.png", buffer: glowSoftPng },
    { name: "sun-glow-strong.png", buffer: glowStrongPng },
    { name: "sun-rays-soft.png", buffer: raysSoftPng },
    { name: "sun-rays-dramatic.png", buffer: raysDramaticPng },
    { name: "sun-occlusion-soft.png", buffer: occlusionSoftPng },
    { name: "sun-occlusion-storm.png", buffer: occlusionStormPng },
    { name: "sunbreak-mask.png", buffer: fallbackPng },
  ]);

  await writeFile("sun-glow-soft.png", glowSoftPng);
  await writeFile("sun-glow-strong.png", glowStrongPng);
  await writeFile("sun-rays-soft.png", raysSoftPng);
  await writeFile("sun-rays-dramatic.png", raysDramaticPng);
  await writeFile("sun-occlusion-soft.png", occlusionSoftPng);
  await writeFile("sun-occlusion-storm.png", occlusionStormPng);
  await writeFile("sunbreak-mask.png", fallbackPng);
  await writeFile("sunbreak-preview-sheet.jpg", previewSheet);

  console.log("");
  console.log("Done. Generated controlled v4 layered sun assets.");
  console.log(`Raw input folder: ${path.relative(PROJECT_ROOT, RAW_DIR)}`);
  console.log(`Output folder:    ${path.relative(PROJECT_ROOT, OUT_DIR)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});