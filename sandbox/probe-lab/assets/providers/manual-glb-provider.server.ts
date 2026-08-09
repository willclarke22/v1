import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MyWayAssetRecord } from "../asset-types";
import {
  assetWithFileStats,
  listMyWayAssets,
  registerMyWayAsset,
} from "../asset-library.server";
import { createNormalizeJob } from "../blender/blender-job-store.server";
import { runBlenderJob } from "../blender/blender-bridge.server";
import { hashFile } from "../content-hash.server";
import {
  compareGlbAppearance,
  inspectGlbAppearanceBuffer,
  inspectGlbAppearanceFile,
} from "../glb-appearance-inspection.server";
import { queueAssetEnrichment } from "../enrichment/asset-enrichment-worker.server";
import { safeAssetId } from "../normalize-asset-record";
import {
  attributionCompletenessIssues,
  buildAssetAttribution,
  licensePolicyForKind,
} from "../asset-attribution";
import {
  buildPolyPizzaAttributionText,
  polyPizzaAssetId,
} from "../poly-pizza-manual-intake";
import {
  ensureAssetDirectories,
  projectPath,
} from "../paths.server";
import {
  archivePrivateAssetSource,
  deleteDurableAssetJson,
  deletePrivateAssetObject,
  durableAssetCloudEnabled,
  writeDurableAssetJson,
} from "../storage/asset-durable-artifacts.server";

import {
  MAX_MANUAL_GLB_BYTES,
  validateManualGlbBuffer,
} from "./manual-glb-validation";

type ManualLicenseKind = Extract<
  MyWayAssetRecord["license_kind"],
  "unknown" | "self_owned" | "cc0" | "cc_by" | "cc_by_4_0" | "royalty_free"
>;

export type ManualGlbFileLike = {
  name: string;
  size: number;
  type?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type ManualGlbImportInput = {
  file: ManualGlbFileLike;
  concept: string;
  aliases?: string[];
  semanticTags?: string[];
  domain?: string;
  targetExtentM?: number;
  sourceProvider?: string;
  sourceUrl?: string | null;
  sourceAssetId?: string | null;
  assetTitle?: string | null;
  creatorName?: string | null;
  licenseKind?: ManualLicenseKind;
  licenseVersion?: string | null;
  attribution?: string | null;
  modificationNotice?: string | null;
  downloadedAt?: string | null;
  provenanceNotes?: string | null;
};

function cleanText(value: string | null | undefined, maxLength: number) {
  const cleaned = String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLength);
}

function cleanFileName(value: string) {
  const base = path.basename(value.replace(/\\/g, "/"));
  const cleaned = base
    .replace(/[^a-zA-Z0-9._()\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "uploaded-asset.glb").slice(0, 180);
}

function licenseFlags(kind: ManualLicenseKind) {
  return licensePolicyForKind(kind);
}

async function writeDebug(payload: Record<string, unknown>) {
  const debugPath = projectPath(
    "sandbox/probe-lab/assets/debug/latest-manual-glb-import.json",
  );
  await mkdir(path.dirname(debugPath), { recursive: true });
  await writeFile(
    debugPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  ).catch(() => undefined);
}

export async function importManualGlb(input: ManualGlbImportInput) {
  await ensureAssetDirectories();

  const concept = cleanText(input.concept, 120);
  if (!concept) {
    throw new Error("A canonical object identity is required.");
  }

  const originalFileName = cleanFileName(input.file.name);
  if (!originalFileName.toLowerCase().endsWith(".glb")) {
    throw new Error("Choose a .glb file. .gltf and other formats are not supported by this importer.");
  }

  if (input.file.size <= 0) {
    throw new Error("The selected GLB file is empty.");
  }

  if (input.file.size > MAX_MANUAL_GLB_BYTES) {
    throw new Error(
      `The selected GLB is ${Math.ceil(input.file.size / (1024 * 1024))} MB. The manual importer limit is 400 MB.`,
    );
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());
  const glbValidation = validateManualGlbBuffer(buffer);
  const sourceAppearance = inspectGlbAppearanceBuffer(buffer);

  const targetExtentM =
    typeof input.targetExtentM === "number" &&
    Number.isFinite(input.targetExtentM)
      ? Math.min(20, Math.max(0.05, input.targetExtentM))
      : 2;
  const sourceProvider =
    cleanText(input.sourceProvider, 120) ||
    "Manual upload";
  const sourceUrl =
    cleanText(input.sourceUrl, 1000) ||
    null;
  const sourceAssetId =
    cleanText(input.sourceAssetId, 240) ||
    originalFileName;
  const assetTitle =
    cleanText(input.assetTitle, 240) ||
    concept;
  const creatorName =
    cleanText(input.creatorName, 240) ||
    null;
  const modificationNotice =
    cleanText(input.modificationNotice, 1000) ||
    null;
  const downloadedAt =
    cleanText(input.downloadedAt, 80) ||
    null;
  const provenanceNotes =
    cleanText(input.provenanceNotes, 1200) ||
    null;
  const licenseKind =
    input.licenseKind ?? "unknown";
  const isPolyPizza =
    sourceProvider.toLowerCase() ===
    "poly pizza";
  const polyPizzaLicenseKind =
    licenseKind === "cc0" ||
    licenseKind === "cc_by" ||
    licenseKind ===
      "cc_by_4_0"
      ? licenseKind
      : null;
  const generatedPolyPizzaAttribution =
    isPolyPizza &&
    polyPizzaLicenseKind
      ? buildPolyPizzaAttributionText({
          sourceTitle: assetTitle,
          creatorName:
            creatorName ?? "",
          licenseKind:
            polyPizzaLicenseKind,
        })
      : "";
  const attributionText =
    cleanText(input.attribution, 1200) ||
    generatedPolyPizzaAttribution ||
    null;
  const attribution =
    buildAssetAttribution({
      licenseKind,
      attributionText,
      assetTitle,
      creatorName,
      sourceProvider,
      sourceAssetId,
      sourceUrl,
      modificationNotice,
      downloadedAt,
      licenseVersion:
        input.licenseVersion,
    });

  const baseId =
    safeAssetId(concept) ||
    `manual_${Date.now()}`;
  const deterministicPolyPizzaId =
    isPolyPizza
      ? polyPizzaAssetId(
          concept,
          sourceAssetId,
        )
      : "";
  const assetId =
    deterministicPolyPizzaId ||
    `${baseId}_man_${Date.now().toString(36)}`;
  const sourcePath = projectPath(
    "sandbox/probe-lab/assets/inbox/manual",
    `${assetId}-source.glb`,
  );
  const outputPath = projectPath(
    "public/sandbox-assets/myway/models/manual",
    `${assetId}.glb`,
  );
  const thumbnailPath = projectPath(
    "public/sandbox-assets/myway/thumbnails",
    `${assetId}.png`,
  );
  const sourceRecordRelativePath =
    `sandbox/probe-lab/assets/library/source-records/${assetId}.json`;
  const licenseRelativePath =
    `sandbox/probe-lab/assets/library/licenses/${assetId}.manual.review.json`;

  const attributionIssues =
    attributionCompletenessIssues(
      attribution,
    );
  if (attributionIssues.length) {
    throw new Error(
      `Attribution-required import is incomplete: ${attributionIssues.join(
        "; ",
      )}`,
    );
  }

  const duplicateSource =
    (await listMyWayAssets()).find(
      (candidate) =>
        candidate.attribution
          ?.source_provider
          ?.toLowerCase() ===
          sourceProvider.toLowerCase() &&
        candidate.source_asset_id ===
          sourceAssetId,
    );
  if (duplicateSource) {
    return {
      created: false,
      duplicate_of:
        duplicateSource.asset_id,
      asset: await assetWithFileStats(
        duplicateSource,
      ),
      enrichment_entry: null,
      source_record_path:
        duplicateSource.license_record_path ??
        null,
    };
  }

  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, buffer);

  await writeDebug({
    status: "source_saved",
    asset_id: assetId,
    concept,
    original_file_name: originalFileName,
    source_provider: sourceProvider,
    source_asset_id: sourceAssetId,
    source_url: sourceUrl,
    uploaded_bytes: buffer.length,
    glb_validation: glbValidation,
    target_extent_m: targetExtentM,
    timestamp: new Date().toISOString(),
  });

  const { jobPath } = await createNormalizeJob({
    kind: "normalize_asset",
    input_path: sourcePath,
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
      "Blender completed without returning normalized manual-asset metadata.",
    );
  }

  const result = completed.result;
  const normalizedAppearance = await inspectGlbAppearanceFile(outputPath);
  const appearanceComparison = compareGlbAppearance(
    sourceAppearance,
    normalizedAppearance,
  );
  const contentHash = await hashFile(outputPath);
  const sourceFileStats = await stat(sourcePath);
  const normalizedFileStats = await stat(outputPath);
  const flags = licenseFlags(licenseKind);
  const now = new Date().toISOString();

  const sourceArchive =
    await archivePrivateAssetSource({
      assetId,
      sourceType: "manual",
      localPath: sourcePath,
    });

  const sourceRecord = {
    schema_version: "myway_manual_asset_source_record_v1",
    asset_id: assetId,
    requested_concept: concept,
    original_file_name: originalFileName,
    browser_reported_mime_type: input.file.type || null,
    source_provider: sourceProvider,
    source_asset_id: sourceAssetId,
    source_url: sourceUrl,
    asset_title: assetTitle,
    creator_name: creatorName,
    license_kind_asserted_by_user: licenseKind,
    license_version_asserted_by_user:
      attribution.license_version,
    attribution,
    provenance_notes: provenanceNotes,
    source_file_project_path:
      sourceArchive
        ? null
        : path
            .relative(process.cwd(), sourcePath)
            .replace(/\\/g, "/"),
    source_storage_provider:
      sourceArchive ? "r2" : "local",
    source_object_key:
      sourceArchive?.object_key ?? null,
    normalized_runtime_glb: path
      .relative(process.cwd(), outputPath)
      .replace(/\\/g, "/"),
    normalized_thumbnail: path
      .relative(process.cwd(), thumbnailPath)
      .replace(/\\/g, "/"),
    source_file_size_bytes: sourceFileStats.size,
    normalized_file_size_bytes: normalizedFileStats.size,
    content_hash: contentHash,
    glb_validation: glbValidation,
    appearance: {
      source: sourceAppearance,
      normalized: normalizedAppearance,
      comparison: appearanceComparison,
    },
    geometry_profile_generator:
      result.geometry_profile?.generator ?? null,
    imported_at: now,
  };

  const licenseDraft = {
    schema_version: "myway_manual_asset_license_review_v1",
    asset_id: assetId,
    review_status: "needs_human_review",
    source_provider: sourceProvider,
    source_asset_id: sourceAssetId,
    source_url: sourceUrl,
    asset_title: assetTitle,
    creator_name: creatorName,
    license_kind_asserted_by_user: licenseKind,
    license_version_asserted_by_user:
      attribution.license_version,
    commercial_use_allowed_asserted_by_user:
      flags.commercialUseAllowed,
    raw_redistribution_allowed_asserted_by_user:
      flags.rawRedistributionAllowed,
    attribution,
    provenance_notes: provenanceNotes,
    warning:
      "MyWay records the uploader's assertion but does not independently verify third-party terms. Verify the source terms before app promotion.",
    created_at: now,
  };

  await Promise.all([
    writeDurableAssetJson(
      sourceRecordRelativePath,
      sourceRecord,
    ),
    writeDurableAssetJson(
      licenseRelativePath,
      licenseDraft,
    ),
  ]);

  if (
    sourceArchive &&
    durableAssetCloudEnabled()
  ) {
    await rm(
      sourcePath,
      { force: true },
    );
  }

  const record: MyWayAssetRecord = {
    asset_id: assetId,
    canonical_label: concept.toLowerCase(),
    display_name:
      isPolyPizza
        ? assetId
        : concept,
    aliases: input.aliases ?? [],
    semantic_tags: [concept, ...(input.semanticTags ?? [])],
    asset_type: "glb",
    domain: cleanText(input.domain, 120) || "asset_library_manual_upload",
    requested_concept: concept,
    source_display_name: `${sourceProvider}: ${assetTitle}`,
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
    source_asset_id: sourceAssetId,
    source_prompt: null,
    source_url: sourceUrl,
    source_path:
      sourceArchive
        ? null
        : path
            .relative(process.cwd(), sourcePath)
            .replace(/\\/g, "/"),
    public_path: `/sandbox-assets/myway/models/manual/${assetId}.glb`,
    thumbnail_path: `/sandbox-assets/myway/thumbnails/${assetId}.png`,
    license_record_path: licenseRelativePath,
    storage_provider: "local",
    storage_object_key: null,
    storage_etag: null,
    file_size_bytes: normalizedFileStats.size,
    thumbnail_storage_provider: "local",
    thumbnail_object_key: null,
    thumbnail_etag: null,
    thumbnail_file_size_bytes: null,
    source_storage_provider:
      sourceArchive ? "r2" : "local",
    source_object_key:
      sourceArchive?.object_key ?? null,
    source_storage_etag:
      sourceArchive?.etag ?? null,
    source_file_size_bytes:
      sourceArchive?.size_bytes ??
      sourceFileStats.size,
    source_archived_at:
      sourceArchive ? now : null,
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
    quality_score: appearanceComparison.appearance_preserved ? 0.75 : 0.4,
    reuse_count: 0,
    license_kind: licenseKind,
    attribution,
    license_status: flags.licenseStatus,
    commercial_use_allowed: flags.commercialUseAllowed,
    raw_redistribution_allowed: flags.rawRedistributionAllowed,
    safe_to_use_in_sandbox: appearanceComparison.appearance_preserved,
    safe_to_promote_to_app: false,
    status: "normalized",
    scene_review_status: "pending",
    scene_reviewed_at: null,
    scene_review_notes: null,
    notes: [
      `Manually uploaded from ${sourceProvider} as ${originalFileName}.`,
      attributionText ? `Attribution: ${attributionText}.` : null,
      modificationNotice
        ? `Changes: ${modificationNotice}.`
        : null,
      provenanceNotes,
      appearanceComparison.appearance_preserved
        ? "Input and normalized GLB appearance channels were preserved."
        : `Appearance preservation failed: ${appearanceComparison.warnings.join(" ")}`,
      sourceArchive
        ? "The original GLB was archived to private R2 and the verified local raw upload was cleared. Review identity, geometry, appearance, licensing, and scene eligibility before promotion."
        : "The original GLB remains in the manual inbox until cloud archival is available. Review identity, geometry, appearance, licensing, and scene eligibility before promotion.",
    ]
      .filter(Boolean)
      .join(" "),
    created_at: now,
    updated_at: now,
  };

  const registered = await registerMyWayAsset(record);

  if (!registered.created) {
    await Promise.all([
      ...[sourcePath, outputPath, thumbnailPath].map(
        (candidatePath) =>
          rm(candidatePath, {
            force: true,
          }).catch(() => undefined),
      ),
      deleteDurableAssetJson(
        sourceRecordRelativePath,
      ).catch(() => undefined),
      deleteDurableAssetJson(
        licenseRelativePath,
      ).catch(() => undefined),
      sourceArchive
        ? deletePrivateAssetObject(
            sourceArchive.object_key,
          ).catch(() => undefined)
        : Promise.resolve(false),
    ]);

    return {
      created: false,
      duplicate_of: registered.duplicate_of,
      asset: await assetWithFileStats(registered.asset),
      enrichment_entry: null,
      source_record_path: registered.asset.license_record_path ?? null,
    };
  }

  const enrichmentEntry = queueAssetEnrichment(registered.asset.asset_id, {
    force: true,
  });

  await writeDebug({
    status: "completed",
    asset_id: registered.asset.asset_id,
    original_file_name: originalFileName,
    source_provider: sourceProvider,
    source_asset_id: sourceAssetId,
    source_url: sourceUrl,
    source_record_path: sourceRecordRelativePath,
    public_path: registered.asset.public_path,
    polygon_count: registered.asset.polygon_count ?? null,
    dimensions_m: registered.asset.dimensions_m,
    appearance: {
      source: sourceAppearance,
      normalized: normalizedAppearance,
      comparison: appearanceComparison,
    },
    timestamp: new Date().toISOString(),
  });

  return {
    created: true,
    duplicate_of: null,
    asset: await assetWithFileStats(registered.asset),
    enrichment_entry: enrichmentEntry,
    source_record_path: sourceRecordRelativePath,
    appearance: {
      source: sourceAppearance,
      normalized: normalizedAppearance,
      comparison: appearanceComparison,
    },
  };
}
