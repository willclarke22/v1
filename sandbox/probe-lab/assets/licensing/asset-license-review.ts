import type { MyWayAssetRecord } from "../asset-types";
import {
  attributionCompletenessIssues,
  isAttributionRequiredLicense,
} from "../asset-attribution";

export type MyWayAssetLicenseDecision =
  | "needs_review"
  | "approved_public_distribution"
  | "private_archive_only"
  | "rejected";

export type MyWayAssetLicenseReviewV1 = {
  schema_version: "myway_asset_license_review_v1";
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
    production_use_allowed: boolean;
    public_raw_distribution_allowed: boolean;
    commercial_use_allowed: boolean;
    no_known_third_party_restrictions: boolean;
    generic_or_authorized_subject: boolean;
  };
  attribution?: {
    required: boolean;
    text: string;
    license: string;
    license_url?: string | null;
    creator_name?: string | null;
    source_url?: string | null;
    source_asset_id?: string | null;
    modification_notice?: string | null;
  } | null;
  notes?: string | null;
};

function nonemptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateAssetLicenseReview(
  raw: unknown,
): {
  ok: boolean;
  errors: string[];
  review: MyWayAssetLicenseReviewV1 | null;
} {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      errors: ["License review must be a JSON object."],
      review: null,
    };
  }

  const item = raw as Record<string, unknown>;

  if (item.schema_version !== "myway_asset_license_review_v1") {
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

  if (!Array.isArray(item.basis) || item.basis.length === 0) {
    errors.push(
      "basis must contain at least one reviewed source or ownership finding",
    );
  }

  const attestations =
    item.attestations &&
    typeof item.attestations === "object" &&
    !Array.isArray(item.attestations)
      ? (item.attestations as Record<string, unknown>)
      : null;

  if (!attestations) {
    errors.push("attestations are required");
  } else {
    for (const key of [
      "reviewed_source_terms",
      "production_use_allowed",
      "public_raw_distribution_allowed",
      "commercial_use_allowed",
      "no_known_third_party_restrictions",
      "generic_or_authorized_subject",
    ]) {
      if (typeof attestations[key] !== "boolean") {
        errors.push(`attestations.${key} must be boolean`);
      }
    }
  }

  if (
    item.attribution != null
  ) {
    const attribution =
      item.attribution &&
      typeof item.attribution === "object" &&
      !Array.isArray(item.attribution)
        ? item.attribution as
            Record<string, unknown>
        : null;
    if (!attribution) {
      errors.push(
        "attribution must be an object when present",
      );
    } else {
      if (
        typeof attribution.required !==
        "boolean"
      ) {
        errors.push(
          "attribution.required must be boolean",
        );
      }
      if (
        attribution.required === true &&
        !nonemptyString(attribution.text)
      ) {
        errors.push(
          "attribution.text is required when attribution.required is true",
        );
      }
      if (
        attribution.required === true &&
        !nonemptyString(
          attribution.license,
        )
      ) {
        errors.push(
          "attribution.license is required when attribution.required is true",
        );
      }
    }
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

export function buildBlenderKitCc0LicenseReview(
  asset: MyWayAssetRecord,
): MyWayAssetLicenseReviewV1 {
  if (
    asset.source_type !== "blenderkit" ||
    asset.license_kind !== "cc0"
  ) {
    throw new Error(
      "Automated BlendKit review is only available for assets whose source record reports CC0.",
    );
  }

  return {
    schema_version: "myway_asset_license_review_v1",
    review_id: `${asset.asset_id}_blenderkit_cc0_review_v1`,
    asset_id: asset.asset_id,
    decision: "approved_public_distribution",
    reviewed_by: "MyWay automated BlendKit CC0 intake policy",
    reviewed_at: new Date().toISOString(),
    basis: [
      {
        label: "Asset-specific BlendKit API record",
        url: asset.source_url ?? null,
        finding:
          "The captured source metadata reports the asset license as CC0. MyWay rejects the intake if the returned license is not exactly CC0.",
      },
      {
        label: "BlendKit license documentation",
        url: "https://www.blenderkit.com/docs/licenses/",
        finding:
          "BlendKit describes CC0 as permitting unrestricted use, including commercial use and redistribution.",
      },
      {
        label: "BlendKit licensing FAQ",
        url: "https://www.blenderkit.com/docs/licenses/licensing-faq/",
        finding:
          "BlendKit states that CC0 technically permits any use of the asset.",
      },
    ],
    attestations: {
      reviewed_source_terms: true,
      production_use_allowed: true,
      public_raw_distribution_allowed: true,
      commercial_use_allowed: true,
      no_known_third_party_restrictions: true,
      generic_or_authorized_subject: true,
    },
    notes:
      "Automated approval is limited to an exact CC0 license value captured from BlendKit for a generic fruit subject. The user still reviews visual quality before uploading the runtime GLB to Cloudflare R2.",
  };
}


export function isPolyPizzaManualLicenseCandidate(
  asset: MyWayAssetRecord,
) {
  return (
    asset.source_type === "manual" &&
    asset.attribution
      ?.source_provider
      ?.trim()
      .toLowerCase() === "poly pizza" &&
    (asset.license_kind === "cc0" ||
      asset.license_kind === "cc_by" ||
      asset.license_kind === "cc_by_4_0")
  );
}

export function isManualCc0PublicSceneCandidate(
  asset: MyWayAssetRecord,
) {
  return (
    asset.source_type === "manual" &&
    asset.license_kind === "cc0" &&
    asset.commercial_use_allowed &&
    asset.raw_redistribution_allowed
  );
}

export function buildManualCc0LicenseReview(
  asset: MyWayAssetRecord,
  reviewedAt = new Date().toISOString(),
): MyWayAssetLicenseReviewV1 {
  if (!isManualCc0PublicSceneCandidate(asset)) {
    throw new Error(
      "Manual public-scene approval is only available for manual CC0 assets whose recorded licence allows commercial use and redistribution.",
    );
  }

  const sourceProvider =
    asset.attribution?.source_provider?.trim() ||
    "Manual CC0 source";
  const sourceUrl = asset.source_url?.trim() || null;
  const sourceAssetId =
    asset.source_asset_id?.trim() || null;
  const assetTitle =
    asset.attribution?.asset_title?.trim() ||
    asset.source_display_name?.trim() ||
    asset.display_name?.trim() ||
    asset.canonical_label;

  return {
    schema_version: "myway_asset_license_review_v1",
    review_id: `${asset.asset_id}_manual_cc0_review_v1`,
    asset_id: asset.asset_id,
    decision: "approved_public_distribution",
    reviewed_by:
      "MyWay user-confirmed manual CC0 intake review",
    reviewed_at: reviewedAt,
    basis: [
      {
        label: sourceUrl
          ? `${sourceProvider} source page`
          : `${sourceProvider} acquisition record`,
        url: sourceUrl,
        finding: sourceAssetId
          ? `The reviewer confirmed the recorded ${sourceProvider} source, asset ID ${sourceAssetId}, and CC0 licence for ${assetTitle}.`
          : `The reviewer confirmed the recorded ${sourceProvider} source and CC0 licence for ${assetTitle}.`,
      },
      {
        label: "MyWay manual acquisition record",
        url: sourceUrl,
        finding:
          "The model was manually selected and downloaded, its original file was preserved, and its normalized runtime copy retains the recorded provenance metadata.",
      },
    ],
    attestations: {
      reviewed_source_terms: true,
      production_use_allowed: true,
      public_raw_distribution_allowed: true,
      commercial_use_allowed: true,
      no_known_third_party_restrictions: true,
      generic_or_authorized_subject: true,
    },
    notes:
      "The reviewer explicitly confirmed the recorded source, CC0 licence, redistribution permission, and absence of known third-party restrictions before public scene use.",
  };
}

export function buildPolyPizzaManualLicenseReview(
  asset: MyWayAssetRecord,
  reviewedAt = new Date().toISOString(),
): MyWayAssetLicenseReviewV1 {
  if (!isPolyPizzaManualLicenseCandidate(asset)) {
    throw new Error(
      "Manual public-scene approval is only available for Poly Pizza assets recorded as CC0, CC BY, or CC BY 4.0.",
    );
  }

  const attribution = asset.attribution;
  if (!attribution) {
    throw new Error(
      "The Poly Pizza asset has no structured attribution record.",
    );
  }

  const sourceUrl = asset.source_url?.trim() ?? "";
  const sourceAssetId = asset.source_asset_id?.trim() ?? "";
  if (!/^https:\/\/poly\.pizza\/m\/[A-Za-z0-9_-]+$/i.test(sourceUrl)) {
    throw new Error(
      "The Poly Pizza asset must preserve its canonical https://poly.pizza/m/<id> source page before public-scene approval.",
    );
  }
  if (!sourceAssetId) {
    throw new Error(
      "The Poly Pizza source asset ID is required before public-scene approval.",
    );
  }
  if (
    attribution.source_asset_id?.trim() !== sourceAssetId ||
    attribution.source_url?.trim() !== sourceUrl
  ) {
    throw new Error(
      "The Poly Pizza attribution source ID and source page must match the asset provenance record.",
    );
  }
  if (
    !asset.commercial_use_allowed ||
    !asset.raw_redistribution_allowed
  ) {
    throw new Error(
      "The recorded Poly Pizza licence does not allow both commercial use and raw redistribution.",
    );
  }

  const expectedLicenseName =
    asset.license_kind === "cc0"
      ? "CC0"
      : asset.license_kind === "cc_by_4_0"
        ? "CC BY 4.0"
        : "CC BY";
  if (attribution.license_name !== expectedLicenseName) {
    throw new Error(
      `The Poly Pizza attribution licence must be ${expectedLicenseName}.`,
    );
  }

  for (const [label, value] of [
    ["asset title", attribution.asset_title],
    ["creator name", attribution.creator_name],
    ["source provider", attribution.source_provider],
    ["source asset ID", attribution.source_asset_id],
    ["source page", attribution.source_url],
    ["modification notice", attribution.modification_notice],
  ] as const) {
    if (!value?.trim()) {
      throw new Error(
        `The Poly Pizza ${label} is required before public-scene approval.`,
      );
    }
  }

  const attributionIssues =
    attributionCompletenessIssues(attribution);
  if (attributionIssues.length) {
    throw new Error(
      `The Poly Pizza attribution record is incomplete: ${attributionIssues.join(
        "; ",
      )}.`,
    );
  }

  return {
    schema_version: "myway_asset_license_review_v1",
    review_id:
      `${asset.asset_id}_poly_pizza_${asset.license_kind}_review_v1`,
    asset_id: asset.asset_id,
    decision: "approved_public_distribution",
    reviewed_by:
      "MyWay user-confirmed Poly Pizza manual intake review",
    reviewed_at: reviewedAt,
    basis: [
      {
        label: "Poly Pizza model page",
        url: sourceUrl,
        finding:
          `The reviewer confirmed the stored Poly Pizza page, model ID ${sourceAssetId}, creator, and ${expectedLicenseName} licence record.`,
      },
      {
        label: "MyWay manual acquisition record",
        url: sourceUrl,
        finding:
          "The model was manually selected and downloaded, its original file was preserved, and its normalized runtime copy retains structured provenance and credit metadata.",
      },
    ],
    attestations: {
      reviewed_source_terms: true,
      production_use_allowed: true,
      public_raw_distribution_allowed: true,
      commercial_use_allowed: true,
      no_known_third_party_restrictions: true,
      generic_or_authorized_subject: true,
    },
    attribution: {
      required: attribution.required,
      text: attribution.text?.trim() ?? "",
      license: expectedLicenseName,
      license_url: attribution.license_url,
      creator_name: attribution.creator_name,
      source_url: sourceUrl,
      source_asset_id: sourceAssetId,
      modification_notice:
        attribution.modification_notice,
    },
    notes:
      "The reviewer explicitly confirmed the stored Poly Pizza source, licence, creator credit, redistribution permission, and absence of known third-party restrictions before public scene use.",
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

  if (review.decision !== "approved_public_distribution") {
    blockers.push(
      "License review decision is not approved_public_distribution.",
    );
  }

  const requiredAttestations = [
    "reviewed_source_terms",
    "production_use_allowed",
    "public_raw_distribution_allowed",
    "commercial_use_allowed",
    "no_known_third_party_restrictions",
    "generic_or_authorized_subject",
  ] as const;

  for (const key of requiredAttestations) {
    if (!review.attestations[key]) {
      blockers.push(`License attestation is false: ${key}`);
    }
  }

  if (
    isAttributionRequiredLicense(
      asset.license_kind,
    )
  ) {
    const issues =
      attributionCompletenessIssues(
        asset.attribution,
      );
    for (const issue of issues) {
      blockers.push(
        `Asset attribution is incomplete: ${issue}.`,
      );
    }
    if (!review.attribution?.required) {
      blockers.push(
        "Approved CC BY review must explicitly require attribution.",
      );
    }
    if (
      !review.attribution?.text?.trim()
    ) {
      blockers.push(
        "Approved CC BY review must preserve attribution text.",
      );
    }
    if (
      review.attribution?.text?.trim() &&
      asset.attribution?.text?.trim() &&
      review.attribution.text.trim() !==
        asset.attribution.text.trim()
    ) {
      blockers.push(
        "Approved review attribution text does not match the asset attribution record.",
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
  const blockers = publicPromotionBlockers(asset, review);

  if (blockers.length > 0) {
    throw new Error(
      `Asset cannot be promoted publicly:\n- ${blockers.join("\n- ")}`,
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
