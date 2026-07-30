"use client";

import * as THREE from "three";
import type {
  GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  GLTFLoader,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

import type {
  ResourceRuntimeMetrics,
  ResourceRuntimePhase,
  RuntimeModelBindingV1,
} from "./resource-runtime-contract";
import {
  validateRuntimeModelUrl,
} from "./build-runtime-binding";

type CacheEntry = {
  key: string;
  url: string;
  controller: AbortController;
  refs: number;
  status: "loading" | "ready" | "failed";
  promise: Promise<LoadedTemplate>;
  template: LoadedTemplate | null;
  last_used_at: number;
};

type LoadedTemplate = {
  gltf: GLTF;
  byte_size: number;
  download_ms: number;
  verify_ms: number | null;
  parse_ms: number;
  actual_content_hash: string | null;
  hash_verified: boolean | null;
};

export type RuntimeGlbInstance = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  metrics: ResourceRuntimeMetrics;
  release: () => void;
};

export type RuntimeGlbPhaseListener = (
  phase: ResourceRuntimePhase,
  message: string,
) => void;

const runtimeCache =
  new Map<string, CacheEntry>();
const MAX_READY_CACHE_ENTRIES = 8;

function now() {
  return performance.now();
}

function cacheKey(
  binding: RuntimeModelBindingV1,
) {
  return [
    binding.public_url,
    binding.content_hash ?? "no-hash",
  ].join("#");
}

function basePath(url: string) {
  try {
    return new URL(".", url).href;
  } catch {
    return window.location.href;
  }
}

async function sha256Hex(
  bytes: ArrayBuffer,
) {
  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      bytes,
    );

  return Array.from(
    new Uint8Array(digest),
  )
    .map((value) =>
      value
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
}

function parseGlb(
  bytes: ArrayBuffer,
  url: string,
) {
  const loader = new GLTFLoader();

  return new Promise<GLTF>(
    (resolve, reject) => {
      loader.parse(
        bytes,
        basePath(url),
        resolve,
        reject,
      );
    },
  );
}

function textureKeys(
  material: THREE.Material,
) {
  return Object.entries(
    material as unknown as
      Record<string, unknown>,
  )
    .filter(
      (
        entry,
      ): entry is [string, THREE.Texture] =>
        entry[1] instanceof THREE.Texture,
    )
    .map(([key]) => key);
}

function cloneMaterial(
  source: THREE.Material,
  textureMap: Map<
    THREE.Texture,
    THREE.Texture
  >,
) {
  const material = source.clone();

  for (const key of textureKeys(material)) {
    const record =
      material as unknown as
        Record<string, unknown>;
    const sourceTexture =
      record[key] as THREE.Texture;
    const existing =
      textureMap.get(sourceTexture);
    const texture =
      existing ??
      sourceTexture.clone();

    if (!existing) {
      texture.needsUpdate = true;
      textureMap.set(
        sourceTexture,
        texture,
      );
    }

    record[key] = texture;
  }

  return material;
}

function cloneTemplateScene(
  template: THREE.Group,
) {
  const scene =
    SkeletonUtils.clone(
      template,
    ) as THREE.Group;
  const textureMap =
    new Map<
      THREE.Texture,
      THREE.Texture
    >();
  let geometryCount = 0;
  let materialCount = 0;

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }

    object.geometry =
      object.geometry.clone();
    geometryCount += 1;

    if (
      Array.isArray(object.material)
    ) {
      object.material =
        object.material.map(
          (material) =>
            cloneMaterial(
              material,
              textureMap,
            ),
        );
      materialCount +=
        object.material.length;
    } else {
      object.material =
        cloneMaterial(
          object.material,
          textureMap,
        );
      materialCount += 1;
    }

    object.castShadow = true;
    object.receiveShadow = true;
  });

  return {
    scene,
    geometryCount,
    materialCount,
    textureCount: textureMap.size,
  };
}

export function disposeRuntimeScene(
  scene: THREE.Object3D,
) {
  const geometries =
    new Set<THREE.BufferGeometry>();
  const materials =
    new Set<THREE.Material>();
  const textures =
    new Set<THREE.Texture>();

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }

    geometries.add(object.geometry);

    const meshMaterials =
      Array.isArray(object.material)
        ? object.material
        : [object.material];

    for (const material of
      meshMaterials) {
      materials.add(material);

      for (const key of
        textureKeys(material)) {
        const texture =
          (
            material as unknown as
              Record<string, unknown>
          )[key];

        if (
          texture instanceof
          THREE.Texture
        ) {
          textures.add(texture);
        }
      }
    }
  });

  textures.forEach((texture) =>
    texture.dispose(),
  );
  materials.forEach((material) =>
    material.dispose(),
  );
  geometries.forEach((geometry) =>
    geometry.dispose(),
  );

  return {
    geometry_count:
      geometries.size,
    material_count:
      materials.size,
    texture_count:
      textures.size,
  };
}

function disposeTemplate(
  template: LoadedTemplate,
) {
  disposeRuntimeScene(
    template.gltf.scene,
  );
}

function evictReadyEntries() {
  const ready = Array.from(
    runtimeCache.values(),
  )
    .filter(
      (entry) =>
        entry.status === "ready" &&
        entry.refs === 0,
    )
    .sort(
      (left, right) =>
        left.last_used_at -
        right.last_used_at,
    );

  while (
    runtimeCache.size >
      MAX_READY_CACHE_ENTRIES &&
    ready.length
  ) {
    const entry = ready.shift();

    if (
      !entry ||
      entry.refs !== 0 ||
      !entry.template
    ) {
      continue;
    }

    runtimeCache.delete(entry.key);
    disposeTemplate(entry.template);
  }
}

async function loadTemplate(
  binding: RuntimeModelBindingV1,
  controller: AbortController,
  verifyHash: boolean,
  onPhase?: RuntimeGlbPhaseListener,
): Promise<LoadedTemplate> {
  const url =
    validateRuntimeModelUrl(
      binding.public_url,
      binding.storage_provider,
    );
  const startedAt = now();

  onPhase?.(
    "downloading",
    `Downloading ${binding.asset_id}.`,
  );
  const downloadStartedAt = now();
  const response = await fetch(url, {
    signal: controller.signal,
    cache: "force-cache",
  });

  if (!response.ok) {
    throw new Error(
      `Resource download failed (${response.status} ${response.statusText}).`,
    );
  }

  const bytes =
    await response.arrayBuffer();
  const downloadMs =
    now() - downloadStartedAt;

  let actualContentHash:
    | string
    | null = null;
  let hashVerified:
    | boolean
    | null = null;
  let verifyMs:
    | number
    | null = null;

  if (
    verifyHash &&
    binding.content_hash
  ) {
    onPhase?.(
      "verifying",
      "Verifying the downloaded SHA-256 hash.",
    );
    const verifyStartedAt = now();
    actualContentHash =
      await sha256Hex(bytes);
    verifyMs =
      now() - verifyStartedAt;
    hashVerified =
      actualContentHash.toLowerCase() ===
      binding.content_hash.toLowerCase();

    if (!hashVerified) {
      throw new Error(
        `Content hash mismatch. Expected ${binding.content_hash}, received ${actualContentHash}.`,
      );
    }
  }

  onPhase?.(
    "parsing",
    "Parsing the GLB in Three.js.",
  );
  const parseStartedAt = now();
  const gltf = await parseGlb(
    bytes,
    url,
  );
  const parseMs =
    now() - parseStartedAt;

  void startedAt;

  return {
    gltf,
    byte_size: bytes.byteLength,
    download_ms: downloadMs,
    verify_ms: verifyMs,
    parse_ms: parseMs,
    actual_content_hash:
      actualContentHash,
    hash_verified: hashVerified,
  };
}

export async function acquireRuntimeGlb(
  binding: RuntimeModelBindingV1,
  options: {
    signal?: AbortSignal;
    verify_hash?: boolean;
    on_phase?: RuntimeGlbPhaseListener;
  } = {},
): Promise<RuntimeGlbInstance> {
  const key = cacheKey(binding);
  const existing =
    runtimeCache.get(key);
  const cacheHit =
    Boolean(existing);
  let entry = existing;

  if (!entry) {
    const controller =
      new AbortController();
    entry = {
      key,
      url: binding.public_url,
      controller,
      refs: 0,
      status: "loading",
      template: null,
      last_used_at: Date.now(),
      promise: Promise.resolve(
        null as never,
      ),
    };

    entry.promise = loadTemplate(
      binding,
      controller,
      options.verify_hash === true,
      options.on_phase,
    )
      .then((template) => {
        entry!.status = "ready";
        entry!.template = template;
        entry!.last_used_at =
          Date.now();
        return template;
      })
      .catch((error) => {
        entry!.status = "failed";
        runtimeCache.delete(key);
        throw error;
      });

    runtimeCache.set(key, entry);
  }

  entry.refs += 1;
  entry.last_used_at = Date.now();

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
      entry!.status === "loading"
    ) {
      entry!.controller.abort();
      runtimeCache.delete(key);
    }

    evictReadyEntries();
  };

  const signal =
    options.signal;

  if (signal?.aborted) {
    release();
    throw new DOMException(
      "Resource load cancelled.",
      "AbortError",
    );
  }

  const onAbort = () =>
    release();
  signal?.addEventListener(
    "abort",
    onAbort,
    { once: true },
  );

  const totalStartedAt = now();

  try {
    const template =
      await entry.promise;

    if (signal?.aborted) {
      throw new DOMException(
        "Resource load cancelled.",
        "AbortError",
      );
    }

    const cloned =
      cloneTemplateScene(
        template.gltf.scene,
      );

    options.on_phase?.(
      "ready",
      `${binding.asset_id} is ready.`,
    );

    return {
      scene: cloned.scene,
      animations:
        template.gltf.animations.map(
          (clip) => clip.clone(),
        ),
      metrics: {
        cache_key: key,
        cache_hit: cacheHit,
        byte_size:
          template.byte_size,
        download_ms:
          template.download_ms,
        verify_ms:
          template.verify_ms,
        parse_ms:
          template.parse_ms,
        total_ms:
          now() - totalStartedAt,
        expected_content_hash:
          binding.content_hash,
        actual_content_hash:
          template.actual_content_hash,
        hash_verified:
          template.hash_verified,
        instance_geometry_count:
          cloned.geometryCount,
        instance_material_count:
          cloned.materialCount,
        instance_texture_count:
          cloned.textureCount,
      },
      release,
    };
  } catch (error) {
    release();
    throw error;
  } finally {
    signal?.removeEventListener(
      "abort",
      onAbort,
    );
  }
}

export function clearRuntimeGlbCache() {
  let cleared = 0;
  let retained = 0;

  for (const [key, entry] of
    runtimeCache) {
    if (entry.refs > 0) {
      retained += 1;
      continue;
    }

    if (entry.status === "loading") {
      entry.controller.abort();
    }

    if (entry.template) {
      disposeTemplate(entry.template);
    }

    runtimeCache.delete(key);
    cleared += 1;
  }

  return {
    cleared,
    retained,
    remaining: runtimeCache.size,
  };
}

export function runtimeGlbCacheSnapshot() {
  return Array.from(
    runtimeCache.values(),
  ).map((entry) => ({
    key: entry.key,
    url: entry.url,
    status: entry.status,
    refs: entry.refs,
    byte_size:
      entry.template?.byte_size ??
      null,
    last_used_at:
      entry.last_used_at,
  }));
}
