import {
  access,
  rm,
} from "node:fs/promises";
import path from "node:path";

import {
  listMyWayAssets,
  updateMyWayAsset,
} from "../../sandbox/probe-lab/assets/asset-library.server";
import {
  createNormalizeJob,
} from "../../sandbox/probe-lab/assets/blender/blender-job-store.server";
import {
  runBlenderJob,
} from "../../sandbox/probe-lab/assets/blender/blender-bridge.server";
import {
  ensureAssetDirectories,
  projectPath,
} from "../../sandbox/probe-lab/assets/paths.server";

function localAssetPath(asset: {
  source_path?: string | null;
  public_path: string;
}) {
  if (
    asset.source_path &&
    !/^https?:\/\//i.test(asset.source_path)
  ) {
    return projectPath(asset.source_path);
  }

  if (
    asset.public_path.startsWith(
      "/sandbox-assets/",
    )
  ) {
    return projectPath(
      "public",
      asset.public_path.replace(/^\/+/, ""),
    );
  }

  return null;
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await ensureAssetDirectories();
  const assets = await listMyWayAssets();
  const approvedOnly =
    !process.argv.includes("--all");
  const targets = assets.filter(
    (asset) =>
      !asset.geometry_profile &&
      (!approvedOnly ||
        asset.scene_review_status ===
          "approved"),
  );
  const results: Array<{
    asset_id: string;
    status: "profiled" | "skipped" | "failed";
    message: string;
  }> = [];

  for (const asset of targets) {
    const inputPath = localAssetPath(asset);

    if (
      !inputPath ||
      !(await exists(inputPath))
    ) {
      results.push({
        asset_id: asset.asset_id,
        status: "skipped",
        message:
          "No local GLB was available. Runtime geometry detection remains active.",
      });
      continue;
    }

    const temporaryOutput = projectPath(
      "sandbox/probe-lab/assets/debug/geometry-profile-backfill",
      `${asset.asset_id}.glb`,
    );
    const temporaryThumbnail = projectPath(
      "sandbox/probe-lab/assets/debug/geometry-profile-backfill",
      `${asset.asset_id}.png`,
    );

    try {
      const extent = Math.max(
        0.05,
        ...asset.dimensions_m.map((value) =>
          Math.abs(value),
        ),
      );
      const { jobPath } =
        await createNormalizeJob({
          kind: "normalize_asset",
          input_path: inputPath,
          output_path: temporaryOutput,
          thumbnail_path:
            temporaryThumbnail,
          target_extent_m: extent,
          source_type: "manual",
          result: null,
          error: null,
        });
      const completed =
        await runBlenderJob(jobPath);

      if (completed.kind !== "normalize_asset") {
        throw new Error(
          `Expected a normalize_asset Blender job but received ${completed.kind}.`,
        );
      }

      const profile =
        completed.result?.geometry_profile;

      if (!profile) {
        throw new Error(
          "Blender did not return Geometry Profile v1.",
        );
      }

      await updateMyWayAsset(asset.asset_id, {
        geometry_profile: profile,
        support_surfaces:
          profile.support_surfaces,
        dimensions_m:
          profile.local_bounds.size,
        affordances:
          profile.support_surfaces.length > 0
            ? Array.from(
                new Set([
                  ...(asset.affordances ?? []),
                  "support_surface",
                ]),
              )
            : asset.affordances ?? [],
      });
      results.push({
        asset_id: asset.asset_id,
        status: "profiled",
        message: `${profile.support_surfaces.length} support surface(s) detected.`,
      });
    } catch (error) {
      results.push({
        asset_id: asset.asset_id,
        status: "failed",
        message:
          error instanceof Error
            ? error.message
            : String(error),
      });
    } finally {
      await Promise.all([
        rm(temporaryOutput, {
          force: true,
        }),
        rm(temporaryThumbnail, {
          force: true,
        }),
      ]);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: !results.some(
          (result) =>
            result.status === "failed",
        ),
        mode: approvedOnly
          ? "scene-approved assets"
          : "all assets",
        results,
      },
      null,
      2,
    ),
  );

  if (
    results.some(
      (result) => result.status === "failed",
    )
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
