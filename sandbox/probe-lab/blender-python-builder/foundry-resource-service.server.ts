
import path from "node:path";

import {
  cacheAmbientCgAsset,
} from "../assets/catalog/ambientcg/ambientcg-download.server";
import {
  hydrateAmbientCgHdri,
  hydrateAmbientCgMaterial,
} from "../assets/catalog/ambientcg/ambientcg-hydration.server";
import {
  readAmbientCgCatalog,
  readAmbientCgHdriRegistry,
  readAmbientCgMaterialAppearanceRegistry,
  readAmbientCgMaterialRegistry,
} from "../assets/catalog/ambientcg/ambientcg-store.server";
import type {
  AmbientCgCachedHdri,
  AmbientCgCachedMaterial,
  AmbientCgCatalogAsset,
  AmbientCgMaterialAppearanceProfile,
  AmbientCgMaterialMaps,
} from "../assets/catalog/ambientcg/ambientcg-types";
import type {
  AssetDesignBriefV2,
  AssetMaterialSlotIntentV2,
  FoundryQualityMode,
} from "./asset-design-brief";
import {
  foundryResourceWords,
  foundryResourceWordSet,
  scoreFoundryResourceWords,
  scoreEnvironmentCompatibility,
  scoreMaterialAppearanceCompatibility,
  scoreMaterialFamilyCompatibility,
} from "./foundry-resource-ranking";
import {
  FOUNDRY_RESOURCE_PLAN_SCHEMA_VERSION,
  normalizeFoundryResourcePlan,
  summarizeFoundryResourcePlan,
  type FoundryEnvironmentBindingPlan,
  type FoundryMaterialBindingPlan,
  type FoundryResourceCandidate,
  type FoundryResourcePlanV1,
} from "./foundry-resource-plan";
import {
  normalizeFoundryLookAdjustments,
  type FoundryLookAdjustmentsV1,
  type FoundryMaterialSlotLookAdjustmentV1,
} from "./foundry-look-adjustments";

const MATERIAL_MAP_KEYS =
  new Set<keyof AmbientCgMaterialMaps>([
    "base_color",
    "normal_gl",
    "normal_dx",
    "roughness",
    "metallic",
    "ambient_occlusion",
    "height",
    "opacity",
    "emission",
  ]);

function preferredResolution(
  quality:
    FoundryQualityMode,
) {
  if (quality === "draft") {
    return [
      "1K",
      "2K",
      "4K",
    ];
  }
  if (quality === "hero") {
    return [
      "4K",
      "8K",
      "2K",
      "1K",
    ];
  }
  return [
    "2K",
    "4K",
    "1K",
  ];
}

function variantLooksLikeZip(
  variant:
    AmbientCgCatalogAsset["download_variants"][number],
) {
  if (variant.archive_format === "ZIP") {
    return true;
  }

  try {
    const parsed = new URL(variant.url);
    return (
      parsed.pathname.toLowerCase().endsWith(".zip") ||
      (parsed.searchParams.get("file") ?? "")
        .toLowerCase()
        .endsWith(".zip")
    );
  } catch {
    return variant.url
      .toLowerCase()
      .includes(".zip");
  }
}

function chooseVariant(
  asset:
    AmbientCgCatalogAsset,
  quality:
    FoundryQualityMode,
) {
  const resolutions =
    preferredResolution(
      quality,
    );
  const formats =
    asset.asset_type ===
      "hdri"
      ? [
          "HDR",
          "EXR",
          "JPG",
        ]
      : [
          "JPG",
          "PNG",
        ];
  const eligible =
    asset.download_variants.filter(
      (variant) =>
        asset.asset_type === "hdri" ||
        variantLooksLikeZip(variant),
    );

  for (const resolution of
    resolutions) {
    for (const format of
      formats) {
      const match =
        eligible.find(
          (variant) =>
            variant.resolution ===
              resolution &&
            variant.file_format ===
              format,
        );
      if (match) {
        return match;
      }
    }
  }

  return null;
}

function mapAvailability(
  material:
    AmbientCgCachedMaterial,
) {
  return Object.entries(
    material.maps,
  )
    .filter(
      (
        entry,
      ): entry is [
        keyof AmbientCgMaterialMaps,
        string,
      ] =>
        MATERIAL_MAP_KEYS.has(
          entry[0] as keyof AmbientCgMaterialMaps,
        ) &&
        typeof entry[1] ===
          "string" &&
        Boolean(entry[1]),
    )
    .map(
      ([key]) =>
        key,
    );
}

function requiredMapsForSlot(
  slot:
    AssetMaterialSlotIntentV2,
  quality:
    FoundryQualityMode,
) {
  const special =
    slot.required_maps.filter(
      (map) =>
        map === "opacity" ||
        map === "emission" ||
        map === "metallic",
    );
  const baseline:
    Array<
      keyof AmbientCgMaterialMaps
    > =
      quality === "draft"
        ? [
            "base_color",
            "roughness",
          ]
        : quality === "standard"
          ? [
              "base_color",
              "roughness",
              "normal_gl",
            ]
          : slot.required_maps;

  return Array.from(
    new Set([
      ...baseline,
      ...special,
    ]),
  );
}

function hasRequiredMap(
  available:
    Array<
      keyof AmbientCgMaterialMaps
    >,
  required:
    keyof AmbientCgMaterialMaps,
) {
  if (required === "normal_gl") {
    return (
      available.includes(
        "normal_gl",
      ) ||
      available.includes(
        "normal_dx",
      )
    );
  }
  return available.includes(
    required,
  );
}

function missingRequiredMaps(
  available:
    Array<
      keyof AmbientCgMaterialMaps
    >,
  required:
    Array<
      keyof AmbientCgMaterialMaps
    >,
) {
  return required.filter(
    (map) =>
      !hasRequiredMap(
        available,
        map,
      ),
  );
}

function clampConfidence(
  value: number,
) {
  return Math.max(
    0,
    Math.min(1, value),
  );
}

function cachedMaterialCandidate(
  material:
    AmbientCgCachedMaterial,
  slot:
    AssetMaterialSlotIntentV2,
  quality:
    FoundryQualityMode,
  requestWords:
    Set<string>,
  preferred:
    FoundryResourceCandidate | null,
  profile:
    AmbientCgMaterialAppearanceProfile | null,
): FoundryResourceCandidate | null {
  const identityWords =
    foundryResourceWords([
      material.display_name,
      material.source_asset_id,
      ...material.semantic_tags,
      profile?.summary,
    ]);
  const family =
    scoreMaterialFamilyCompatibility(
      slot,
      identityWords,
    );
  if (!family.compatible) {
    return null;
  }
  const appearance =
    scoreMaterialAppearanceCompatibility(
      slot,
      profile,
    );
  if (!appearance.compatible) {
    return null;
  }
  const lexical =
    scoreFoundryResourceWords(
      requestWords,
      identityWords,
    );
  const available =
    mapAvailability(
      material,
    );
  const required =
    requiredMapsForSlot(
      slot,
      quality,
    );
  const missing =
    missingRequiredMaps(
      available,
      required,
    );
  if (
    !hasRequiredMap(
      available,
      "base_color",
    )
  ) {
    return null;
  }

  let score =
    family.score +
    appearance.score +
    lexical.score +
    (
      material.published_to_r2 &&
      material.storage_provider ===
        "r2"
        ? 18
        : -120
    ) +
    available.length * 3 -
    missing.length * 20;
  const reasons = [
    ...family.reasons,
    ...appearance.reasons,
    ...lexical.reasons,
  ];

  if (
    preferred?.resource_id ===
      material.resource_id ||
    preferred?.source_asset_id ===
      material.source_asset_id
  ) {
    score += 60;
    reasons.unshift(
      "previous compatible selection",
    );
  }
  if (!missing.length) {
    score += 24;
    reasons.push(
      `all ${quality} maps available`,
    );
  } else {
    reasons.push(
      `missing ${missing.join(", ")}`,
    );
  }

  const matchConfidence =
    clampConfidence(
      0.2 +
      appearance.confidence * 0.35 +
      Math.min(
        0.2,
        lexical.match_count * 0.04,
      ) -
      missing.length * 0.08,
    );

  return {
    candidate_kind:
      "cached_r2",
    resource_id:
      material.resource_id,
    source_asset_id:
      material.source_asset_id,
    variant_id:
      material.variant_id,
    display_name:
      material.display_name,
    preview_url:
      material.preview_url ??
      material.thumbnail_url,
    resolution:
      material.resolution,
    file_format:
      material.file_format,
    score,
    reasons:
      reasons.slice(0, 12),
    published_to_r2:
      material.published_to_r2 ===
        true &&
      material.storage_provider ===
        "r2",
    required_maps_available:
      available,
    missing_required_maps:
      missing,
    appearance_summary:
      profile?.summary ?? null,
    dominant_colors:
      profile?.dominant_colors ?? [],
    brightness:
      profile?.brightness ?? null,
    appearance_confidence:
      profile?.status === "ready"
        ? profile.confidence
        : null,
    match_confidence:
      matchConfidence,
  };
}

function catalogMaterialMapRole(
  value: string,
): keyof AmbientCgMaterialMaps | null {
  const name = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

  if (/normal_?dx|directx/.test(name)) {
    return "normal_dx";
  }
  if (/normal_?gl|opengl/.test(name)) {
    return "normal_gl";
  }
  if (/normal/.test(name)) {
    return "normal_gl";
  }
  if (/rough/.test(name)) {
    return "roughness";
  }
  if (/metal/.test(name)) {
    return "metallic";
  }
  if (/ambient_?occlusion|(?:^|_)ao(?:_|$)/.test(name)) {
    return "ambient_occlusion";
  }
  if (/height|displacement|disp/.test(name)) {
    return "height";
  }
  if (/opacity|alpha|transparency/.test(name)) {
    return "opacity";
  }
  if (/emission|emissive/.test(name)) {
    return "emission";
  }
  if (/base_?colou?r|colou?r|albedo|diffuse|(?:^|_)diff(?:_|$)/.test(name)) {
    return "base_color";
  }

  return null;
}

function catalogMaterialCandidate(
  asset:
    AmbientCgCatalogAsset,
  slot:
    AssetMaterialSlotIntentV2,
  quality:
    FoundryQualityMode,
  requestWords:
    Set<string>,
  preferred:
    FoundryResourceCandidate | null,
  profile:
    AmbientCgMaterialAppearanceProfile | null,
): FoundryResourceCandidate | null {
  const variant =
    chooseVariant(
      asset,
      quality,
    );
  if (!variant) {
    return null;
  }
  const identityWords =
    foundryResourceWords([
      asset.display_name,
      asset.source_asset_id,
      asset.short_description,
      asset.long_description,
      asset.technique,
      ...asset.semantic_tags,
      ...asset.colors,
      ...asset.collections,
      profile?.summary,
    ]);
  const family =
    scoreMaterialFamilyCompatibility(
      slot,
      identityWords,
    );
  if (!family.compatible) {
    return null;
  }
  const appearance =
    scoreMaterialAppearanceCompatibility(
      slot,
      profile,
    );
  if (!appearance.compatible) {
    return null;
  }
  const candidateWords = [
    ...identityWords,
    ...foundryResourceWords(
      asset.maps,
    ),
  ];
  const lexical =
    scoreFoundryResourceWords(
      requestWords,
      candidateWords,
    );
  const normalizedAvailable =
    Array.from(
      new Set(
        asset.maps
          .map(
            catalogMaterialMapRole,
          )
          .filter(
            (
              role,
            ): role is keyof AmbientCgMaterialMaps =>
              Boolean(role),
          ),
      ),
    );
  const required =
    requiredMapsForSlot(
      slot,
      quality,
    );
  const missing =
    missingRequiredMaps(
      normalizedAvailable,
      required,
    );
  if (
    asset.maps.length > 0 &&
    !hasRequiredMap(
      normalizedAvailable,
      "base_color",
    )
  ) {
    return null;
  }

  let score =
    family.score +
    appearance.score +
    lexical.score +
    8 -
    missing.length * 18;
  const reasons = [
    ...family.reasons,
    ...appearance.reasons,
    ...lexical.reasons,
  ];
  if (
    preferred?.source_asset_id ===
    asset.source_asset_id
  ) {
    score += 60;
    reasons.unshift(
      "previous compatible selection",
    );
  }
  if (
    variant.resolution ===
    preferredResolution(
      quality,
    )[0]
  ) {
    score += 12;
    reasons.push(
      `${variant.resolution} ${quality} variant`,
    );
  }
  if (!missing.length) {
    score += 20;
    reasons.push(
      `all ${quality} maps available`,
    );
  } else {
    reasons.push(
      `missing ${missing.join(", ")}`,
    );
  }

  const matchConfidence =
    clampConfidence(
      0.18 +
      appearance.confidence * 0.36 +
      Math.min(
        0.2,
        lexical.match_count * 0.04,
      ) -
      missing.length * 0.08,
    );

  return {
    candidate_kind:
      "ambientcg_catalog",
    resource_id: null,
    source_asset_id:
      asset.source_asset_id,
    variant_id:
      variant.variant_id,
    display_name:
      asset.display_name,
    preview_url:
      asset.preview_urls[0] ??
      asset.thumbnail_urls[0] ??
      null,
    resolution:
      variant.resolution,
    file_format:
      variant.file_format,
    score,
    reasons:
      reasons.slice(0, 12),
    published_to_r2: false,
    required_maps_available:
      normalizedAvailable,
    missing_required_maps:
      missing,
    appearance_summary:
      profile?.summary ?? null,
    dominant_colors:
      profile?.dominant_colors ?? [],
    brightness:
      profile?.brightness ?? null,
    appearance_confidence:
      profile?.status === "ready"
        ? profile.confidence
        : null,
    match_confidence:
      matchConfidence,
  };
}

function fallbackMaterialCandidate(
  slot:
    AssetMaterialSlotIntentV2,
): FoundryResourceCandidate {
  return {
    candidate_kind:
      "procedural",
    resource_id: null,
    source_asset_id: null,
    variant_id: null,
    display_name:
      `${slot.display_name} procedural fallback`,
    preview_url: null,
    resolution: null,
    file_format: null,
    score: 100,
    reasons: [
      "trusted fallback preferred over a weak or incompatible texture match",
    ],
    published_to_r2: false,
    required_maps_available: [],
    missing_required_maps:
      slot.required_maps,
    appearance_summary:
      "Controlled procedural Principled material using the design brief fallback values.",
    dominant_colors: [],
    brightness: null,
    appearance_confidence: null,
    match_confidence: 1,
  };
}

function materialRequestWords(
  slot:
    AssetMaterialSlotIntentV2,
) {
  return foundryResourceWordSet([
    slot.display_name,
    slot.material_family,
    slot.intent,
    slot.color_hint,
    slot.roughness_hint,
    slot.metallic_hint,
    slot.texture_hint,
    slot.brightness_hint,
    ...slot.semantic_tags,
  ]);
}

function resolveMaterialBinding(
  brief:
    AssetDesignBriefV2,
  slot:
    AssetMaterialSlotIntentV2,
  materials:
    AmbientCgCachedMaterial[],
  catalog:
    AmbientCgCatalogAsset[],
  preferred:
    FoundryResourceCandidate | null,
  appearanceById:
    Map<
      string,
      AmbientCgMaterialAppearanceProfile
    >,
): FoundryMaterialBindingPlan {
  const requestWords =
    materialRequestWords(
      slot,
    );
  const cached =
    materials
      .map((material) =>
        cachedMaterialCandidate(
          material,
          slot,
          brief.quality_mode,
          requestWords,
          preferred,
          appearanceById.get(
            material.source_asset_id,
          ) ?? null,
        ),
      )
      .filter(
        (
          candidate,
        ): candidate is
          FoundryResourceCandidate =>
          candidate !== null &&
          candidate.published_to_r2,
      );
  const catalogCandidates =
    catalog
      .filter(
        (asset) =>
          asset.asset_type ===
          "material",
      )
      .map((asset) =>
        catalogMaterialCandidate(
          asset,
          slot,
          brief.quality_mode,
          requestWords,
          preferred,
          appearanceById.get(
            asset.source_asset_id,
          ) ?? null,
        ),
      )
      .filter(
        (
          candidate,
        ): candidate is
          FoundryResourceCandidate =>
          Boolean(candidate),
      );
  const fallback =
    fallbackMaterialCandidate(
      slot,
    );
  const candidates = [
    ...cached,
    ...catalogCandidates,
    fallback,
  ]
    .sort(
      (left, right) =>
        right.score -
        left.score ||
        right.match_confidence -
        left.match_confidence ||
        left.display_name.localeCompare(
          right.display_name,
        ),
    )
    .slice(0, 8);

  const preferredCandidate =
    candidates.find(
      (candidate) =>
        candidate.candidate_kind !==
          "procedural" &&
        candidate.match_confidence >=
          0.58 &&
        (
          (
            preferred?.resource_id &&
            candidate.resource_id ===
              preferred.resource_id
          ) ||
          (
            preferred?.source_asset_id &&
            candidate.source_asset_id ===
              preferred.source_asset_id &&
            (
              !preferred.variant_id ||
              candidate.variant_id ===
                preferred.variant_id
            )
          )
        ),
    );
  const highestTexture =
    candidates.find(
      (candidate) =>
        candidate.candidate_kind !==
        "procedural",
    );
  const selected =
    preferredCandidate ??
    (
      highestTexture &&
      highestTexture.score >=
        fallback.score + 8 &&
      highestTexture.match_confidence >=
        0.55
        ? highestTexture
        : fallback
    );
  const status =
    selected.candidate_kind ===
      "cached_r2"
      ? "ready_r2"
      : selected.candidate_kind ===
          "ambientcg_catalog"
        ? "catalog_match"
        : "procedural_fallback";

  return {
    slot,
    status,
    selected,
    candidates,
    texture_scale_m:
      slot.physical_scale_m,
  };
}

function cachedEnvironmentCandidate(
  environment:
    AmbientCgCachedHdri,
  intent:
    AssetDesignBriefV2["environment"],
  requestWords:
    Set<string>,
  preferred:
    FoundryResourceCandidate | null,
): FoundryResourceCandidate | null {
  const candidateValues = [
    environment.display_name,
    environment.source_asset_id,
    ...environment.semantic_tags,
  ];
  const compatibility =
    scoreEnvironmentCompatibility(
      intent,
      candidateValues,
    );
  if (!compatibility.compatible) {
    return null;
  }
  const lexical =
    scoreFoundryResourceWords(
      requestWords,
      foundryResourceWords(
        candidateValues,
      ),
    );
  let score =
    compatibility.score +
    lexical.score +
    (
      environment.published_to_r2 &&
      environment.storage_provider ===
        "r2"
        ? 18
        : -120
    );
  const reasons = [
    ...compatibility.reasons,
    ...lexical.reasons,
  ];
  if (
    preferred?.resource_id ===
      environment.resource_id ||
    preferred?.source_asset_id ===
      environment.source_asset_id
  ) {
    score += 60;
    reasons.unshift(
      "previous compatible environment selection",
    );
  }

  return {
    candidate_kind:
      "cached_r2",
    resource_id:
      environment.resource_id,
    source_asset_id:
      environment.source_asset_id,
    variant_id:
      environment.variant_id,
    display_name:
      environment.display_name,
    preview_url:
      environment.preview_url ??
      environment.thumbnail_url,
    resolution:
      environment.resolution,
    file_format:
      environment.file_format,
    score,
    reasons:
      reasons.slice(0, 10),
    published_to_r2:
      environment.published_to_r2 ===
        true &&
      environment.storage_provider ===
        "r2",
    required_maps_available: [
      "environment",
    ],
    missing_required_maps: [],
    appearance_summary:
      compatibility.candidate.replaceAll(
        "_",
        " ",
      ),
    dominant_colors: [],
    brightness: null,
    appearance_confidence: null,
    match_confidence:
      compatibility.candidate ===
        compatibility.requested
        ? 0.9
        : 0.65,
  };
}

function catalogEnvironmentCandidate(
  asset:
    AmbientCgCatalogAsset,
  intent:
    AssetDesignBriefV2["environment"],
  quality:
    FoundryQualityMode,
  requestWords:
    Set<string>,
  preferred:
    FoundryResourceCandidate | null,
): FoundryResourceCandidate | null {
  const variant =
    chooseVariant(
      asset,
      quality,
    );
  if (!variant) {
    return null;
  }
  const candidateValues = [
    asset.display_name,
    asset.source_asset_id,
    asset.short_description,
    asset.long_description,
    ...asset.semantic_tags,
    ...asset.collections,
  ];
  const compatibility =
    scoreEnvironmentCompatibility(
      intent,
      candidateValues,
    );
  if (!compatibility.compatible) {
    return null;
  }
  const lexical =
    scoreFoundryResourceWords(
      requestWords,
      foundryResourceWords(
        candidateValues,
      ),
    );
  let score =
    compatibility.score +
    lexical.score +
    8;
  const reasons = [
    ...compatibility.reasons,
    ...lexical.reasons,
  ];
  if (
    preferred?.source_asset_id ===
    asset.source_asset_id
  ) {
    score += 60;
    reasons.unshift(
      "previous compatible environment selection",
    );
  }
  if (
    variant.resolution ===
    preferredResolution(
      quality,
    )[0]
  ) {
    score += 12;
    reasons.push(
      `${variant.resolution} ${quality} variant`,
    );
  }

  return {
    candidate_kind:
      "ambientcg_catalog",
    resource_id: null,
    source_asset_id:
      asset.source_asset_id,
    variant_id:
      variant.variant_id,
    display_name:
      asset.display_name,
    preview_url:
      asset.preview_urls[0] ??
      asset.thumbnail_urls[0] ??
      null,
    resolution:
      variant.resolution,
    file_format:
      variant.file_format,
    score,
    reasons:
      reasons.slice(0, 10),
    published_to_r2: false,
    required_maps_available: [
      "environment",
    ],
    missing_required_maps: [],
    appearance_summary:
      compatibility.candidate.replaceAll(
        "_",
        " ",
      ),
    dominant_colors: [],
    brightness: null,
    appearance_confidence: null,
    match_confidence:
      compatibility.candidate ===
        compatibility.requested
        ? 0.9
        : 0.65,
  };
}

function fallbackEnvironmentCandidate():
  FoundryResourceCandidate {
  return {
    candidate_kind:
      "procedural",
    resource_id: null,
    source_asset_id: null,
    variant_id: null,
    display_name:
      "Trusted neutral studio rig",
    preview_url: null,
    resolution: null,
    file_format: null,
    score: 100,
    reasons: [
      "trusted studio fallback preferred over an unrelated HDRI",
    ],
    published_to_r2: false,
    required_maps_available: [],
    missing_required_maps: [],
    appearance_summary:
      "Neutral product look-development studio.",
    dominant_colors: [],
    brightness: null,
    appearance_confidence: null,
    match_confidence: 1,
  };
}

function resolveEnvironmentBinding(
  brief:
    AssetDesignBriefV2,
  environments:
    AmbientCgCachedHdri[],
  catalog:
    AmbientCgCatalogAsset[],
  preferred:
    FoundryResourceCandidate | null,
): FoundryEnvironmentBindingPlan {
  const requestWords =
    foundryResourceWordSet([
      brief.environment.intent,
      brief.environment
        .preferred_environment_class,
      ...brief.environment
        .semantic_tags,
    ]);
  const cached =
    environments
      .map((environment) =>
        cachedEnvironmentCandidate(
          environment,
          brief.environment,
          requestWords,
          preferred,
        ),
      )
      .filter(
        (
          candidate,
        ): candidate is
          FoundryResourceCandidate =>
          candidate !== null &&
          candidate.published_to_r2,
      );
  const catalogCandidates =
    catalog
      .filter(
        (asset) =>
          asset.asset_type ===
          "hdri",
      )
      .map((asset) =>
        catalogEnvironmentCandidate(
          asset,
          brief.environment,
          brief.quality_mode,
          requestWords,
          preferred,
        ),
      )
      .filter(
        (
          candidate,
        ): candidate is
          FoundryResourceCandidate =>
          Boolean(candidate),
      );
  const fallback =
    fallbackEnvironmentCandidate();
  const candidates = [
    ...cached,
    ...catalogCandidates,
    fallback,
  ]
    .sort(
      (left, right) =>
        right.score -
        left.score ||
        right.match_confidence -
        left.match_confidence ||
        left.display_name.localeCompare(
          right.display_name,
        ),
    )
    .slice(0, 8);

  const preferredCandidate =
    candidates.find(
      (candidate) =>
        candidate.candidate_kind !==
          "procedural" &&
        candidate.match_confidence >=
          0.6 &&
        (
          (
            preferred?.resource_id &&
            candidate.resource_id ===
              preferred.resource_id
          ) ||
          (
            preferred?.source_asset_id &&
            candidate.source_asset_id ===
              preferred.source_asset_id &&
            (
              !preferred.variant_id ||
              candidate.variant_id ===
                preferred.variant_id
            )
          )
        ),
    );
  const highestHdri =
    candidates.find(
      (candidate) =>
        candidate.candidate_kind !==
        "procedural",
    );
  const selected =
    preferredCandidate ??
    (
      highestHdri &&
      highestHdri.score >=
        fallback.score + 5 &&
      highestHdri.match_confidence >=
        0.6
        ? highestHdri
        : fallback
    );
  const status =
    selected.candidate_kind ===
      "cached_r2"
      ? "ready_r2"
      : selected.candidate_kind ===
          "ambientcg_catalog"
        ? "catalog_match"
        : "trusted_studio_fallback";

  return {
    status,
    intent:
      brief.environment,
    selected,
    candidates,
  };
}

export async function resolveFoundryResourcePlan(
  brief:
    AssetDesignBriefV2,
  previousPlan?: unknown,
): Promise<FoundryResourcePlanV1> {
  const [
    materialRegistry,
    materialAppearances,
    hdriRegistry,
    catalog,
  ] = await Promise.all([
    readAmbientCgMaterialRegistry(),
    readAmbientCgMaterialAppearanceRegistry(),
    readAmbientCgHdriRegistry(),
    readAmbientCgCatalog(),
  ]);
  const previous =
    previousPlan
      ? normalizeFoundryResourcePlan(
          previousPlan,
          brief,
        )
      : null;
  const preferredBySlot =
    new Map(
      (
        previous
          ?.material_bindings ??
        []
      ).map((binding) => [
        binding.slot.slot_id,
        binding.selected,
      ]),
    );

  const appearanceById =
    new Map(
      materialAppearances.profiles.map(
        (profile) => [
          profile.source_asset_id,
          profile,
        ],
      ),
    );

  const materialBindings =
    brief.material_slots.map(
      (slot) =>
        resolveMaterialBinding(
          brief,
          slot,
          materialRegistry.materials,
          catalog.assets,
          preferredBySlot.get(
            slot.slot_id,
          ) ?? null,
          appearanceById,
        ),
    );
  const environment =
    resolveEnvironmentBinding(
      brief,
      hdriRegistry.hdris,
      catalog.assets,
      previous?.environment
        .selected ?? null,
    );

  return {
    schema_version:
      FOUNDRY_RESOURCE_PLAN_SCHEMA_VERSION,
    created_at:
      new Date().toISOString(),
    design_brief_asset_id:
      brief.asset_id,
    quality_mode:
      brief.quality_mode,
    material_bindings:
      materialBindings,
    environment,
    summary:
      summarizeFoundryResourcePlan(
        materialBindings,
        environment,
      ),
  };
}

export async function prepareFoundryResources(
  brief:
    AssetDesignBriefV2,
  rawPlan:
    unknown,
) {
  const plan =
    normalizeFoundryResourcePlan(
      rawPlan,
      brief,
    );
  const prepared: Array<{
    kind: "material" | "hdri";
    slot_id: string | null;
    source_asset_id: string;
    variant_id: string | null;
    resource_id: string;
    display_name: string;
  }> = [];

  for (const binding of
    plan.material_bindings) {
    if (
      binding.selected
        .candidate_kind !==
        "ambientcg_catalog" ||
      !binding.selected
        .source_asset_id
    ) {
      continue;
    }

    const result =
      await cacheAmbientCgAsset({
        sourceAssetId:
          binding.selected
            .source_asset_id,
        variantId:
          binding.selected
            .variant_id ??
          undefined,
      });
    prepared.push({
      kind: "material",
      slot_id:
        binding.slot.slot_id,
      source_asset_id:
        result.resource
          .source_asset_id,
      variant_id:
        result.resource
          .variant_id,
      resource_id:
        result.resource
          .resource_id,
      display_name:
        result.resource
          .display_name,
    });
  }

  if (
    plan.environment.selected
      .candidate_kind ===
      "ambientcg_catalog" &&
    plan.environment.selected
      .source_asset_id
  ) {
    const result =
      await cacheAmbientCgAsset({
        sourceAssetId:
          plan.environment
            .selected
            .source_asset_id,
        variantId:
          plan.environment
            .selected
            .variant_id ??
          undefined,
      });
    prepared.push({
      kind: "hdri",
      slot_id: null,
      source_asset_id:
        result.resource
          .source_asset_id,
      variant_id:
        result.resource
          .variant_id,
      resource_id:
        result.resource
          .resource_id,
      display_name:
        result.resource
          .display_name,
    });
  }

  const preferredPlan = {
    ...plan,
    material_bindings:
      plan.material_bindings.map(
        (binding) => {
          const exact =
            prepared.find(
              (entry) =>
                entry.kind ===
                  "material" &&
                entry.slot_id ===
                  binding.slot
                    .slot_id,
            );
          return exact
            ? {
                ...binding,
                selected: {
                  ...binding.selected,
                  candidate_kind:
                    "cached_r2" as const,
                  resource_id:
                    exact.resource_id,
                  source_asset_id:
                    exact.source_asset_id,
                  variant_id:
                    exact.variant_id,
                  display_name:
                    exact.display_name,
                  published_to_r2:
                    true,
                },
              }
            : binding;
        },
      ),
    environment:
      (() => {
        const exact =
          prepared.find(
            (entry) =>
              entry.kind ===
              "hdri",
          );
        return exact
          ? {
              ...plan.environment,
              selected: {
                ...plan.environment
                  .selected,
                candidate_kind:
                  "cached_r2" as const,
                resource_id:
                  exact.resource_id,
                source_asset_id:
                  exact.source_asset_id,
                variant_id:
                  exact.variant_id,
                display_name:
                  exact.display_name,
                published_to_r2:
                  true,
              },
            }
          : plan.environment;
      })(),
  };

  return {
    prepared,
    plan:
      await resolveFoundryResourcePlan(
        brief,
        preferredPlan,
      ),
  };
}

export type BlenderFoundryResourceManifest = {
  schema_version:
    "myway_blender_foundry_resource_manifest_v1";
  created_at: string;
  design_brief_asset_id: string;
  quality_mode:
    FoundryQualityMode;
  material_slots: Record<
    string,
    {
      slot_id: string;
      display_name: string;
      source:
        | "ambientcg_r2"
        | "procedural";
      resource_id:
        | string
        | null;
      source_asset_id:
        | string
        | null;
      variant_id:
        | string
        | null;
      content_sha256:
        | string
        | null;
      maps: Partial<
        Record<
          keyof AmbientCgMaterialMaps,
          string
        >
      >;
      texture_scale_m:
        | number
        | null;
      look:
        FoundryMaterialSlotLookAdjustmentV1;
      fallback: {
        color_rgba:
          [number, number, number, number];
        metallic: number;
        roughness: number;
      };
    }
  >;
  part_material_slots:
    Record<string, string>;
  environment: {
    source:
      | "ambientcg_r2"
      | "trusted_studio";
    resource_id:
      | string
      | null;
    source_asset_id:
      | string
      | null;
    variant_id:
      | string
      | null;
    content_sha256:
      | string
      | null;
    environment_path:
      | string
      | null;
    strength: number;
    rotation_degrees: number;
    exposure: number;
    background_visible: boolean;
    fallback_light_energy_scale: number;
  };
  look_adjustments:
    FoundryLookAdjustmentsV1;
};

export async function hydrateFoundryResourcesForBlender(
  brief:
    AssetDesignBriefV2,
  rawPlan:
    unknown,
  rawLookAdjustments?:
    unknown,
): Promise<
  BlenderFoundryResourceManifest
> {
  const plan =
    normalizeFoundryResourcePlan(
      rawPlan,
      brief,
    );
  const lookAdjustments =
    normalizeFoundryLookAdjustments(
      rawLookAdjustments,
      brief,
      plan,
    );
  const materialSlots:
    BlenderFoundryResourceManifest[
      "material_slots"
    ] = {};

  for (const binding of
    plan.material_bindings) {
    const selected =
      binding.selected;
    if (
      binding.status ===
        "ready_r2" &&
      selected.resource_id
    ) {
      const hydrated =
        await hydrateAmbientCgMaterial(
          selected.resource_id,
        );
      materialSlots[
        binding.slot.slot_id
      ] = {
        slot_id:
          binding.slot.slot_id,
        display_name:
          hydrated.resource
            .display_name,
        source:
          "ambientcg_r2",
        resource_id:
          hydrated.resource
            .resource_id,
        source_asset_id:
          hydrated.resource
            .source_asset_id,
        variant_id:
          hydrated.resource
            .variant_id,
        content_sha256:
          hydrated.resource
            .content_sha256,
        maps:
          hydrated.maps,
        texture_scale_m:
          lookAdjustments
            .material_slots[
              binding.slot.slot_id
            ]?.physical_scale_m ??
          binding.texture_scale_m,
        look:
          lookAdjustments
            .material_slots[
              binding.slot.slot_id
            ],
        fallback:
          binding.slot
            .procedural_fallback,
      };
    } else {
      materialSlots[
        binding.slot.slot_id
      ] = {
        slot_id:
          binding.slot.slot_id,
        display_name:
          binding.slot
            .display_name,
        source:
          "procedural",
        resource_id: null,
        source_asset_id: null,
        variant_id: null,
        content_sha256: null,
        maps: {},
        texture_scale_m:
          lookAdjustments
            .material_slots[
              binding.slot.slot_id
            ]?.physical_scale_m ??
          binding.texture_scale_m,
        look:
          lookAdjustments
            .material_slots[
              binding.slot.slot_id
            ],
        fallback:
          binding.slot
            .procedural_fallback,
      };
    }
  }

  const partMaterialSlots:
    Record<string, string> = {};
  for (const part of
    brief.parts) {
    if (
      part.material_slot_id
    ) {
      partMaterialSlots[
        part.part_id
      ] =
        part.material_slot_id;
    }
  }
  for (const slot of
    brief.material_slots) {
    for (const partId of
      slot.assigned_part_ids) {
      partMaterialSlots[
        partId
      ] =
        slot.slot_id;
    }
  }

  let environment:
    BlenderFoundryResourceManifest[
      "environment"
    ] = {
    source:
      "trusted_studio",
    resource_id: null,
    source_asset_id: null,
    variant_id: null,
    content_sha256: null,
    environment_path: null,
    strength:
      lookAdjustments.environment
        .strength,
    rotation_degrees:
      lookAdjustments.environment
        .rotation_degrees,
    exposure:
      lookAdjustments.environment
        .exposure,
    background_visible:
      lookAdjustments.environment
        .background_visible,
    fallback_light_energy_scale:
      lookAdjustments.environment
        .fallback_light_energy_scale,
  };

  if (
    plan.environment.status ===
      "ready_r2" &&
    plan.environment.selected
      .resource_id
  ) {
    const hydrated =
      await hydrateAmbientCgHdri(
        plan.environment.selected
          .resource_id,
      );
    environment = {
      source:
        "ambientcg_r2",
      resource_id:
        hydrated.resource
          .resource_id,
      source_asset_id:
        hydrated.resource
          .source_asset_id,
      variant_id:
        hydrated.resource
          .variant_id,
      content_sha256:
        hydrated.resource
          .content_sha256,
      environment_path:
        hydrated.environment_path,
      strength:
        lookAdjustments.environment
          .strength,
      rotation_degrees:
        lookAdjustments.environment
          .rotation_degrees,
      exposure:
        lookAdjustments.environment
          .exposure,
      background_visible:
        lookAdjustments.environment
          .background_visible,
      fallback_light_energy_scale:
        lookAdjustments.environment
          .fallback_light_energy_scale,
    };
  }

  return {
    schema_version:
      "myway_blender_foundry_resource_manifest_v1",
    created_at:
      new Date().toISOString(),
    design_brief_asset_id:
      brief.asset_id,
    quality_mode:
      brief.quality_mode,
    material_slots:
      materialSlots,
    part_material_slots:
      partMaterialSlots,
    environment,
    look_adjustments:
      lookAdjustments,
  };
}

export function publicResourceManifest(
  manifest:
    BlenderFoundryResourceManifest,
) {
  return {
    ...manifest,
    material_slots:
      Object.fromEntries(
        Object.entries(
          manifest.material_slots,
        ).map(
          ([slotId, slot]) => [
            slotId,
            {
              ...slot,
              maps:
                Object.fromEntries(
                  Object.keys(
                    slot.maps,
                  ).map(
                    (key) => [
                      key,
                      path.basename(
                        String(
                          slot.maps[
                            key as keyof
                              typeof slot.maps
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
            },
          ],
        ),
      ),
    environment: {
      ...manifest.environment,
      environment_path:
        manifest.environment
          .environment_path
          ? path.basename(
              manifest.environment
                .environment_path,
            )
          : null,
    },
  };
}
