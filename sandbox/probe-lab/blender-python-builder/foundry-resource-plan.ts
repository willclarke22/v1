import type {
  AssetDesignBriefV2,
  AssetMaterialSlotIntentV2,
  FoundryQualityMode,
} from "./asset-design-brief";

export const FOUNDRY_RESOURCE_PLAN_SCHEMA_VERSION =
  "myway_foundry_resource_plan_v1" as const;

export type FoundryResourceCandidate = {
  candidate_kind:
    | "cached_r2"
    | "ambientcg_catalog"
    | "procedural";
  resource_id: string | null;
  source_asset_id: string | null;
  variant_id: string | null;
  display_name: string;
  preview_url: string | null;
  resolution: string | null;
  file_format: string | null;
  score: number;
  reasons: string[];
  published_to_r2: boolean;
  required_maps_available: string[];
  missing_required_maps: string[];
  appearance_summary:
    string | null;
  dominant_colors:
    string[];
  brightness:
    "dark" | "medium" | "light" | null;
  appearance_confidence:
    number | null;
  match_confidence:
    number;
};

export type FoundryMaterialBindingPlan = {
  slot:
    AssetMaterialSlotIntentV2;
  status:
    | "ready_r2"
    | "catalog_match"
    | "procedural_fallback"
    | "missing";
  selected:
    FoundryResourceCandidate;
  candidates:
    FoundryResourceCandidate[];
  texture_scale_m:
    number | null;
};

export type FoundryEnvironmentBindingPlan = {
  status:
    | "ready_r2"
    | "catalog_match"
    | "trusted_studio_fallback"
    | "missing";
  intent:
    AssetDesignBriefV2[
      "environment"
    ];
  selected:
    FoundryResourceCandidate;
  candidates:
    FoundryResourceCandidate[];
};

export type FoundryResourcePlanV1 = {
  schema_version:
    typeof FOUNDRY_RESOURCE_PLAN_SCHEMA_VERSION;
  created_at: string;
  design_brief_asset_id: string;
  quality_mode:
    FoundryQualityMode;
  material_bindings:
    FoundryMaterialBindingPlan[];
  environment:
    FoundryEnvironmentBindingPlan;
  summary: {
    ready_r2: number;
    catalog_matches: number;
    procedural_fallbacks: number;
    missing: number;
    requires_preparation: boolean;
  };
};

function record(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(
  value: unknown,
  fallback = "",
) {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : fallback;
}

function numberValue(
  value: unknown,
  fallback: number,
) {
  const parsed =
    Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function candidate(
  value: unknown,
  fallback:
    FoundryResourceCandidate,
): FoundryResourceCandidate {
  const item =
    record(value);
  const kind =
    item.candidate_kind ===
      "cached_r2" ||
    item.candidate_kind ===
      "ambientcg_catalog" ||
    item.candidate_kind ===
      "procedural"
      ? item.candidate_kind
      : fallback.candidate_kind;

  return {
    candidate_kind:
      kind,
    resource_id:
      text(
        item.resource_id,
      ) || null,
    source_asset_id:
      text(
        item.source_asset_id,
      ) || null,
    variant_id:
      text(
        item.variant_id,
      ) || null,
    display_name:
      text(
        item.display_name,
        fallback.display_name,
      ),
    preview_url:
      text(
        item.preview_url,
      ) || null,
    resolution:
      text(
        item.resolution,
      ) || null,
    file_format:
      text(
        item.file_format,
      ) || null,
    score:
      numberValue(
        item.score,
        fallback.score,
      ),
    reasons:
      Array.isArray(
        item.reasons,
      )
        ? item.reasons
            .map((reason) =>
              text(reason),
            )
            .filter(Boolean)
        : fallback.reasons,
    published_to_r2:
      item.published_to_r2 ===
        true,
    required_maps_available:
      Array.isArray(
        item.required_maps_available,
      )
        ? item.required_maps_available
            .map((map) =>
              text(map),
            )
            .filter(Boolean)
        : [],
    missing_required_maps:
      Array.isArray(
        item.missing_required_maps,
      )
        ? item.missing_required_maps
            .map((map) =>
              text(map),
            )
            .filter(Boolean)
        : [],
    appearance_summary:
      text(
        item.appearance_summary,
      ) || null,
    dominant_colors:
      Array.isArray(
        item.dominant_colors,
      )
        ? item.dominant_colors
            .map((color) =>
              text(color),
            )
            .filter(Boolean)
        : [],
    brightness:
      item.brightness === "dark" ||
      item.brightness === "medium" ||
      item.brightness === "light"
        ? item.brightness
        : null,
    appearance_confidence:
      Number.isFinite(
        Number(
          item.appearance_confidence,
        ),
      )
        ? Math.max(
            0,
            Math.min(
              1,
              Number(
                item.appearance_confidence,
              ),
            ),
          )
        : null,
    match_confidence:
      numberValue(
        item.match_confidence,
        fallback.match_confidence,
      ),
  };
}

function proceduralCandidate(
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
      "trusted Principled BSDF fallback",
    ],
    published_to_r2: false,
    required_maps_available: [],
    missing_required_maps:
      slot.required_maps,
    appearance_summary:
      "Controlled procedural Principled material fallback.",
    dominant_colors: [],
    brightness: null,
    appearance_confidence: null,
    match_confidence: 1,
  };
}

export function summarizeFoundryResourcePlan(
  materialBindings:
    FoundryMaterialBindingPlan[],
  environment:
    FoundryEnvironmentBindingPlan,
) {
  const statuses = [
    ...materialBindings.map(
      (binding) =>
        binding.status,
    ),
    environment.status,
  ];

  return {
    ready_r2:
      statuses.filter(
        (status) =>
          status ===
          "ready_r2",
      ).length,
    catalog_matches:
      statuses.filter(
        (status) =>
          status ===
          "catalog_match",
      ).length,
    procedural_fallbacks:
      statuses.filter(
        (status) =>
          status ===
            "procedural_fallback" ||
          status ===
            "trusted_studio_fallback",
      ).length,
    missing:
      statuses.filter(
        (status) =>
          status ===
          "missing",
      ).length,
    requires_preparation:
      statuses.some(
        (status) =>
          status ===
          "catalog_match",
      ),
  };
}

export function normalizeFoundryResourcePlan(
  value: unknown,
  brief:
    AssetDesignBriefV2,
): FoundryResourcePlanV1 {
  const root =
    record(value);
  const rawBindings =
    Array.isArray(
      root.material_bindings,
    )
      ? root.material_bindings
      : [];

  const bySlot =
    new Map(
      rawBindings.map(
        (raw) => {
          const item =
            record(raw);
          const slot =
            record(item.slot);
          return [
            text(
              slot.slot_id,
            ),
            item,
          ];
        },
      ),
    );

  const materialBindings =
    brief.material_slots.map(
      (slot) => {
        const item =
          bySlot.get(
            slot.slot_id,
          ) ?? {};
        const fallback =
          proceduralCandidate(
            slot,
          );
        const rawCandidates =
          Array.isArray(
            item.candidates,
          )
            ? item.candidates
            : [];
        const candidates =
          rawCandidates.length
            ? rawCandidates.map(
                (raw) =>
                  candidate(
                    raw,
                    fallback,
                  ),
              )
            : [fallback];
        const selected =
          candidate(
            item.selected,
            candidates[0] ??
              fallback,
          );
        const status =
          item.status ===
            "ready_r2" ||
          item.status ===
            "catalog_match" ||
          item.status ===
            "missing"
            ? item.status
            : "procedural_fallback";

        return {
          slot,
          status,
          selected,
          candidates,
          texture_scale_m:
            Number.isFinite(
              Number(
                item.texture_scale_m,
              ),
            )
              ? Number(
                  item.texture_scale_m,
                )
              : slot.physical_scale_m,
        } satisfies
          FoundryMaterialBindingPlan;
      },
    );

  const environmentRoot =
    record(
      root.environment,
    );
  const environmentFallback:
    FoundryResourceCandidate = {
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
      appearance_summary:
        "Trusted neutral studio lighting fallback.",
      dominant_colors: [],
      brightness: null,
      appearance_confidence: null,
      match_confidence: 1,
    };
  const environmentCandidates =
    Array.isArray(
      environmentRoot.candidates,
    )
      ? environmentRoot.candidates.map(
          (raw) =>
            candidate(
              raw,
              environmentFallback,
            ),
        )
      : [
          environmentFallback,
        ];
  const environmentStatus =
    environmentRoot.status ===
      "ready_r2" ||
    environmentRoot.status ===
      "catalog_match" ||
    environmentRoot.status ===
      "missing"
      ? environmentRoot.status
      : "trusted_studio_fallback";
  const environment:
    FoundryEnvironmentBindingPlan = {
    status:
      environmentStatus,
    intent:
      brief.environment,
    selected:
      candidate(
        environmentRoot.selected,
        environmentCandidates[0] ??
          environmentFallback,
      ),
    candidates:
      environmentCandidates,
  };

  return {
    schema_version:
      FOUNDRY_RESOURCE_PLAN_SCHEMA_VERSION,
    created_at:
      text(
        root.created_at,
        new Date().toISOString(),
      ),
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
