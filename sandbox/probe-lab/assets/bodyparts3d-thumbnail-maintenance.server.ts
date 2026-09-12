import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  getAssetBrowserRegistryAsset,
  getAssetBrowserRegistrySnapshot,
  invalidateAssetBrowserRegistrySnapshot,
} from "./asset-browser-snapshot.server";
import { updateMyWayAsset } from "./asset-library.server";
import {
  BODYPARTS3D_FULL_COLLECTION_ID,
  bodyParts3dSemanticMaterialForSystem,
  bodyParts3dSystemFromGroupTags,
} from "./bodyparts3d-slp-pilot";
import { createNormalizeJob } from "./blender/blender-job-store.server";
import { runBlenderJob } from "./blender/blender-bridge.server";
import {
  pendingAssetProxyUrl,
  pendingAssetThumbnailObjectKey,
  readPendingAssetReviewObject,
} from "./storage/pending-asset-storage.server";
import { getR2SourceStorage } from "./storage/r2-asset-storage.server";
import { createAssetTempWorkspace } from "./storage/asset-temp-workspace.server";

export type BodyParts3dThumbnailAuditStatus =
  | "healthy"
  | "recoverable_reference"
  | "missing_object"
  | "unsupported";

export type BodyParts3dThumbnailAuditItem = {
  asset_id: string;
  source_asset_id: string | null;
  concept_name: string | null;
  status: BodyParts3dThumbnailAuditStatus;
  thumbnail_object_key: string | null;
  registered_reference: boolean;
  object_exists: boolean;
};

function isFullAtlasAsset(asset: {
  collection_membership?: { collection_id: string } | null;
}) {
  return (
    asset.collection_membership?.collection_id ===
    BODYPARTS3D_FULL_COLLECTION_ID
  );
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
) {
  const output = new Array<R>(values.length);
  let cursor = 0;

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      async () => {
        while (true) {
          const index = cursor++;
          if (index >= values.length) return;
          output[index] = await mapper(values[index]!, index);
        }
      },
    ),
  );

  return output;
}

export async function auditBodyParts3dThumbnailBatch(input: {
  registryRevision: string;
  offset: number;
  limit: number;
}) {
  const snapshot =
    await getAssetBrowserRegistrySnapshot(input.registryRevision);
  const assets = snapshot.assets
    .filter(isFullAtlasAsset)
    .sort((left, right) =>
      (left.source_asset_id ?? left.asset_id).localeCompare(
        right.source_asset_id ?? right.asset_id,
      ),
    );

  const offset = Math.max(0, input.offset);
  const limit = Math.min(96, Math.max(1, input.limit));
  const page = assets.slice(offset, offset + limit);
  const source = getR2SourceStorage();

  const items = await mapWithConcurrency(
    page,
    12,
    async (asset): Promise<BodyParts3dThumbnailAuditItem> => {
      if (asset.storage_provider !== "r2_private_pending") {
        return {
          asset_id: asset.asset_id,
          source_asset_id: asset.source_asset_id ?? null,
          concept_name: asset.collection_membership?.concept_name ?? null,
          status: "unsupported",
          thumbnail_object_key: asset.thumbnail_object_key ?? null,
          registered_reference: false,
          object_exists: false,
        };
      }

      const deterministicKey =
        pendingAssetThumbnailObjectKey(asset.asset_id);
      const registeredReference =
        asset.thumbnail_storage_provider === "r2_private_pending" &&
        asset.thumbnail_object_key === deterministicKey &&
        Boolean(asset.thumbnail_path);
      const objectExists = await source.exists(deterministicKey);

      return {
        asset_id: asset.asset_id,
        source_asset_id: asset.source_asset_id ?? null,
        concept_name: asset.collection_membership?.concept_name ?? null,
        status:
          registeredReference && objectExists
            ? "healthy"
            : objectExists
              ? "recoverable_reference"
              : "missing_object",
        thumbnail_object_key: deterministicKey,
        registered_reference: registeredReference,
        object_exists: objectExists,
      };
    },
  );

  return {
    total: assets.length,
    offset,
    limit,
    next_offset:
      offset + page.length < assets.length
        ? offset + page.length
        : null,
    items,
  };
}

function anatomyThumbnailColor(asset: {
  collection_membership?: { group_tags?: string[] } | null;
}) {
  const systemId =
    bodyParts3dSystemFromGroupTags(
      asset.collection_membership?.group_tags ?? [],
    );
  return (
    bodyParts3dSemanticMaterialForSystem(systemId)?.base_color ??
    "#B7C0CC"
  );
}

async function repairThumbnailReference(
  assetId: string,
  object: {
    object_key: string;
    etag: string | null;
    size_bytes: number;
  },
) {
  const updated = await updateMyWayAsset(assetId, {
    thumbnail_path:
      pendingAssetProxyUrl(assetId, "thumbnail"),
    thumbnail_storage_provider:
      "r2_private_pending",
    thumbnail_object_key:
      object.object_key,
    thumbnail_etag:
      object.etag,
    thumbnail_file_size_bytes:
      object.size_bytes,
  });

  invalidateAssetBrowserRegistrySnapshot();
  return updated;
}

export async function backfillBodyParts3dThumbnail(input: {
  assetId: string;
  registryRevision: string;
}) {
  const asset =
    await getAssetBrowserRegistryAsset(
      input.assetId,
      input.registryRevision,
    );

  if (!asset || !isFullAtlasAsset(asset)) {
    throw new Error(
      `BodyParts3D full-atlas asset was not found: ${input.assetId}`,
    );
  }

  if (asset.storage_provider !== "r2_private_pending") {
    throw new Error(
      `BodyParts3D thumbnail backfill currently requires a private pending atlas model: ${asset.asset_id}`,
    );
  }

  const source = getR2SourceStorage();
  const thumbnailKey =
    pendingAssetThumbnailObjectKey(asset.asset_id);

  const existing = await source.read(thumbnailKey);
  if (existing) {
    await repairThumbnailReference(asset.asset_id, existing);
    return {
      asset_id: asset.asset_id,
      result: "reference_repaired" as const,
      thumbnail_object_key: thumbnailKey,
      thumbnail_etag: existing.etag,
      thumbnail_size_bytes: existing.size_bytes,
    };
  }

  const model =
    await readPendingAssetReviewObject(asset, "model");
  if (!model) {
    throw new Error(
      `Cannot regenerate thumbnail because the private pending GLB is missing: ${asset.asset_id}`,
    );
  }

  const workspace =
    await createAssetTempWorkspace(
      "bodyparts3d-thumbnail",
    );

  try {
    const inputPath =
      path.join(workspace.path, "source.glb");
    const outputPath =
      path.join(workspace.path, "thumbnail-normalized.glb");
    const thumbnailPath =
      path.join(workspace.path, "thumbnail.png");

    await writeFile(
      /* turbopackIgnore: true */
      inputPath,
      Buffer.from(model.body),
    );

    const { jobPath } =
      await createNormalizeJob({
        kind: "normalize_asset",
        input_path: inputPath,
        output_path: outputPath,
        thumbnail_path: thumbnailPath,
        target_extent_m:
          Math.max(
            ...asset.dimensions_m.map((value) =>
              Number.isFinite(value) ? Math.max(value, 0.001) : 0.001,
            ),
          ),
        normalization_mode:
          "preserve_geometry",
        thumbnail_color_hex:
          anatomyThumbnailColor(asset),
        source_type: "manual",
        result: null,
        error: null,
      });

    const completed =
      await runBlenderJob(jobPath);

    if (
      completed.kind !== "normalize_asset" ||
      !completed.result
    ) {
      throw new Error(
        `Blender did not return a regenerated anatomy thumbnail for ${asset.asset_id}.`,
      );
    }

    const thumbnailBytes =
      await readFile(
        /* turbopackIgnore: true */
        thumbnailPath,
      );

    const uploaded =
      await source.uploadBytes({
        body: thumbnailBytes,
        object_key: thumbnailKey,
        content_type: "image/png",
        visibility: "private",
        cache_control:
          "private, max-age=31536000, immutable",
        metadata: {
          "myway-record-kind":
            "bodyparts3d-thumbnail",
          "myway-asset-id":
            asset.asset_id,
          "myway-thumbnail-palette":
            "myway_semantic_anatomy_palette_v1",
        },
      });

    const verified =
      await source.read(thumbnailKey);
    if (
      !verified ||
      verified.size_bytes !== thumbnailBytes.byteLength
    ) {
      throw new Error(
        `Regenerated thumbnail upload could not be verified for ${asset.asset_id}.`,
      );
    }

    await repairThumbnailReference(
      asset.asset_id,
      {
        object_key:
          uploaded.object_key,
        etag:
          verified.etag ??
          uploaded.etag ??
          null,
        size_bytes:
          verified.size_bytes,
      },
    );

    return {
      asset_id:
        asset.asset_id,
      result:
        "thumbnail_regenerated" as const,
      thumbnail_object_key:
        thumbnailKey,
      thumbnail_etag:
        verified.etag ??
        uploaded.etag ??
        null,
      thumbnail_size_bytes:
        verified.size_bytes,
    };
  } finally {
    await workspace.cleanup().catch(() => undefined);
  }
}
