import { createHash } from "node:crypto";

import type { MyWayAssetRecord } from "./asset-types";
import { safeAssetId } from "./normalize-asset-record";

export type MyWayAssetProviderCode =
  | "polyp"
  | "acg"
  | "bk"
  | "trl"
  | "proc"
  | "man"
  | "unknown";

export type MyWayAssetIdentityProposal = {
  asset_id: string;
  provider_code: MyWayAssetProviderCode;
  provider_label: string;
  provider_confidence: "high" | "medium" | "low";
  current_display_name: string;
  proposed_display_name: string;
  current_canonical_label: string;
  proposed_canonical_label: string;
  current_asset_id: string;
  proposed_asset_id: string;
  technical_id_change: boolean;
  semantic_change: boolean;
  safe_to_auto_rename: boolean;
  reasons: string[];
};

function normalizedProvider(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function titleWords(value: string) {
  return value
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stableAssetIdentitySuffix(value: string) {
  return createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 8);
}

export function providerCodeFromIdentity(input: {
  sourceProvider?: string | null;
  sourceType?: MyWayAssetRecord["source_type"] | null;
  assetId?: string | null;
  sourceUrl?: string | null;
  sourceDisplayName?: string | null;
}) {
  const provider = normalizedProvider(
    input.sourceProvider || input.sourceDisplayName,
  );
  const url = normalizedProvider(input.sourceUrl);
  const assetId = String(input.assetId ?? "").toLowerCase();

  if (
    provider.includes("poly pizza") ||
    url.includes("poly.pizza") ||
    assetId.includes("_polyp_")
  ) {
    return {
      code: "polyp" as const,
      label: "Poly Pizza",
      confidence: provider.includes("poly pizza") || url.includes("poly.pizza")
        ? "high" as const
        : "medium" as const,
    };
  }

  if (
    provider.includes("ambientcg") ||
    url.includes("ambientcg.com") ||
    assetId.includes("_acg_")
  ) {
    return {
      code: "acg" as const,
      label: "ambientCG",
      confidence: provider.includes("ambientcg") || url.includes("ambientcg.com")
        ? "high" as const
        : "medium" as const,
    };
  }

  if (
    provider.includes("blenderkit") ||
    provider.includes("blendkit") ||
    url.includes("blenderkit.com") ||
    input.sourceType === "blenderkit" ||
    assetId.includes("_bk_")
  ) {
    return {
      code: "bk" as const,
      label: "BlenderKit",
      confidence:
        provider.includes("blenderkit") ||
        provider.includes("blendkit") ||
        input.sourceType === "blenderkit"
          ? "high" as const
          : "medium" as const,
    };
  }

  if (
    provider.includes("trellis") ||
    input.sourceType === "trellis" ||
    assetId.includes("_tr_") ||
    assetId.includes("_trl_")
  ) {
    return {
      code: "trl" as const,
      label: "TRELLIS",
      confidence:
        provider.includes("trellis") || input.sourceType === "trellis"
          ? "high" as const
          : "medium" as const,
    };
  }

  if (
    provider.includes("glm") ||
    provider.includes("procedural") ||
    input.sourceType === "procedural" ||
    assetId.includes("_proc_")
  ) {
    return {
      code: "proc" as const,
      label: "Procedural",
      confidence:
        provider.includes("glm") ||
        provider.includes("procedural") ||
        input.sourceType === "procedural"
          ? "high" as const
          : "medium" as const,
    };
  }

  if (
    input.sourceType === "manual" ||
    provider.includes("manual") ||
    assetId.includes("_man_")
  ) {
    return {
      code: "man" as const,
      label: provider && !provider.includes("manual")
        ? input.sourceProvider!.trim()
        : "Manual",
      confidence:
        provider && !provider.includes("manual")
          ? "medium" as const
          : "low" as const,
    };
  }

  return {
    code: "unknown" as const,
    label: input.sourceProvider?.trim() || "Unknown",
    confidence: "low" as const,
  };
}

export function buildProviderAwareAssetId(input: {
  concept: string;
  sourceProvider?: string | null;
  sourceType?: MyWayAssetRecord["source_type"] | null;
  sourceAssetId?: string | null;
  sourceUrl?: string | null;
  sourceDisplayName?: string | null;
  contentHash?: string | null;
  originalFileName?: string | null;
}) {
  const base = safeAssetId(input.concept) || "asset";
  const provider = providerCodeFromIdentity({
    sourceProvider: input.sourceProvider,
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
    sourceDisplayName: input.sourceDisplayName,
  });
  const providerCode =
    provider.code === "unknown"
      ? "man"
      : provider.code;
  const durableIdentityParts = [
    input.sourceAssetId?.trim() || "",
    input.sourceUrl?.trim() || "",
    input.contentHash?.trim() || "",
  ];
  const hasDurableIdentity =
    durableIdentityParts.some(Boolean);
  const identitySeed = [
    provider.label.toLowerCase(),
    ...(hasDurableIdentity
      ? durableIdentityParts
      : [
          input.originalFileName?.trim() || "",
          input.concept.trim().toLowerCase(),
        ]),
  ].join("|");
  return `${base}_${providerCode}_${stableAssetIdentitySuffix(identitySeed)}`;
}

function semanticLabel(asset: MyWayAssetRecord) {
  const verified = asset.verified_canonical_label?.trim();
  if (verified) return verified.toLowerCase().replace(/\s+/g, " ");

  const canonical = asset.canonical_label?.trim();
  if (canonical) {
    const cleaned = titleWords(canonical)
      .replace(/\b(?:polyp|acg|bk|trl|tr|proc|man)\b/gi, " ")
      .replace(/\b[a-f0-9]{8}\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned) return cleaned.toLowerCase();
  }

  const display = titleWords(asset.display_name || asset.asset_id);
  return display.toLowerCase() || "asset";
}

export function proposeAssetIdentity(
  asset: MyWayAssetRecord,
): MyWayAssetIdentityProposal {
  const provider = providerCodeFromIdentity({
    sourceProvider: asset.attribution?.source_provider ?? null,
    sourceType: asset.source_type,
    assetId: asset.asset_id,
    sourceUrl: asset.source_url ?? null,
    sourceDisplayName: asset.source_display_name ?? null,
  });
  const canonical = semanticLabel(asset);
  const display =
    titleWords(
      asset.attribution?.asset_title ||
      asset.source_display_name?.split(":").slice(1).join(":") ||
      asset.display_name ||
      canonical,
    ) || canonical;
  const computedProviderId =
    buildProviderAwareAssetId({
      concept: canonical,
      sourceProvider:
        asset.attribution?.source_provider ??
        asset.source_display_name?.split(":")[0] ??
        null,
      sourceType: asset.source_type,
      sourceAssetId: asset.source_asset_id ?? null,
      sourceUrl: asset.source_url ?? null,
      sourceDisplayName: asset.source_display_name ?? null,
      contentHash: asset.content_hash ?? null,
      // Never seed a proposed identity from the current technical ID. Doing so
      // would make every successful rename propose a different rename on the
      // next audit. Existing assets use durable provenance/content instead.
      originalFileName: null,
    });
  const semanticSlug = safeAssetId(canonical) || "asset";
  const providerCode =
    provider.code === "unknown" ? "man" : provider.code;
  const escapedBase = semanticSlug.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const escapedProvider = providerCode.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const structurallyCurrent = new RegExp(
    `^${escapedBase}_${escapedProvider}_[a-z0-9]{6,32}$`,
    "i",
  ).test(asset.asset_id);
  const hasTechnicalDebris =
    /_(?:zip|glb|gltf|fbx|obj|blend)(?:_|$)/i.test(asset.asset_id) ||
    /_pending_/i.test(asset.asset_id) ||
    (
      provider.code === "polyp" &&
      asset.asset_id.toLowerCase().includes("ugiy7ycqp9")
    );
  // Existing provider-aware IDs such as soldier_polyp_<id>, *_acg_<suffix>,
  // and *_bk_<suffix> are already healthy. Preserve them instead of causing
  // mass churn just because the new importer uses a hash-backed suffix.
  const proposedId =
    structurallyCurrent && !hasTechnicalDebris
      ? asset.asset_id
      : computedProviderId;

  const reasons: string[] = [];
  if (asset.asset_id !== proposedId) {
    reasons.push("Technical ID does not match the provider-aware semantic naming convention.");
  }
  if (/_(?:zip|glb|gltf|fbx|obj|blend)(?:_|$)/i.test(asset.asset_id)) {
    reasons.push("A file/archive token leaked into the technical ID.");
  }
  if (
    provider.code === "polyp" &&
    asset.asset_id.toLowerCase().includes("ugiy7ycqp9")
  ) {
    reasons.push("The Office Pack bundle ID leaked into the per-asset technical ID.");
  }
  if (
    asset.display_name === asset.asset_id ||
    /_(?:polyp|acg|bk|trl|tr|proc|man)_/i.test(asset.display_name)
  ) {
    reasons.push("The technical ID is being exposed as the display name.");
  }

  const semanticChange =
    canonical !==
    (asset.verified_canonical_label || asset.canonical_label)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  const safeToAutoRename =
    asset.scene_review_status !== "approved" &&
    provider.confidence === "high" &&
    Boolean(
      asset.source_asset_id?.trim() ||
      asset.source_url?.trim() ||
      asset.content_hash?.trim(),
    );

  return {
    asset_id: asset.asset_id,
    provider_code: provider.code,
    provider_label: provider.label,
    provider_confidence: provider.confidence,
    current_display_name: asset.display_name,
    proposed_display_name: display,
    current_canonical_label:
      asset.verified_canonical_label || asset.canonical_label,
    proposed_canonical_label: canonical,
    current_asset_id: asset.asset_id,
    proposed_asset_id: proposedId,
    technical_id_change: asset.asset_id !== proposedId,
    semantic_change: semanticChange,
    safe_to_auto_rename: safeToAutoRename,
    reasons,
  };
}
