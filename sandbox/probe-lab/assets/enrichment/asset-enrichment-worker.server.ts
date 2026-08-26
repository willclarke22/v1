import {
  materializePendingAssetReviewModel,
} from "../storage/pending-asset-storage.server";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assetWithFileStats,
  getMyWayAsset,
  listMyWayAssets,
  updateMyWayAsset,
} from "../asset-library.server";
import type {
  MyWayAssetAppearanceProfileV1,
  MyWayAssetRecord,
} from "../asset-types";
import {
  createAnalysisRenderJob,
} from "../blender/blender-job-store.server";
import { runBlenderJob } from "../blender/blender-bridge.server";
import {
  stableTextHash,
} from "../content-hash.server";
import {
  ensureAssetDirectories,
} from "../paths.server";
import {
  createAssetTempWorkspace,
} from "../storage/asset-temp-workspace.server";
import {
  durableAssetCloudEnabled,
  uploadRuntimeAssetFile,
  writeDurableAssetJson,
} from "../storage/asset-durable-artifacts.server";
import {
  analyzeAssetAppearance,
  ASSET_ANALYSIS_RENDER_VERSION,
  ASSET_APPEARANCE_PROMPT_VERSION,
  embedAssetAppearance,
} from "./asset-enrichment-provider.server";
import {
  needsReviewMissingEnrichmentMode,
  type NeedsReviewMissingEnrichmentMode,
} from "./needs-review-enrichment-policy";

export type AssetEnrichmentQueueEntry = {
  asset_id: string;
  status: "queued" | "running" | "completed" | "failed";
  mode: "full" | "vision_only" | "embedding_only";
  force: boolean;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
};

const queueEntries = new Map<string, AssetEnrichmentQueueEntry>();
const embeddingRefreshAfterFull = new Set<string>();
let enrichmentTail: Promise<void> = Promise.resolve();

const MYWAY_PUBLIC_ASSET_URL_ROOT =
  "/sandbox-assets/myway";

const MYWAY_PUBLIC_ASSET_FILE_ROOT =
  path.join(
    /* turbopackIgnore: true */
    process.cwd(),
    "public",
    "sandbox-assets",
    "myway",
  );

const MYWAY_LOCAL_ANALYSIS_FILE_ROOT =
  `${MYWAY_PUBLIC_ASSET_FILE_ROOT}${path.sep}analysis`;

function safeRuntimePathSegment(
  value: string,
  label: string,
) {
  if (
    !value ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    throw new Error(
      `Unsafe ${label}: ${value}`,
    );
  }
  return value;
}

function opaqueRuntimeChild(
  root: string,
  child: string,
  label: string,
) {
  return `${root}${path.sep}${safeRuntimePathSegment(
    child,
    label,
  )}`;
}

function localPublicAssetPath(
  publicPath: string,
) {
  const normalized =
    publicPath.replace(/\\/g, "/");
  const prefix =
    `${MYWAY_PUBLIC_ASSET_URL_ROOT}/`;

  if (!normalized.startsWith(prefix)) {
    throw new Error(
      `Asset path must start with ${prefix}`,
    );
  }

  const relative =
    normalized.slice(prefix.length);
  const segments =
    relative
      .split("/")
      .filter(Boolean)
      .map((segment) =>
        safeRuntimePathSegment(
          segment,
          "public asset path segment",
        ),
      );

  if (!segments.length) {
    throw new Error(
      "Asset path must include a file below the MyWay public asset root.",
    );
  }

  return (
    `${MYWAY_PUBLIC_ASSET_FILE_ROOT}${path.sep}` +
    segments.join(path.sep)
  );
}

async function writeRuntimeFile(
  filePath: string,
  bytes: Uint8Array,
) {
  const traceSafeFilePath =
    filePath;

  await writeFile(
    /* turbopackIgnore: true */
    traceSafeFilePath,
    bytes,
  );
}

async function hashRuntimeFile(
  filePath: string,
) {
  const traceSafeFilePath =
    filePath;

  return new Promise<string>(
    (resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(
        /* turbopackIgnore: true */
        traceSafeFilePath,
      );

      stream.on("error", reject);
      stream.on("data", (chunk) => {
        hash.update(chunk);
      });
      stream.on("end", () => {
        resolve(hash.digest("hex"));
      });
    },
  );
}

function now() {
  return new Date().toISOString();
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : String(caught);
}

function pendingAppearance(
  asset: MyWayAssetRecord,
  status: MyWayAssetAppearanceProfileV1["status"],
  error: string | null = null,
): MyWayAssetAppearanceProfileV1 {
  return {
    schema_version: "myway_asset_appearance_profile_v1",
    status,
    summary: status === "failed" ? asset.appearance_profile?.summary ?? "" : "",
    style_descriptors:
      status === "failed" ? asset.appearance_profile?.style_descriptors ?? [] : [],
    design_era:
      status === "failed" ? asset.appearance_profile?.design_era ?? [] : [],
    realism_level:
      status === "failed" ? asset.appearance_profile?.realism_level ?? [] : [],
    shape_language:
      status === "failed" ? asset.appearance_profile?.shape_language ?? [] : [],
    material_treatment:
      status === "failed" ? asset.appearance_profile?.material_treatment ?? [] : [],
    color_palette:
      status === "failed" ? asset.appearance_profile?.color_palette ?? [] : [],
    surface_condition:
      status === "failed" ? asset.appearance_profile?.surface_condition ?? [] : [],
    ornamentation:
      status === "failed" ? asset.appearance_profile?.ornamentation ?? [] : [],
    visual_mood:
      status === "failed" ? asset.appearance_profile?.visual_mood ?? [] : [],
    detail_level:
      status === "failed" ? asset.appearance_profile?.detail_level ?? [] : [],
    scene_compatibility:
      status === "failed" ? asset.appearance_profile?.scene_compatibility ?? [] : [],
    descriptors:
      status === "failed" ? asset.appearance_profile?.descriptors ?? [] : [],
    materials:
      status === "failed" ? asset.appearance_profile?.materials ?? [] : [],
    colors: status === "failed" ? asset.appearance_profile?.colors ?? [] : [],
    geometry:
      status === "failed" ? asset.appearance_profile?.geometry ?? [] : [],
    warnings:
      status === "failed" ? asset.appearance_profile?.warnings ?? [] : [],
    confidence:
      status === "failed" ? asset.appearance_profile?.confidence ?? 0 : 0,
    analysis_views:
      status === "failed" ? asset.appearance_profile?.analysis_views ?? [] : [],
    model: status === "failed" ? asset.appearance_profile?.model ?? null : null,
    prompt_version: ASSET_APPEARANCE_PROMPT_VERSION,
    render_version: ASSET_ANALYSIS_RENDER_VERSION,
    content_hash: asset.content_hash ?? null,
    analyzed_at:
      status === "failed" ? asset.appearance_profile?.analyzed_at ?? null : null,
    error,
  };
}

async function materializeAssetInput(asset: MyWayAssetRecord) {
  if (
    asset.storage_provider ===
      "r2_private_pending"
  ) {
    const materialized =
      await materializePendingAssetReviewModel(
        asset,
      );

    return {
      input_path: materialized.local_path,
      temporary: true,
      cleanup: materialized.cleanup,
    };
  }

  if (!/^https:\/\//i.test(asset.public_path)) {
    return {
      input_path: localPublicAssetPath(asset.public_path),
      temporary: false,
      cleanup: async () => undefined,
    };
  }

  const workspace =
    await createAssetTempWorkspace("enrichment");
  try {
    const response = await fetch(asset.public_path);
    if (!response.ok) {
      throw new Error(
        `Could not download remote asset ${asset.asset_id}: ${response.status}`,
      );
    }

    const bytes = Buffer.from(
      await response.arrayBuffer(),
    );
    const suffix =
      path.extname(
        new URL(asset.public_path).pathname,
      ) || ".glb";
    const inputPath =
      opaqueRuntimeChild(
        workspace.path,
        `${asset.asset_id}${suffix}`,
        "enrichment input filename",
      );
    await writeRuntimeFile(
      inputPath,
      bytes,
    );

    return {
      input_path: inputPath,
      temporary: true,
      cleanup: workspace.cleanup,
    };
  } catch (caught) {
    await workspace.cleanup().catch(
      () => undefined,
    );
    throw caught;
  }
}

function appearanceText(
  asset: MyWayAssetRecord,
  appearance: {
    summary: string;
    style_descriptors: string[];
    design_era: string[];
    realism_level: string[];
    shape_language: string[];
    material_treatment: string[];
    color_palette: string[];
    surface_condition: string[];
    ornamentation: string[];
    visual_mood: string[];
    detail_level: string[];
    scene_compatibility: string[];
    descriptors: string[];
    materials: string[];
    colors: string[];
    geometry: string[];
    warnings: string[];
  },
) {
  return [
    `Visual style summary: ${appearance.summary}`,
    `Style descriptors: ${appearance.style_descriptors.join(", ") || "not confidently identified"}`,
    `Design era or aesthetic language: ${appearance.design_era.join(", ") || "not confidently identified"}`,
    `Realism level: ${appearance.realism_level.join(", ") || "not confidently identified"}`,
    `Shape language: ${appearance.shape_language.join(", ") || "not confidently identified"}`,
    `Material treatment: ${appearance.material_treatment.join(", ") || "not confidently identified"}`,
    `Color palette: ${appearance.color_palette.join(", ") || "not confidently identified"}`,
    `Surface condition: ${appearance.surface_condition.join(", ") || "not confidently identified"}`,
    `Ornamentation: ${appearance.ornamentation.join(", ") || "not confidently identified"}`,
    `Visual mood: ${appearance.visual_mood.join(", ") || "not confidently identified"}`,
    `Detail level: ${appearance.detail_level.join(", ") || "not confidently identified"}`,
    `Visual scene compatibility: ${appearance.scene_compatibility.join(", ") || "not confidently identified"}`,
    `Supporting descriptors: ${appearance.descriptors.join(", ") || "none"}`,
    `Visible materials: ${appearance.materials.join(", ") || "unknown"}`,
    `Visible colors: ${appearance.colors.join(", ") || "unknown"}`,
    `Visible geometry: ${appearance.geometry.join(", ") || "not described"}`,
    `Asset identity gate: ${
      asset.verified_canonical_label ||
      asset.requested_concept ||
      asset.canonical_label
    }`,
    `Warnings: ${appearance.warnings.join(", ") || "none"}`,
  ].join("\n");
}

async function writeAppearanceEmbedding(
  asset: MyWayAssetRecord,
  appearance: NonNullable<MyWayAssetRecord["appearance_profile"]>,
) {
  const sourceText = appearanceText(asset, appearance);
  const sourceTextHash = stableTextHash(sourceText);
  const embedded = await embedAssetAppearance(sourceText);
  const vectorRelativePath =
    `sandbox/probe-lab/assets/embeddings/${asset.asset_id}.json`;

  await writeDurableAssetJson(
    vectorRelativePath,
    {
      schema_version: "myway_asset_embedding_vector_v1",
      asset_id: asset.asset_id,
      model: embedded.model,
      dimensions: embedded.vector.length,
      source_text_hash: sourceTextHash,
      source_text: sourceText,
      vector: embedded.vector,
      created_at: now(),
    },
  );

  return updateMyWayAsset(asset.asset_id, {
    appearance_embedding: {
      schema_version: "myway_asset_appearance_embedding_v1",
      status: "ready",
      model: embedded.model,
      dimensions: embedded.vector.length,
      vector_key: vectorRelativePath.replace(/\\/g, "/"),
      source_text_hash: sourceTextHash,
      embedded_at: now(),
      error: null,
    },
  });
}

async function analysisRenderDestination(
  assetId: string,
) {
  if (!durableAssetCloudEnabled()) {
    return {
      cloud: false,
      render_directory:
        opaqueRuntimeChild(
          MYWAY_LOCAL_ANALYSIS_FILE_ROOT,
          assetId,
          "analysis asset id",
        ),
      public_url_root:
        `/sandbox-assets/myway/analysis/${assetId}`,
      cleanup: async () => undefined,
    };
  }

  const workspace =
    await createAssetTempWorkspace("analysis");

  return {
    cloud: true,
    render_directory:
      opaqueRuntimeChild(
        workspace.path,
        assetId,
        "analysis asset id",
      ),
    public_url_root:
      `/__myway-temporary-analysis/${assetId}`,
    cleanup: workspace.cleanup,
  };
}

async function publishAnalysisViews(
  assetId: string,
  views: Array<{
    name:
      | "front_three_quarter"
      | "rear_three_quarter"
      | "side"
      | "elevated_front";
    file_path: string;
    public_path: string;
  }>,
  cloud: boolean,
) {
  if (!cloud) {
    return views.map((view) => ({
      name: view.name,
      public_path: view.public_path,
    }));
  }

  return Promise.all(
    views.map(async (view) => {
      const hash =
        await hashRuntimeFile(
          view.file_path,
        );
      const uploaded =
        await uploadRuntimeAssetFile({
          localPath: view.file_path,
          objectKey:
            `runtime/analysis/${assetId}/${view.name}/` +
            `${hash.slice(0, 16)}.png`,
          metadata: {
            "asset-id": assetId,
            "analysis-view": view.name,
            "content-hash": hash,
          },
        });

      if (!uploaded?.public_url) {
        throw new Error(
          `Analysis view ${view.name} did not produce an R2 public URL.`,
        );
      }

      return {
        name: view.name,
        public_path: uploaded.public_url,
      };
    }),
  );
}

async function refreshAssetEmbeddingOnly(assetId: string) {
  await ensureAssetDirectories();
  const asset = await getMyWayAsset(assetId);
  if (!asset) throw new Error(`Asset was not found: ${assetId}`);
  if (asset.asset_type === "primitive") {
    throw new Error("Primitive-only entries do not need appearance embeddings.");
  }
  if (asset.status === "rejected") {
    throw new Error("Rejected assets are not enriched.");
  }
  if (asset.appearance_profile?.status !== "ready") {
    throw new Error(
      "Appearance analysis is not ready. Run Omni vision first; embedding-only mode never starts the vision provider.",
    );
  }

  return writeAppearanceEmbedding(
    asset,
    asset.appearance_profile,
  );
}

async function enrichAsset(assetId: string, force: boolean, includeEmbedding = true) {
  await ensureAssetDirectories();
  let asset = await getMyWayAsset(assetId);
  if (!asset) throw new Error(`Asset was not found: ${assetId}`);
  if (asset.asset_type === "primitive") {
    throw new Error("Primitive-only entries do not need visual enrichment.");
  }
  if (asset.status === "rejected") {
    throw new Error("Rejected assets are not enriched.");
  }

  const file = await assetWithFileStats(asset);
  if (!file.file_stats.exists) {
    throw new Error(`The asset file is missing: ${asset.public_path}`);
  }

  if (
    !force &&
    asset.appearance_profile?.status === "ready" &&
    asset.appearance_profile.content_hash === asset.content_hash &&
    (!includeEmbedding || asset.appearance_embedding?.status === "ready")
  ) {
    return asset;
  }

  const materialized =
    await materializeAssetInput(asset);
  const inputPath = materialized.input_path;

  try {
    const contentHash =
      await hashRuntimeFile(
        inputPath,
      );
    if (asset.content_hash !== contentHash) {
      asset = await updateMyWayAsset(asset.asset_id, {
        content_hash: contentHash,
        appearance_profile: pendingAppearance(
          { ...asset, content_hash: contentHash },
          "pending",
        ),
        appearance_embedding: {
          schema_version: "myway_asset_appearance_embedding_v1",
          status: "pending",
          model:
            process.env.MYWAY_ASSET_EMBED_MODEL?.trim() ||
            "nvidia/nemotron-3-embed-1b",
          dimensions: null,
          vector_key: null,
          source_text_hash: null,
          embedded_at: null,
          error: null,
        },
      });
    }

    asset = await updateMyWayAsset(asset.asset_id, {
      appearance_profile: pendingAppearance(asset, "rendering"),
      appearance_embedding: {
        schema_version: "myway_asset_appearance_embedding_v1",
        status: "pending",
        model:
          process.env.MYWAY_ASSET_EMBED_MODEL?.trim() ||
          "nvidia/nemotron-3-embed-1b",
        dimensions: null,
        vector_key: null,
        source_text_hash: null,
        embedded_at: null,
        error: null,
      },
    });

    let appearanceReady = false;
    const analysisDestination =
      await analysisRenderDestination(
        asset.asset_id,
      );

    try {
      const { jobPath } = await createAnalysisRenderJob({
        kind: "render_asset_analysis",
        input_path: inputPath,
        render_directory:
          analysisDestination.render_directory,
        public_url_root:
          analysisDestination.public_url_root,
        target_extent_m: 2,
        result: null,
        error: null,
      });
      const completed = await runBlenderJob(jobPath);
      if (
        completed.kind !== "render_asset_analysis" ||
        !completed.result
      ) {
        throw new Error(
          "Blender completed without returning the four analysis renders.",
        );
      }

      const views = completed.result.analysis_views;
      if (views.length !== 4) {
        throw new Error(
          `Blender returned ${views.length} analysis renders instead of four.`,
        );
      }

      asset = await updateMyWayAsset(asset.asset_id, {
        appearance_profile: {
          ...pendingAppearance(asset, "analyzing"),
          analysis_views: [],
        },
      });

      const vision = await analyzeAssetAppearance({
        asset,
        viewFilePaths: views.map((view) => view.file_path),
      });
      const publishedViews =
        await publishAnalysisViews(
          asset.asset_id,
          views,
          analysisDestination.cloud,
        );
      const analyzedAt = now();
      const readyAppearance: MyWayAssetAppearanceProfileV1 = {
        schema_version: "myway_asset_appearance_profile_v1",
        status: "ready",
        ...vision.analysis,
        analysis_views: publishedViews,
        model: vision.model,
        prompt_version: ASSET_APPEARANCE_PROMPT_VERSION,
        render_version: ASSET_ANALYSIS_RENDER_VERSION,
        content_hash: asset.content_hash ?? contentHash,
        analyzed_at: analyzedAt,
        error: null,
      };

      asset = await updateMyWayAsset(asset.asset_id, {
        appearance_profile: readyAppearance,
      });
      appearanceReady = true;

      if (includeEmbedding) {
        asset = await writeAppearanceEmbedding(
          asset,
          readyAppearance,
        );
      }

      return asset;
    } catch (caught) {
      const message = errorMessage(caught);
      const current = (await getMyWayAsset(asset.asset_id)) ?? asset;

      if (appearanceReady) {
        await updateMyWayAsset(asset.asset_id, {
          appearance_embedding: {
            schema_version: "myway_asset_appearance_embedding_v1",
            status: "failed",
            model:
              process.env.MYWAY_ASSET_EMBED_MODEL?.trim() ||
              "nvidia/nemotron-3-embed-1b",
            dimensions: null,
            vector_key: null,
            source_text_hash: null,
            embedded_at: null,
            error: message,
          },
        });
      } else {
        await updateMyWayAsset(asset.asset_id, {
          appearance_profile: {
            ...pendingAppearance(current, "failed", message),
            analysis_views:
              current.appearance_profile?.analysis_views ?? [],
          },
        });
      }

      throw caught;
    } finally {
      await analysisDestination.cleanup().catch(
        () => undefined,
      );
    }
  } finally {
    await materialized.cleanup().catch(
      () => undefined,
    );
  }

}

export function queueAssetEnrichment(
  assetId: string,
  options: {
    force?: boolean;
    runEmbedding?: boolean;
  } = {},
) {
  const existing = queueEntries.get(assetId);
  if (
    existing &&
    (existing.status === "queued" || existing.status === "running")
  ) {
    return existing;
  }

  const entry: AssetEnrichmentQueueEntry = {
    asset_id: assetId,
    status: "queued",
    mode:
      options.runEmbedding === false
        ? "vision_only"
        : "full",
    force: options.force === true,
    queued_at: now(),
    started_at: null,
    completed_at: null,
    error: null,
  };
  queueEntries.set(assetId, entry);

  const task = enrichmentTail.then(async () => {
    entry.status = "running";
    entry.started_at = now();
    try {
      await enrichAsset(assetId, entry.force, entry.mode !== "vision_only");
      entry.status = "completed";
      entry.completed_at = now();
      if (embeddingRefreshAfterFull.delete(assetId)) {
        queueAssetEmbeddingRefresh(assetId);
      }
    } catch (caught) {
      entry.status = "failed";
      entry.completed_at = now();
      entry.error = errorMessage(caught);
    }
  });
  enrichmentTail = task.catch(() => undefined);
  return entry;
}

export function queueAssetEmbeddingRefresh(
  assetId: string,
) {
  const existing = queueEntries.get(assetId);
  if (
    existing &&
    (existing.status === "queued" || existing.status === "running")
  ) {
    if (
      existing.mode === "full" ||
      existing.mode === "vision_only"
    ) {
      embeddingRefreshAfterFull.add(assetId);
    }
    return existing;
  }

  const entry: AssetEnrichmentQueueEntry = {
    asset_id: assetId,
    status: "queued",
    mode: "embedding_only",
    force: true,
    queued_at: now(),
    started_at: null,
    completed_at: null,
    error: null,
  };
  queueEntries.set(assetId, entry);

  const task = enrichmentTail.then(async () => {
    entry.status = "running";
    entry.started_at = now();
    try {
      await refreshAssetEmbeddingOnly(assetId);
      entry.status = "completed";
      entry.completed_at = now();
    } catch (caught) {
      entry.status = "failed";
      entry.completed_at = now();
      entry.error = errorMessage(caught);
    }
  });
  enrichmentTail = task.catch(() => undefined);
  return entry;
}

function backfillPriority(asset: MyWayAssetRecord) {
  if (
    asset.scene_review_status === "pending" ||
    asset.semantic_review_status === "pending" ||
    asset.semantic_review_status === "mismatch"
  ) {
    return 0;
  }
  if (asset.reuse_count > 0) return 1;
  if (asset.scene_review_status === "approved") return 2;
  return 3;
}

export async function queueNextAssetEnrichment() {
  const assets = await listMyWayAssets();
  const candidates = assets
    .filter(
      (asset) =>
        asset.asset_type !== "primitive" &&
        asset.status !== "rejected" &&
        (asset.appearance_profile?.status === "pending" ||
          asset.appearance_profile?.status === "rendering" ||
          asset.appearance_profile?.status === "analyzing" ||
          asset.appearance_embedding?.status === "pending"),
    )
    .sort(
      (a, b) =>
        backfillPriority(a) - backfillPriority(b) ||
        b.reuse_count - a.reuse_count ||
        b.updated_at.localeCompare(a.updated_at),
    );

  for (const asset of candidates) {
    const queued = queueEntries.get(asset.asset_id);
    if (queued?.status === "queued" || queued?.status === "running") {
      continue;
    }
    const file = await assetWithFileStats(asset);
    if (!file.file_stats.exists) continue;
    return asset.appearance_profile?.status === "ready" &&
      asset.appearance_embedding?.status === "pending"
      ? queueAssetEmbeddingRefresh(asset.asset_id)
      : queueAssetEnrichment(asset.asset_id);
  }

  return null;
}


export async function queueAllAssetEnrichment(
  options: { force?: boolean } = {},
) {
  const assets =
    await listMyWayAssets();
  const entries: AssetEnrichmentQueueEntry[] =
    [];
  const skipped: Array<{
    asset_id: string;
    reason: string;
  }> = [];

  for (const asset of assets) {
    if (asset.asset_type === "primitive") {
      skipped.push({
        asset_id: asset.asset_id,
        reason:
          "Primitive-only entries do not need visual analysis.",
      });
      continue;
    }
    if (asset.status === "rejected") {
      skipped.push({
        asset_id: asset.asset_id,
        reason:
          "Rejected assets are not analyzed.",
      });
      continue;
    }

    const file =
      await assetWithFileStats(asset);
    if (!file.file_stats.exists) {
      skipped.push({
        asset_id: asset.asset_id,
        reason:
          "The asset file is missing.",
      });
      continue;
    }

    entries.push(
      queueAssetEnrichment(
        asset.asset_id,
        {
          force:
            options.force === true,
        },
      ),
    );
  }

  return {
    entries,
    skipped,
  };
}


export type NeedsReviewMissingEnrichmentBackfillResult = {
  needs_review_count: number;
  incomplete_count: number;
  already_complete_count: number;
  not_applicable_count: number;
  queued_count: number;
  full_count: number;
  embedding_only_count: number;
  entries: AssetEnrichmentQueueEntry[];
  skipped: Array<{
    asset_id: string;
    mode: Exclude<NeedsReviewMissingEnrichmentMode, null>;
    reason: string;
  }>;
};

export async function queueNeedsReviewMissingEnrichment() {
  const assets = await listMyWayAssets();
  const needsReviewAssets = assets
    .filter((asset) => asset.scene_review_status === "pending")
    .sort(
      (left, right) =>
        left.created_at.localeCompare(right.created_at) ||
        left.asset_id.localeCompare(right.asset_id),
    );

  const providerEligible = needsReviewAssets.filter(
    (asset) =>
      asset.asset_type !== "primitive" &&
      asset.status !== "rejected",
  );
  const incomplete = providerEligible
    .map((asset) => ({
      asset,
      mode: needsReviewMissingEnrichmentMode(asset),
    }))
    .filter(
      (
        row,
      ): row is {
        asset: MyWayAssetRecord;
        mode: Exclude<NeedsReviewMissingEnrichmentMode, null>;
      } => row.mode !== null,
    );

  const entries: AssetEnrichmentQueueEntry[] = [];
  const skipped: NeedsReviewMissingEnrichmentBackfillResult["skipped"] = [];
  let fullCount = 0;
  let embeddingOnlyCount = 0;

  for (const { asset, mode } of incomplete) {
    const file = await assetWithFileStats(asset);
    if (!file.file_stats.exists) {
      skipped.push({
        asset_id: asset.asset_id,
        mode,
        reason: "The asset file is missing.",
      });
      continue;
    }

    if (mode === "embedding_only") {
      entries.push(
        queueAssetEmbeddingRefresh(asset.asset_id),
      );
      embeddingOnlyCount += 1;
      continue;
    }

    const entry = queueAssetEnrichment(asset.asset_id, {
      force: false,
      runEmbedding: true,
    });

    // If a vision-only job was already active, ensure its completion is
    // followed by the missing embedding rather than treating it as sufficient.
    if (entry.mode === "vision_only") {
      queueAssetEmbeddingRefresh(asset.asset_id);
    }

    entries.push(entry);
    fullCount += 1;
  }

  return {
    needs_review_count: needsReviewAssets.length,
    incomplete_count: incomplete.length,
    already_complete_count:
      providerEligible.length - incomplete.length,
    not_applicable_count:
      needsReviewAssets.length - providerEligible.length,
    queued_count: entries.length,
    full_count: fullCount,
    embedding_only_count: embeddingOnlyCount,
    entries,
    skipped,
  } satisfies NeedsReviewMissingEnrichmentBackfillResult;
}

export function assetEnrichmentQueueSnapshot() {
  return Array.from(queueEntries.values()).sort((a, b) =>
    b.queued_at.localeCompare(a.queued_at),
  );
}
