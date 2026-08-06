import type {
  MyWayAssetAttributionV1,
  MyWayAssetLicenseKind,
  MyWayAssetRecord,
  MyWayThirdPartyAssetCreditV1,
  MyWayThirdPartyAssetManifestV1,
} from "./asset-types";

export const ATTRIBUTION_REQUIRED_LICENSE_KINDS = [
  "cc_by",
  "cc_by_4_0",
] as const;

function cleanText(
  value: unknown,
  maxLength = 1200,
) {
  return typeof value === "string"
    ? value
        .replace(/\u0000/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength) || null
    : null;
}

function record(
  value: unknown,
): Record<string, unknown> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function isAttributionRequiredLicense(
  kind: MyWayAssetLicenseKind,
) {
  return (
    kind === "cc_by" ||
    kind === "cc_by_4_0"
  );
}

export function licenseNameForKind(
  kind: MyWayAssetLicenseKind,
) {
  if (kind === "cc0") return "CC0";
  if (kind === "cc_by") return "CC BY";
  if (kind === "cc_by_4_0") return "CC BY 4.0";
  if (kind === "self_owned") return "Self-owned rights";
  if (kind === "royalty_free") return "Royalty-free";
  return "Unknown";
}

export function licenseVersionForKind(
  kind: MyWayAssetLicenseKind,
) {
  return kind === "cc_by_4_0" ? "4.0" : null;
}

export function licenseUrlForKind(
  kind: MyWayAssetLicenseKind,
) {
  if (kind === "cc0") {
    return "https://creativecommons.org/publicdomain/zero/1.0/";
  }
  if (kind === "cc_by_4_0") {
    return "https://creativecommons.org/licenses/by/4.0/";
  }
  return null;
}

export function licensePolicyForKind(
  kind: MyWayAssetLicenseKind,
) {
  if (
    kind === "cc0" ||
    kind === "cc_by" ||
    kind === "cc_by_4_0"
  ) {
    return {
      licenseStatus: "recorded" as const,
      commercialUseAllowed: true,
      rawRedistributionAllowed: true,
    };
  }

  if (
    kind === "self_owned" ||
    kind === "royalty_free"
  ) {
    return {
      licenseStatus: "recorded" as const,
      commercialUseAllowed: true,
      rawRedistributionAllowed: false,
    };
  }

  return {
    licenseStatus: "needs_review" as const,
    commercialUseAllowed: false,
    rawRedistributionAllowed: false,
  };
}

export type BuildAssetAttributionInput = {
  licenseKind: MyWayAssetLicenseKind;
  attributionText?: string | null;
  assetTitle?: string | null;
  creatorName?: string | null;
  sourceProvider?: string | null;
  sourceAssetId?: string | null;
  sourceUrl?: string | null;
  modificationNotice?: string | null;
  downloadedAt?: string | null;
  licenseName?: string | null;
  licenseVersion?: string | null;
  licenseUrl?: string | null;
};

export function buildAssetAttribution(
  input: BuildAssetAttributionInput,
): MyWayAssetAttributionV1 {
  const required =
    isAttributionRequiredLicense(
      input.licenseKind,
    );

  return {
    schema_version:
      "myway_asset_attribution_v1",
    required,
    text: cleanText(
      input.attributionText,
      1200,
    ),
    asset_title: cleanText(
      input.assetTitle,
      240,
    ),
    creator_name: cleanText(
      input.creatorName,
      240,
    ),
    source_provider: cleanText(
      input.sourceProvider,
      160,
    ),
    source_asset_id: cleanText(
      input.sourceAssetId,
      240,
    ),
    source_url: cleanText(
      input.sourceUrl,
      1000,
    ),
    license_name:
      cleanText(
        input.licenseName,
        160,
      ) ??
      licenseNameForKind(
        input.licenseKind,
      ),
    license_version:
      cleanText(
        input.licenseVersion,
        40,
      ) ??
      licenseVersionForKind(
        input.licenseKind,
      ),
    license_url:
      cleanText(
        input.licenseUrl,
        1000,
      ) ??
      licenseUrlForKind(
        input.licenseKind,
      ),
    modification_notice: cleanText(
      input.modificationNotice,
      1000,
    ),
    downloaded_at: cleanText(
      input.downloadedAt,
      80,
    ),
  };
}

function attributionTextFromNotes(
  notes: string | null | undefined,
) {
  const value = cleanText(notes, 2000);
  if (!value) return null;

  const labelled = value.match(
    /(?:^|\s)Attribution:\s*(.+?)(?=\s(?:Input|The original|Review|Promoted|Licence|License):|$)/i,
  )?.[1];

  return cleanText(labelled, 1200) ?? value;
}

export function normalizeAssetAttribution(
  raw: unknown,
  fallback: BuildAssetAttributionInput & {
    notes?: string | null;
  },
): MyWayAssetAttributionV1 | null {
  const item = record(raw);
  const required =
    isAttributionRequiredLicense(
      fallback.licenseKind,
    );
  const hasFallback = Boolean(
    fallback.attributionText ||
      fallback.assetTitle ||
      fallback.creatorName ||
      fallback.sourceProvider ||
      fallback.sourceAssetId ||
      fallback.sourceUrl ||
      fallback.modificationNotice ||
      fallback.downloadedAt,
  );

  if (!item && !required && !hasFallback) {
    return null;
  }

  return buildAssetAttribution({
    licenseKind: fallback.licenseKind,
    attributionText:
      cleanText(item?.text, 1200) ??
      cleanText(
        fallback.attributionText,
        1200,
      ) ??
      (required
        ? attributionTextFromNotes(
            fallback.notes,
          )
        : null),
    assetTitle:
      cleanText(
        item?.asset_title,
        240,
      ) ?? fallback.assetTitle,
    creatorName:
      cleanText(
        item?.creator_name,
        240,
      ) ?? fallback.creatorName,
    sourceProvider:
      cleanText(
        item?.source_provider,
        160,
      ) ?? fallback.sourceProvider,
    sourceAssetId:
      cleanText(
        item?.source_asset_id,
        240,
      ) ?? fallback.sourceAssetId,
    sourceUrl:
      cleanText(
        item?.source_url,
        1000,
      ) ?? fallback.sourceUrl,
    modificationNotice:
      cleanText(
        item?.modification_notice,
        1000,
      ) ?? fallback.modificationNotice,
    downloadedAt:
      cleanText(
        item?.downloaded_at,
        80,
      ) ?? fallback.downloadedAt,
    licenseName:
      cleanText(
        item?.license_name,
        160,
      ) ?? fallback.licenseName,
    licenseVersion:
      cleanText(
        item?.license_version,
        40,
      ) ?? fallback.licenseVersion,
    licenseUrl:
      cleanText(
        item?.license_url,
        1000,
      ) ?? fallback.licenseUrl,
  });
}

export function attributionCompletenessIssues(
  attribution:
    | MyWayAssetAttributionV1
    | null
    | undefined,
) {
  if (!attribution?.required) {
    return [];
  }

  const issues: string[] = [];
  if (!attribution.text?.trim()) {
    issues.push(
      "attribution text is required",
    );
  }
  if (!attribution.source_url?.trim()) {
    issues.push(
      "source URL is required",
    );
  }
  if (!attribution.source_asset_id?.trim()) {
    issues.push(
      "stable source asset ID is required",
    );
  }
  if (!attribution.license_name?.trim()) {
    issues.push(
      "license name is required",
    );
  }
  if (!attribution.modification_notice?.trim()) {
    issues.push(
      "modification notice is required",
    );
  }
  if (
    !attribution.creator_name?.trim() &&
    !attribution.text?.trim()
  ) {
    issues.push(
      "creator name or creator-supplied credit is required",
    );
  }
  return issues;
}

export function buildThirdPartyAssetCredit(
  asset: MyWayAssetRecord,
): MyWayThirdPartyAssetCreditV1 | null {
  const attribution = asset.attribution;
  if (
    !attribution?.required ||
    !attribution.text
  ) {
    return null;
  }

  return {
    schema_version:
      "myway_third_party_asset_credit_v1",
    asset_id: asset.asset_id,
    asset_title:
      attribution.asset_title ??
      asset.display_name,
    creator_name:
      attribution.creator_name,
    source_provider:
      attribution.source_provider,
    source_asset_id:
      attribution.source_asset_id ??
      asset.source_asset_id ??
      null,
    source_url:
      attribution.source_url ??
      asset.source_url ??
      null,
    license_kind:
      asset.license_kind,
    license_name:
      attribution.license_name,
    license_version:
      attribution.license_version,
    license_url:
      attribution.license_url,
    attribution_text:
      attribution.text,
    modification_notice:
      attribution.modification_notice,
  };
}

export function buildThirdPartyAssetManifest(
  assets: MyWayAssetRecord[],
  generatedAt = new Date().toISOString(),
): MyWayThirdPartyAssetManifestV1 {
  const seen = new Set<string>();
  const credits: MyWayThirdPartyAssetCreditV1[] = [];

  for (const asset of assets) {
    const credit =
      buildThirdPartyAssetCredit(asset);
    if (!credit) continue;

    const key = [
      credit.source_provider ?? "",
      credit.source_asset_id ?? "",
      credit.attribution_text,
    ].join("|").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    credits.push(credit);
  }

  return {
    schema_version:
      "myway_third_party_assets_v1",
    generated_at: generatedAt,
    assets: credits.sort((left, right) =>
      (left.asset_title ?? left.asset_id)
        .localeCompare(
          right.asset_title ?? right.asset_id,
        ),
    ),
  };
}

export function renderThirdPartyAssetLicensesText(
  manifest: MyWayThirdPartyAssetManifestV1,
) {
  const lines = [
    "MyWay third-party asset credits",
    `Generated: ${manifest.generated_at}`,
    "",
  ];

  for (const credit of manifest.assets) {
    lines.push(credit.attribution_text);
    lines.push(
      `License: ${credit.license_name}${
        credit.license_version &&
        !credit.license_name.includes(
          credit.license_version,
        )
          ? ` ${credit.license_version}`
          : ""
      }`,
    );
    if (credit.source_url) {
      lines.push(
        `Source: ${credit.source_url}`,
      );
    }
    if (credit.modification_notice) {
      lines.push(
        `Changes: ${credit.modification_notice}`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}
