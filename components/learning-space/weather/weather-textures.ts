import * as THREE from "three";
import type { LearningWeather } from "@/types/learning-space";

type WeatherTextureKind = "surface" | "sunbreak";

export type WeatherMaskImages = {
  cloudSoft?: CanvasImageSource | null;
  cloudWispy?: CanvasImageSource | null;
  cloudDense?: CanvasImageSource | null;
  sunbreak?: CanvasImageSource | null;
};

type WeatherTextureOptions = {
  topicId: string;
  weather: LearningWeather;
  kind: WeatherTextureKind;
  masks?: WeatherMaskImages;
  width?: number;
  height?: number;
};

/**
 * Hybrid v3 sunlight tuning.
 *
 * The earlier diagnostic mode proved that the procedural sun layer renders.
 * This version keeps the sunlight visible, but pulls it back from the large
 * yellow wash: smaller glow, clearer rays, softer occlusion, and a stable
 * front-biased anchor so the sunbreak remains readable while we keep tuning.
 */
const SUNBREAK_HYBRID_MODE = true;
const SUNBREAK_GLOW_MULTIPLIER = 1.42;
const SUNBREAK_RAY_MULTIPLIER = 1.95;
const SUNBREAK_OCCLUSION_MULTIPLIER = 0.64;
const SUNBREAK_FRONT_ANCHOR = true;

type Rgba = [number, number, number, number];

type CloudImageLayerOptions = {
  source?: CanvasImageSource | null;
  width: number;
  height: number;
  topicSeed: string;
  offsetU?: number;
  offsetV?: number;
  scale?: number;
  opacity: number;
  threshold?: number;
  softness?: number;
  power?: number;
  blurPx?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  whitenessBoost?: number;
  warmHighlight?: number;
  coolShadow?: number;
  shadowAlphaBoost?: number;
  shadowDarken?: number;
};

type MaskLayerOptions = {
  source?: CanvasImageSource | null;
  width: number;
  height: number;
  topicSeed: string;
  offsetU?: number;
  offsetV?: number;
  scale?: number;
  opacity: number;
  color: Rgba;
  threshold?: number;
  softness?: number;
  power?: number;
  blurPx?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hashString(value: string) {
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

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function configureTexture(texture: THREE.CanvasTexture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  return texture;
}

type CanvasSourceDimensions = CanvasImageSource & {
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  videoWidth?: number;
  videoHeight?: number;
  displayWidth?: number;
  displayHeight?: number;
  codedWidth?: number;
  codedHeight?: number;
};

function firstPositiveNumber(...values: Array<number | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return 0;
}

function imageSourceWidth(source: CanvasImageSource) {
  const sizedSource = source as CanvasSourceDimensions;

  return firstPositiveNumber(
    sizedSource.videoWidth,
    sizedSource.naturalWidth,
    sizedSource.displayWidth,
    sizedSource.codedWidth,
    sizedSource.width,
  );
}

function imageSourceHeight(source: CanvasImageSource) {
  const sizedSource = source as CanvasSourceDimensions;

  return firstPositiveNumber(
    sizedSource.videoHeight,
    sizedSource.naturalHeight,
    sizedSource.displayHeight,
    sizedSource.codedHeight,
    sizedSource.height,
  );
}

function drawRepeatedSource(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  offsetU: number,
  offsetV: number,
  scale: number,
) {
  const sourceWidth = Number(imageSourceWidth(source)) || width;
  const sourceHeight = Number(imageSourceHeight(source)) || height;

  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const startX = ((offsetU * width) % drawWidth) - drawWidth;
  const startY = clamp(offsetV * height, -height, height);

  for (let y = startY - drawHeight; y < height + drawHeight; y += drawHeight) {
    for (let x = startX; x < width + drawWidth; x += drawWidth) {
      ctx.drawImage(
        source,
        0,
        0,
        sourceWidth,
        sourceHeight,
        x,
        y,
        drawWidth,
        drawHeight,
      );
    }
  }
}

function applyContrast(value: number, contrast: number) {
  return (value - 128) * contrast + 128;
}

function applySaturation(
  r: number,
  g: number,
  b: number,
  saturation: number,
): [number, number, number] {
  const luminance = r * 0.299 + g * 0.587 + b * 0.114;

  return [
    lerp(luminance, r, saturation),
    lerp(luminance, g, saturation),
    lerp(luminance, b, saturation),
  ];
}

/**
 * Draws photographic cloud assets while preserving their original RGB/shading.
 * This is the main "real cloud" path. It avoids recoloring the sprites into a
 * blue wash, then adds state-driven warmth, highlight, and storm shadow.
 */
function createCloudImageLayer(options: CloudImageLayerOptions) {
  const {
    source,
    width,
    height,
    topicSeed,
    offsetU = 0,
    offsetV = 0,
    scale = 1,
    opacity,
    threshold = 0.03,
    softness = 0.48,
    power = 1,
    blurPx = 0,
    brightness = 1.08,
    contrast = 1.14,
    saturation = 0.88,
    whitenessBoost = 0.12,
    warmHighlight = 0,
    coolShadow = 0.06,
    shadowAlphaBoost = 0.18,
    shadowDarken = 0,
  } = options;

  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx || !source || opacity <= 0.001) return canvas;

  ctx.clearRect(0, 0, width, height);
  drawRepeatedSource(ctx, source, width, height, offsetU, offsetV, scale);

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;

  const seedRandom = mulberry32(hashString(topicSeed));
  const tinyVariation = 0.96 + seedRandom() * 0.08;

  for (let index = 0; index < data.length; index += 4) {
    const sourceR = data[index];
    const sourceG = data[index + 1];
    const sourceB = data[index + 2];
    const sourceA = data[index + 3] / 255;

    const sourceLuminance =
      (sourceR * 0.299 + sourceG * 0.587 + sourceB * 0.114) / 255;

    const alphaSource = Math.max(sourceA, sourceLuminance * sourceA);
    const mask = Math.pow(
      smoothstep(
        threshold,
        clamp(threshold + softness, threshold + 0.001, 1),
        alphaSource,
      ),
      power,
    );

    const highlight = smoothstep(0.55, 0.98, sourceLuminance);
    const shadow = 1 - highlight;

    let r = applyContrast(sourceR * brightness, contrast);
    let g = applyContrast(sourceG * brightness, contrast);
    let b = applyContrast(sourceB * brightness, contrast);

    [r, g, b] = applySaturation(r, g, b, saturation);

    r = lerp(r, 255, highlight * whitenessBoost);
    g = lerp(g, 255, highlight * whitenessBoost);
    b = lerp(b, 255, highlight * whitenessBoost);

    r += highlight * warmHighlight * 36;
    g += highlight * warmHighlight * 22;
    b -= highlight * warmHighlight * 6;

    r -= shadow * coolShadow * 14;
    g += shadow * coolShadow * 4;
    b += shadow * coolShadow * 28;

    r -= shadow * shadowDarken * 46;
    g -= shadow * shadowDarken * 42;
    b -= shadow * shadowDarken * 28;

    const alpha =
      mask *
      opacity *
      tinyVariation *
      (1 + shadowAlphaBoost * smoothstep(0.18, 0.7, sourceLuminance));

    data[index] = Math.round(clamp(r, 0, 255));
    data[index + 1] = Math.round(clamp(g, 0, 255));
    data[index + 2] = Math.round(clamp(b, 0, 255));
    data[index + 3] = Math.round(clamp01(alpha) * 255);
  }

  ctx.putImageData(image, 0, 0);

  if (blurPx > 0) {
    const blurred = makeCanvas(width, height);
    const blurCtx = blurred.getContext("2d");
    if (!blurCtx) return canvas;

    blurCtx.clearRect(0, 0, width, height);
    blurCtx.filter = `blur(${blurPx}px)`;
    blurCtx.drawImage(canvas, 0, 0);
    blurCtx.filter = "none";
    return blurred;
  }

  return canvas;
}

function createTintedMaskLayer(options: MaskLayerOptions) {
  const {
    source,
    width,
    height,
    topicSeed,
    offsetU = 0,
    offsetV = 0,
    scale = 1,
    opacity,
    color,
    threshold = 0.08,
    softness = 0.7,
    power = 1,
    blurPx = 0,
  } = options;

  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx || !source || opacity <= 0.001) return canvas;

  ctx.clearRect(0, 0, width, height);
  drawRepeatedSource(ctx, source, width, height, offsetU, offsetV, scale);

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;

  const seedRandom = mulberry32(hashString(topicSeed));
  const tinyVariation = 0.96 + seedRandom() * 0.08;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index] / 255;
    const g = data[index + 1] / 255;
    const b = data[index + 2] / 255;
    const a = data[index + 3] / 255;
    const luminance = (r * 0.299 + g * 0.587 + b * 0.114) * a;
    const mask = Math.pow(
      smoothstep(
        threshold,
        clamp(threshold + softness, threshold + 0.001, 1),
        luminance,
      ),
      power,
    );
    const alpha = clamp01(mask * opacity * tinyVariation);

    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = Math.round(alpha * color[3]);
  }

  ctx.putImageData(image, 0, 0);

  if (blurPx > 0) {
    const blurred = makeCanvas(width, height);
    const blurCtx = blurred.getContext("2d");
    if (!blurCtx) return canvas;

    blurCtx.clearRect(0, 0, width, height);
    blurCtx.filter = `blur(${blurPx}px)`;
    blurCtx.drawImage(canvas, 0, 0);
    blurCtx.filter = "none";
    return blurred;
  }

  return canvas;
}

function drawSubtleDisplayGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opacity: number,
) {
  if (opacity <= 0.001) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "rgba(255,255,255,0.55)";

  const step = 12;
  for (let y = 6; y < height; y += step) {
    for (let x = 6; x < width; x += step) {
      ctx.fillRect(x, y, 0.72, 0.72);
    }
  }

  ctx.restore();
}

function drawMicroSparkle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  topicId: string,
  opacity: number,
) {
  if (opacity <= 0.001) return;

  const random = mulberry32(hashString(`${topicId}:weather-display-sparkle:v6`));
  const count = Math.round(80 + opacity * 220);

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (let index = 0; index < count; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = 0.35 + random() * 1.2;
    const alpha = opacity * (0.1 + random() * 0.5);

    const sparkle = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.2);
    sparkle.addColorStop(0, `rgba(255,255,255,${alpha})`);
    sparkle.addColorStop(0.36, `rgba(175,230,255,${alpha * 0.35})`);
    sparkle.addColorStop(1, "rgba(175,230,255,0)");

    ctx.fillStyle = sparkle;
    ctx.beginPath();
    ctx.arc(x, y, radius * 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawCurvedLatitudeLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opacity: number,
) {
  if (opacity <= 0.001) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = "rgba(220,246,255,0.54)";
  ctx.lineWidth = 0.62;

  for (let y = height * 0.14; y <= height * 0.86; y += height * 0.135) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(width * 0.22, y - 12, width * 0.78, y + 12, width, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawSphereMask(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  const mask = ctx.createLinearGradient(0, 0, 0, height);
  mask.addColorStop(0, "rgba(255,255,255,0.68)");
  mask.addColorStop(0.07, "rgba(255,255,255,0.92)");
  mask.addColorStop(0.5, "rgba(255,255,255,1)");
  mask.addColorStop(0.93, "rgba(255,255,255,0.92)");
  mask.addColorStop(1, "rgba(255,255,255,0.68)");
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawSkyBase(
  ctx: CanvasRenderingContext2D,
  args: WeatherTextureOptions,
  width: number,
  height: number,
) {
  const cloudDensity = clamp01(args.weather.cloud_density);
  const turbulence = clamp01(args.weather.storm_turbulence);
  const sunlight = clamp01(args.weather.sunlight_intensity);
  const breakthrough = clamp01(args.weather.sunlight_breakthrough);
  const clarity = clamp01(args.weather.sky_clarity);
  const stability = clamp01(args.weather.atmosphere_stability);

  const stormPressure = cloudDensity * 0.35 + turbulence * 0.65;
  const clearLift = clarity * 0.75 + sunlight * 0.25;

  const topR = lerp(18 + turbulence * 8, 38 + sunlight * 24, clearLift);
  const topG = lerp(88 + turbulence * 2, 164 + sunlight * 22, clearLift);
  const topB = lerp(176, 252, clearLift);

  const midR = lerp(24 + turbulence * 10, 68 + sunlight * 30, clearLift);
  const midG = lerp(116 + turbulence * 4, 192 + sunlight * 24, clearLift);
  const midB = lerp(206, 255, clearLift);

  const bottomR = lerp(16 + turbulence * 16, 42 + sunlight * 24, stability);
  const bottomG = lerp(82, 142 + sunlight * 18, stability);
  const bottomB = lerp(168, 232, stability);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, `rgb(${topR}, ${topG}, ${topB})`);
  sky.addColorStop(0.48, `rgb(${midR}, ${midG}, ${midB})`);
  sky.addColorStop(1, `rgb(${bottomR}, ${bottomG}, ${bottomB})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const random = mulberry32(hashString(`${args.topicId}:surface-sun-anchor:v6`));
  const sunX = width * (0.18 + random() * 0.26);
  const sunY = height * (0.13 + random() * 0.22);
  const radius = width * (0.18 + sunlight * 0.11 + breakthrough * 0.14);

  const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, radius);
  sunGlow.addColorStop(
    0,
    `rgba(255, 253, 225, ${0.16 + sunlight * 0.24 + breakthrough * 0.3})`,
  );
  sunGlow.addColorStop(
    0.34,
    `rgba(255, 228, 142, ${0.08 + breakthrough * 0.16})`,
  );
  sunGlow.addColorStop(1, "rgba(255, 221, 132, 0)");
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, width, height);

  const stormDepth = ctx.createLinearGradient(0, 0, 0, height);
  stormDepth.addColorStop(0, "rgba(255,255,255,0.04)");
  stormDepth.addColorStop(0.42, "rgba(255,255,255,0)");
  stormDepth.addColorStop(
    1,
    `rgba(2, 14, 46, ${0.045 + stormPressure * 0.12})`,
  );
  ctx.fillStyle = stormDepth;
  ctx.fillRect(0, 0, width, height);
}

function computeSunAnchor(
  topicId: string,
  width: number,
  height: number,
  variant: string,
) {
  const random = mulberry32(hashString(`${topicId}:procedural-sun-anchor:${variant}:v1`));

  /**
   * Front-biased anchor:
   * Keep the sunbreak in a readable upper/front area, but move it slightly off
   * center so it feels like a real opening in the cloud field rather than a
   * flashlight pointed at the middle of the sphere.
   */
  if (SUNBREAK_HYBRID_MODE && SUNBREAK_FRONT_ANCHOR) {
    const horizontalNudge = (random() - 0.5) * 0.065;
    const verticalNudge = (random() - 0.5) * 0.035;

    return {
      x: width * ((variant === "texture" ? 0.468 : 0.458) + horizontalNudge),
      y: height * ((variant === "texture" ? 0.268 : 0.238) + verticalNudge),
      drift: random(),
    };
  }

  return {
    x: width * (0.2 + random() * 0.42),
    y: height * (0.12 + random() * 0.28),
    drift: random(),
  };
}

function drawRayField({
  ctx,
  width,
  height,
  topicId,
  anchorX,
  anchorY,
  opacity,
  warmth,
  breakthrough,
  turbulence,
  variant,
}: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  topicId: string;
  anchorX: number;
  anchorY: number;
  opacity: number;
  warmth: number;
  breakthrough: number;
  turbulence: number;
  variant: "surface" | "texture";
}) {
  if (opacity <= 0.001) return;

  const random = mulberry32(hashString(`${topicId}:procedural-rays:${variant}:v1`));
  const rayCount = Math.round(10 + breakthrough * 14 + turbulence * 3);
  const spread = Math.PI * (0.34 + breakthrough * 0.16);
  const centerAngle = Math.PI / 2 + (random() - 0.5) * 0.22;
  const baseLength = height * (0.7 + breakthrough * 0.52);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.filter = SUNBREAK_HYBRID_MODE
    ? variant === "texture"
      ? "blur(4.2px)"
      : "blur(2.8px)"
    : variant === "texture"
      ? "blur(7px)"
      : "blur(4px)";

  for (let index = 0; index < rayCount; index += 1) {
    const t = rayCount <= 1 ? 0.5 : index / (rayCount - 1);
    const angle = centerAngle + (t - 0.5) * spread + (random() - 0.5) * 0.12;
    const length = baseLength * (0.72 + random() * 0.52);
    const startWidth = width * (0.012 + random() * 0.018);
    const endWidth = width * (0.036 + random() * 0.07) * (0.8 + breakthrough * 0.4);
    const strength =
      opacity *
      (0.28 + random() * 0.72) *
      (variant === "texture" ? 1 : 0.82) *
      (SUNBREAK_HYBRID_MODE ? SUNBREAK_RAY_MULTIPLIER : 1);

    const startDistance = width * (0.025 + random() * 0.04);
    const startX = anchorX + Math.cos(angle) * startDistance;
    const startY = anchorY + Math.sin(angle) * startDistance;
    const endX = anchorX + Math.cos(angle) * length;
    const endY = anchorY + Math.sin(angle) * length;
    const normalX = Math.cos(angle + Math.PI / 2);
    const normalY = Math.sin(angle + Math.PI / 2);

    const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
    gradient.addColorStop(0, `rgba(255, 252, 234, ${strength * 0.72})`);
    gradient.addColorStop(
      0.26,
      `rgba(255, ${Math.round(232 + warmth * 18)}, ${Math.round(172 + warmth * 34)}, ${strength})`,
    );
    gradient.addColorStop(0.74, `rgba(255, 232, 178, ${strength * 0.24})`);
    gradient.addColorStop(1, "rgba(255, 232, 178, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(startX + normalX * startWidth, startY + normalY * startWidth);
    ctx.lineTo(startX - normalX * startWidth, startY - normalY * startWidth);
    ctx.lineTo(endX - normalX * endWidth, endY - normalY * endWidth);
    ctx.lineTo(endX + normalX * endWidth, endY + normalY * endWidth);
    ctx.closePath();
    ctx.fill();
  }

  ctx.filter = "none";
  ctx.restore();
}

function drawProceduralSunOcclusion({
  ctx,
  width,
  height,
  topicId,
  anchorX,
  anchorY,
  opacity,
  turbulence,
  cloudDensity,
}: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  topicId: string;
  anchorX: number;
  anchorY: number;
  opacity: number;
  turbulence: number;
  cloudDensity: number;
}) {
  if (opacity <= 0.001) return;

  const random = mulberry32(hashString(`${topicId}:procedural-sun-occlusion:v1`));

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.filter = `blur(${Math.round(14 + turbulence * 10)}px)`;

  const blobCount = Math.round(7 + cloudDensity * 9 + turbulence * 5);
  for (let index = 0; index < blobCount; index += 1) {
    const angle = (random() - 0.5) * Math.PI * 0.8 + Math.PI * 0.5;
    const distance = width * (0.05 + random() * 0.34);
    const x = anchorX + Math.cos(angle) * distance + (random() - 0.5) * width * 0.22;
    const y = anchorY + Math.sin(angle) * distance + (random() - 0.2) * height * 0.2;
    const radiusX = width * (0.055 + random() * 0.13);
    const radiusY = height * (0.035 + random() * 0.11);
    const strength = opacity * (0.25 + random() * 0.5);

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(radiusX, radiusY));
    gradient.addColorStop(0, `rgba(0,0,0,${strength})`);
    gradient.addColorStop(0.48, `rgba(0,0,0,${strength * 0.42})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(radiusX / Math.max(radiusX, radiusY), radiusY / Math.max(radiusX, radiusY));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(radiusX, radiusY), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.filter = "none";
  ctx.restore();
}

function drawProceduralSunbreak({
  ctx,
  args,
  width,
  height,
  variant,
}: {
  ctx: CanvasRenderingContext2D;
  args: WeatherTextureOptions;
  width: number;
  height: number;
  variant: "surface" | "texture";
}) {
  const cloudDensity = clamp01(args.weather.cloud_density);
  const turbulence = clamp01(args.weather.storm_turbulence);
  const sunlight = clamp01(args.weather.sunlight_intensity);
  const breakthrough = clamp01(args.weather.sunlight_breakthrough);
  const clarity = clamp01(args.weather.sky_clarity);
  const stability = clamp01(args.weather.atmosphere_stability);

  const sunPresence = clamp01(sunlight * 0.58 + breakthrough * 0.72 + clarity * 0.22);
  if (sunPresence <= 0.015) return;

  const stormPressure = clamp01(cloudDensity * 0.38 + turbulence * 0.62);
  const anchor = computeSunAnchor(args.topicId, width, height, variant);
  const anchorX = anchor.x;
  const anchorY = anchor.y;
  const warm = clamp01(0.28 + sunlight * 0.38 + breakthrough * 0.32 + stability * 0.12);

  const shapedRadiusMultiplier = SUNBREAK_HYBRID_MODE ? 0.92 : 1;
  const shapedGlowMultiplier = SUNBREAK_HYBRID_MODE
    ? SUNBREAK_GLOW_MULTIPLIER
    : 1;
  const shapedOcclusionMultiplier = SUNBREAK_HYBRID_MODE
    ? SUNBREAK_OCCLUSION_MULTIPLIER
    : 1;

  const glowRadius =
    width *
    (variant === "texture" ? 0.172 : 0.152) *
    (0.8 + breakthrough * 0.38 + clarity * 0.14) *
    shapedRadiusMultiplier;
  const haloRadius =
    width *
    (variant === "texture" ? 0.42 : 0.31) *
    (0.74 + sunlight * 0.24 + breakthrough * 0.16) *
    shapedRadiusMultiplier;
  const glowAlpha = clamp01(
    (variant === "texture" ? 0.46 : 0.2) *
      sunPresence *
      (0.82 + clarity * 0.22) *
      (1 - stormPressure * 0.16) *
      shapedGlowMultiplier,
  );
  const haloAlpha = clamp01(
    (variant === "texture" ? 0.18 : 0.085) *
      sunPresence *
      (0.86 + sunlight * 0.2) *
      (1 - stormPressure * 0.1) *
      shapedGlowMultiplier,
  );

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  const halo = ctx.createRadialGradient(anchorX, anchorY, 0, anchorX, anchorY, haloRadius);
  halo.addColorStop(0, `rgba(255, 246, 214, ${haloAlpha})`);
  halo.addColorStop(0.32, `rgba(255, ${Math.round(218 + warm * 24)}, ${Math.round(138 + warm * 45)}, ${haloAlpha * 0.42})`);
  halo.addColorStop(1, "rgba(255, 218, 138, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(anchorX, anchorY, 0, anchorX, anchorY, glowRadius);
  glow.addColorStop(0, `rgba(255, 255, 236, ${glowAlpha})`);
  glow.addColorStop(0.24, `rgba(255, 244, 196, ${glowAlpha * 0.62})`);
  glow.addColorStop(0.62, `rgba(255, 216, 132, ${glowAlpha * 0.2})`);
  glow.addColorStop(1, "rgba(255, 216, 132, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();

  drawRayField({
    ctx,
    width,
    height,
    topicId: args.topicId,
    anchorX,
    anchorY,
    opacity:
      (variant === "texture" ? 0.44 : 0.19) *
      breakthrough *
      (0.78 + sunlight * 0.28 + clarity * 0.18) *
      (1 - stormPressure * 0.16),
    warmth: warm,
    breakthrough,
    turbulence,
    variant,
  });

  drawProceduralSunOcclusion({
    ctx,
    width,
    height,
    topicId: args.topicId,
    anchorX,
    anchorY,
    opacity:
      (variant === "texture" ? 0.46 : 0.2) *
      stormPressure *
      (0.76 + cloudDensity * 0.22) *
      shapedOcclusionMultiplier,
    turbulence,
    cloudDensity,
  });

  if (variant === "surface") {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    const clearing = ctx.createRadialGradient(anchorX, anchorY, 0, anchorX, anchorY, glowRadius * 0.92);
    clearing.addColorStop(0, `rgba(96, 184, 255, ${0.018 + breakthrough * 0.035 + clarity * 0.022})`);
    clearing.addColorStop(0.44, `rgba(96, 184, 255, ${0.01 + clarity * 0.016})`);
    clearing.addColorStop(1, "rgba(96, 184, 255, 0)");
    ctx.fillStyle = clearing;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

function drawSunbreakClearing(
  ctx: CanvasRenderingContext2D,
  args: WeatherTextureOptions,
  width: number,
  height: number,
  _baseOffset: number,
) {
  drawProceduralSunbreak({
    ctx,
    args,
    width,
    height,
    variant: "surface",
  });
}

function drawAssetWeatherSurfaceTexture(args: WeatherTextureOptions) {
  const width = args.width ?? 1024;
  const height = args.height ?? 512;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (!ctx) return canvas;

  const cloudDensity = clamp01(args.weather.cloud_density);
  const turbulence = clamp01(args.weather.storm_turbulence);
  const sunlight = clamp01(args.weather.sunlight_intensity);
  const breakthrough = clamp01(args.weather.sunlight_breakthrough);
  const clarity = clamp01(args.weather.sky_clarity);
  const stability = clamp01(args.weather.atmosphere_stability);

  const random = mulberry32(hashString(`${args.topicId}:asset-weather:v6`));
  const baseOffset = random();
  const stormPressure = cloudDensity * 0.38 + turbulence * 0.62;
  const clearMultiplier = lerp(1, 0.74, clarity);
  const unstableMultiplier = lerp(0.96, 1.18, turbulence);
  const sunlightLift = 0.16 + sunlight * 0.2 + breakthrough * 0.22;

  drawSkyBase(ctx, args, width, height);

  const shadowLayer = createTintedMaskLayer({
    source: args.masks?.cloudDense,
    width,
    height,
    topicSeed: `${args.topicId}:dense-shadow:v6`,
    offsetU: baseOffset * 0.27 + 0.07,
    offsetV: 0.012,
    scale: 1.03,
    opacity:
      (0.07 + cloudDensity * 0.14 + turbulence * 0.26) *
      clearMultiplier *
      unstableMultiplier,
    color: [12, 32, 78, 190],
    threshold: 0.08,
    softness: 0.56,
    power: 1.12,
    blurPx: 1.7,
  });
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(shadowLayer, 0, 0);
  ctx.restore();

  const softLayer = createCloudImageLayer({
    source: args.masks?.cloudSoft,
    width,
    height,
    topicSeed: `${args.topicId}:soft-cloud:v6`,
    offsetU: baseOffset * 0.42,
    offsetV: -0.012,
    scale: 1.0,
    opacity: (0.44 + cloudDensity * 0.43) * clearMultiplier,
    threshold: 0.018,
    softness: 0.58,
    power: lerp(0.88, 1.1, turbulence),
    blurPx: lerp(0.52, 0.16, turbulence),
    brightness: 1.17 + sunlightLift,
    contrast: 1.18 + turbulence * 0.08,
    saturation: 0.82,
    whitenessBoost: 0.2 + sunlight * 0.09,
    warmHighlight: sunlight * 0.34 + breakthrough * 0.3,
    coolShadow: 0.08 + turbulence * 0.08,
    shadowAlphaBoost: 0.1 + cloudDensity * 0.12,
    shadowDarken: stormPressure * 0.08,
  });
  ctx.drawImage(softLayer, 0, 0);

  const denseLayer = createCloudImageLayer({
    source: args.masks?.cloudDense,
    width,
    height,
    topicSeed: `${args.topicId}:dense-cloud:v6`,
    offsetU: baseOffset * 0.2 + 0.18,
    offsetV: 0.018,
    scale: lerp(1.02, 0.96, turbulence),
    opacity:
      (0.22 + cloudDensity * 0.55 + turbulence * 0.24) *
      clearMultiplier *
      unstableMultiplier,
    threshold: lerp(0.034, 0.016, cloudDensity),
    softness: 0.5,
    power: lerp(1.05, 0.86, cloudDensity),
    blurPx: lerp(0.48, 0.12, turbulence),
    brightness: 1.08 + sunlightLift * 0.72,
    contrast: 1.25 + turbulence * 0.14,
    saturation: 0.76,
    whitenessBoost: 0.13 + sunlight * 0.07,
    warmHighlight: sunlight * 0.26 + breakthrough * 0.3,
    coolShadow: 0.14 + turbulence * 0.16,
    shadowAlphaBoost: 0.23 + turbulence * 0.2,
    shadowDarken: stormPressure * 0.22,
  });
  ctx.drawImage(denseLayer, 0, 0);

  if (stormPressure > 0.22) {
    const rainCloudLayer = createTintedMaskLayer({
      source: args.masks?.cloudDense,
      width,
      height,
      topicSeed: `${args.topicId}:rain-cloud-pressure:v6`,
      offsetU: baseOffset * 0.13 + 0.28,
      offsetV: 0.045,
      scale: 0.98,
      opacity: smoothstep(0.22, 1, stormPressure) * 0.2,
      color: [20, 34, 66, 185],
      threshold: 0.18,
      softness: 0.5,
      power: 1.22,
      blurPx: 2.2,
    });
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(rainCloudLayer, 0, 0);
    ctx.restore();
  }

  drawSunbreakClearing(ctx, args, width, height, baseOffset);

  const wispyLayer = createCloudImageLayer({
    source: args.masks?.cloudWispy,
    width,
    height,
    topicSeed: `${args.topicId}:wispy-cloud:v6`,
    offsetU: baseOffset * 0.68 + 0.32,
    offsetV: -0.026,
    scale: 1.14,
    opacity:
      (0.22 + clarity * 0.17 + cloudDensity * 0.18 + sunlight * 0.07) *
      lerp(1, 0.82, turbulence),
    threshold: 0.022,
    softness: 0.46,
    power: 1.1,
    blurPx: 0.08,
    brightness: 1.24 + sunlightLift,
    contrast: 1.22,
    saturation: 0.72,
    whitenessBoost: 0.24 + sunlight * 0.09,
    warmHighlight: sunlight * 0.3 + breakthrough * 0.26,
    coolShadow: 0.04,
    shadowAlphaBoost: 0.04,
    shadowDarken: stormPressure * 0.02,
  });
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(wispyLayer, 0, 0);
  ctx.restore();

  const highlightLayer = createCloudImageLayer({
    source: args.masks?.cloudSoft,
    width,
    height,
    topicSeed: `${args.topicId}:cloud-highlight:v6`,
    offsetU: baseOffset * 0.42,
    offsetV: -0.012,
    scale: 1.0,
    opacity: 0.06 + sunlight * 0.07 + breakthrough * 0.1,
    threshold: 0.22,
    softness: 0.43,
    power: 1.68,
    blurPx: 0.16,
    brightness: 1.42 + sunlight * 0.3,
    contrast: 1.34,
    saturation: 0.62,
    whitenessBoost: 0.48,
    warmHighlight: sunlight * 0.26 + breakthrough * 0.3,
    coolShadow: 0,
    shadowAlphaBoost: 0,
    shadowDarken: 0,
  });
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(highlightLayer, 0, 0);
  ctx.restore();

  drawMicroSparkle(
    ctx,
    width,
    height,
    args.topicId,
    0.018 + sunlight * 0.012 + breakthrough * 0.04 + stability * 0.008,
  );
  drawCurvedLatitudeLines(ctx, width, height, 0.01 + stability * 0.012);
  drawSubtleDisplayGrid(ctx, width, height, 0.007 + stability * 0.01);
  drawSphereMask(ctx, width, height);

  return canvas;
}

function drawAssetSunbreakTexture(args: WeatherTextureOptions) {
  const width = args.width ?? 1024;
  const height = args.height ?? 512;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (!ctx) return canvas;

  ctx.clearRect(0, 0, width, height);

  drawProceduralSunbreak({
    ctx,
    args,
    width,
    height,
    variant: "texture",
  });

  drawSphereMask(ctx, width, height);
  return canvas;
}

export function createLearningWeatherTexture(args: WeatherTextureOptions) {
  const canvas =
    args.kind === "sunbreak"
      ? drawAssetSunbreakTexture(args)
      : drawAssetWeatherSurfaceTexture(args);

  return configureTexture(new THREE.CanvasTexture(canvas));
}
