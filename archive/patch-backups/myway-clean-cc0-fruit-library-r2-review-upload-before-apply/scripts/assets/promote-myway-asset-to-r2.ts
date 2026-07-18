import { loadEnvConfig } from "@next/env";
import {
  copyFile,
  readFile,
  stat,
} from "node:fs/promises";
import path from "node:path";

import {
  getMyWayAsset,
  updateMyWayAsset,
} from "../../sandbox/probe-lab/assets/asset-library.server";
import { hashFile } from "../../sandbox/probe-lab/assets/content-hash.server";
import {
  applyApprovedLicenseReview,
  assertPublicPromotionAllowed,
  validateAssetLicenseReview,
} from "../../sandbox/probe-lab/assets/licensing/asset-license-review";
import {
  MYWAY_ASSET_REGISTRY_PROJECT_PATH,
  projectPath,
  publicUrlToProjectPath,
} from "../../sandbox/probe-lab/assets/paths.server";
import {
  getR2RuntimeStorage,
  getR2SourceStorage,
} from "../../sandbox/probe-lab/assets/storage/r2-asset-storage.server";

loadEnvConfig(process.cwd());

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0
    ? process.argv[index + 1] ?? null
    : null;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function localPathFromPublicPath(
  publicPath: string,
) {
  if (/^https?:\/\//i.test(publicPath)) {
    throw new Error(
      "Asset already uses a remote public_path. Use a new asset version rather than overwriting an immutable runtime object.",
    );
  }

  return publicUrlToProjectPath(publicPath);
}

function extensionFor(
  filePath: string,
  fallback: string,
) {
  const extension = path
    .extname(filePath)
    .toLowerCase();

  return extension || fallback;
}

function contentTypeFor(
  extension: string,
) {
  if (extension === ".glb") {
    return "model/gltf-binary";
  }
  if (extension === ".gltf") {
    return "model/gltf+json";
  }
  if (extension === ".png") {
    return "image/png";
  }
  if (
    extension === ".jpg" ||
    extension === ".jpeg"
  ) {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

async function ensureFile(filePath: string) {
  const info = await stat(filePath);

  if (!info.isFile()) {
    throw new Error(
      `Expected a file: ${filePath}`,
    );
  }

  return info;
}

async function main() {
  const assetId = argument("--asset-id");
  const reviewInput = argument("--review-file");
  const archiveSource =
    hasFlag("--archive-source");

  if (!assetId || !reviewInput) {
    throw new Error(
      "Usage: pnpm exec tsx scripts/assets/promote-myway-asset-to-r2.ts --asset-id <asset-id> --review-file <review.json> [--archive-source]",
    );
  }

  const asset = await getMyWayAsset(assetId);

  if (!asset) {
    throw new Error(
      `Asset was not found: ${assetId}`,
    );
  }

  if (asset.asset_type === "primitive") {
    throw new Error(
      "Primitive assets do not need object-storage promotion.",
    );
  }

  const reviewPath = path.isAbsolute(reviewInput)
    ? reviewInput
    : projectPath(reviewInput);
  const reviewRaw = JSON.parse(
    await readFile(reviewPath, "utf8"),
  );
  const validation =
    validateAssetLicenseReview(reviewRaw);

  if (!validation.ok || !validation.review) {
    throw new Error(
      `License review is invalid:\n- ${validation.errors.join(
        "\n- ",
      )}`,
    );
  }

  const review = validation.review;
  assertPublicPromotionAllowed(asset, review);

  const modelPath = localPathFromPublicPath(
    asset.public_path,
  );
  await ensureFile(modelPath);

  const modelHash =
    asset.content_hash ??
    (await hashFile(modelPath));
  const modelExtension = extensionFor(
    modelPath,
    ".glb",
  );
  const modelKey =
    `runtime/models/${asset.source_type}/` +
    `${asset.asset_id}/` +
    `${modelHash.slice(0, 16)}${modelExtension}`;

  const runtimeStorage =
    getR2RuntimeStorage();

  const modelUpload =
    await runtimeStorage.upload({
      local_path: modelPath,
      object_key: modelKey,
      content_type:
        contentTypeFor(modelExtension),
      visibility: "public",
      cache_control:
        "public, max-age=31536000, immutable",
      metadata: {
        "asset-id": asset.asset_id,
        "source-type": asset.source_type,
        "content-hash": modelHash,
        "license-review-id":
          review.review_id,
      },
    });

  if (!modelUpload.public_url) {
    throw new Error(
      "Runtime upload did not produce a public URL.",
    );
  }

  let thumbnailUpload:
    | Awaited<
        ReturnType<
          typeof runtimeStorage.upload
        >
      >
    | null = null;

  if (asset.thumbnail_path) {
    const thumbnailPath =
      localPathFromPublicPath(
        asset.thumbnail_path,
      );
    await ensureFile(thumbnailPath);
    const thumbnailHash =
      await hashFile(thumbnailPath);
    const thumbnailExtension =
      extensionFor(thumbnailPath, ".png");
    const thumbnailKey =
      `runtime/thumbnails/${asset.asset_id}/` +
      `${thumbnailHash.slice(0, 16)}` +
      `${thumbnailExtension}`;

    thumbnailUpload =
      await runtimeStorage.upload({
        local_path: thumbnailPath,
        object_key: thumbnailKey,
        content_type: contentTypeFor(
          thumbnailExtension,
        ),
        visibility: "public",
        cache_control:
          "public, max-age=31536000, immutable",
        metadata: {
          "asset-id": asset.asset_id,
          "content-hash": thumbnailHash,
          "license-review-id":
            review.review_id,
        },
      });
  }

  let sourceArchive:
    | Awaited<
        ReturnType<
          ReturnType<
            typeof getR2SourceStorage
          >["upload"]
        >
      >
    | null = null;

  if (archiveSource) {
    if (!asset.source_path) {
      throw new Error(
        "Asset has no source_path to archive.",
      );
    }

    const sourcePath = path.isAbsolute(
      asset.source_path,
    )
      ? asset.source_path
      : projectPath(asset.source_path);
    await ensureFile(sourcePath);

    const sourceHash =
      await hashFile(sourcePath);
    const sourceExtension =
      extensionFor(sourcePath, ".bin");
    const sourceKey =
      `source/${asset.source_type}/` +
      `${asset.asset_id}/` +
      `${sourceHash.slice(0, 16)}` +
      `${sourceExtension}`;

    const sourceStorage =
      getR2SourceStorage();

    sourceArchive =
      await sourceStorage.upload({
        local_path: sourcePath,
        object_key: sourceKey,
        content_type:
          contentTypeFor(sourceExtension),
        visibility: "private",
        metadata: {
          "asset-id": asset.asset_id,
          "source-type":
            asset.source_type,
          "content-hash": sourceHash,
        },
      });
  }

  const registryPath = projectPath(
    MYWAY_ASSET_REGISTRY_PROJECT_PATH,
  );
  const backupPath =
    `${registryPath}.before-r2-promotion.backup`;

  await copyFile(registryPath, backupPath);

  const relativeLicensePath = path
    .relative(process.cwd(), reviewPath)
    .replace(/\\/g, "/");

  const licensed =
    applyApprovedLicenseReview(
      asset,
      review,
      relativeLicensePath,
    );

  const updated = await updateMyWayAsset(
    asset.asset_id,
    {
      ...licensed,
      public_path: modelUpload.public_url,
      thumbnail_path:
        thumbnailUpload?.public_url ??
        asset.thumbnail_path ??
        null,

      storage_provider: "r2",
      storage_object_key:
        modelUpload.object_key,
      storage_etag: modelUpload.etag,
      file_size_bytes:
        modelUpload.size_bytes,

      thumbnail_storage_provider:
        thumbnailUpload ? "r2" : null,
      thumbnail_object_key:
        thumbnailUpload?.object_key ?? null,
      thumbnail_etag:
        thumbnailUpload?.etag ?? null,
      thumbnail_file_size_bytes:
        thumbnailUpload?.size_bytes ?? null,

      source_storage_provider:
        sourceArchive ? "r2" : null,
      source_object_key:
        sourceArchive?.object_key ?? null,
      source_storage_etag:
        sourceArchive?.etag ?? null,
      source_file_size_bytes:
        sourceArchive?.size_bytes ?? null,
      source_archived_at:
        sourceArchive
          ? new Date().toISOString()
          : null,

      content_hash: modelHash,
      promoted_at: new Date().toISOString(),
      notes:
        `${licensed.notes ?? ""}`.trim() +
        `${
          licensed.notes ? " " : ""
        }Promoted to Cloudflare R2 with license review ${review.review_id}.`,
    },
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        asset_id: updated.asset_id,
        public_path: updated.public_path,
        thumbnail_path:
          updated.thumbnail_path,
        storage_object_key:
          updated.storage_object_key,
        source_object_key:
          updated.source_object_key,
        registry_backup: path
          .relative(
            process.cwd(),
            backupPath,
          )
          .replace(/\\/g, "/"),
      },
      null,
      2,
    ),
  );

  console.log(
    "\nNext: test the R2 URLs in the Asset Library, then commit registry.json and the license review JSON. Do not commit R2 credentials.",
  );
}

main().catch((caught) => {
  console.error(
    caught instanceof Error
      ? caught.message
      : String(caught),
  );
  process.exitCode = 1;
});
