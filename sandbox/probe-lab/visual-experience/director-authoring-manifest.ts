import {
  DIRECTOR_AUTHORABLE_CAPABILITIES,
  directorCanonicalCapabilityIdForAuthoring,
} from "../motion-camera-library/director-capability-registry";
import {
  isDirectorQualificationCapabilityActive,
  isDirectorQualificationCapabilityDeferred,
  isDirectorQualificationCapabilityMergeCandidate,
} from "../motion-camera-library/director-qualification-families";

export const VISUAL_EXPERIENCE_DIRECTOR_MANIFEST_VERSION =
  "visual_experience_director_authoring_manifest_v2" as const;

export const VISUAL_EXPERIENCE_DIRECTOR_PALETTE_TARGET = 32 as const;
export const VISUAL_EXPERIENCE_DIRECTOR_PALETTE_HARD_MAX = 36 as const;

export type VisualExperienceDirectorManifestContext = {
  learner_message?: string | null;
  preferred_style?: string | null;
  asset_collection_mode?: string | null;
};

export type VisualExperienceDirectorCapabilityManifestEntry = {
  capability_id: string;
  label: string;
  category: string;
  group: string;
  semantic_intent: string;
  authoring_status: "production_active";
  threejs_support: string;
  fallback_capability_id: string | null;
  parameter_ids: string[];
};

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "because", "before", "being", "between",
  "could", "does", "from", "have", "into", "just", "like", "more", "need",
  "only", "other", "should", "show", "that", "their", "then", "there", "these",
  "they", "this", "through", "under", "very", "what", "when", "where", "which",
  "with", "would", "your", "why", "how", "understand", "explain",
]);

const BASELINE_VISUAL_TERMS = [
  "establish", "reveal", "isolate", "highlight", "focus", "attention", "hold",
  "keep visible", "occlusion", "compare", "continuity", "anchor", "push", "pull",
  "orbit", "track", "wide", "close", "depth", "layer", "relationship",
];

function compactText(value: string, max = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function tokens(value: string) {
  return Array.from(new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3 && !STOP_WORDS.has(item)),
  ));
}

export function visualExperienceDirectorCapabilityIsProductionActive(
  capabilityId: string,
) {
  const canonical = directorCanonicalCapabilityIdForAuthoring(capabilityId);
  return (
    isDirectorQualificationCapabilityActive(canonical) &&
    !isDirectorQualificationCapabilityDeferred(canonical) &&
    !isDirectorQualificationCapabilityMergeCandidate(canonical)
  );
}

function capabilitySearchText(capability: (typeof DIRECTOR_AUTHORABLE_CAPABILITIES)[number]) {
  return [
    capability.id,
    capability.label,
    capability.category,
    capability.group,
    capability.semantic_intent,
    capability.director_instruction,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function relevanceScore(
  capability: (typeof DIRECTOR_AUTHORABLE_CAPABILITIES)[number],
  queryTokens: string[],
  context: VisualExperienceDirectorManifestContext,
) {
  const haystack = capabilitySearchText(capability);
  let score = 0;

  for (const token of queryTokens) {
    if (haystack.includes(token)) score += token.length >= 7 ? 9 : 6;
  }
  for (const phrase of BASELINE_VISUAL_TERMS) {
    if (haystack.includes(phrase)) score += 3;
  }

  const message = (context.learner_message ?? "").toLowerCase();
  if (/move|motion|rotate|turn|flow|travel|push|pull|open|close|mechanism|process/.test(message)) {
    if (/motion|track|follow|rotate|move|path|continuity/.test(haystack)) score += 7;
  }
  if (/compare|difference|versus|vs\b|distinguish/.test(message)) {
    if (/compare|contrast|match|preserve|side|split/.test(haystack)) score += 8;
  }
  if (context.asset_collection_mode?.startsWith("bodyparts3d")) {
    if (/reveal|isolate|highlight|occlusion|depth|layer|orbit|close|focus|keep.visible/.test(haystack)) score += 7;
  }
  if (context.preferred_style === "step_by_step") {
    if (/reveal|hold|continuity|sequence|establish/.test(haystack)) score += 4;
  }

  return score;
}

function compactEntry(
  capability: (typeof DIRECTOR_AUTHORABLE_CAPABILITIES)[number],
  selectedIds: Set<string>,
): VisualExperienceDirectorCapabilityManifestEntry {
  const candidateFallback = capability.compiler.fallback_capability_id
    ? directorCanonicalCapabilityIdForAuthoring(capability.compiler.fallback_capability_id)
    : null;
  const fallback = candidateFallback && selectedIds.has(candidateFallback)
    ? candidateFallback
    : null;
  return {
    capability_id: directorCanonicalCapabilityIdForAuthoring(capability.id),
    label: compactText(capability.label, 72),
    category: capability.category,
    group: capability.group,
    semantic_intent: compactText(capability.semantic_intent, 180),
    authoring_status: "production_active",
    threejs_support: capability.compiler.threejs,
    fallback_capability_id: fallback,
    parameter_ids: (capability.parameters ?? []).map((parameter) => parameter.name).slice(0, 8),
  };
}

/**
 * Turn-specific model-facing palette derived from the canonical Director registry.
 *
 * The complete registry remains MyWay's source of truth. The model receives only a
 * compact, balanced subset of production-active capabilities for this turn. This
 * keeps prompt size bounded while allowing newly qualified cinematic mechanisms to
 * become eligible automatically without Visual-Experience-specific hand wiring.
 */
export function buildVisualExperienceDirectorAuthoringManifest(
  context: VisualExperienceDirectorManifestContext = {},
) {
  const active = DIRECTOR_AUTHORABLE_CAPABILITIES.filter((capability) =>
    visualExperienceDirectorCapabilityIsProductionActive(capability.id),
  );
  const queryTokens = tokens([
    context.learner_message ?? "",
    context.preferred_style ?? "",
    context.asset_collection_mode ?? "",
  ].join(" "));

  const ranked = active
    .map((capability) => ({
      capability,
      score: relevanceScore(capability, queryTokens, context),
      canonical_id: directorCanonicalCapabilityIdForAuthoring(capability.id),
    }))
    .sort((a, b) => b.score - a.score || a.canonical_id.localeCompare(b.canonical_id));

  const selected = new Map<string, (typeof DIRECTOR_AUTHORABLE_CAPABILITIES)[number]>();
  const byCategory = new Map<string, typeof ranked>();
  for (const item of ranked) {
    const list = byCategory.get(item.capability.category) ?? [];
    list.push(item);
    byCategory.set(item.capability.category, list);
  }

  // Preserve breadth first so a turn never loses entire cinematography/action families.
  for (const category of Array.from(byCategory.keys()).sort()) {
    for (const item of (byCategory.get(category) ?? []).slice(0, 2)) {
      selected.set(item.canonical_id, item.capability);
    }
  }

  // Fill remaining slots with turn-relevant capabilities.
  for (const item of ranked) {
    if (selected.size >= VISUAL_EXPERIENCE_DIRECTOR_PALETTE_TARGET) break;
    selected.set(item.canonical_id, item.capability);
  }

  // If a selected capability has an active fallback, include it when room remains so
  // the model never sees a fallback id it is forbidden to author.
  for (const capability of Array.from(selected.values())) {
    if (selected.size >= VISUAL_EXPERIENCE_DIRECTOR_PALETTE_HARD_MAX) break;
    const fallbackId = capability.compiler.fallback_capability_id
      ? directorCanonicalCapabilityIdForAuthoring(capability.compiler.fallback_capability_id)
      : null;
    if (!fallbackId || selected.has(fallbackId)) continue;
    const fallback = active.find(
      (candidate) => directorCanonicalCapabilityIdForAuthoring(candidate.id) === fallbackId,
    );
    if (fallback) selected.set(fallbackId, fallback);
  }

  const selectedIds = new Set(selected.keys());
  const capabilities = Array.from(selected.values())
    .map((capability) => compactEntry(capability, selectedIds))
    .sort((a, b) => a.category.localeCompare(b.category) || a.capability_id.localeCompare(b.capability_id));

  const activeByCategory = Object.fromEntries(
    Array.from(new Set(active.map((capability) => capability.category)))
      .sort()
      .map((category) => [
        category,
        active.filter((capability) => capability.category === category).length,
      ]),
  );

  return {
    schema_version: VISUAL_EXPERIENCE_DIRECTOR_MANIFEST_VERSION,
    policy: {
      semantic_intent_first: true,
      palette_is_turn_specific: true,
      model_must_not_request_omitted_ids: true,
      model_never_authors_camera_xyz: true,
      model_never_authors_asset_ids: true,
      model_never_authors_collision_solutions: true,
      qualification_fixture_data_exposed: false,
      internal_asset_qualification_exposed: false,
      internal_pair_interaction_exposed: false,
      internal_builder_placement_exposed: false,
    },
    counts: {
      global_authorable: DIRECTOR_AUTHORABLE_CAPABILITIES.length,
      global_production_active: active.length,
      global_compatibility_only: DIRECTOR_AUTHORABLE_CAPABILITIES.length - active.length,
      palette_count: capabilities.length,
      palette_target: VISUAL_EXPERIENCE_DIRECTOR_PALETTE_TARGET,
      palette_hard_max: VISUAL_EXPERIENCE_DIRECTOR_PALETTE_HARD_MAX,
    },
    active_by_category: activeByCategory,
    selection_context: {
      query_terms: queryTokens.slice(0, 16),
      asset_collection_mode: context.asset_collection_mode ?? null,
      preferred_style: context.preferred_style ?? null,
    },
    capabilities,
  };
}
