import type { MyWayAssetRecord } from "./asset-types";
import {
  attributionCompletenessIssues,
  isAttributionRequiredLicense,
} from "./asset-attribution";

function isSupportedPublicPath(value: string) {
  return (
    value.startsWith("/") ||
    /^https:\/\//i.test(value)
  );
}

export function validateMyWayAssetRecord(
  asset: MyWayAssetRecord,
) {
  const errors: string[] = [];

  if (!asset.asset_id) {
    errors.push("asset_id is required");
  }

  if (!asset.display_name) {
    errors.push("display_name is required");
  }

  if (!asset.public_path) {
    errors.push("public_path is required");
  } else if (
    !isSupportedPublicPath(asset.public_path)
  ) {
    errors.push(
      "public_path must be a project-relative / path or an HTTPS URL",
    );
  }

  if (
    asset.thumbnail_path &&
    !isSupportedPublicPath(asset.thumbnail_path)
  ) {
    errors.push(
      "thumbnail_path must be a project-relative / path or an HTTPS URL",
    );
  }

  if (
    asset.dimensions_m.some(
      (value) =>
        !Number.isFinite(value) || value < 0,
    )
  ) {
    errors.push(
      "dimensions_m must contain three nonnegative finite numbers",
    );
  }

  if (
    asset.storage_provider === "r2" &&
    !/^https:\/\//i.test(asset.public_path)
  ) {
    errors.push(
      "R2 assets must use an HTTPS public_path",
    );
  }

  if (
    asset.safe_to_promote_to_app &&
    (!asset.raw_redistribution_allowed ||
      asset.license_status !== "app_ready")
  ) {
    errors.push(
      "safe_to_promote_to_app requires app_ready licensing and raw redistribution permission",
    );
  }

  if (
    (asset.safe_to_promote_to_app ||
      asset.license_status === "app_ready") &&
    isAttributionRequiredLicense(
      asset.license_kind,
    )
  ) {
    const attributionIssues =
      attributionCompletenessIssues(
        asset.attribution,
      );
    if (attributionIssues.length) {
      errors.push(
        `Attribution-required assets are incomplete: ${attributionIssues.join(
          "; ",
        )}`,
      );
    }
  }

  if (
    !["pending", "approved", "rejected"].includes(
      asset.scene_review_status ?? "pending",
    )
  ) {
    errors.push(
      "scene_review_status must be pending, approved, or rejected",
    );
  }

  if (
    asset.scene_review_status === "approved" &&
    (!asset.safe_to_use_in_sandbox ||
      asset.status === "rejected")
  ) {
    errors.push(
      "scene-approved assets must be safe for sandbox use and not rejected",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
