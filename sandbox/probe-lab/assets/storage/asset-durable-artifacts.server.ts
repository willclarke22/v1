import {
  mkdir,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

import { hashFile } from "../content-hash.server";
import {
  projectPath,
} from "../paths.server";
import {
  readJsonFileWithRetry,
  writeJsonFileAtomic,
} from "../json-file.server";
import {
  clearCloudJsonMemoryCache,
  cloudAssetMetadataEnabled,
  keepLocalAssetMetadataMirror,
  readCloudJson,
  writeCloudJson,
} from "./cloud-json.server";
import {
  getR2RuntimeStorage,
  getR2SourceStorage,
  hasR2AssetStorageEnvironment,
} from "./r2-asset-storage.server";

const DURABLE_JSON_PREFIXES = [
  {
    local:
      "sandbox/probe-lab/assets/embeddings/",
    cloud:
      "metadata/myway/assets/embeddings/",
  },
  {
    local:
      "sandbox/probe-lab/assets/library/licenses/",
    cloud:
      "metadata/myway/assets/licenses/",
  },
  {
    local:
      "sandbox/probe-lab/assets/library/source-records/",
    cloud:
      "metadata/myway/assets/source-records/",
  },
] as const;

function normalizeProjectReference(
  value: string,
) {
  return value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function safeProjectReference(
  value: string,
) {
  const normalized =
    normalizeProjectReference(value);

  if (
    path.isAbsolute(value) ||
    normalized.includes("../")
  ) {
    throw new Error(
      `Unsafe project asset reference: ${value}`,
    );
  }

  return normalized;
}

export function durableAssetCloudEnabled() {
  return (
    cloudAssetMetadataEnabled() &&
    hasR2AssetStorageEnvironment()
  );
}

export function durableJsonCloudKey(
  reference: string,
) {
  const normalized =
    safeProjectReference(reference);

  const match =
    DURABLE_JSON_PREFIXES.find(
      (entry) =>
        normalized.startsWith(entry.local),
    );

  if (!match) {
    throw new Error(
      `Unsupported durable asset JSON reference: ${reference}`,
    );
  }

  return (
    match.cloud +
    normalized.slice(match.local.length)
  );
}

export function durableJsonLocalPath(
  reference: string,
) {
  const normalized =
    safeProjectReference(reference);

  if (
    !DURABLE_JSON_PREFIXES.some(
      (entry) =>
        normalized.startsWith(entry.local),
    )
  ) {
    throw new Error(
      `Unsupported durable asset JSON reference: ${reference}`,
    );
  }

  return projectPath(
    ...normalized.split("/").filter(Boolean),
  );
}

async function localJsonOrNull<T>(
  reference: string,
) {
  try {
    return await readJsonFileWithRetry<T>(
      durableJsonLocalPath(reference),
    );
  } catch (caught) {
    if (
      (caught as NodeJS.ErrnoException)
        .code === "ENOENT"
    ) {
      return null;
    }
    throw caught;
  }
}

export async function readDurableAssetJson<T>(
  reference: string,
): Promise<T | null> {
  if (durableAssetCloudEnabled()) {
    const remote =
      await readCloudJson<T>(
        durableJsonCloudKey(reference),
      );
    if (remote != null) {
      return remote;
    }
  }

  return localJsonOrNull<T>(reference);
}

export async function writeDurableAssetJson(
  reference: string,
  value: unknown,
) {
  const cloudEnabled =
    durableAssetCloudEnabled();
  let cloudObject:
    Awaited<
      ReturnType<typeof writeCloudJson>
    > = null;

  if (cloudEnabled) {
    cloudObject =
      await writeCloudJson(
        durableJsonCloudKey(reference),
        value,
      );

    if (
      !cloudObject ||
      !(await getR2SourceStorage().exists(
        cloudObject.object_key,
      ))
    ) {
      throw new Error(
        `Private R2 metadata verification failed for ${reference}.`,
      );
    }
  }

  if (
    !cloudEnabled ||
    keepLocalAssetMetadataMirror()
  ) {
    const filePath =
      durableJsonLocalPath(reference);
    await mkdir(
      path.dirname(filePath),
      { recursive: true },
    );
    await writeJsonFileAtomic(
      filePath,
      value,
    );
  }

  return {
    reference:
      normalizeProjectReference(reference),
    cloud_object_key:
      cloudObject?.object_key ?? null,
    cloud_etag:
      cloudObject?.etag ?? null,
    local_mirror:
      !cloudEnabled ||
      keepLocalAssetMetadataMirror(),
  };
}

export async function ensureDurableAssetJson(
  reference: string,
) {
  const value =
    await readDurableAssetJson<unknown>(
      reference,
    );

  if (value == null) {
    throw new Error(
      `Durable asset metadata is missing: ${reference}`,
    );
  }

  return writeDurableAssetJson(
    reference,
    value,
  );
}


export async function deleteDurableAssetJson(
  reference: string,
) {
  if (durableAssetCloudEnabled()) {
    const key =
      durableJsonCloudKey(reference);
    await getR2SourceStorage()
      .delete(key)
      .catch(() => undefined);
    clearCloudJsonMemoryCache(
      key,
    );
  }

  const localPath =
    durableJsonLocalPath(reference);
  await rm(
    localPath,
    { force: true },
  ).catch(() => undefined);
}

export async function removeLocalDurableAssetJson(
  reference: string | null | undefined,
) {
  if (
    !reference ||
    keepLocalAssetMetadataMirror()
  ) {
    return false;
  }

  let localPath: string;
  try {
    localPath =
      durableJsonLocalPath(reference);
  } catch {
    return false;
  }

  await rm(
    localPath,
    { force: true },
  );
  return true;
}

export function runtimeObjectKeyFromPublicUrl(
  value: string | null | undefined,
) {
  if (!value) return null;

  const base =
    process.env.R2_PUBLIC_BASE_URL
      ?.trim()
      .replace(/\/+$/g, "");
  if (
    !base ||
    !value.startsWith(
      `${base}/`,
    )
  ) {
    return null;
  }

  const encoded =
    value.slice(base.length + 1);
  try {
    return encoded
      .split("/")
      .map((segment) =>
        decodeURIComponent(segment),
      )
      .join("/");
  } catch {
    return null;
  }
}

export function runtimeContentType(
  extension: string,
) {
  const normalized =
    extension.toLowerCase();

  if (normalized === ".glb") {
    return "model/gltf-binary";
  }
  if (normalized === ".gltf") {
    return "model/gltf+json";
  }
  if (normalized === ".png") {
    return "image/png";
  }
  if (
    normalized === ".jpg" ||
    normalized === ".jpeg"
  ) {
    return "image/jpeg";
  }
  if (normalized === ".webp") {
    return "image/webp";
  }
  if (normalized === ".json") {
    return "application/json; charset=utf-8";
  }
  if (normalized === ".py") {
    return "text/x-python; charset=utf-8";
  }

  return "application/octet-stream";
}

export async function uploadRuntimeAssetFile(
  input: {
    localPath: string;
    objectKey: string;
    metadata?: Record<string, string>;
    cacheControl?: string;
  },
) {
  if (!durableAssetCloudEnabled()) {
    return null;
  }

  const info =
    await stat(input.localPath);
  if (!info.isFile()) {
    throw new Error(
      `Expected a runtime artifact file: ${input.localPath}`,
    );
  }

  const extension =
    path.extname(input.localPath);
  const storage =
    getR2RuntimeStorage();
  const uploaded =
    await storage.upload({
      local_path: input.localPath,
      object_key: input.objectKey,
      content_type:
        runtimeContentType(extension),
      visibility: "public",
      cache_control:
        input.cacheControl ??
        "public, max-age=31536000, immutable",
      metadata:
        input.metadata,
    });

  if (
    !uploaded.public_url ||
    !(await storage.exists(
      uploaded.object_key,
    ))
  ) {
    throw new Error(
      `Runtime R2 verification failed for ${input.objectKey}.`,
    );
  }

  return uploaded;
}

export async function archivePrivateAssetSource(
  input: {
    assetId: string;
    sourceType: string;
    localPath: string;
  },
) {
  if (!durableAssetCloudEnabled()) {
    return null;
  }

  const info =
    await stat(input.localPath);
  if (!info.isFile()) {
    throw new Error(
      `Expected an asset source file: ${input.localPath}`,
    );
  }

  const hash =
    await hashFile(input.localPath);
  const extension =
    path.extname(input.localPath)
      .toLowerCase() || ".bin";
  const sourceType =
    input.sourceType
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-") ||
    "unknown";
  const key =
    `source/${sourceType}/${input.assetId}/` +
    `${hash.slice(0, 16)}${extension}`;
  const storage =
    getR2SourceStorage();
  const uploaded =
    await storage.upload({
      local_path:
        input.localPath,
      object_key: key,
      content_type:
        runtimeContentType(extension),
      visibility: "private",
      cache_control: "no-store",
      metadata: {
        "asset-id":
          input.assetId,
        "source-type":
          sourceType,
        "content-hash":
          hash,
      },
    });

  if (
    !(await storage.exists(
      uploaded.object_key,
    ))
  ) {
    throw new Error(
      `Private R2 source verification failed for ${input.assetId}.`,
    );
  }

  return {
    ...uploaded,
    content_hash: hash,
  };
}

export async function deletePrivateAssetObject(
  objectKey: string | null | undefined,
) {
  if (
    !objectKey ||
    !durableAssetCloudEnabled()
  ) {
    return false;
  }

  await getR2SourceStorage().delete(
    objectKey,
  );
  return true;
}
