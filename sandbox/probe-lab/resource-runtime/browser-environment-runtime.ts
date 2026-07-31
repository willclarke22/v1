"use client";

import * as THREE from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

import type {
  EnvironmentCacheMetric,
  RuntimeEnvironmentBindingV1,
  RuntimeEnvironmentFormat,
} from "./environment-runtime-contract";
import { environmentFormatFromUrl } from "./environment-runtime-policy";

type DownloadTemplate = {
  bytes: ArrayBuffer;
  byte_size: number;
  download_ms: number;
  verify_ms: number;
  expected_content_hash: string | null;
  actual_content_hash: string | null;
  hash_verified: boolean | null;
};

type DownloadEntry = {
  key: string;
  refs: number;
  status: "loading" | "ready" | "failed";
  controller: AbortController;
  abort_timer: ReturnType<typeof setTimeout> | null;
  promise: Promise<DownloadTemplate>;
  template: DownloadTemplate | null;
  last_used_at: number;
};

type PixelArray = Uint8Array | Uint16Array | Float32Array;

type DecodedEnvironment = {
  data: PixelArray;
  width: number;
  height: number;
  format: THREE.PixelFormat;
  type: THREE.TextureDataType;
  colorSpace: THREE.ColorSpace;
};

type EnvironmentTemplate = {
  source_texture: THREE.DataTexture;
  pmrem_target: THREE.WebGLRenderTarget;
  byte_size: number;
  download_ms: number;
  verify_ms: number;
  decode_ms: number;
  pmrem_ms: number;
  decoded_width: number | null;
  decoded_height: number | null;
  expected_content_hash: string | null;
  actual_content_hash: string | null;
  hash_verified: boolean | null;
};

type EnvironmentEntry = {
  key: string;
  refs: number;
  status: "loading" | "ready" | "failed";
  promise: Promise<EnvironmentTemplate>;
  template: EnvironmentTemplate | null;
  last_used_at: number;
  format: RuntimeEnvironmentFormat;
  download_release: () => void;
};

export type RuntimeEnvironmentInstance = {
  source_texture: THREE.DataTexture;
  environment_texture: THREE.Texture;
  metrics: EnvironmentCacheMetric;
  release: () => void;
};

const downloadCache = new Map<string, DownloadEntry>();
const rendererCaches = new WeakMap<THREE.WebGLRenderer, Map<string, EnvironmentEntry>>();
const allRendererCaches = new Set<Map<string, EnvironmentEntry>>();
const rendererIds = new WeakMap<THREE.WebGLRenderer, number>();

let nextRendererId = 1;
const MAX_READY_DOWNLOADS = 4;
const MAX_READY_ENVIRONMENTS = 4;
const BACKGROUND_MEMORY_BUDGET_BYTES = 128 * 1024 * 1024;
const LIGHTING_MEMORY_BUDGET_BYTES = 96 * 1024 * 1024;

function rendererId(renderer: THREE.WebGLRenderer) {
  const existing = rendererIds.get(renderer);
  if (existing) return existing;
  const value = nextRendererId++;
  rendererIds.set(renderer, value);
  return value;
}

function cacheForRenderer(renderer: THREE.WebGLRenderer) {
  const existing = rendererCaches.get(renderer);
  if (existing) return existing;
  const created = new Map<string, EnvironmentEntry>();
  rendererCaches.set(renderer, created);
  allRendererCaches.add(created);
  return created;
}

function cacheKey(binding: RuntimeEnvironmentBindingV1) {
  return [binding.public_url, binding.content_hash ?? "no-environment-hash", binding.format ?? "unknown"].join("#");
}

export function validateRuntimeEnvironmentUrl(publicUrl: string) {
  const normalized = publicUrl.trim().replace(/\\/g, "/");
  if (!normalized) {
    throw new Error("Runtime environment URL is empty.");
  }
  if (/^https:\/\//i.test(normalized) || normalized.startsWith("/sandbox-assets/myway/")) {
    return normalized;
  }
  throw new Error("Runtime environments must use HTTPS or the MyWay public asset root.");
}

function runtimeEnvironmentFetchUrl(publicUrl: string) {
  if (/^https:\/\//i.test(publicUrl)) {
    return `/api/sandbox/probe-lab/resource-runtime/environments/file?url=${encodeURIComponent(publicUrl)}`;
  }
  return publicUrl;
}

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function loadDownload(binding: RuntimeEnvironmentBindingV1, controller: AbortController, verifyHash: boolean) {
  if (!binding.public_url) {
    throw new Error("The environment binding does not have a runtime URL.");
  }

  const authoritativeUrl = validateRuntimeEnvironmentUrl(binding.public_url);
  const fetchUrl = runtimeEnvironmentFetchUrl(authoritativeUrl);
  const downloadStartedAt = performance.now();
  let response: Response;

  try {
    response = await fetch(fetchUrl, {
      signal: controller.signal,
      cache: "force-cache",
    });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new DOMException("Environment download cancelled.", "AbortError");
    }
    throw new Error(
      `Environment request could not reach the MyWay environment proxy: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    throw new Error(`Environment download failed (${response.status} ${response.statusText}).`);
  }

  const bytes = await response.arrayBuffer();
  const downloadMs = performance.now() - downloadStartedAt;

  let actualHash: string | null = null;
  let hashVerified: boolean | null = null;
  let verifyMs = 0;

  if (verifyHash && binding.content_hash) {
    const verifyStartedAt = performance.now();
    actualHash = await sha256Hex(bytes);
    verifyMs = performance.now() - verifyStartedAt;
    hashVerified = actualHash.toLowerCase() === binding.content_hash.toLowerCase();

    if (!hashVerified) {
      throw new Error("The downloaded environment SHA-256 does not match the reviewed registry.");
    }
  }

  return {
    bytes,
    byte_size: bytes.byteLength,
    download_ms: downloadMs,
    verify_ms: verifyMs,
    expected_content_hash: binding.content_hash,
    actual_content_hash: actualHash,
    hash_verified: hashVerified,
  } satisfies DownloadTemplate;
}

function evictIdleDownloads() {
  const ready = Array.from(downloadCache.values())
    .filter((entry) => entry.status === "ready" && entry.refs === 0)
    .sort((left, right) => left.last_used_at - right.last_used_at);

  while (ready.length > MAX_READY_DOWNLOADS) {
    const entry = ready.shift();
    if (!entry) break;
    downloadCache.delete(entry.key);
  }
}

function acquireDownload(binding: RuntimeEnvironmentBindingV1, verifyHash: boolean) {
  const key = cacheKey(binding);
  const existing = downloadCache.get(key);

  if (existing) {
    if (existing.abort_timer) {
      clearTimeout(existing.abort_timer);
      existing.abort_timer = null;
    }
    existing.refs += 1;
    existing.last_used_at = Date.now();

    return {
      key,
      cache_hit: true,
      promise: existing.promise,
      release: () => releaseDownload(key, existing),
    };
  }

  const controller = new AbortController();
  const entry: DownloadEntry = {
    key,
    refs: 1,
    status: "loading",
    controller,
    abort_timer: null,
    promise: Promise.resolve(null as never),
    template: null,
    last_used_at: Date.now(),
  };

  entry.promise = loadDownload(binding, controller, verifyHash)
    .then((template) => {
      entry.status = "ready";
      entry.template = template;
      entry.last_used_at = Date.now();
      evictIdleDownloads();
      return template;
    })
    .catch((error) => {
      entry.status = "failed";
      if (downloadCache.get(key) === entry) {
        downloadCache.delete(key);
      }
      throw error;
    });

  downloadCache.set(key, entry);

  return {
    key,
    cache_hit: false,
    promise: entry.promise,
    release: () => releaseDownload(key, entry),
  };
}

function releaseDownload(key: string, entry: DownloadEntry) {
  entry.refs = Math.max(0, entry.refs - 1);
  entry.last_used_at = Date.now();

  if (entry.refs === 0 && entry.status === "loading" && !entry.abort_timer) {
    entry.abort_timer = setTimeout(() => {
      entry.abort_timer = null;
      if (entry.refs === 0 && entry.status === "loading") {
        entry.controller.abort();
      }
    }, 25);
  }

  evictIdleDownloads();
}

function componentsPerPixel(format: THREE.PixelFormat) {
  switch (format) {
    case THREE.RedFormat:
      return 1;
    case THREE.RGFormat:
      return 2;
    case THREE.RGBFormat:
      return 3;
    case THREE.RGBAFormat:
    default:
      return 4;
  }
}

function bytesPerChannel(type: THREE.TextureDataType) {
  switch (type) {
    case THREE.FloatType:
      return 4;
    case THREE.HalfFloatType:
      return 2;
    default:
      return 1;
  }
}

function createLike(source: PixelArray, length: number): PixelArray {
  if (source instanceof Float32Array) return new Float32Array(length);
  if (source instanceof Uint16Array) return new Uint16Array(length);
  return new Uint8Array(length);
}

function decodeEnvironment(bytes: ArrayBuffer, format: RuntimeEnvironmentFormat): DecodedEnvironment {
  const parsed = format === "hdr" ? new RGBELoader().parse(bytes) : new EXRLoader().parse(bytes);

  return {
    data: parsed.data as PixelArray,
    width: parsed.width,
    height: parsed.height,
    format: ("format" in parsed ? parsed.format : THREE.RGBAFormat) as THREE.PixelFormat,
    type: parsed.type as THREE.TextureDataType,
    colorSpace: (("colorSpace" in parsed ? parsed.colorSpace : THREE.LinearSRGBColorSpace) as THREE.ColorSpace),
  };
}

function fitWidthHeight(width: number, height: number, maxWidth: number) {
  if (width <= maxWidth) return { width, height };
  const scale = maxWidth / width;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function fitMemoryBudget(decoded: DecodedEnvironment, width: number, height: number, budgetBytes: number) {
  const channels = componentsPerPixel(decoded.format);
  const channelBytes = bytesPerChannel(decoded.type);
  while (width > 1 && height > 1 && width * height * channels * channelBytes > budgetBytes) {
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
  }
  return { width, height };
}

function backgroundDimensions(decoded: DecodedEnvironment, renderer: THREE.WebGLRenderer) {
  const maxTexture = Math.max(1, renderer.capabilities.maxTextureSize || 4096);
  const capped = fitWidthHeight(decoded.width, decoded.height, Math.min(maxTexture, 4096));
  return fitMemoryBudget(decoded, capped.width, capped.height, BACKGROUND_MEMORY_BUDGET_BYTES);
}

function lightingDimensions(decoded: DecodedEnvironment, renderer: THREE.WebGLRenderer) {
  const maxTexture = Math.max(1, renderer.capabilities.maxTextureSize || 2048);
  const preferredCap = renderer.capabilities.isWebGL2 ? 4096 : 2048;
  const capped = fitWidthHeight(decoded.width, decoded.height, Math.min(maxTexture, preferredCap));
  return fitMemoryBudget(decoded, capped.width, capped.height, LIGHTING_MEMORY_BUDGET_BYTES);
}

function resampleDecodedNearest(decoded: DecodedEnvironment, width: number, height: number): DecodedEnvironment {
  if (decoded.width === width && decoded.height === height) {
    return decoded;
  }

  const channels = componentsPerPixel(decoded.format);
  const data = createLike(decoded.data, width * height * channels);
  const sourceWidth = decoded.width;
  const sourceHeight = decoded.height;

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor(((y + 0.5) / height) * sourceHeight));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor(((x + 0.5) / width) * sourceWidth));
      const sourceIndex = (sourceY * sourceWidth + sourceX) * channels;
      const targetIndex = (y * width + x) * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        data[targetIndex + channel] = decoded.data[sourceIndex + channel] as number;
      }
    }
  }

  return {
    ...decoded,
    data,
    width,
    height,
  };
}

function dataTextureFromDecoded(decoded: DecodedEnvironment) {
  const texture = new THREE.DataTexture(decoded.data, decoded.width, decoded.height, decoded.format, decoded.type);
  texture.colorSpace = decoded.colorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

async function buildEnvironmentTemplate(
  binding: RuntimeEnvironmentBindingV1,
  renderer: THREE.WebGLRenderer,
  verifyHash: boolean,
  download: ReturnType<typeof acquireDownload>,
) {
  const downloaded = await download.promise;
  const decodeStartedAt = performance.now();
  const format = binding.format ?? environmentFormatFromUrl(binding.public_url);

  if (!format) {
    throw new Error("The reviewed environment must be HDR or EXR.");
  }

  const decoded = decodeEnvironment(downloaded.bytes.slice(0), format);
  const backgroundDims = backgroundDimensions(decoded, renderer);
  const lightingDims = lightingDimensions(decoded, renderer);

  const backgroundTexture = dataTextureFromDecoded(
    resampleDecodedNearest(decoded, backgroundDims.width, backgroundDims.height),
  );
  const lightingTexture = dataTextureFromDecoded(
    resampleDecodedNearest(decoded, lightingDims.width, lightingDims.height),
  );

  const decodeMs = performance.now() - decodeStartedAt;
  const pmremStartedAt = performance.now();
  const generator = new THREE.PMREMGenerator(renderer);
  generator.compileEquirectangularShader();

  let pmremTarget: THREE.WebGLRenderTarget;
  try {
    pmremTarget = generator.fromEquirectangular(lightingTexture);
  } finally {
    generator.dispose();
    lightingTexture.dispose();
  }

  const pmremMs = performance.now() - pmremStartedAt;

  return {
    source_texture: backgroundTexture,
    pmrem_target: pmremTarget,
    byte_size: downloaded.byte_size,
    download_ms: downloaded.download_ms,
    verify_ms: downloaded.verify_ms,
    decode_ms: decodeMs,
    pmrem_ms: pmremMs,
    decoded_width: backgroundTexture.image?.width ?? decoded.width,
    decoded_height: backgroundTexture.image?.height ?? decoded.height,
    expected_content_hash: downloaded.expected_content_hash,
    actual_content_hash: downloaded.actual_content_hash,
    hash_verified: downloaded.hash_verified,
  } satisfies EnvironmentTemplate;
}

function disposeTemplate(template: EnvironmentTemplate | null) {
  if (!template) return;
  template.source_texture.dispose();
  template.pmrem_target.dispose();
}

function evictIdleEnvironments(cache: Map<string, EnvironmentEntry>) {
  const ready = Array.from(cache.values())
    .filter((entry) => entry.status === "ready" && entry.refs === 0)
    .sort((left, right) => left.last_used_at - right.last_used_at);

  while (ready.length > MAX_READY_ENVIRONMENTS) {
    const entry = ready.shift();
    if (!entry) break;
    cache.delete(entry.key);
    disposeTemplate(entry.template);
    entry.download_release();
  }
}

export async function acquireRuntimeEnvironment(
  binding: RuntimeEnvironmentBindingV1,
  renderer: THREE.WebGLRenderer,
  options: {
    verify_hash?: boolean;
  } = {},
): Promise<RuntimeEnvironmentInstance> {
  if (binding.lighting_mode !== "hdri" || !binding.public_url) {
    throw new Error("A reviewed HDRI binding is required.");
  }

  const format = binding.format ?? environmentFormatFromUrl(binding.public_url);

  if (!format) {
    throw new Error("Only HDR and EXR environments are supported.");
  }

  const key = cacheKey(binding);
  const cache = cacheForRenderer(renderer);
  let entry = cache.get(key);
  const cacheHit = Boolean(entry);

  if (entry) {
    entry.refs += 1;
    entry.last_used_at = Date.now();
  } else {
    const download = acquireDownload(binding, Boolean(options.verify_hash));

    entry = {
      key,
      refs: 1,
      status: "loading",
      promise: Promise.resolve(null as never),
      template: null,
      last_used_at: Date.now(),
      format,
      download_release: download.release,
    };

    entry.promise = buildEnvironmentTemplate(binding, renderer, Boolean(options.verify_hash), download)
      .then((template) => {
        if (!entry) {
          throw new Error("Environment cache entry disappeared.");
        }
        entry.status = "ready";
        entry.template = template;
        entry.last_used_at = Date.now();
        evictIdleEnvironments(cache);
        return template;
      })
      .catch((error) => {
        if (entry) {
          entry.status = "failed";
          if (cache.get(key) === entry) {
            cache.delete(key);
          }
          entry.download_release();
        }
        throw error;
      });

    cache.set(key, entry);
  }

  const template = await entry.promise;
  const metrics: EnvironmentCacheMetric = {
    cache_key: `${rendererId(renderer)}:${key}`,
    status: "ready",
    refs: entry.refs,
    byte_size: template.byte_size,
    format,
    download_ms: template.download_ms,
    verify_ms: template.verify_ms,
    decode_ms: template.decode_ms,
    pmrem_ms: template.pmrem_ms,
    cache_hit: cacheHit,
    decoded_width: template.decoded_width,
    decoded_height: template.decoded_height,
    expected_content_hash: template.expected_content_hash,
    actual_content_hash: template.actual_content_hash,
    hash_verified: template.hash_verified,
    last_used_at: Date.now(),
  };

  let released = false;

  return {
    source_texture: template.source_texture,
    environment_texture: template.pmrem_target.texture,
    metrics,
    release: () => {
      if (released) return;
      released = true;
      entry!.refs = Math.max(0, entry!.refs - 1);
      entry!.last_used_at = Date.now();
      evictIdleEnvironments(cache);
    },
  };
}

export function clearRuntimeEnvironmentCache(renderer?: THREE.WebGLRenderer) {
  if (renderer) {
    const cache = rendererCaches.get(renderer);
    if (cache) {
      for (const [key, entry] of cache) {
        if (entry.refs > 0) {
          continue;
        }
        disposeTemplate(entry.template);
        cache.delete(key);
        entry.download_release();
      }
    }
    return runtimeEnvironmentCacheSnapshot(renderer);
  }

  for (const cache of allRendererCaches) {
    for (const [key, entry] of cache) {
      if (entry.refs > 0) {
        continue;
      }
      disposeTemplate(entry.template);
      cache.delete(key);
      entry.download_release();
    }
  }

  return runtimeEnvironmentCacheSnapshot();
}

export function runtimeEnvironmentCacheSnapshot(renderer?: THREE.WebGLRenderer) {
  const environments = renderer
    ? Array.from(cacheForRenderer(renderer).values()).map((entry) => ({
        renderer_id: rendererId(renderer),
        key: entry.key,
        status: entry.status,
        refs: entry.refs,
        format: entry.format,
        byte_size: entry.template?.byte_size ?? null,
        download_ms: entry.template?.download_ms ?? null,
        decode_ms: entry.template?.decode_ms ?? null,
        pmrem_ms: entry.template?.pmrem_ms ?? null,
        last_used_at: entry.last_used_at,
      }))
    : [];

  return {
    downloads: Array.from(downloadCache.values()).map((entry) => ({
      key: entry.key,
      status: entry.status,
      refs: entry.refs,
      byte_size: entry.template?.byte_size ?? null,
      last_used_at: entry.last_used_at,
    })),
    environments,
  };
}
