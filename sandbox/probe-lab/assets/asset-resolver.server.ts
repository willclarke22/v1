import { writeFile } from "node:fs/promises";

import type {
  AssetAcquisitionPolicy,
  AssetResolveRequest,
  AssetResolveResult,
} from "./asset-types";
import {
  requestMissingAssetAcquisition,
} from "./asset-acquisition.server";
import {
  resolveReviewedAsset,
} from "./reviewed-asset-resolver.server";
import { projectPath } from "./paths.server";

function acquisitionPolicy(
  request: AssetResolveRequest,
): AssetAcquisitionPolicy {
  if (
    request.acquisition_policy ===
      "queue_only" ||
    request.acquisition_policy ===
      "sandbox_synchronous" ||
    request.acquisition_policy === "never"
  ) {
    return request.acquisition_policy;
  }

  if (
    request.allow_blenderkit === true ||
    request.allow_trellis === true
  ) {
    return "sandbox_synchronous";
  }

  return "never";
}

async function debug(
  request: AssetResolveRequest,
  result: AssetResolveResult,
) {
  if (request.debug_write !== true) {
    return;
  }

  await writeFile(
    projectPath(
      "sandbox/probe-lab/assets/debug/latest-asset-resolution.json",
    ),
    `${JSON.stringify(
      {
        request,
        result,
        written_at:
          new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  ).catch(() => undefined);
}

/**
 * Compatibility facade.
 *
 * New scene-runtime code must call resolveReviewedAsset() directly. This
 * wrapper exists for explicit manual tools and legacy routes that may choose
 * to request acquisition after pure reviewed resolution fails.
 */
export async function resolveMyWayAsset(
  request: AssetResolveRequest,
): Promise<AssetResolveResult> {
  const policy =
    acquisitionPolicy(request);
  const reviewed =
    await resolveReviewedAsset({
      ...request,
      acquisition_policy: "never",
      debug_write: false,
      record_reuse: false,
    });

  if (reviewed.ok || policy === "never") {
    const result: AssetResolveResult = {
      ...reviewed,
      acquisition_policy: policy,
    };
    await debug(request, result);
    return result;
  }

  const acquisition =
    await requestMissingAssetAcquisition(
      request,
      policy,
    );

  const result: AssetResolveResult = {
    ...reviewed,
    ok: acquisition.ok,
    source: acquisition.source,
    asset: acquisition.asset,
    warnings: Array.from(
      new Set([
        ...reviewed.warnings,
        ...acquisition.warnings,
      ]),
    ),
    attempts: acquisition.attempts,
    acquisition_policy: policy,
    selection_reason: null,
    queued_job_ids:
      acquisition.queued_job_ids,
    failure_reason: acquisition.ok
      ? null
      : reviewed.failure_reason,
    requires_scene_review:
      acquisition.requires_scene_review,
  };

  await debug(request, result);
  return result;
}

export {
  resolveReviewedAsset,
} from "./reviewed-asset-resolver.server";

export {
  requestMissingAssetAcquisition,
} from "./asset-acquisition.server";
