
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
  readAmbientCgMaterialRegistry,
} from "../assets/catalog/ambientcg/ambientcg-store.server";
import type {
  AmbientCgCachedHdri,
  AmbientCgCachedMaterial,
  AmbientCgCatalogAsset,
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

function cachedMaterialCandidate(
  material:
    AmbientCgCachedMaterial,
  slot:
    AssetMaterialSlotIntentV2,
  requestWords:
    Set<string>,
  preferred:
    FoundryResourceCandidate | null,
): FoundryResourceCandidate {
  const candidateWords =
    foundryResourceWords([
      material.display_name,
      material.source_asset_id,
      ...material.semantic_tags,
    ]);
  const lexical =
    scoreFoundryResourceWords(
      requestWords,
      candidateWords,
    );
  const family =
    scoreMaterialFamilyCompatibility(
      slot,
      candidateWords,
    );
  const available =
    mapAvailability(
      material,
    );
  const missing =
    slot.required_maps.filter(
      (map) =>
        !available.includes(
          map,
        ),
    );
  let score =
    lexical.score +
    family.score +
    (
      material.published_to_r2 &&
      material.storage_provider ===
        "r2"
        ? 90
        : -150
    ) +
    available.length * 3 -
    missing.length * 16;

  const reasons = [
    ...family.reasons,
    ...lexical.reasons,
  ];
  if (
    preferred?.resource_id ===
    material.resource_id
  ) {
    score += 1000;
    reasons.unshift(
      "explicit resource selection",
    );
  }
  if (
    preferred?.source_asset_id ===
    material.source_asset_id
  ) {
    score += 500;
    reasons.unshift(
      "explicit AmbientCG selection",
    );
  }
  if (!missing.length) {
    score += 30;
    reasons.push(
      "all required maps available",
    );
  }

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
    reasons,
    published_to_r2:
      material.published_to_r2 ===
        true &&
      material.storage_provider ===
        "r2",
    required_maps_available:
      available,
    missing_required_maps:
      missing,
  };
}

function catalogMaterialMapRole(
  value: string,
): keyof AmbientCgMaterialMaps | null {
  const name = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

  if (/normal_?gl|normal/.test(name)) {
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
    ]);
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
  const family =
    scoreMaterialFamilyCompatibility(
      slot,
      identityWords,
    );
  const normalizedAvailable =
    Array.from(
      new Set(
        asset.maps
          .map(catalogMaterialMapRole)
          .filter(
            (
              role,
            ): role is keyof AmbientCgMaterialMaps =>
              Boolean(role),
          ),
      ),
    );

  if (!family.compatible) {
    return null;
  }

  if (
    asset.maps.length > 0 &&
    slot.required_maps.includes(
      "base_color",
    ) &&
    !normalizedAvailable.includes(
      "base_color",
    )
  ) {
    return null;
  }
  const missing =
    slot.required_maps.filter(
      (required) =>
        !normalizedAvailable.includes(
          required,
        ),
    );
  let score =
    lexical.score +
    family.score +
    24 -
    missing.length * 5;
  const reasons = [
    ...family.reasons,
    ...lexical.reasons,
  ];
  if (
    preferred?.source_asset_id ===
    asset.source_asset_id
  ) {
    score += 1000;
    reasons.unshift(
      "explicit AmbientCG selection",
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
    reasons,
    published_to_r2: false,
    required_maps_available:
      normalizedAvailable,
    missing_required_maps:
      missing,
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
    score: 1,
    reasons: [
      "trusted Principled fallback",
    ],
    published_to_r2: false,
    required_maps_available: [],
    missing_required_maps:
      slot.required_maps,
  };
}

function materialRequestWords(
  brief:
    AssetDesignBriefV2,
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
    ...slot.semantic_tags,
    brief.concept,
    ...brief.style_tags,
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
): FoundryMaterialBindingPlan {
  const requestWords =
    materialRequestWords(
      brief,
      slot,
    );
  const cached =
    materials
      .map((material) =>
        cachedMaterialCandidate(
          material,
          slot,
          requestWords,
          preferred,
        ),
      )
      .filter(
        (candidate) =>
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
        left.display_name.localeCompare(
          right.display_name,
        ),
    )
    .slice(0, 8);

  const preferredCandidate =
    candidates.find(
      (candidate) =>
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
        ),
    );
  const selected =
    preferredCandidate ??
    candidates[0] ??
    fallback;
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
  requestWords:
    Set<string>,
  preferred:
    FoundryResourceCandidate | null,
): FoundryResourceCandidate {
  const lexical =
    scoreFoundryResourceWords(
      requestWords,
      foundryResourceWords([
        environment.display_name,
        environment.source_asset_id,
        ...environment.semantic_tags,
      ]),
    );
  let score =
    lexical.score +
    (
      environment.published_to_r2 &&
      environment.storage_provider ===
        "r2"
        ? 90
        : -150
    );
  const reasons = [
    ...lexical.reasons,
  ];
  if (
    preferred?.resource_id ===
    environment.resource_id
  ) {
    score += 1000;
    reasons.unshift(
      "explicit environment selection",
    );
  }
  if (
    preferred?.source_asset_id ===
    environment.source_asset_id
  ) {
    score += 500;
    reasons.unshift(
      "explicit AmbientCG selection",
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
    reasons,
    published_to_r2:
      environment.published_to_r2 ===
        true &&
      environment.storage_provider ===
        "r2",
    required_maps_available: [
      "environment",
    ],
    missing_required_maps: [],
  };
}

function catalogEnvironmentCandidate(
  asset:
    AmbientCgCatalogAsset,
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
  const lexical =
    scoreFoundryResourceWords(
      requestWords,
      foundryResourceWords([
        asset.display_name,
        asset.source_asset_id,
        asset.short_description,
        asset.long_description,
        ...asset.semantic_tags,
        ...asset.collections,
      ]),
    );
  let score =
    lexical.score + 24;
  const reasons = [
    ...lexical.reasons,
  ];
  if (
    preferred?.source_asset_id ===
    asset.source_asset_id
  ) {
    score += 1000;
    reasons.unshift(
      "explicit AmbientCG selection",
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
    reasons,
    published_to_r2: false,
    required_maps_available: [
      "environment",
    ],
    missing_required_maps: [],
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
    score: 1,
    reasons: [
      "trusted fallback lighting",
    ],
    published_to_r2: false,
    required_maps_available: [],
    missing_required_maps: [],
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
      "studio",
      "lookdev",
    ]);
  const cached =
    environments
      .map((environment) =>
        cachedEnvironmentCandidate(
          environment,
          requestWords,
          preferred,
        ),
      )
      .filter(
        (candidate) =>
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
        left.display_name.localeCompare(
          right.display_name,
        ),
    )
    .slice(0, 8);

  const preferredCandidate =
    candidates.find(
      (candidate) =>
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
        ),
    );
  const selected =
    preferredCandidate ??
    candidates[0] ??
    fallback;
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
    hdriRegistry,
    catalog,
  ] = await Promise.all([
    readAmbientCgMaterialRegistry(),
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
    background_visible: boolean;
  };
};

export async function hydrateFoundryResourcesForBlender(
  brief:
    AssetDesignBriefV2,
  rawPlan:
    unknown,
): Promise<
  BlenderFoundryResourceManifest
> {
  const plan =
    normalizeFoundryResourcePlan(
      rawPlan,
      brief,
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
          binding.texture_scale_m,
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
          binding.texture_scale_m,
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
      brief.environment
        .strength,
    rotation_degrees:
      brief.environment
        .rotation_degrees,
    background_visible:
      brief.environment
        .background_visible,
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
        brief.environment
          .strength,
      rotation_degrees:
        brief.environment
          .rotation_degrees,
      background_visible:
        brief.environment
          .background_visible,
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
