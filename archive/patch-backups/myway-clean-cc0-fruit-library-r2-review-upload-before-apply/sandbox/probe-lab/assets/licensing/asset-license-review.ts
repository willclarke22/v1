import type { MyWayAssetRecord } from "../asset-types";

export type MyWayAssetLicenseDecision =
  | "needs_review"
  | "approved_public_distribution"
  | "private_archive_only"
  | "rejected";

export type MyWayAssetLicenseReviewV1 = {
  schema_version:
    "myway_asset_license_review_v1";
  review_id: string;
  asset_id: string;
  decision: MyWayAssetLicenseDecision;
  reviewed_by: string;
  reviewed_at: string;
  basis: Array<{
    label: string;
    url?: string | null;
    finding: string;
  }>;
  attestations: {
    reviewed_source_terms: boolean;
    public_raw_distribution_allowed: boolean;
    commercial_use_allowed: boolean;
    no_known_third_party_restrictions: boolean;
    generic_or_authorized_subject: boolean;
  };
  notes?: string | null;
};

function nonemptyString(value: unknown) {
  return typeof value === "string" &&
    value.trim().length > 0;
}

export function validateAssetLicenseReview(
  raw: unknown,
): {
  ok: boolean;
  errors: string[];
  review: MyWayAssetLicenseReviewV1 | null;
} {
  const errors: string[] = [];

  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    return {
      ok: false,
      errors: [
        "License review must be a JSON object.",
      ],
      review: null,
    };
  }

  const item = raw as Record<string, unknown>;

  if (
    item.schema_version !==
    "myway_asset_license_review_v1"
  ) {
    errors.push(
      "schema_version must be myway_asset_license_review_v1",
    );
  }

  for (const field of [
    "review_id",
    "asset_id",
    "reviewed_by",
    "reviewed_at",
  ]) {
    if (!nonemptyString(item[field])) {
      errors.push(`${field} is required`);
    }
  }

  const decisions = [
    "needs_review",
    "approved_public_distribution",
    "private_archive_only",
    "rejected",
  ];

  if (!decisions.includes(String(item.decision))) {
    errors.push("decision is invalid");
  }

  if (
    !Array.isArray(item.basis) ||
    item.basis.length === 0
  ) {
    errors.push(
      "basis must contain at least one reviewed source or ownership finding",
    );
  }

  const attestations =
    item.attestations &&
    typeof item.attestations === "object" &&
    !Array.isArray(item.attestations)
      ? (item.attestations as Record<
          string,
          unknown
        >)
      : null;

  if (!attestations) {
    errors.push("attestations are required");
  }

  return {
    ok: errors.length === 0,
    errors,
    review:
      errors.length === 0
        ? (item as MyWayAssetLicenseReviewV1)
        : null,
  };
}

export function publicPromotionBlockers(
  asset: MyWayAssetRecord,
  review: MyWayAssetLicenseReviewV1,
) {
  const blockers: string[] = [];

  if (review.asset_id !== asset.asset_id) {
    blockers.push(
      "License review asset_id does not match the asset.",
    );
  }

  if (
    asset.source_type === "blenderkit" &&
    asset.license_kind === "royalty_free"
  ) {
    blockers.push(
      "BlendKit Royalty Free assets are hard-blocked from standalone public GLB distribution. Use a CC0 asset or a separately licensed/self-owned replacement.",
    );
  }

  if (
    review.decision !==
    "approved_public_distribution"
  ) {
    blockers.push(
      "License review decision is not approved_public_distribution.",
    );
  }

  const requiredAttestations = [
    "reviewed_source_terms",
    "public_raw_distribution_allowed",
    "commercial_use_allowed",
    "no_known_third_party_restrictions",
    "generic_or_authorized_subject",
  ] as const;

  for (const key of requiredAttestations) {
    if (!review.attestations[key]) {
      blockers.push(
        `License attestation is false: ${key}`,
      );
    }
  }

  if (
    asset.license_kind === "royalty_free" &&
    asset.source_type !== "blenderkit"
  ) {
    blockers.push(
      "Royalty Free assets require a source-specific legal review before public raw-file distribution.",
    );
  }

  return blockers;
}

export function assertPublicPromotionAllowed(
  asset: MyWayAssetRecord,
  review: MyWayAssetLicenseReviewV1,
) {
  const blockers =
    publicPromotionBlockers(asset, review);

  if (blockers.length > 0) {
    throw new Error(
      `Asset cannot be promoted publicly:\n- ${blockers.join(
        "\n- ",
      )}`,
    );
  }
}

export function applyApprovedLicenseReview(
  asset: MyWayAssetRecord,
  review: MyWayAssetLicenseReviewV1,
  licenseRecordPath: string,
): MyWayAssetRecord {
  assertPublicPromotionAllowed(asset, review);

  return {
    ...asset,
    license_record_path: licenseRecordPath,
    license_review_id: review.review_id,
    license_status: "app_ready",
    commercial_use_allowed: true,
    raw_redistribution_allowed: true,
    safe_to_promote_to_app: true,
    status: "approved",
    updated_at: new Date().toISOString(),
  };
}
