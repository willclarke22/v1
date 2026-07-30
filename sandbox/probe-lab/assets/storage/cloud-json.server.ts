import {
  getR2SourceStorage,
  hasR2AssetStorageEnvironment,
} from "./r2-asset-storage.server";

const memoryCache = new Map<
  string,
  {
    expires_at: number;
    value: unknown;
  }
>();

const DEFAULT_CACHE_MS = Number(
  process.env.MYWAY_CLOUD_METADATA_CACHE_MS ?? 30_000,
);

export function cloudAssetMetadataEnabled() {
  const explicit =
    process.env.MYWAY_ASSET_METADATA_STORAGE
      ?.trim()
      .toLowerCase();

  if (explicit === "local") return false;
  if (explicit === "r2") return true;

  return hasR2AssetStorageEnvironment();
}

export function keepLocalAssetMetadataMirror() {
  const explicit =
    process.env.MYWAY_KEEP_LOCAL_ASSET_MIRROR
      ?.trim()
      .toLowerCase();

  if (explicit === "true" || explicit === "1") {
    return true;
  }

  if (explicit === "false" || explicit === "0") {
    return false;
  }

  return !cloudAssetMetadataEnabled();
}

export function canWriteProjectAssetFiles() {
  if (process.env.VERCEL === "1") return false;
  return keepLocalAssetMetadataMirror();
}

export async function readCloudJson<T>(
  objectKey: string,
): Promise<T | null> {
  if (!cloudAssetMetadataEnabled()) {
    return null;
  }

  const cached = memoryCache.get(objectKey);
  if (
    cached &&
    cached.expires_at > Date.now()
  ) {
    return structuredClone(cached.value) as T;
  }

  const result =
    await getR2SourceStorage().read(objectKey);

  if (!result) return null;

  const parsed = JSON.parse(
    Buffer.from(result.body).toString("utf8"),
  ) as T;

  memoryCache.set(objectKey, {
    expires_at: Date.now() + DEFAULT_CACHE_MS,
    value: parsed,
  });

  return structuredClone(parsed);
}

export async function writeCloudJson(
  objectKey: string,
  value: unknown,
) {
  if (!cloudAssetMetadataEnabled()) {
    return null;
  }

  const body = JSON.stringify(value);

  const result =
    await getR2SourceStorage().uploadBytes({
      body,
      object_key: objectKey,
      content_type: "application/json; charset=utf-8",
      visibility: "private",
      cache_control: "no-store",
      metadata: {
        "myway-record-kind": "json-metadata",
        "updated-at": new Date().toISOString(),
      },
    });

  memoryCache.set(objectKey, {
    expires_at: Date.now() + DEFAULT_CACHE_MS,
    value: structuredClone(value),
  });

  return result;
}

export function clearCloudJsonMemoryCache(
  objectKey?: string,
) {
  if (objectKey) {
    memoryCache.delete(objectKey);
    return;
  }

  memoryCache.clear();
}
