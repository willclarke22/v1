import {
  createHash,
} from "node:crypto";
import {
  createReadStream,
} from "node:fs";
import {
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type {
  MyWayAssetRecord,
} from "../asset-types";
import {
  projectPath,
  publicUrlToProjectPath,
} from "../paths.server";
import {
  createAssetTempWorkspace,
} from "./asset-temp-workspace.server";
import {
  durableAssetCloudEnabled,
} from "./asset-durable-artifacts.server";
import {
  getR2SourceStorage,
} from "./r2-asset-storage.server";

export const MYWAY_PENDING_ASSET_PREFIX =
  "pending/assets/";

const PENDING_PROXY_PATH =
  "/api/sandbox/probe-lab/assets/pending-file";

function safeId(
  assetId: string,
) {
  const normalized =
    assetId
      .trim()
      .toLowerCase();

  if (
    !normalized ||
    !/^[a-z0-9_-]+$/.test(
      normalized,
    )
  ) {
    throw new Error(
      `Unsafe pending asset id: ${assetId}`,
    );
  }

  return normalized;
}

function bytesHash(
  bytes: Uint8Array,
) {
  return createHash("sha256")
    .update(
      Buffer.from(bytes),
    )
    .digest("hex");
}

async function hashTraceSafeFile(
  filePath: string,
) {
  const traceSafeFilePath =
    filePath;

  return new Promise<string>(
    (resolve, reject) => {
      const hash =
        createHash("sha256");

      const stream =
        createReadStream(
          /* turbopackIgnore: true */
          traceSafeFilePath,
        );

      stream.on("error", reject);
      stream.on(
        "data",
        (chunk) => {
          hash.update(chunk);
        },
      );
      stream.on(
        "end",
        () => {
          resolve(hash.digest("hex"));
        },
      );
    },
  );
}

export function pendingAssetStorageEnabled() {
  return durableAssetCloudEnabled();
}

export function pendingAssetModelObjectKey(
  assetId: string,
) {
  return (
    MYWAY_PENDING_ASSET_PREFIX +
    `${safeId(assetId)}/normalized.glb`
  );
}

export function pendingAssetThumbnailObjectKey(
  assetId: string,
) {
  return (
    MYWAY_PENDING_ASSET_PREFIX +
    `${safeId(assetId)}/thumbnail.png`
  );
}

export function pendingAssetProxyUrl(
  assetId: string,
  kind: "model" | "thumbnail",
) {
  return (
    `${PENDING_PROXY_PATH}?asset_id=` +
    `${encodeURIComponent(
      safeId(assetId),
    )}&kind=${kind}`
  );
}

function localStoredPath(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) return null;

  if (
    /^https?:\/\//i.test(value) ||
    value.startsWith(
      PENDING_PROXY_PATH,
    )
  ) {
    return null;
  }

  if (value.startsWith("/")) {
    return publicUrlToProjectPath(
      value,
    );
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return projectPath(value);
}

async function ensurePrivateObjectFromLocal(
  input: {
    localPath: string;
    objectKey: string;
    contentType: string;
    assetId: string;
    kind: "model" | "thumbnail";
  },
) {
  const traceSafeLocalPath =
    input.localPath;

  const info =
    await stat(
      /* turbopackIgnore: true */
      traceSafeLocalPath,
    );

  if (!info.isFile()) {
    throw new Error(
      `Expected a pending review file: ${input.localPath}`,
    );
  }

  const localHash =
    await hashTraceSafeFile(
      traceSafeLocalPath,
    );

  const source =
    getR2SourceStorage();

  const existing =
    await source.read(
      input.objectKey,
    );

  if (existing) {
    const remoteHash =
      bytesHash(
        existing.body,
      );

    if (
      existing.size_bytes !== info.size ||
      remoteHash !== localHash
    ) {
      throw new Error(
        `Private R2 pending-object conflict at ${input.objectKey}. ` +
        "The existing cloud object is not byte-identical to the local review candidate. " +
        "Neither copy was overwritten or deleted.",
      );
    }

    return {
      object_key:
        input.objectKey,
      etag:
        existing.etag,
      size_bytes:
        existing.size_bytes,
      content_hash:
        localHash,
      created:
        false,
    };
  }

  const uploaded =
    await source.upload({
      local_path:
        input.localPath,
      object_key:
        input.objectKey,
      content_type:
        input.contentType,
      visibility:
        "private",
      cache_control:
        "private, no-store",
      metadata: {
        "asset-id":
          input.assetId,
        "pending-kind":
          input.kind,
        "content-hash":
          localHash,
      },
    });

  const verified =
    await source.read(
      uploaded.object_key,
    );

  if (!verified) {
    throw new Error(
      `Private R2 pending upload could not be read back: ${uploaded.object_key}`,
    );
  }

  const verifiedHash =
    bytesHash(
      verified.body,
    );

  if (
    verified.size_bytes !== info.size ||
    verifiedHash !== localHash
  ) {
    await source.delete(
      uploaded.object_key,
    ).catch(
      () => undefined,
    );

    throw new Error(
      `Private R2 pending upload failed byte verification: ${uploaded.object_key}`,
    );
  }

  return {
    object_key:
      uploaded.object_key,
    etag:
      verified.etag ??
      uploaded.etag ??
      null,
    size_bytes:
      verified.size_bytes,
    content_hash:
      localHash,
    created:
      true,
  };
}

export type PrivatePendingStage = {
  staged: boolean;
  asset:
    MyWayAssetRecord;
  local_files_after_commit:
    string[];
  created_object_keys:
    string[];
};

export async function stageLocalAssetAsPrivatePending(
  asset:
    MyWayAssetRecord,
): Promise<
  PrivatePendingStage
> {
  if (
    !pendingAssetStorageEnabled() ||
    asset.asset_type === "primitive" ||
    asset.storage_provider !== "local" ||
    asset.status === "rejected" ||
    asset.scene_review_status !== "pending"
  ) {
    return {
      staged: false,
      asset,
      local_files_after_commit:
        [],
      created_object_keys:
        [],
    };
  }

  const modelPath =
    localStoredPath(
      asset.public_path,
    );

  if (!modelPath) {
    throw new Error(
      `Pending asset ${asset.asset_id} does not expose a local normalized model that can be staged to private R2.`,
    );
  }

  const model =
    await ensurePrivateObjectFromLocal({
      localPath:
        modelPath,
      objectKey:
        pendingAssetModelObjectKey(
          asset.asset_id,
        ),
      contentType:
        asset.asset_type === "gltf"
          ? "model/gltf+json"
          : "model/gltf-binary",
      assetId:
        asset.asset_id,
      kind:
        "model",
    });

  let thumbnail:
    Awaited<
      ReturnType<
        typeof ensurePrivateObjectFromLocal
      >
    > | null = null;

  const thumbnailPath =
    asset.thumbnail_path
      ? localStoredPath(
          asset.thumbnail_path,
        )
      : null;

  try {
    if (
      asset.thumbnail_path &&
      !thumbnailPath
    ) {
      throw new Error(
        `Pending asset ${asset.asset_id} has a thumbnail reference that is not a local review file.`,
      );
    }

    if (thumbnailPath) {
      thumbnail =
        await ensurePrivateObjectFromLocal({
          localPath:
            thumbnailPath,
          objectKey:
            pendingAssetThumbnailObjectKey(
              asset.asset_id,
            ),
          contentType:
            "image/png",
          assetId:
            asset.asset_id,
          kind:
            "thumbnail",
        });
    }
  }
  catch (caught) {
    if (model.created) {
      await getR2SourceStorage()
        .delete(
          model.object_key,
        )
        .catch(
          () => undefined,
        );
    }

    throw caught;
  }

  const localFiles =
    [
      modelPath,
      thumbnailPath,
    ].filter(
      (
        value,
      ): value is string =>
        Boolean(value),
    );

  let nextSourcePath =
    asset.source_path ??
    null;

  const sourceLocalPath =
    localStoredPath(
      nextSourcePath,
    );

  if (
    sourceLocalPath &&
    path.resolve(
      /* turbopackIgnore: true */
      sourceLocalPath,
    ) ===
      path.resolve(
        /* turbopackIgnore: true */
        modelPath,
      )
  ) {
    nextSourcePath = null;
  }

  return {
    staged: true,
    asset: {
      ...asset,
      public_path:
        pendingAssetProxyUrl(
          asset.asset_id,
          "model",
        ),
      thumbnail_path:
        thumbnail
          ? pendingAssetProxyUrl(
              asset.asset_id,
              "thumbnail",
            )
          : null,
      storage_provider:
        "r2_private_pending",
      storage_object_key:
        model.object_key,
      storage_etag:
        model.etag ??
        null,
      file_size_bytes:
        model.size_bytes,
      thumbnail_storage_provider:
        thumbnail
          ? "r2_private_pending"
          : null,
      thumbnail_object_key:
        thumbnail?.object_key ??
        null,
      thumbnail_etag:
        thumbnail?.etag ??
        null,
      thumbnail_file_size_bytes:
        thumbnail?.size_bytes ??
        null,
      source_path:
        nextSourcePath,
      content_hash:
        asset.content_hash ??
        model.content_hash,
      promoted_at:
        null,
    },
    local_files_after_commit:
      localFiles,
    created_object_keys:
      [
        model.created
          ? model.object_key
          : null,
        thumbnail?.created
          ? thumbnail.object_key
          : null,
      ].filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      ),
  };
}

export async function cleanupLocalPendingStageFiles(
  stage:
    PrivatePendingStage,
) {
  const removed:
    string[] = [];
  const failed:
    Array<{
      path: string;
      error: string;
    }> = [];

  for (
    const filePath of
    stage.local_files_after_commit
  ) {
    try {
      await rm(
        /* turbopackIgnore: true */
        filePath,
        {
          force:
            true,
        },
      );

      removed.push(
        filePath,
      );
    }
    catch (caught) {
      failed.push({
        path:
          filePath,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    }
  }

  return {
    removed,
    failed,
  };
}

export async function rollbackPrivatePendingStage(
  stage:
    PrivatePendingStage,
) {
  if (!stage.created_object_keys.length) {
    return;
  }

  const source =
    getR2SourceStorage();

  for (
    const objectKey of
    [...stage.created_object_keys]
      .reverse()
  ) {
    await source.delete(
      objectKey,
    );

    if (
      await source.exists(
        objectKey,
      )
    ) {
      throw new Error(
        `Could not roll back newly created private pending object: ${objectKey}`,
      );
    }
  }
}

function pendingObjectKey(
  asset:
    MyWayAssetRecord,
  kind:
    | "model"
    | "thumbnail",
) {
  if (kind === "model") {
    if (
      asset.storage_provider !==
        "r2_private_pending" ||
      !asset.storage_object_key
    ) {
      return null;
    }

    return asset.storage_object_key;
  }

  if (
    asset.thumbnail_storage_provider !==
      "r2_private_pending" ||
    !asset.thumbnail_object_key
  ) {
    return null;
  }

  return asset.thumbnail_object_key;
}

export async function pendingAssetReviewObjectExists(
  asset:
    MyWayAssetRecord,
  kind:
    | "model"
    | "thumbnail",
) {
  const objectKey =
    pendingObjectKey(
      asset,
      kind,
    );

  return objectKey
    ? getR2SourceStorage()
        .exists(objectKey)
    : false;
}

export async function readPendingAssetReviewObject(
  asset:
    MyWayAssetRecord,
  kind:
    | "model"
    | "thumbnail",
) {
  const objectKey =
    pendingObjectKey(
      asset,
      kind,
    );

  if (!objectKey) return null;

  return getR2SourceStorage()
    .read(objectKey);
}

export async function materializePendingAssetReviewFiles(
  asset:
    MyWayAssetRecord,
) {
  if (
    asset.storage_provider !==
      "r2_private_pending"
  ) {
    throw new Error(
      `Asset is not a private-R2 pending candidate: ${asset.asset_id}`,
    );
  }

  const workspace =
    await createAssetTempWorkspace(
      "pending-review",
    );

  try {
    const model =
      await readPendingAssetReviewObject(
        asset,
        "model",
      );

    if (!model) {
      throw new Error(
        `Private pending model is missing from R2: ${asset.asset_id}`,
      );
    }

    const modelPath =
      path.join(
        /* turbopackIgnore: true */
        workspace.path,
        asset.asset_type === "gltf"
          ? "model.gltf"
          : "model.glb",
      );

    await writeFile(
      /* turbopackIgnore: true */
      modelPath,
      Buffer.from(model.body),
    );

    const actualHash =
      await hashTraceSafeFile(
        modelPath,
      );

    if (
      asset.content_hash &&
      actualHash !== asset.content_hash
    ) {
      throw new Error(
        `Private pending model hash mismatch for ${asset.asset_id}.`,
      );
    }

    let thumbnailPath:
      string | null = null;

    if (
      asset.thumbnail_storage_provider ===
        "r2_private_pending" &&
      asset.thumbnail_object_key
    ) {
      const thumbnail =
        await readPendingAssetReviewObject(
          asset,
          "thumbnail",
        );

      if (!thumbnail) {
        throw new Error(
          `Private pending thumbnail is missing from R2: ${asset.asset_id}`,
        );
      }

      thumbnailPath =
        path.join(
          /* turbopackIgnore: true */
          workspace.path,
          "thumbnail.png",
        );

      await writeFile(
        /* turbopackIgnore: true */
        thumbnailPath,
        Buffer.from(thumbnail.body),
      );
    }

    return {
      local_path:
        modelPath,
      model_path:
        modelPath,
      thumbnail_path:
        thumbnailPath,
      byte_size:
        model.size_bytes,
      content_hash:
        actualHash,
      cleanup:
        workspace.cleanup,
    };
  }
  catch (caught) {
    await workspace.cleanup()
      .catch(
        () => undefined,
      );
    throw caught;
  }
}

export async function materializePendingAssetReviewModel(
  asset:
    MyWayAssetRecord,
) {
  return materializePendingAssetReviewFiles(
    asset,
  );
}

export async function deletePendingAssetReviewObjects(
  asset:
    MyWayAssetRecord,
) {
  const source =
    getR2SourceStorage();

  const keys =
    Array.from(
      new Set(
        [
          asset.storage_provider ===
            "r2_private_pending"
            ? asset.storage_object_key
            : null,
          asset.thumbnail_storage_provider ===
            "r2_private_pending"
            ? asset.thumbnail_object_key
            : null,
        ].filter(
          (
            value,
          ): value is string =>
            Boolean(value),
        ),
      ),
    );

  for (const objectKey of keys) {
    await source.delete(objectKey);

    if (await source.exists(objectKey)) {
      throw new Error(
        `Private pending object still exists after delete: ${objectKey}`,
      );
    }
  }

  return keys;
}

export async function deletePendingAssetReviewObjectsForAssetId(
  assetId: string,
) {
  const source =
    getR2SourceStorage();

  const keys = [
    pendingAssetModelObjectKey(assetId),
    pendingAssetThumbnailObjectKey(assetId),
  ];

  const removed:
    string[] = [];

  for (const objectKey of keys) {
    if (!(await source.exists(objectKey))) {
      continue;
    }

    await source.delete(objectKey);

    if (await source.exists(objectKey)) {
      throw new Error(
        `Private pending object still exists after cleanup: ${objectKey}`,
      );
    }

    removed.push(objectKey);
  }

  return removed;
}
