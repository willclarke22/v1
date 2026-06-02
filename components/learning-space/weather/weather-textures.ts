import * as THREE from "three";
import type { LearningWeather } from "@/types/learning-space";

type WeatherTextureKind = "surface" | "sunbreak";

type WeatherTextureOptions = {
  topicId: string;
  weather: LearningWeather;
  kind: WeatherTextureKind;
  width?: number;
  height?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function buildNoiseGrid(
  random: () => number,
  columns: number,
  rows: number,
) {
  const values = new Float32Array(columns * rows);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = random();
  }
  return { columns, rows, values };
}

function sampleGrid(
  grid: { columns: number; rows: number; values: Float32Array },
  u: number,
  v: number,
) {
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

function drawSubtleDisplayGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = "rgba(255,255,255,0.55)";

  const step = 12;
  for (let y = 6; y < height; y += step) {
    for (let x = 6; x < width; x += step) {
      ctx.fillRect(x, y, 0.9, 0.9);
    }
  }

  ctx.restore();
}

function drawCurvedLatitudeLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "rgba(255,255,255,0.52)";
  ctx.lineWidth = 0.9;

  for (let y = height * 0.12; y <= height * 0.88; y += height * 0.115) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(width * 0.22, y - 18, width * 0.78, y + 18, width, y);
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
  mask.addColorStop(0, "rgba(255,255,255,0.62)");
  mask.addColorStop(0.08, "rgba(255,255,255,0.9)");
  mask.addColorStop(0.5, "rgba(255,255,255,1)");
  mask.addColorStop(0.92, "rgba(255,255,255,0.9)");
  mask.addColorStop(1, "rgba(255,255,255,0.62)");
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawWeatherSurfaceTexture(args: WeatherTextureOptions) {
  const width = args.width ?? 1024;
  const height = args.height ?? 512;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (!ctx) return canvas;

  const cloudDensity = clamp(args.weather.cloud_density, 0, 1);
  const turbulence = clamp(args.weather.storm_turbulence, 0, 1);
  const sunlight = clamp(args.weather.sunlight_intensity, 0, 1);
  const breakthrough = clamp(args.weather.sunlight_breakthrough, 0, 1);
  const clarity = clamp(args.weather.sky_clarity, 0, 1);
  const stability = clamp(args.weather.atmosphere_stability, 0, 1);

  const random = mulberry32(hashString(`${args.topicId}:weather-surface:v3`));
  const coarse = buildNoiseGrid(random, 18, 10);
  const mid = buildNoiseGrid(random, 48, 24);
  const fine = buildNoiseGrid(random, 122, 60);
  const wisps = buildNoiseGrid(random, 220, 108);

  const image = ctx.createImageData(width, height);
  const data = image.data;

  const sunX = 0.22 + random() * 0.22;
  const sunY = 0.18 + random() * 0.16;
  const cloudThreshold = 0.48 - cloudDensity * 0.18 + clarity * 0.08;
  const sharpness = 0.055 + (1 - clarity) * 0.03;

  for (let y = 0; y < height; y += 1) {
    const v = y / Math.max(1, height - 1);
    const vertical = smoothstep(0.05, 0.92, v);
    const poleFade = 0.72 + 0.28 * Math.sin(Math.PI * clamp(v, 0, 1));

    for (let x = 0; x < width; x += 1) {
      const u = x / Math.max(1, width - 1);

      const driftU = u + Math.sin(v * Math.PI * 2.4) * 0.045 + turbulence * 0.035;
      const driftV = v + Math.sin(u * Math.PI * 2.2) * 0.025;

      const n1 = sampleGrid(coarse, driftU, driftV);
      const n2 = sampleGrid(mid, driftU * 1.8 + 0.11, driftV * 1.4 + 0.05);
      const n3 = sampleGrid(fine, driftU * 3.4 + 0.27, driftV * 2.9 + 0.19);
      const n4 = sampleGrid(wisps, driftU * 6.2 + 0.43, driftV * 4.5 + 0.31);

      const banding =
        0.5 +
        0.5 *
          Math.sin(
            v * Math.PI * (7.5 + turbulence * 3.5) +
              n1 * 2.1 +
              Math.sin(u * Math.PI * 2.0) * 0.7,
          );

      const cloudField =
        n1 * 0.36 +
        n2 * 0.29 +
        n3 * 0.23 +
        n4 * 0.12 +
        banding * (0.14 + turbulence * 0.08) -
        Math.abs(v - 0.55) * 0.08;

      const cloudCore = smoothstep(
        cloudThreshold,
        cloudThreshold + sharpness,
        cloudField,
      );
      const cloudEdge = smoothstep(
        cloudThreshold - 0.07,
        cloudThreshold + sharpness * 1.7,
        cloudField,
      );
      const wispMask = smoothstep(0.58, 0.86, n4) * cloudEdge;

      const stormNoise = sampleGrid(mid, driftU * 2.2 + 0.6, driftV * 1.9 + 0.2);
      const storm = smoothstep(0.56, 0.9, stormNoise) * turbulence * cloudEdge;

      const sunDistance = Math.hypot((u - sunX) * 1.45, (v - sunY) * 2.0);
      const sunGlow = Math.max(0, 1 - sunDistance / (0.24 + breakthrough * 0.14));
      const sunBreak = smoothstep(0.12, 1, sunGlow) * (0.35 + sunlight * 0.45 + breakthrough * 0.65);

      const clearSky = smoothstep(0.25, 0.75, clarity) * (1 - cloudEdge * 0.55);
      const skyLift = clearSky * 18 + sunlight * 8;
      const lowerDepth = smoothstep(0.44, 1, v) * (18 + turbulence * 18);

      let r = lerp(20 + turbulence * 12, 45 + skyLift, 1 - vertical * 0.18);
      let g = lerp(86 + cloudDensity * 8, 155 + clarity * 34 + sunlight * 14, 1 - vertical * 0.12);
      let b = lerp(168 + turbulence * 18, 240 + clarity * 10, 1 - vertical * 0.25);

      r -= lowerDepth * 0.35;
      g -= lowerDepth * 0.45;
      b -= lowerDepth * 0.1;

      const cloudWhite = 225 + clarity * 18 + sunlight * 10;
      const cloudShadow = 132 - turbulence * 20;
      const cloudBlue = 218 + clarity * 20;

      const cloudR = lerp(cloudShadow, cloudWhite, cloudCore);
      const cloudG = lerp(cloudShadow + 12, cloudWhite + 2, cloudCore);
      const cloudB = lerp(188, cloudBlue + 12, cloudCore);

      const cloudAmount = clamp(
        cloudEdge * (0.5 + cloudDensity * 0.55) + wispMask * 0.35,
        0,
        1,
      );

      r = lerp(r, cloudR, cloudAmount);
      g = lerp(g, cloudG, cloudAmount);
      b = lerp(b, cloudB, cloudAmount);

      r = lerp(r, 52, storm * 0.62);
      g = lerp(g, 80, storm * 0.58);
      b = lerp(b, 132, storm * 0.5);

      r += sunBreak * (72 + breakthrough * 56);
      g += sunBreak * (48 + sunlight * 26);
      b += sunBreak * (8 - cloudDensity * 4);

      const displaySparkle =
        smoothstep(0.88, 0.99, sampleGrid(wisps, u * 14.0 + 0.2, v * 9.0 + 0.4)) *
        (0.035 + stability * 0.025);

      r += displaySparkle * 255;
      g += displaySparkle * 255;
      b += displaySparkle * 255;

      const index = (y * width + x) * 4;
      data[index] = clamp(r * poleFade, 0, 255);
      data[index + 1] = clamp(g * poleFade, 0, 255);
      data[index + 2] = clamp(b * poleFade, 0, 255);
      data[index + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  drawCurvedLatitudeLines(ctx, width, height);
  drawSubtleDisplayGrid(ctx, width, height);
  drawSphereMask(ctx, width, height);

  return canvas;
}

function drawSunbreakTexture(args: WeatherTextureOptions) {
  const width = args.width ?? 1024;
  const height = args.height ?? 512;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (!ctx) return canvas;

  const random = mulberry32(hashString(`${args.topicId}:weather-sunbreak:v3`));
  const sunlight = clamp(args.weather.sunlight_intensity, 0, 1);
  const breakthrough = clamp(args.weather.sunlight_breakthrough, 0, 1);
  const clarity = clamp(args.weather.sky_clarity, 0, 1);

  ctx.clearRect(0, 0, width, height);

  if (sunlight > 0.02 || breakthrough > 0.02) {
    const anchorX = width * (0.18 + random() * 0.24);
    const anchorY = height * (0.14 + random() * 0.16);
    const glowRadius = width * (0.14 + sunlight * 0.08 + breakthrough * 0.1);

    const bloom = ctx.createRadialGradient(
      anchorX,
      anchorY,
      0,
      anchorX,
      anchorY,
      glowRadius,
    );
    bloom.addColorStop(0, `rgba(255, 252, 232, ${0.68 + sunlight * 0.2})`);
    bloom.addColorStop(0.2, `rgba(255, 230, 150, ${0.36 + breakthrough * 0.22})`);
    bloom.addColorStop(0.58, `rgba(255, 208, 110, ${0.12 + clarity * 0.08})`);
    bloom.addColorStop(1, "rgba(255,208,110,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, width, height);

    const rayCount = Math.round(7 + breakthrough * 9 + clarity * 3);
    ctx.save();
    ctx.translate(anchorX, anchorY);

    for (let index = 0; index < rayCount; index += 1) {
      const angle =
        -0.38 +
        (index / Math.max(1, rayCount - 1)) * 1.32 +
        (random() - 0.5) * 0.08;
      const length = width * (0.14 + random() * 0.2 + breakthrough * 0.1);
      const rayWidth = width * (0.008 + random() * 0.018);

      ctx.save();
      ctx.rotate(angle);
      const ray = ctx.createLinearGradient(0, 0, 0, length);
      ray.addColorStop(0, `rgba(255, 245, 205, ${0.22 + breakthrough * 0.22})`);
      ray.addColorStop(0.45, `rgba(255, 224, 160, ${0.08 + sunlight * 0.09})`);
      ray.addColorStop(1, "rgba(255,224,160,0)");
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(-rayWidth, 0);
      ctx.lineTo(rayWidth, 0);
      ctx.lineTo(rayWidth * 0.38, length);
      ctx.lineTo(-rayWidth * 0.38, length);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  drawSphereMask(ctx, width, height);
  return canvas;
}

export function createLearningWeatherTexture(args: WeatherTextureOptions) {
  const canvas =
    args.kind === "sunbreak"
      ? drawSunbreakTexture(args)
      : drawWeatherSurfaceTexture(args);

  return configureTexture(new THREE.CanvasTexture(canvas));
}
