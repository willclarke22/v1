import {
  materializePendingAssetReviewModel,
} from "../storage/pending-asset-storage.server";
import {
  access,
  mkdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  assetWithFileStats,
  getMyWayAsset,
  listMyWayAssets,
  updateMyWayAsset,
} from "../asset-library.server";
import type {
  MyWayAssetGeometryProfileV1,
  MyWayAssetRecord,
} from "../asset-types";
import {
  createGeometryProfileJob,
} from "../blender/blender-job-store.server";
import {
  runBlenderJob,
} from "../blender/blender-bridge.server";
import { hashFile } from "../content-hash.server";
import {
  ensureAssetDirectories,
  projectPath,
  publicUrlToProjectPath,
} from "../paths.server";
import { writeJsonFileAtomic } from "../json-file.server";

export type GeometryProfileQueueEntry = {
  asset_id: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "skipped";
  force: boolean;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  support_surface_count: number | null;
  audit_status: "measured" | "review_required" | null;
  audit_confidence: number | null;
  warnings: string[];
  error: string | null;
};

const queueEntries = new Map<
  string,
  GeometryProfileQueueEntry
>();
let geometryTail: Promise<void> =
  Promise.resolve();

function now() {
  return new Date().toISOString();
}

function errorMessage(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : String(caught);
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function localInputPath(
  asset: MyWayAssetRecord,
) {
  const sourcePath =
    asset.source_path?.trim();
  if (
    sourcePath &&
    !/^https?:\/\//i.test(sourcePath)
  ) {
    const candidate = projectPath(
      sourcePath.replace(/^\/+/, ""),
    );
    if (await exists(candidate)) {
      return candidate;
    }
  }

  if (
    !/^https?:\/\//i.test(
      asset.public_path,
    )
  ) {
    const candidate =
      publicUrlToProjectPath(
        asset.public_path,
      );
    if (await exists(candidate)) {
      return candidate;
    }
  }

  if (
    !/^https?:\/\//i.test(
      asset.public_path,
    )
  ) {
    throw new Error(
      `No local GLB was found for ${asset.asset_id}.`,
    );
  }

  const response = await fetch(
    asset.public_path,
  );
  if (!response.ok) {
    throw new Error(
      `Could not download ${asset.asset_id} for geometry profiling: ${response.status}.`,
    );
  }

  const suffix =
    path.extname(
      new URL(
        asset.public_path,
      ).pathname,
    ) || ".glb";
  const cachePath = projectPath(
    "sandbox/probe-lab/assets/geometry/cache",
    `${asset.asset_id}${suffix}`,
  );
  await mkdir(
    path.dirname(cachePath),
    { recursive: true },
  );
  await writeFile(
    cachePath,
    Buffer.from(
      await response.arrayBuffer(),
    ),
  );
  return cachePath;
}

function profileNeedsRefresh(
  asset: MyWayAssetRecord,
  contentHash: string,
) {
  return !(
    asset.geometry_profile?.generator ===
      "myway_blender_geometry_profile_v3_spatial_regions" &&
    asset.geometry_profile
      .content_hash === contentHash
  );
}

async function writeLatestReport() {
  const entries = geometryProfileQueueSnapshot();
  const terminal = entries.filter(
    (entry) =>
      entry.status === "completed" ||
      entry.status === "failed" ||
      entry.status === "skipped",
  );

  await writeJsonFileAtomic(
    projectPath(
      "sandbox/probe-lab/assets/debug/latest-geometry-backfill-report.json",
    ),
    {
      schema_version:
        "myway_geometry_backfill_report_v1",
      written_at: now(),
      summary: {
        total: entries.length,
        queued: entries.filter(
          (entry) =>
            entry.status === "queued",
        ).length,
        running: entries.filter(
          (entry) =>
            entry.status === "running",
        ).length,
        completed: entries.filter(
          (entry) =>
            entry.status === "completed",
        ).length,
        review_required: terminal.filter(
          (entry) =>
            entry.audit_status ===
            "review_required",
        ).length,
        failed: entries.filter(
          (entry) =>
            entry.status === "failed",
        ).length,
        skipped: entries.filter(
          (entry) =>
            entry.status === "skipped",
        ).length,
      },
      entries,
    },
  );
}

async function profileAssetGeometry(
  assetId: string,
  force: boolean,
) {
  await ensureAssetDirectories();
  const asset =
    await getMyWayAsset(assetId);

  if (!asset) {
    throw new Error(
      `Asset was not found: ${assetId}`,
    );
  }
  if (asset.asset_type === "primitive") {
    return {
      skipped: true,
      reason:
        "Primitive entries do not use GLB geometry profiles.",
    } as const;
  }
  if (asset.status === "rejected") {
    return {
      skipped: true,
      reason:
        "Rejected assets are not profiled.",
    } as const;
  }

  const file =
    await assetWithFileStats(asset);
  if (!file.file_stats.exists) {
    throw new Error(
      `The registered asset file is unavailable: ${asset.public_path}`,
    );
  }

  const materialized =
    asset.storage_provider ===
      "r2_private_pending"
      ? await materializePendingAssetReviewModel(
          asset,
        )
      : {
          local_path:
            await localInputPath(asset),
          cleanup:
            async () => undefined,
        };

  try {
    const inputPath = materialized.local_path;
    const contentHash =
      await hashFile(inputPath);

    if (
      !force &&
      !profileNeedsRefresh(
        asset,
        contentHash,
      )
    ) {
      return {
        skipped: true,
        reason:
          "Spatial Geometry Profile v3 already matches the current GLB.",
      } as const;
    }

    const { jobPath } =
      await createGeometryProfileJob({
        kind: "profile_asset_geometry",
        input_path: inputPath,
        result: null,
        error: null,
      });
    const completed =
      await runBlenderJob(jobPath);

    if (
      completed.kind !== "profile_asset_geometry" ||
      !completed.result?.geometry_profile
    ) {
      throw new Error(
        "Blender completed without returning Spatial Geometry Profile v3.",
      );
    }

    const measuredProfile =
      completed.result.geometry_profile;
    const manualSurfaces =
      (asset.support_surfaces ?? []).filter(
        (surface) => surface.source === "manual",
      );
    const manualIds = new Set(
      manualSurfaces.map(
        (surface) => surface.id,
      ),
    );
    const profile: MyWayAssetGeometryProfileV1 = {
      ...measuredProfile,
      support_surfaces: [
        ...manualSurfaces,
        ...measuredProfile.support_surfaces.filter(
          (surface) => !manualIds.has(surface.id),
        ),
      ],
      primary_support_surface_id:
        manualSurfaces[0]?.id ??
        measuredProfile.primary_support_surface_id ??
        null,
      content_hash: contentHash,
    };

    const updated =
      await updateMyWayAsset(
        asset.asset_id,
        {
          geometry_profile: profile,
          support_surfaces:
            profile.support_surfaces,
        },
      );

    return {
      skipped: false,
      asset: updated,
      profile,
    } as const;
  }
  finally {
    await materialized.cleanup()
      .catch(() => undefined);
  }
}

export function queueAssetGeometryProfile(
  assetId: string,
  options: { force?: boolean } = {},
) {
  const existing =
    queueEntries.get(assetId);
  if (
    existing &&
    (existing.status === "queued" ||
      existing.status === "running")
  ) {
    return existing;
  }

  const entry: GeometryProfileQueueEntry = {
    asset_id: assetId,
    status: "queued",
    force: options.force === true,
    queued_at: now(),
    started_at: null,
    completed_at: null,
    support_surface_count: null,
    audit_status: null,
    audit_confidence: null,
    warnings: [],
    error: null,
  };
  queueEntries.set(assetId, entry);

  const task = geometryTail.then(
    async () => {
      entry.status = "running";
      entry.started_at = now();
      await writeLatestReport().catch(
        () => undefined,
      );

      try {
        const result =
          await profileAssetGeometry(
            assetId,
            entry.force,
          );
        entry.completed_at = now();

        if (result.skipped) {
          entry.status = "skipped";
          entry.warnings = [
            result.reason,
          ];
        } else {
          entry.status = "completed";
          entry.support_surface_count =
            result.profile
              .support_surfaces.length;
          entry.audit_status =
            result.profile.audit
              ?.status ?? "measured";
          entry.audit_confidence =
            result.profile.audit
              ?.confidence ?? null;
          entry.warnings =
            result.profile.audit
              ?.warnings ?? [];
        }
      } catch (caught) {
        entry.status = "failed";
        entry.completed_at = now();
        entry.error =
          errorMessage(caught);
      }

      await writeLatestReport().catch(
        () => undefined,
      );
    },
  );
  geometryTail = task.catch(
    () => undefined,
  );
  return entry;
}

export async function queueAllGeometryProfiles(
  options: { force?: boolean } = {},
) {
  const assets =
    await listMyWayAssets();
  const entries: GeometryProfileQueueEntry[] = [];
  const skipped: Array<{
    asset_id: string;
    reason: string;
  }> = [];

  for (const asset of assets) {
    if (asset.asset_type === "primitive") {
      skipped.push({
        asset_id: asset.asset_id,
        reason:
          "Primitive entry.",
      });
      continue;
    }
    if (asset.status === "rejected") {
      skipped.push({
        asset_id: asset.asset_id,
        reason:
          "Rejected asset.",
      });
      continue;
    }

    const file =
      await assetWithFileStats(asset);
    if (!file.file_stats.exists) {
      skipped.push({
        asset_id: asset.asset_id,
        reason:
          "Registered file is unavailable.",
      });
      continue;
    }

    entries.push(
      queueAssetGeometryProfile(
        asset.asset_id,
        {
          force:
            options.force === true,
        },
      ),
    );
  }

  await writeLatestReport();
  return { entries, skipped };
}

export function geometryProfileQueueSnapshot() {
  return Array.from(
    queueEntries.values(),
  ).sort((left, right) =>
    right.queued_at.localeCompare(
      left.queued_at,
    ),
  );
}
