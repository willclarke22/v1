import {
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

import {
  getMyWayAsset,
  updateMyWayAsset,
} from "./asset-library.server";
import type {
  MyWayAssetAppearanceView,
  MyWayAssetRecord,
} from "./asset-types";
import { hashFile } from "./content-hash.server";
import {
  applyApprovedLicenseReview,
  assertPublicPromotionAllowed,
  validateAssetLicenseReview,
} from "./licensing/asset-license-review";
import {
  MYWAY_ASSET_LIBRARY_PROJECT_PATH,
  projectPath,
  publicUrlToProjectPath,
} from "./paths.server";
import {
  archivePrivateAssetSource,
  durableAssetCloudEnabled,
  ensureDurableAssetJson,
  readDurableAssetJson,
  recoverDurableAssetJsonFromLocal,
  removeLocalDurableAssetJson,
  uploadRuntimeAssetFile,
} from "./storage/asset-durable-artifacts.server";
import {
  getR2RuntimeStorage,
  getR2SourceStorage,
} from "./storage/r2-asset-storage.server";

async function readOrRecoverDurableAssetJson<T>(
  reference: string,
): Promise<T | null> {
  const remote =
    await readDurableAssetJson<T>(
      reference,
    );

  if (remote != null) {
    return remote;
  }

  try {
    await recoverDurableAssetJsonFromLocal(
      reference,
    );
  } catch {
    return null;
  }

  return readDurableAssetJson<T>(
    reference,
  );
}

function localPathFromPublicPath(publicPath: string) {
  if (/^https?:\/\//i.test(publicPath)) {
    throw new Error(
      "Asset already uses a remote public_path. Create a new asset version instead of overwriting an immutable R2 object.",
    );
  }

  return publicUrlToProjectPath(publicPath);
}

function extensionFor(filePath: string, fallback: string) {
  return path.extname(filePath).toLowerCase() || fallback;
}

async function ensureFile(filePath: string) {
  const info = await stat(filePath);
  if (!info.isFile()) {
    throw new Error(`Expected a file: ${filePath}`);
  }
  return info;
}

function logicalLicenseReference(
  reviewInput: string,
) {
  if (path.isAbsolute(reviewInput)) {
    return path
      .relative(process.cwd(), reviewInput)
      .replace(/\\/g, "/");
  }

  return reviewInput
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

async function publishAnalysisViews(
  asset: MyWayAssetRecord,
) {
  const views =
    asset.appearance_profile?.analysis_views ??
    [];

  if (
    !views.length ||
    !durableAssetCloudEnabled()
  ) {
    return {
      views,
      local_files: [] as string[],
    };
  }

  const localFiles: string[] = [];
  const published:
    MyWayAssetAppearanceView[] = [];

  for (const view of views) {
    if (/^https:\/\//i.test(view.public_path)) {
      published.push(view);
      continue;
    }

    let localPath: string;
    try {
      localPath =
        localPathFromPublicPath(
          view.public_path,
        );
    } catch {
      published.push(view);
      continue;
    }

    const hash =
      await hashFile(localPath);
    const uploaded =
      await uploadRuntimeAssetFile({
        localPath,
        objectKey:
          `runtime/analysis/${asset.asset_id}/${view.name}/` +
          `${hash.slice(0, 16)}${extensionFor(localPath, ".png")}`,
        metadata: {
          "asset-id": asset.asset_id,
          "analysis-view": view.name,
          "content-hash": hash,
        },
      });

    if (!uploaded?.public_url) {
      throw new Error(
        `Analysis view ${view.name} did not produce an R2 URL.`,
      );
    }

    localFiles.push(localPath);
    published.push({
      name: view.name,
      public_path:
        uploaded.public_url,
    });
  }

  return {
    views: published,
    local_files: localFiles,
  };
}

async function publishDurableMetadata(
  asset: MyWayAssetRecord,
  licenseReference: string,
) {
  const license =
    await readOrRecoverDurableAssetJson<unknown>(
      licenseReference,
    );

  if (license == null) {
    throw new Error(
      `The license review could not be recovered to authoritative R2 storage: ${licenseReference}`,
    );
  }

  await ensureDurableAssetJson(
    licenseReference,
  );

  const sourceRecordReference =
    `${MYWAY_ASSET_LIBRARY_PROJECT_PATH}/source-records/${asset.asset_id}.json`;
  const sourceRecord =
    await readOrRecoverDurableAssetJson<unknown>(
      sourceRecordReference,
    );

  if (sourceRecord != null) {
    await ensureDurableAssetJson(
      sourceRecordReference,
    );
  }

  const vectorReference =
    asset.appearance_embedding?.status ===
      "ready"
      ? asset.appearance_embedding
          .vector_key
      : null;

  if (vectorReference) {
    const vector =
      await readOrRecoverDurableAssetJson<unknown>(
        vectorReference,
      );
    if (vector != null) {
      await ensureDurableAssetJson(
        vectorReference,
      );
    }
  }

  return {
    source_record_reference:
      sourceRecord != null
        ? sourceRecordReference
        : null,
    vector_reference:
      vectorReference,
  };
}

export async function promoteMyWayAssetToR2(input: {
  assetId: string;
  reviewFile?: string | null;
  archiveSource?: boolean;
  removeLocalAfterVerification?: boolean;
}) {
  const asset = await getMyWayAsset(input.assetId);

  if (!asset) {
    throw new Error(`Asset was not found: ${input.assetId}`);
  }

  if (asset.asset_type === "primitive") {
    throw new Error(
      "Primitive assets do not need object-storage promotion.",
    );
  }

  if (
    asset.storage_provider === "r2" &&
    /^https:\/\//i.test(asset.public_path)
  ) {
    return {
      asset,
      already_promoted: true,
    };
  }

  if (!durableAssetCloudEnabled()) {
    throw new Error(
      "Cloudflare R2 is not fully configured. Durable cloud promotion requires both the runtime and private source buckets.",
    );
  }

  const reviewInput =
    input.reviewFile ?? asset.license_record_path;

  if (!reviewInput) {
    throw new Error(
      "The asset has no license review record.",
    );
  }

  const licenseReference =
    logicalLicenseReference(
      reviewInput,
    );
  const reviewRaw =
    await readOrRecoverDurableAssetJson<unknown>(
      licenseReference,
    );

  if (!reviewRaw) {
    throw new Error(
      `The license review could not be read from durable storage: ${licenseReference}`,
    );
  }

  const validation =
    validateAssetLicenseReview(
      reviewRaw,
    );

  if (!validation.ok || !validation.review) {
    throw new Error(
      `License review is invalid:\n- ${validation.errors.join("\n- ")}`,
    );
  }

  const review = validation.review;
  assertPublicPromotionAllowed(
    asset,
    review,
  );

  const modelPath =
    localPathFromPublicPath(
      asset.public_path,
    );
  await ensureFile(modelPath);

  const modelHash =
    asset.content_hash ??
    (await hashFile(modelPath));
  const modelExtension =
    extensionFor(
      modelPath,
      ".glb",
    );
  const modelUpload =
    await uploadRuntimeAssetFile({
      localPath: modelPath,
      objectKey:
        `runtime/models/${asset.source_type}/${asset.asset_id}/` +
        `${modelHash.slice(0, 16)}${modelExtension}`,
      metadata: {
        "asset-id":
          asset.asset_id,
        "source-type":
          asset.source_type,
        "content-hash":
          modelHash,
        "license-review-id":
          review.review_id,
      },
    });

  if (!modelUpload?.public_url) {
    throw new Error(
      "Runtime model upload did not produce a public URL.",
    );
  }

  let thumbnailUpload:
    Awaited<
      ReturnType<
        typeof uploadRuntimeAssetFile
      >
    > = null;
  let thumbnailPath:
    string | null = null;

  if (asset.thumbnail_path) {
    const localThumbnailPath =
      localPathFromPublicPath(
        asset.thumbnail_path,
      );
    thumbnailPath =
      localThumbnailPath;
    await ensureFile(
      localThumbnailPath,
    );
    const thumbnailHash =
      await hashFile(
        localThumbnailPath,
      );
    const thumbnailExtension =
      extensionFor(
        localThumbnailPath,
        ".png",
      );

    thumbnailUpload =
      await uploadRuntimeAssetFile({
        localPath:
          localThumbnailPath,
        objectKey:
          `runtime/thumbnails/${asset.asset_id}/` +
          `${thumbnailHash.slice(0, 16)}${thumbnailExtension}`,
        metadata: {
          "asset-id":
            asset.asset_id,
          "content-hash":
            thumbnailHash,
          "license-review-id":
            review.review_id,
        },
      });
  }

  let sourceArchive:
    Awaited<
      ReturnType<
        typeof archivePrivateAssetSource
      >
    > = null;
  let sourcePath:
    string | null = null;

  if (
    asset.source_storage_provider ===
      "r2" &&
    asset.source_object_key
  ) {
    if (
      !(await getR2SourceStorage().exists(
        asset.source_object_key,
      ))
    ) {
      throw new Error(
        "The previously archived private source object could not be verified in R2.",
      );
    }

    if (asset.source_path) {
      sourcePath =
        path.isAbsolute(
          asset.source_path,
        )
          ? asset.source_path
          : projectPath(
              asset.source_path,
            );
    }

    sourceArchive = {
      provider: "r2",
      bucket: "",
      object_key:
        asset.source_object_key,
      public_url: null,
      etag:
        asset.source_storage_etag ??
        null,
      size_bytes:
        asset.source_file_size_bytes ??
        0,
      content_type:
        "application/octet-stream",
      content_hash:
        asset.content_hash ??
        "",
    };
  } else if (
    input.archiveSource &&
    asset.source_path
  ) {
    const localSourcePath =
      path.isAbsolute(
        asset.source_path,
      )
        ? asset.source_path
        : projectPath(
            asset.source_path,
          );
    sourcePath =
      localSourcePath;
    await ensureFile(
      localSourcePath,
    );
    sourceArchive =
      await archivePrivateAssetSource({
        assetId:
          asset.asset_id,
        sourceType:
          asset.source_type,
        localPath:
          localSourcePath,
      });
  }

  const analysis =
    await publishAnalysisViews(
      asset,
    );
  const metadata =
    await publishDurableMetadata(
      asset,
      licenseReference,
    );

  const licensed =
    applyApprovedLicenseReview(
      asset,
      review,
      licenseReference,
    );

  const nextAppearance =
    asset.appearance_profile
      ? {
          ...asset.appearance_profile,
          analysis_views:
            analysis.views,
        }
      : undefined;

  const updated =
    await updateMyWayAsset(
      asset.asset_id,
      {
        ...licensed,
        public_path:
          modelUpload.public_url,
        thumbnail_path:
          thumbnailUpload?.public_url ??
          asset.thumbnail_path ??
          null,
        storage_provider: "r2",
        storage_object_key:
          modelUpload.object_key,
        storage_etag:
          modelUpload.etag,
        file_size_bytes:
          modelUpload.size_bytes,
        thumbnail_storage_provider:
          thumbnailUpload
            ? "r2"
            : asset
                .thumbnail_storage_provider ??
              null,
        thumbnail_object_key:
          thumbnailUpload
            ?.object_key ??
          asset.thumbnail_object_key ??
          null,
        thumbnail_etag:
          thumbnailUpload?.etag ??
          asset.thumbnail_etag ??
          null,
        thumbnail_file_size_bytes:
          thumbnailUpload
            ?.size_bytes ??
          asset
            .thumbnail_file_size_bytes ??
          null,
        source_storage_provider:
          sourceArchive
            ? "r2"
            : asset
                .source_storage_provider ??
              null,
        source_object_key:
          sourceArchive
            ?.object_key ??
          asset.source_object_key ??
          null,
        source_storage_etag:
          sourceArchive?.etag ??
          asset
            .source_storage_etag ??
          null,
        source_file_size_bytes:
          sourceArchive
            ?.size_bytes ??
          asset
            .source_file_size_bytes ??
          null,
        source_archived_at:
          sourceArchive
            ? new Date()
                .toISOString()
            : asset
                .source_archived_at ??
              null,
        appearance_profile:
          nextAppearance,
        content_hash:
          modelHash,
        promoted_at:
          new Date()
            .toISOString(),
        notes:
          `${licensed.notes ?? ""}`.trim() +
          `${licensed.notes ? " " : ""}` +
          `Promoted to Cloudflare R2 with license review ${review.review_id}. Durable asset metadata is stored in the private source bucket.`,
      },
    );

  const runtime =
    getR2RuntimeStorage();
  if (
    !(await runtime.exists(
      modelUpload.object_key,
    ))
  ) {
    throw new Error(
      "The promoted model could not be re-verified in R2 after the registry update.",
    );
  }

  if (
    thumbnailUpload &&
    !(await runtime.exists(
      thumbnailUpload.object_key,
    ))
  ) {
    throw new Error(
      "The promoted thumbnail could not be re-verified in R2 after the registry update.",
    );
  }

  const removeLocal =
    input.removeLocalAfterVerification ===
      true;

  if (removeLocal) {
    await Promise.all([
      rm(
        modelPath,
        { force: true },
      ),
      thumbnailPath
        ? rm(
            thumbnailPath,
            { force: true },
          )
        : Promise.resolve(),
      sourcePath &&
      sourceArchive
        ? rm(
            sourcePath,
            { force: true },
          )
        : Promise.resolve(),
      ...analysis.local_files.map(
        (filePath) =>
          rm(
            filePath,
            { force: true },
          ),
      ),
      removeLocalDurableAssetJson(
        licenseReference,
      ),
      metadata.source_record_reference
        ? removeLocalDurableAssetJson(
            metadata
              .source_record_reference,
          )
        : Promise.resolve(false),
      metadata.vector_reference
        ? removeLocalDurableAssetJson(
            metadata.vector_reference,
          )
        : Promise.resolve(false),
    ]);

    if (
      sourcePath &&
      sourceArchive
    ) {
      await updateMyWayAsset(
        updated.asset_id,
        {
          source_path: null,
        },
      );
    }
  }

  return {
    asset:
      removeLocal &&
      sourcePath &&
      sourceArchive
        ? await getMyWayAsset(
            updated.asset_id,
          ) ?? updated
        : updated,
    already_promoted: false,
    local_runtime_removed:
      removeLocal,
    durable_metadata: {
      license:
        licenseReference,
      source_record:
        metadata
          .source_record_reference,
      appearance_embedding:
        metadata.vector_reference,
    },
  };
}
