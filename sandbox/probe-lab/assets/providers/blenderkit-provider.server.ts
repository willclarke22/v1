import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MyWayAssetRecord } from "../asset-types";
import { hashFile } from "../content-hash.server";
import {
  registerMyWayAsset,
  updateMyWayAsset,
} from "../asset-library.server";
import { createBlenderKitJob } from "../blender/blender-job-store.server";
import { runBlenderJob } from "../blender/blender-bridge.server";
import {
  buildBlenderKitCc0LicenseReview,
} from "../licensing/asset-license-review";
import { safeAssetId } from "../normalize-asset-record";
import {
  ensureAssetDirectories,
  projectPath,
} from "../paths.server";

function tokenizeSearchPart(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildBlendKitQuery(input: {
  concept: string;
  aliases?: string[];
  semanticTags?: string[];
  acquisitionTerms?: string[];
}) {
  const orderedTerms = [
    input.concept,
    ...(input.aliases ?? []),
    ...(input.semanticTags ?? []),
    ...(input.acquisitionTerms ?? []),
  ];

  const seen = new Set<string>();
  const terms: string[] = [];

  for (const value of orderedTerms) {
    for (const token of tokenizeSearchPart(value)) {
      if (seen.has(token)) continue;
      seen.add(token);
      terms.push(token);
      if (terms.length >= 12) break;
    }
    if (terms.length >= 12) break;
  }

  return terms.join(" ") || input.concept;
}

function licenseKind(
  value: string | null | undefined,
): MyWayAssetRecord["license_kind"] {
  const normalized = (value ?? "")
    .toLowerCase()
    .replace(/[- ]/g, "_");

  if (
    normalized === "cc0" ||
    normalized === "cc_0" ||
    normalized === "cc_zero" ||
    normalized === "creative_commons_zero"
  ) {
    return "cc0";
  }
  if (normalized.includes("royalty")) return "royalty_free";
  return "unknown";
}

export async function acquireFromBlenderKit(input: {
  concept: string;
  aliases?: string[];
  semanticTags?: string[];
  acquisitionTerms?: string[];
  domain?: string;
  targetExtentM?: number;
  searchQuery?: string;
  requiredLicenseKind?: "cc0";
  excludedSourceAssetIds?: string[];
  selectedSourceAssetId?: string | null;
  jobTimeoutMs?: number;
}) {
  await ensureAssetDirectories();

  const requiredLicenseKind = input.requiredLicenseKind ?? "cc0";
  const baseId =
    safeAssetId(input.concept) || `blenderkit_${Date.now()}`;
  const assetId = `${baseId}_bk_${Date.now().toString(36)}`;

  const outputPath = projectPath(
    "public/sandbox-assets/myway/models/blenderkit",
    `${assetId}.glb`,
  );
  const thumbnailPath = projectPath(
    "public/sandbox-assets/myway/thumbnails",
    `${assetId}.png`,
  );

  // Keep the requested concept separate from the concrete BlendKit query.
  // The concept controls MyWay naming; searchQuery may try synonyms without
  // renaming a failed or unrelated result as the requested object.
  const searchQuery =
    input.searchQuery?.trim() || input.concept.trim();

  const { jobPath } = await createBlenderKitJob({
    kind: "blenderkit_acquire",
    query: searchQuery,
    output_path: outputPath,
    thumbnail_path: thumbnailPath,
    target_extent_m: input.targetExtentM ?? 2,
    resolution: "resolution_1K",
    free_only: true,
    required_license_kind: requiredLicenseKind,
    excluded_source_asset_ids:
      input.excludedSourceAssetIds ?? [],
    selected_source_asset_id:
      input.selectedSourceAssetId?.trim() || null,
    result: null,
    error: null,
  });

  const jobTimeoutMs =
    typeof input.jobTimeoutMs === "number" &&
    Number.isFinite(input.jobTimeoutMs)
      ? Math.min(
          12 * 60 * 1000,
          Math.max(30_000, input.jobTimeoutMs),
        )
      : undefined;
  const completed = await runBlenderJob(
    jobPath,
    jobTimeoutMs,
  );

  if (completed.kind !== "blenderkit_acquire" || !completed.result) {
    throw new Error(
      "Blender completed without returning BlendKit asset metadata.",
    );
  }

  const result = completed.result;
  const selectedLicense = licenseKind(result.source_license);

  if (selectedLicense !== requiredLicenseKind) {
    throw new Error(
      `BlendKit result was rejected because its license was ${selectedLicense}; ${requiredLicenseKind} is required.`,
    );
  }

  const contentHash = await hashFile(outputPath);
  const sourceRecordRelativePath =
    `sandbox/probe-lab/assets/library/source-records/${assetId}.json`;
  const sourceRecordPath = projectPath(sourceRecordRelativePath);
  const licenseRelativePath =
    `sandbox/probe-lab/assets/library/licenses/${assetId}.review.json`;
  const licensePath = projectPath(licenseRelativePath);

  await mkdir(path.dirname(sourceRecordPath), { recursive: true });
  await mkdir(path.dirname(licensePath), { recursive: true });

  await writeFile(
    sourceRecordPath,
    `${JSON.stringify(
      {
        ...(result.source_record ?? {}),
        myway_requested_concept: input.concept,
        myway_blenderkit_search_query: searchQuery,
        myway_required_license_kind: requiredLicenseKind,
        excluded_source_asset_ids:
          input.excludedSourceAssetIds ?? [],
        selected_source_asset_id:
          input.selectedSourceAssetId?.trim() || null,
        normalized_runtime_glb: path
          .relative(process.cwd(), outputPath)
          .replace(/\\/g, "/"),
        normalized_thumbnail: path
          .relative(process.cwd(), thumbnailPath)
          .replace(/\\/g, "/"),
        content_hash: contentHash,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const now = new Date().toISOString();
  const record: MyWayAssetRecord = {
    asset_id: assetId,
    canonical_label: input.concept.toLowerCase(),
    display_name: result.source_asset_name || input.concept,
    aliases: input.aliases ?? [],
    semantic_tags: [
      input.concept,
      ...(input.semanticTags ?? []),
    ],
    asset_type: "glb",
    domain: input.domain ?? "generic",
    requested_concept: input.concept,
    source_display_name:
      result.source_asset_name || input.concept,
    verified_canonical_label: null,
    verified_aliases: [],
    semantic_review_status: "pending",
    semantic_reviewed_at: null,
    semantic_review_notes: null,
    object_composition: "unknown",
    contains: [],
    affordances: [],
    support_surfaces:
      result.geometry_profile?.support_surfaces ?? [],
    geometry_profile:
      result.geometry_profile ?? null,
    preferred_for_concepts: [],
    source_type: "blenderkit",
    source_asset_id: result.source_asset_id ?? null,
    source_prompt: searchQuery,
    source_url: result.source_url ?? null,
    source_path: path
      .relative(process.cwd(), outputPath)
      .replace(/\\/g, "/"),
    public_path:
      `/sandbox-assets/myway/models/blenderkit/${assetId}.glb`,
    thumbnail_path:
      `/sandbox-assets/myway/thumbnails/${assetId}.png`,
    license_record_path: licenseRelativePath,
    storage_provider: "local",
    storage_object_key: null,
    storage_etag: null,
    file_size_bytes: null,
    thumbnail_storage_provider: "local",
    thumbnail_object_key: null,
    thumbnail_etag: null,
    thumbnail_file_size_bytes: null,
    source_storage_provider: null,
    source_object_key: null,
    source_storage_etag: null,
    source_file_size_bytes: null,
    source_archived_at: null,
    promoted_at: null,
    license_review_id: null,
    dimensions_m:
      result.geometry_profile?.local_bounds.size ??
      [
        result.dimensions_m[0],
        result.dimensions_m[2],
        result.dimensions_m[1],
      ],
    default_scale: 1,
    default_rotation: [0, 0, 0],
    ground_offset_m: 0,
    polygon_count: result.polygon_count,
    rigged: result.rigged,
    animation_clips: result.animation_clips,
    content_hash: contentHash,
    quality_score: 0.78,
    reuse_count: 0,
    license_kind: "cc0",
    license_status: "app_ready",
    commercial_use_allowed: true,
    raw_redistribution_allowed: true,
    safe_to_use_in_sandbox: true,
    safe_to_promote_to_app: true,
    status: "normalized",
    notes:
      `Automatically acquired and normalized from BlendKit` +
      `${result.source_author ? ` by ${result.source_author}` : ""}. ` +
      "The source API record reported CC0. Review the live model before uploading it to Cloudflare R2.",
    created_at: now,
    updated_at: now,
  };

  const registered = await registerMyWayAsset(record);

  if (!registered.created) {
    await Promise.all(
      [
        outputPath,
        thumbnailPath,
        sourceRecordPath,
        licensePath,
      ].map((candidatePath) =>
        rm(candidatePath, { force: true }).catch(
          () => undefined,
        ),
      ),
    );

    return {
      ...registered,
      source_record_path:
        `sandbox/probe-lab/assets/library/source-records/${registered.asset.asset_id}.json`,
      license_review_path:
        registered.asset.license_record_path ?? null,
    };
  }

  const review = buildBlenderKitCc0LicenseReview(registered.asset);

  await writeFile(
    licensePath,
    `${JSON.stringify(review, null, 2)}\n`,
    "utf8",
  );

  const updated = await updateMyWayAsset(
    registered.asset.asset_id,
    {
      license_record_path: licenseRelativePath,
      license_review_id: review.review_id,
    },
  );

  return {
    ...registered,
    asset: updated,
    source_record_path: sourceRecordRelativePath,
    license_review_path: licenseRelativePath,
  };
}
