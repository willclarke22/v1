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

  if (!asset.asset_uid?.trim()) {
    errors.push("asset_uid is required after normalization");
  }

  if ((asset.legacy_asset_ids ?? []).includes(asset.asset_id)) {
    errors.push("legacy_asset_ids must not contain the current asset_id");
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
    asset.storage_provider ===
      "r2_private_pending"
  ) {
    if (
      !asset.storage_object_key ||
      !asset.storage_object_key.startsWith(
        "pending/assets/",
      )
    ) {
      errors.push(
        "Private-R2 pending assets require a pending/assets/ storage_object_key",
      );
    }

    if (
      !asset.public_path.startsWith(
        "/api/sandbox/probe-lab/assets/pending-file?",
      ) ||
      !asset.public_path.includes(
        "kind=model",
      )
    ) {
      errors.push(
        "Private-R2 pending assets must use the private pending-file model proxy",
      );
    }

    if (
      asset.scene_review_status ===
        "approved"
    ) {
      errors.push(
        "A private-R2 pending asset cannot be scene-approved before runtime R2 promotion",
      );
    }

    if (asset.promoted_at) {
      errors.push(
        "A private-R2 pending asset cannot already have promoted_at",
      );
    }
  }

  if (
    asset.thumbnail_storage_provider ===
      "r2_private_pending"
  ) {
    if (
      !asset.thumbnail_object_key ||
      !asset.thumbnail_object_key.startsWith(
        "pending/assets/",
      )
    ) {
      errors.push(
        "Private-R2 pending thumbnails require a pending/assets/ thumbnail_object_key",
      );
    }

    if (
      !asset.thumbnail_path ||
      !asset.thumbnail_path.startsWith(
        "/api/sandbox/probe-lab/assets/pending-file?",
      ) ||
      !asset.thumbnail_path.includes(
        "kind=thumbnail",
      )
    ) {
      errors.push(
        "Private-R2 pending thumbnails must use the private pending-file thumbnail proxy",
      );
    }
  }

  if (
    asset.source_storage_provider ===
      "r2_private_pending"
  ) {
    errors.push(
      "source_storage_provider cannot be r2_private_pending; source archives use ordinary private R2 source storage",
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

