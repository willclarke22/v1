"use client";

import * as THREE from "three";

import type {
  MaterialTextureRole,
  RuntimeTextureBindingV1,
  RuntimeTextureColorSpace,
} from "./material-runtime-contract";

type TextureTemplate = {
  texture: THREE.Texture;
  byte_size: number;
  download_ms: number;
  decode_ms: number;
  bitmap: ImageBitmap | null;
};

type TextureCacheEntry = {
  key: string;
  refs: number;
  status:
    | "loading"
    | "ready"
    | "failed";
  controller: AbortController;
  abort_timer: ReturnType<typeof setTimeout> | null;
  promise: Promise<TextureTemplate>;
  template: TextureTemplate | null;
  last_used_at: number;
};

export type RuntimeTextureInstance = {
  role: MaterialTextureRole;
  texture: THREE.Texture;
  cache_key: string;
  cache_hit: boolean;
  byte_size: number;
  download_ms: number;
  decode_ms: number;
  color_space:
    RuntimeTextureColorSpace;
  release: () => void;
};

const textureCache =
  new Map<
    string,
    TextureCacheEntry
  >();
const MAX_READY_TEXTURES = 24;

function cacheKey(
  binding: RuntimeTextureBindingV1,
) {
  return [
    binding.public_url,
    binding.content_hash ??
      "no-map-hash",
    binding.color_space,
  ].join("#");
}

export function validateRuntimeTextureUrl(
  publicUrl: string,
) {
  const normalized =
    publicUrl
      .trim()
      .replace(/\\/g, "/");

  if (!normalized) {
    throw new Error(
      "Runtime texture URL is empty.",
    );
  }

  if (
    /^https:\/\//i.test(
      normalized,
    ) ||
    normalized.startsWith(
      "/sandbox-assets/myway/",
    )
  ) {
    return normalized;
  }

  throw new Error(
    "Runtime textures must use HTTPS or the MyWay public asset root.",
  );
}

function applyColorSpace(
  texture: THREE.Texture,
  colorSpace:
    RuntimeTextureColorSpace,
) {
  texture.colorSpace =
    colorSpace === "srgb"
      ? THREE.SRGBColorSpace
      : THREE.NoColorSpace;
}

async function decodeWithImageElement(
  blob: Blob,
) {
  const objectUrl =
    URL.createObjectURL(blob);

  try {
    const image =
      await new Promise<HTMLImageElement>(
        (resolve, reject) => {
          const candidate =
            new Image();
          candidate.onload = () =>
            resolve(candidate);
          candidate.onerror = () =>
            reject(
              new Error(
                "The downloaded texture could not be decoded.",
              ),
            );
          candidate.src =
            objectUrl;
        },
      );

    return {
      image,
      bitmap: null,
    };
  } finally {
    URL.revokeObjectURL(
      objectUrl,
    );
  }
}

async function decodeTexture(
  blob: Blob,
) {
  if (
    typeof createImageBitmap ===
    "function"
  ) {
    const bitmap =
      await createImageBitmap(
        blob,
      );
    return {
      image: bitmap,
      bitmap,
    };
  }

  return decodeWithImageElement(
    blob,
  );
}

function runtimeTextureFetchUrl(
  publicUrl: string,
) {
  if (
    /^https:\/\//i.test(
      publicUrl,
    )
  ) {
    return `/api/sandbox/probe-lab/resource-runtime/materials/texture?url=${encodeURIComponent(
      publicUrl,
    )}`;
  }

  return publicUrl;
}

async function loadTextureTemplate(
  binding: RuntimeTextureBindingV1,
  controller: AbortController,
) {
  const authoritativeUrl =
    validateRuntimeTextureUrl(
      binding.public_url,
    );
  const fetchUrl =
    runtimeTextureFetchUrl(
      authoritativeUrl,
    );
  const downloadStartedAt =
    performance.now();
  let response: Response;

  try {
    response = await fetch(
      fetchUrl,
      {
        signal:
          controller.signal,
        cache: "force-cache",
      },
    );
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof DOMException &&
        error.name === "AbortError")
    ) {
      throw new DOMException(
        "Texture load cancelled.",
        "AbortError",
      );
    }

    throw new Error(
      `Texture ${binding.role} request could not reach the MyWay texture proxy: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Texture ${binding.role} download failed (${response.status} ${response.statusText}).`,
    );
  }

  const blob =
    await response.blob();
  const downloadMs =
    performance.now() -
    downloadStartedAt;
  const decodeStartedAt =
    performance.now();
  const decoded =
    await decodeTexture(blob);
  const decodeMs =
    performance.now() -
    decodeStartedAt;
  const texture =
    new THREE.Texture(
      decoded.image,
    );

  applyColorSpace(
    texture,
    binding.color_space,
  );
  texture.wrapS =
    THREE.RepeatWrapping;
  texture.wrapT =
    THREE.RepeatWrapping;
  texture.needsUpdate = true;
  texture.name = `${binding.role}:${authoritativeUrl}`;

  return {
    texture,
    byte_size: blob.size,
    download_ms: downloadMs,
    decode_ms: decodeMs,
    bitmap:
      decoded.bitmap,
  };
}

function disposeTemplate(
  template: TextureTemplate,
) {
  template.texture.dispose();
  template.bitmap?.close();
}

function evictIdleTextures() {
  const ready =
    Array.from(
      textureCache.values(),
    )
      .filter(
        (entry) =>
          entry.status ===
            "ready" &&
          entry.refs === 0,
      )
      .sort(
        (left, right) =>
          left.last_used_at -
          right.last_used_at,
      );

  while (
    textureCache.size >
      MAX_READY_TEXTURES &&
    ready.length
  ) {
    const entry =
      ready.shift();

    if (
      !entry ||
      entry.refs !== 0 ||
      !entry.template
    ) {
      continue;
    }

    textureCache.delete(
      entry.key,
    );
    disposeTemplate(
      entry.template,
    );
  }
}

export async function acquireRuntimeTexture(
  binding: RuntimeTextureBindingV1,
  options: {
    signal?: AbortSignal;
    simulate_failure?: boolean;
  } = {},
): Promise<RuntimeTextureInstance> {
  if (
    options.simulate_failure
  ) {
    throw new Error(
      `Intentional ${binding.role} texture failure.`,
    );
  }

  const key =
    cacheKey(binding);
  const existing =
    textureCache.get(key);
  const cacheHit =
    Boolean(existing);
  let entry = existing;

  if (!entry) {
    const controller =
      new AbortController();

    entry = {
      key,
      refs: 0,
      status: "loading",
      controller,
      abort_timer: null,
      template: null,
      last_used_at:
        Date.now(),
      promise: Promise.resolve(
        null as never,
      ),
    };

    entry.promise =
      loadTextureTemplate(
        binding,
        controller,
      )
        .then(
          (template) => {
            if (entry!.abort_timer) {
              clearTimeout(entry!.abort_timer);
              entry!.abort_timer = null;
            }
            entry!.status =
              "ready";
            entry!.template =
              template;
            entry!.last_used_at =
              Date.now();
            return template;
          },
        )
        .catch((error) => {
          if (entry!.abort_timer) {
            clearTimeout(entry!.abort_timer);
            entry!.abort_timer = null;
          }
          entry!.status =
            "failed";
          if (
            textureCache.get(key) ===
            entry
          ) {
            textureCache.delete(
              key,
            );
          }
          throw error;
        });

    textureCache.set(
      key,
      entry,
    );
  }

  if (entry.abort_timer) {
    clearTimeout(
      entry.abort_timer,
    );
    entry.abort_timer = null;
  }

  entry.refs += 1;
  entry.last_used_at =
    Date.now();
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    entry!.refs = Math.max(
      0,
      entry!.refs - 1,
    );
    entry!.last_used_at =
      Date.now();

    if (
      entry!.refs === 0 &&
      entry!.status ===
        "loading" &&
      !entry!.abort_timer
    ) {
      // React development mode can unmount and immediately remount
      // an effect to verify cleanup. Defer cancellation by one task so
      // an immediate replacement consumer can retain the shared load.
      entry!.abort_timer =
        setTimeout(() => {
          entry!.abort_timer =
            null;

          if (
            entry!.refs === 0 &&
            entry!.status ===
              "loading"
          ) {
            entry!.controller.abort(
              "unused_texture_request",
            );
            if (
              textureCache.get(
                key,
              ) === entry
            ) {
              textureCache.delete(
                key,
              );
            }
          }
        }, 0);
    }

    evictIdleTextures();
  };

  if (
    options.signal?.aborted
  ) {
    release();
    throw new DOMException(
      "Texture load cancelled.",
      "AbortError",
    );
  }

  const onAbort = () =>
    release();

  options.signal?.addEventListener(
    "abort",
    onAbort,
    { once: true },
  );

  try {
    const template =
      await entry.promise;

    if (
      options.signal?.aborted
    ) {
      throw new DOMException(
        "Texture load cancelled.",
        "AbortError",
      );
    }

    const texture =
      template.texture.clone();
    applyColorSpace(
      texture,
      binding.color_space,
    );
    texture.wrapS =
      THREE.RepeatWrapping;
    texture.wrapT =
      THREE.RepeatWrapping;
    texture.needsUpdate = true;

    return {
      role: binding.role,
      texture,
      cache_key: key,
      cache_hit: cacheHit,
      byte_size:
        template.byte_size,
      download_ms:
        template.download_ms,
      decode_ms:
        template.decode_ms,
      color_space:
        binding.color_space,
      release,
    };
  } catch (error) {
    release();
    throw error;
  } finally {
    options.signal?.removeEventListener(
      "abort",
      onAbort,
    );
  }
}

export function clearRuntimeTextureCache() {
  let cleared = 0;
  let retained = 0;

  for (const [key, entry] of
    textureCache) {
    if (entry.refs > 0) {
      retained += 1;
      continue;
    }

    if (entry.abort_timer) {
      clearTimeout(
        entry.abort_timer,
      );
      entry.abort_timer = null;
    }

    if (
      entry.status ===
      "loading"
    ) {
      entry.controller.abort(
        "texture_cache_cleared",
      );
    }

    if (entry.template) {
      disposeTemplate(
        entry.template,
      );
    }

    textureCache.delete(
      key,
    );
    cleared += 1;
  }

  return {
    cleared,
    retained,
    remaining:
      textureCache.size,
  };
}

export function runtimeTextureCacheSnapshot() {
  return Array.from(
    textureCache.values(),
  ).map((entry) => ({
    key: entry.key,
    status: entry.status,
    refs: entry.refs,
    byte_size:
      entry.template
        ?.byte_size ?? null,
    last_used_at:
      entry.last_used_at,
  }));
}
