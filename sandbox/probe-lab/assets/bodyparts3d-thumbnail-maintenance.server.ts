import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  getAssetBrowserRegistryAsset,
  getAssetBrowserRegistrySnapshot,
  invalidateAssetBrowserRegistrySnapshot,
} from "./asset-browser-snapshot.server";
import { updateMyWayAsset } from "./asset-library.server";
import {
  BODYPARTS3D_EXPECTED_ELEMENT_COUNT,
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
import {
  assessBodyParts3dThumbnailPng,
  type BodyParts3dThumbnailVisualAssessment,
} from "./bodyparts3d-thumbnail-quality.server";

export type BodyParts3dThumbnailAuditStatus =
  | "healthy"
  | "recoverable_reference"
  | "missing_object"
  | "visual_blank"
  | "visual_too_small"
  | "visual_decode_error"
  | "unsupported";

export type BodyParts3dThumbnailAuditItem = {
  asset_id: string;
  source_asset_id: string | null;
  concept_name: string | null;
  status: BodyParts3dThumbnailAuditStatus;
  thumbnail_object_key: string | null;
  registered_reference: boolean;
  object_exists: boolean;
  visual_assessment: BodyParts3dThumbnailVisualAssessment | null;
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
    6,
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
          visual_assessment: null,
        };
      }

      const deterministicKey =
        pendingAssetThumbnailObjectKey(asset.asset_id);
      const registeredReference =
        asset.thumbnail_storage_provider === "r2_private_pending" &&
        asset.thumbnail_object_key === deterministicKey &&
        Boolean(asset.thumbnail_path);
      const thumbnailObject = await source.read(deterministicKey);
      if (!thumbnailObject) {
        return {
          asset_id: asset.asset_id,
          source_asset_id: asset.source_asset_id ?? null,
          concept_name: asset.collection_membership?.concept_name ?? null,
          status: "missing_object",
          thumbnail_object_key: deterministicKey,
          registered_reference: registeredReference,
          object_exists: false,
          visual_assessment: null,
        };
      }

      const visualAssessment =
        await assessBodyParts3dThumbnailPng(thumbnailObject.body);
      const visualStatus =
        visualAssessment.status === "healthy"
          ? registeredReference
            ? "healthy"
            : "recoverable_reference"
          : visualAssessment.status;

      return {
        asset_id: asset.asset_id,
        source_asset_id: asset.source_asset_id ?? null,
        concept_name: asset.collection_membership?.concept_name ?? null,
        status: visualStatus,
        thumbnail_object_key: deterministicKey,
        registered_reference: registeredReference,
        object_exists: true,
        visual_assessment: visualAssessment,
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


export async function renderBodyParts3dThumbnailCalibration(input: {
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
      `BodyParts3D thumbnail calibration currently requires a private pending atlas model: ${asset.asset_id}`,
    );
  }

  const model =
    await readPendingAssetReviewObject(asset, "model");
  if (!model) {
    throw new Error(
      `Cannot render thumbnail calibration because the private pending GLB is missing: ${asset.asset_id}`,
    );
  }

  const workspace =
    await createAssetTempWorkspace(
      "bodyparts3d-thumbnail-calibration",
    );

  const targetColorHex =
    anatomyThumbnailColor(asset);

  const candidates = [
    {
      id: "A",
      label: "Linear-color baseline",
      description:
        "sRGB palette color is converted to scene-linear RGB and shown with an emission baseline. This isolates color conversion from lighting.",
      render_profile:
        "bodyparts3d_calibration_color_baseline_v1" as const,
    },
    {
      id: "B",
      label: "Low-exposure matte",
      description:
        "Scene-linear semantic color with restrained sun-style key/fill/rim lighting and lower exposure.",
      render_profile:
        "bodyparts3d_calibration_low_exposure_v1" as const,
    },
    {
      id: "C",
      label: "Soft studio",
      description:
        "Scene-linear semantic color with soft directional studio lighting and AgX display transform.",
      render_profile:
        "bodyparts3d_calibration_soft_studio_v1" as const,
    },
    {
      id: "D",
      label: "Viewer-match attempt",
      description:
        "Scene-linear semantic color with directional intensities patterned after the Asset Library Three.js viewer and an AgX display transform.",
      render_profile:
        "bodyparts3d_calibration_viewer_match_v1" as const,
    },
  ];

  try {
    const inputPath =
      path.join(workspace.path, "source.glb");
    await writeFile(
      /* turbopackIgnore: true */
      inputPath,
      Buffer.from(model.body),
    );

    const rendered: Array<{
      id: string;
      label: string;
      description: string;
      render_profile:
        (typeof candidates)[number]["render_profile"];
      data_url: string | null;
      visual_assessment:
        BodyParts3dThumbnailVisualAssessment | null;
      error: string | null;
    }> = [];
    for (const candidate of candidates) {
      const outputPath =
        path.join(
          workspace.path,
          `calibration-${candidate.id}.glb`,
        );
      const thumbnailPath =
        path.join(
          workspace.path,
          `calibration-${candidate.id}.png`,
        );

      try {
        const { jobPath } =
          await createNormalizeJob({
            kind: "normalize_asset",
            input_path: inputPath,
            output_path: outputPath,
            thumbnail_path: thumbnailPath,
            target_extent_m:
              Math.max(
                ...asset.dimensions_m.map((value) =>
                  Number.isFinite(value)
                    ? Math.max(value, 0.001)
                    : 0.001,
                ),
              ),
            normalization_mode:
              "preserve_geometry",
            thumbnail_color_hex:
              targetColorHex,
            thumbnail_render_profile:
              candidate.render_profile,
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
            `Blender did not return calibration candidate ${candidate.id}.`,
          );
        }

        const thumbnailBytes =
          await readFile(
            /* turbopackIgnore: true */
            thumbnailPath,
          );
        const assessment =
          await assessBodyParts3dThumbnailPng(
            thumbnailBytes,
          );

        rendered.push({
          ...candidate,
          data_url:
            `data:image/png;base64,${thumbnailBytes.toString("base64")}`,
          visual_assessment:
            assessment,
          error:
            null,
        });
      } catch (caught) {
        rendered.push({
          ...candidate,
          data_url:
            null,
          visual_assessment:
            null,
          error:
            caught instanceof Error
              ? caught.message
              : String(caught),
        });
      }
    }

    return {
      asset_id:
        asset.asset_id,
      source_asset_id:
        asset.source_asset_id ?? null,
      concept_name:
        asset.collection_membership?.concept_name ?? null,
      target_color_hex:
        targetColorHex,
      candidates:
        rendered,
      storage_mutated:
        false as const,
    };
  } finally {
    // Calibration candidates are returned inline and never uploaded to R2 or written into the asset registry.
    await workspace.cleanup().catch(() => undefined);
  }
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
  forceRegenerate?: boolean;
  appearancePreview?: boolean;
  viewerMatchRefined?: boolean;
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
  if (existing && input.forceRegenerate !== true) {
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
        thumbnail_render_profile:
          input.viewerMatchRefined === true
            ? "bodyparts3d_viewer_match_refined_v1"
            : input.appearancePreview === true
              ? "bodyparts3d_semantic_preview_v1"
              : "legacy",
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
    const regeneratedAssessment =
      await assessBodyParts3dThumbnailPng(thumbnailBytes);
    if (regeneratedAssessment.status !== "healthy") {
      throw new Error(
        `Regenerated anatomy thumbnail still failed visual QA for ${asset.asset_id}: ` +
          `${regeneratedAssessment.status} (visible=${regeneratedAssessment.visible_fraction.toFixed(5)}, ` +
          `max-span=${regeneratedAssessment.max_span_fraction.toFixed(4)}). Existing R2 thumbnail was left unchanged.`,
      );
    }

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
          "myway-thumbnail-lighting":
            input.viewerMatchRefined === true
              ? "viewer_match_refined_v1"
              : input.appearancePreview === true
                ? "extent_scaled_semantic_preview_v1"
                : "legacy_v1",
          "myway-thumbnail-framing":
            "mesh_vertex_alpha_refit_v3",
          "myway-thumbnail-qa":
            "alpha_bbox_v1",
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
        input.viewerMatchRefined === true
          ? "thumbnail_viewer_match_refined_regenerated" as const
          : input.appearancePreview === true
            ? "thumbnail_appearance_preview_regenerated" as const
            : input.forceRegenerate === true
              ? "thumbnail_visual_regenerated" as const
              : "thumbnail_regenerated" as const,
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
export type BodyParts3dFullAtlasThumbnailTarget = {
  asset_id: string;
  source_asset_id: string | null;
  concept_name: string | null;
};

export async function listBodyParts3dFullAtlasThumbnailTargets(input: {
  registryRevision: string;
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

  if (assets.length !== BODYPARTS3D_EXPECTED_ELEMENT_COUNT) {
    throw new Error(
      `Full-atlas refined regeneration expected ${BODYPARTS3D_EXPECTED_ELEMENT_COUNT.toLocaleString()} BodyParts3D assets but found ${assets.length.toLocaleString()}. No regeneration was started.`,
    );
  }

  return {
    total: assets.length,
    items: assets.map((asset): BodyParts3dFullAtlasThumbnailTarget => ({
      asset_id: asset.asset_id,
      source_asset_id: asset.source_asset_id ?? null,
      concept_name: asset.collection_membership?.concept_name ?? null,
    })),
  };
}

const FULL_ATLAS_REFINED_SESSION_ROOT = path.join(
  os.tmpdir(),
  "myway-bodyparts3d-refined-thumbnail-regeneration",
);
const FULL_ATLAS_REFINED_SESSION_ID_PATTERN =
  /^[a-zA-Z0-9-]{8,80}$/;
const activeFullAtlasRefinedSessions = new Set<string>();

type BodyParts3dFullAtlasRefinedSessionV1 = {
  schema_version: "myway_bodyparts3d_full_atlas_refined_thumbnail_session_v1";
  session_id: string;
  created_at: string;
  updated_at: string;
  registry_revision: string;
  total: number;
  next_index: number;
  regenerated: number;
  failed: number;
  phase: "prepared" | "running" | "error" | "complete";
  current_asset_id: string | null;
  current_label: string | null;
  last_error: string | null;
  queue: BodyParts3dFullAtlasThumbnailTarget[];
};

function fullAtlasRefinedSessionDirectory(sessionId: string) {
  if (!FULL_ATLAS_REFINED_SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error("Invalid BodyParts3D refined thumbnail session id.");
  }
  return path.join(FULL_ATLAS_REFINED_SESSION_ROOT, sessionId);
}

function fullAtlasRefinedSessionStatePath(sessionId: string) {
  return path.join(
    fullAtlasRefinedSessionDirectory(sessionId),
    "state.json",
  );
}

async function readFullAtlasRefinedSession(sessionId: string) {
  const statePath = fullAtlasRefinedSessionStatePath(sessionId);
  let raw: string;
  try {
    raw = await readFile(statePath, "utf8");
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Saved BodyParts3D refined thumbnail session is no longer available: ${sessionId}`,
      );
    }
    throw caught;
  }

  const parsed = JSON.parse(raw) as BodyParts3dFullAtlasRefinedSessionV1;
  if (
    parsed.schema_version !==
      "myway_bodyparts3d_full_atlas_refined_thumbnail_session_v1" ||
    parsed.session_id !== sessionId ||
    parsed.total !== BODYPARTS3D_EXPECTED_ELEMENT_COUNT ||
    parsed.queue.length !== parsed.total
  ) {
    throw new Error(
      "Saved BodyParts3D refined thumbnail session state is invalid.",
    );
  }
  return parsed;
}

async function writeFullAtlasRefinedSession(
  session: BodyParts3dFullAtlasRefinedSessionV1,
) {
  session.updated_at = new Date().toISOString();
  const directory = fullAtlasRefinedSessionDirectory(
    session.session_id,
  );
  await mkdir(directory, { recursive: true });
  const statePath = fullAtlasRefinedSessionStatePath(
    session.session_id,
  );
  const temporaryPath = `${statePath}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(session, null, 2)}
`,
    "utf8",
  );
  await rename(temporaryPath, statePath);
}

function fullAtlasRefinedSessionProgress(
  session: BodyParts3dFullAtlasRefinedSessionV1,
) {
  const nextItem = session.queue[session.next_index] ?? null;
  return {
    schema_version: session.schema_version,
    session_id: session.session_id,
    phase: session.phase,
    created_at: session.created_at,
    updated_at: session.updated_at,
    total: session.total,
    completed: session.next_index,
    regenerated: session.regenerated,
    failed: session.failed,
    remaining: Math.max(0, session.total - session.next_index),
    next_index: session.next_index,
    current_asset_id:
      session.current_asset_id ?? nextItem?.asset_id ?? null,
    current_label:
      session.current_label ??
      nextItem?.concept_name ??
      nextItem?.source_asset_id ??
      nextItem?.asset_id ??
      null,
    last_error: session.last_error,
  };
}

export async function prepareBodyParts3dFullAtlasRefinedThumbnailSession(
  input: {
    registryRevision: string;
    queue?: Awaited<ReturnType<typeof listBodyParts3dFullAtlasThumbnailTargets>>;
  },
) {
  const queue =
    input.queue ??
    await listBodyParts3dFullAtlasThumbnailTargets(input);
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const session: BodyParts3dFullAtlasRefinedSessionV1 = {
    schema_version:
      "myway_bodyparts3d_full_atlas_refined_thumbnail_session_v1",
    session_id: sessionId,
    created_at: now,
    updated_at: now,
    registry_revision: input.registryRevision,
    total: queue.total,
    next_index: 0,
    regenerated: 0,
    failed: 0,
    phase: "prepared",
    current_asset_id: null,
    current_label: null,
    last_error: null,
    queue: queue.items,
  };
  await writeFullAtlasRefinedSession(session);
  return {
    queue,
    session: fullAtlasRefinedSessionProgress(session),
  };
}

export async function bodyParts3dFullAtlasRefinedThumbnailSessionStatus(
  sessionId: string,
) {
  const session = await readFullAtlasRefinedSession(sessionId);
  return fullAtlasRefinedSessionProgress(session);
}

export async function runBodyParts3dFullAtlasRefinedThumbnailStep(input: {
  sessionId: string;
  registryRevision: string;
}) {
  if (activeFullAtlasRefinedSessions.has(input.sessionId)) {
    throw new Error(
      "This BodyParts3D refined thumbnail session is already processing its current asset. Wait for that request to finish, then resume.",
    );
  }

  activeFullAtlasRefinedSessions.add(input.sessionId);
  try {
    const session = await readFullAtlasRefinedSession(input.sessionId);
    if (session.next_index >= session.total) {
      session.phase = "complete";
      session.current_asset_id = null;
      session.current_label = null;
      session.last_error = null;
      await writeFullAtlasRefinedSession(session);
      return fullAtlasRefinedSessionProgress(session);
    }

    const item = session.queue[session.next_index]!;
    session.phase = "running";
    session.current_asset_id = item.asset_id;
    session.current_label =
      item.concept_name ?? item.source_asset_id ?? item.asset_id;
    session.last_error = null;
    await writeFullAtlasRefinedSession(session);

    try {
      const repair = await backfillBodyParts3dThumbnail({
        assetId: item.asset_id,
        registryRevision: input.registryRevision,
        forceRegenerate: true,
        viewerMatchRefined: true,
      });
      if (
        repair.result !==
        "thumbnail_viewer_match_refined_regenerated"
      ) {
        throw new Error(
          `Unexpected refined result for ${item.asset_id}: ${repair.result}.`,
        );
      }

      session.next_index += 1;
      session.regenerated += 1;
      session.phase =
        session.next_index >= session.total
          ? "complete"
          : "prepared";
      session.current_asset_id = null;
      session.current_label = null;
      session.last_error = null;
      await writeFullAtlasRefinedSession(session);
      return fullAtlasRefinedSessionProgress(session);
    } catch (caught) {
      session.failed += 1;
      session.phase = "error";
      session.last_error =
        caught instanceof Error ? caught.message : String(caught);
      await writeFullAtlasRefinedSession(session);
      throw caught;
    }
  } finally {
    activeFullAtlasRefinedSessions.delete(input.sessionId);
  }
}

export async function cancelBodyParts3dFullAtlasRefinedThumbnailSession(
  sessionId: string,
) {
  if (activeFullAtlasRefinedSessions.has(sessionId)) {
    throw new Error(
      "The current refined thumbnail step is still running. Wait for it to finish before resetting the saved session.",
    );
  }
  await rm(fullAtlasRefinedSessionDirectory(sessionId), {
    recursive: true,
    force: true,
  });
  return {
    cancelled: true as const,
    session_id: sessionId,
  };
}

type BodyParts3dThumbnailRepairResult = Awaited<
  ReturnType<typeof backfillBodyParts3dThumbnail>
>;

function normalizeExplicitAssetIds(assetIds: string[]) {
  const unique = new Set<string>();
  const normalized: string[] = [];
  for (const assetId of assetIds) {
    const trimmed = assetId.trim();
    if (!trimmed || unique.has(trimmed)) continue;
    unique.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

export async function backfillBodyParts3dThumbnailBatch(input: {
  assetIds: string[];
  registryRevision: string;
  viewerMatchRefined?: boolean;
}) {
  const assetIds =
    normalizeExplicitAssetIds(input.assetIds);
  if (assetIds.length === 0) {
    throw new Error(
      "At least one explicit BodyParts3D asset ID is required.",
    );
  }
  if (assetIds.length > 8) {
    throw new Error(
      `Explicit BodyParts3D sample batches are capped at 8 assets (received ${assetIds.length}).`,
    );
  }

  const results: Array<{
    asset_id: string;
    result: BodyParts3dThumbnailRepairResult["result"];
  }> = [];

  for (const assetId of assetIds) {
    const repair =
      await backfillBodyParts3dThumbnail({
        assetId,
        registryRevision: input.registryRevision,
        forceRegenerate: true,
        viewerMatchRefined:
          input.viewerMatchRefined === true,
      });
    results.push({
      asset_id: repair.asset_id,
      result: repair.result,
    });
  }

  return {
    asset_ids: assetIds,
    results,
    stop_on_first_failure: true as const,
  };
}

