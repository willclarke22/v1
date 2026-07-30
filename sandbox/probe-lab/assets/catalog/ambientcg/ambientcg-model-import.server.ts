import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  assetWithFileStats,
  listMyWayAssets,
  registerMyWayAsset,
} from "../../asset-library.server";
import type { MyWayAssetRecord } from "../../asset-types";
import { runBlenderJob } from "../../blender/blender-bridge.server";
import { createNormalizeJob } from "../../blender/blender-job-store.server";
import { hashFile } from "../../content-hash.server";
import { safeAssetId } from "../../normalize-asset-record";
import {
  ensureAssetDirectories,
  projectPath,
} from "../../paths.server";
import type {
  AmbientCgDownloadJob,
} from "./ambientcg-types";
import {
  chooseAmbientCgVariant,
  markAmbientCgCatalogCached,
  prepareAmbientCgDownloadedFiles,
  updateAmbientCgDownloadJob,
} from "./ambientcg-download.server";
import {
  ensureAmbientCgDirectories,
  readAmbientCgCatalog,
} from "./ambientcg-store.server";

const SUPPORTED_MODEL_EXTENSIONS = [
  ".glb",
  ".gltf",
  ".fbx",
  ".obj",
  ".blend",
] as const;

function stableSuffix(sourceAssetId: string) {
  return createHash("sha256")
    .update(sourceAssetId)
    .digest("hex")
    .slice(0, 8);
}

function selectModelFile(files: string[]) {
  const candidates = files.filter((file) =>
    SUPPORTED_MODEL_EXTENSIONS.includes(
      path.extname(file).toLowerCase() as (typeof SUPPORTED_MODEL_EXTENSIONS)[number],
    ),
  );

  return candidates.sort((left, right) => {
    const leftIndex = SUPPORTED_MODEL_EXTENSIONS.indexOf(
      path.extname(left).toLowerCase() as (typeof SUPPORTED_MODEL_EXTENSIONS)[number],
    );
    const rightIndex = SUPPORTED_MODEL_EXTENSIONS.indexOf(
      path.extname(right).toLowerCase() as (typeof SUPPORTED_MODEL_EXTENSIONS)[number],
    );
    return (
      leftIndex - rightIndex ||
      path.basename(left).length - path.basename(right).length ||
      left.localeCompare(right)
    );
  })[0] ?? null;
}

function projectRelative(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

export async function importAmbientCgModel(input: {
  sourceAssetId: string;
  variantId?: string;
  targetExtentM?: number;
}) {
  await Promise.all([
    ensureAssetDirectories(),
    ensureAmbientCgDirectories(),
  ]);

  const catalog = await readAmbientCgCatalog();
  const asset = catalog.assets.find(
    (item) => item.source_asset_id === input.sourceAssetId,
  );

  if (!asset) {
    throw new Error(
      "ambientCG model was not found in the catalog. Sync the catalog first.",
    );
  }

  if (asset.asset_type !== "3d-model") {
    throw new Error("Only ambientCG 3D-model entries can be imported into Models.");
  }

  const existing = (await listMyWayAssets()).find(
    (item) =>
      item.source_type === "manual" &&
      item.source_asset_id === asset.source_asset_id &&
      item.source_url === asset.source_url &&
      item.status !== "rejected",
  );

  if (existing) {
    await markAmbientCgCatalogCached(
      asset,
      existing.asset_id,
      existing.storage_provider === "r2",
    );
    return {
      created: false,
      duplicate_of: existing.asset_id,
      asset: await assetWithFileStats(existing),
      job: null,
    };
  }

  const variant = chooseAmbientCgVariant(asset, input.variantId);
  const jobId = randomUUID();
  const jobRoot = path.join(tmpdir(), "myway-ambientcg-model", jobId);
  await mkdir(jobRoot, { recursive: true });

  let job: AmbientCgDownloadJob = {
    job_id: jobId,
    source_asset_id: asset.source_asset_id,
    asset_type: "3d-model",
    variant_id: variant.variant_id,
    operation: "import_model",
    status: "running",
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    completed_at: null,
    downloaded_bytes: null,
    content_sha256: null,
    resource_id: null,
    storage_provider: "local",
    error: null,
  };
  await updateAmbientCgDownloadJob(job);

  try {
    const prepared = await prepareAmbientCgDownloadedFiles(variant, jobRoot);
    const modelInput = selectModelFile(prepared.files);

    if (!modelInput) {
      throw new Error(
        "The selected ambientCG package did not contain a supported .glb, .gltf, .fbx, .obj, or .blend model. Choose another variant.",
      );
    }

    const baseId = safeAssetId(asset.display_name) || "ambientcg_model";
    const assetId = `${baseId}_acg_${stableSuffix(asset.source_asset_id)}`;
    const sourcePath = projectPath(
      "sandbox/probe-lab/assets/inbox/ambientcg",
      `${assetId}-source.glb`,
    );
    const outputPath = projectPath(
      "public/sandbox-assets/myway/models/ambientcg",
      `${assetId}.glb`,
    );
    const thumbnailPath = projectPath(
      "public/sandbox-assets/myway/thumbnails",
      `${assetId}.png`,
    );
    const sourceRecordRelativePath =
      `sandbox/probe-lab/assets/library/source-records/${assetId}.json`;
    const licenseRelativePath =
      `sandbox/probe-lab/assets/library/licenses/${assetId}.review.json`;
    const sourceRecordPath = projectPath(sourceRecordRelativePath);
    const licensePath = projectPath(licenseRelativePath);
    const targetExtentM =
      typeof input.targetExtentM === "number" && Number.isFinite(input.targetExtentM)
        ? Math.min(20, Math.max(0.05, input.targetExtentM))
        : 2;

    const { jobPath } = await createNormalizeJob({
      kind: "normalize_asset",
      input_path: modelInput,
      output_path: outputPath,
      thumbnail_path: thumbnailPath,
      target_extent_m: targetExtentM,
      source_type: "manual",
      result: null,
      error: null,
    });
    const completed = await runBlenderJob(jobPath);

    if (completed.kind !== "normalize_asset" || !completed.result) {
      throw new Error(
        "Blender completed without returning normalized ambientCG model metadata.",
      );
    }

    const result = completed.result;
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await copyFile(outputPath, sourcePath);

    const [contentHash, sourceInfo, outputInfo, thumbnailInfo] = await Promise.all([
      hashFile(outputPath),
      stat(sourcePath),
      stat(outputPath),
      stat(thumbnailPath),
    ]);
    const now = new Date().toISOString();
    const reviewId = `${assetId}_ambientcg_cc0_review_v1`;

    await Promise.all([
      mkdir(path.dirname(sourceRecordPath), { recursive: true }),
      mkdir(path.dirname(licensePath), { recursive: true }),
    ]);

    await writeFile(
      sourceRecordPath,
      `${JSON.stringify(
        {
          schema_version: "myway_ambientcg_model_source_record_v1",
          asset_id: assetId,
          source_provider: "ambientCG",
          source_asset_id: asset.source_asset_id,
          source_url: asset.source_url,
          source_license: "CC0-1.0",
          selected_variant: variant,
          selected_model_file: path.relative(prepared.root, modelInput).replace(/\\/g, "/"),
          source_package_sha256: prepared.download.sha256,
          normalized_runtime_glb: projectRelative(outputPath),
          normalized_thumbnail: projectRelative(thumbnailPath),
          preserved_source_glb: projectRelative(sourcePath),
          normalized_file_size_bytes: outputInfo.size,
          source_file_size_bytes: sourceInfo.size,
          content_hash: contentHash,
          geometry_profile_generator: result.geometry_profile?.generator ?? null,
          imported_at: now,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await writeFile(
      licensePath,
      `${JSON.stringify(
        {
          schema_version: "myway_asset_license_review_v1",
          review_id: reviewId,
          asset_id: assetId,
          decision: "approved_public_distribution",
          reviewed_by: "MyWay automated ambientCG CC0 intake policy",
          reviewed_at: now,
          basis: [
            {
              label: "ambientCG asset record",
              url: asset.source_url,
              finding:
                "The ambientCG catalog record identifies this downloadable model and its preview/source package as CC0 1.0.",
            },
            {
              label: "ambientCG license",
              url: "https://ambientcg.com/license",
              finding:
                "ambientCG publishes its downloadable assets under CC0 1.0, allowing use, modification, commercial use, and redistribution without attribution.",
            },
          ],
          attestations: {
            reviewed_source_terms: true,
            production_use_allowed: true,
            public_raw_distribution_allowed: true,
            commercial_use_allowed: true,
            no_known_third_party_restrictions: true,
            generic_or_authorized_subject: true,
          },
          notes:
            "The user still reviews the normalized rotating model, identity, geometry, and visual quality before scene approval and R2 publication.",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const record: MyWayAssetRecord = {
      asset_id: assetId,
      canonical_label: asset.display_name.toLowerCase(),
      display_name: asset.display_name,
      aliases: [],
      semantic_tags: [asset.display_name, ...asset.semantic_tags],
      asset_type: "glb",
      domain: "asset_library_ambientcg_model",
      requested_concept: asset.display_name,
      source_display_name: `ambientCG: ${asset.display_name}`,
      verified_canonical_label: null,
      verified_aliases: [],
      semantic_review_status: "pending",
      semantic_reviewed_at: null,
      semantic_review_notes: null,
      object_composition: "unknown",
      contains: [],
      affordances: [],
      support_surfaces: result.geometry_profile?.support_surfaces ?? [],
      geometry_profile: result.geometry_profile ?? null,
      preferred_for_concepts: [],
      source_type: "manual",
      source_asset_id: asset.source_asset_id,
      source_prompt: null,
      source_url: asset.source_url,
      source_path: projectRelative(sourcePath),
      public_path: `/sandbox-assets/myway/models/ambientcg/${assetId}.glb`,
      thumbnail_path: `/sandbox-assets/myway/thumbnails/${assetId}.png`,
      license_record_path: licenseRelativePath,
      storage_provider: "local",
      storage_object_key: null,
      storage_etag: null,
      file_size_bytes: outputInfo.size,
      thumbnail_storage_provider: "local",
      thumbnail_object_key: null,
      thumbnail_etag: null,
      thumbnail_file_size_bytes: thumbnailInfo.size,
      source_storage_provider: "local",
      source_object_key: null,
      source_storage_etag: null,
      source_file_size_bytes: sourceInfo.size,
      source_archived_at: now,
      promoted_at: null,
      license_review_id: reviewId,
      dimensions_m:
        result.geometry_profile?.local_bounds.size ??
        [result.dimensions_m[0], result.dimensions_m[2], result.dimensions_m[1]],
      default_scale: 1,
      default_rotation: [0, 0, 0],
      ground_offset_m: 0,
      polygon_count: result.polygon_count,
      rigged: result.rigged,
      animation_clips: result.animation_clips,
      content_hash: contentHash,
      quality_score: 0.75,
      reuse_count: 0,
      license_kind: "cc0",
      license_status: "app_ready",
      commercial_use_allowed: true,
      raw_redistribution_allowed: true,
      safe_to_use_in_sandbox: true,
      safe_to_promote_to_app: true,
      status: "normalized",
      scene_review_status: "pending",
      scene_reviewed_at: null,
      scene_review_notes:
        "Imported from ambientCG under CC0. Review the rotating model and verified identity before approving and publishing it.",
      notes:
        "Automatically downloaded from ambientCG, normalized through Blender, and added to Needs Review. The CC0 source and license records are preserved.",
      created_at: now,
      updated_at: now,
    };

    const registered = await registerMyWayAsset(record);

    if (!registered.created) {
      await Promise.all(
        [sourcePath, outputPath, thumbnailPath, sourceRecordPath, licensePath].map(
          (candidate) => rm(candidate, { force: true }).catch(() => undefined),
        ),
      );
    }

    const finalAsset = registered.asset;
    await markAmbientCgCatalogCached(
      asset,
      finalAsset.asset_id,
      finalAsset.storage_provider === "r2",
    );

    job = {
      ...job,
      status: "complete",
      completed_at: new Date().toISOString(),
      downloaded_bytes: prepared.download.bytes,
      content_sha256: contentHash,
      resource_id: finalAsset.asset_id,
    };
    await updateAmbientCgDownloadJob(job);

    return {
      created: registered.created,
      duplicate_of: registered.duplicate_of,
      asset: await assetWithFileStats(finalAsset),
      job,
    };
  } catch (caught) {
    job = {
      ...job,
      status: "failed",
      completed_at: new Date().toISOString(),
      error: caught instanceof Error ? caught.message : String(caught),
    };
    await updateAmbientCgDownloadJob(job);
    throw caught;
  } finally {
    if (process.env.MYWAY_KEEP_ASSET_JOB_FILES !== "true") {
      await rm(jobRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
