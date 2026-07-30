import assert from "node:assert/strict";

import type {
  EducationalSceneDirectorPlanV1,
} from "../../sandbox/probe-lab/director";
import {
  buildSceneResourcePlanFromDirector,
  normalizeSceneResourcePlan,
  validateSceneResourcePlan,
} from "../../sandbox/probe-lab/scene-resources";

const directorPlan: EducationalSceneDirectorPlanV1 = {
  schema_version:
    "myway_educational_scene_director_v1",
  source: "scaffold",
  title: "Phase 2B fixture",
  scene_thesis:
    "A stable actor remains the same while resources are late-bound.",
  learner_takeaway:
    "Resource replacement does not change the lesson.",
  representation_strategy: {
    primary_mode: "mechanistic_3d",
    secondary_modes: ["animated_diagram"],
    reason:
      "The fixture needs one physical actor and one fallback path.",
    fidelity_priority: "causal_clarity",
  },
  style: {
    look: "clean technical model",
    mood: "neutral",
    continuity: "one continuous scene",
    attention_policy:
      "Emphasize only the active actor.",
  },
  entities: [
    {
      id: "main_actor",
      display_name: "Main actor",
      semantic_role:
        "the physical actor whose identity must remain stable",
      visual_need:
        "A clear physical object with a visible top support surface.",
      semantic_tags: ["fixture", "object"],
      actor_kind: "physical_asset",
      asset_policy: {
        asset_required: true,
        can_use_proxy_until_asset_ready: true,
        fallback_representation:
          "diagrammatic_proxy",
        capability_needs: ["rotate"],
        anchor_needs: ["top"],
      },
    },
  ],
  relationships: [],
  moments: [
    {
      id: "moment_1",
      title: "Reveal the actor",
      learning_job:
        "Make the stable actor identity visible.",
      director_intent:
        "Show the actor without coupling the lesson to a specific GLB.",
      source_explanation_piece_ids: [],
      duration_ms: 2000,
      introduces_entity_ids: ["main_actor"],
      keeps_visible_entity_ids: [],
      active_entity_ids: ["main_actor"],
      camera: {
        shot_type: "medium",
        movement: "static",
        focus_entity_ids: ["main_actor"],
        framing_intent:
          "Keep the actor centered.",
        keep_visible_entity_ids: [],
      },
      events: [
        {
          id: "event_1",
          behaviour: "show",
          actor_entity_id: "main_actor",
          target_entity_id: null,
          supporting_entity_ids: [],
          start_ms: 0,
          duration_ms: 1000,
          easing: "ease_out",
          path_hint: null,
          description: "Reveal the actor.",
          parameters: {},
          fallback_behaviour: null,
        },
      ],
      text_cues: [],
      success_observation:
        "The actor remains identifiable.",
    },
  ],
  global_text_policy: {
    max_words_per_cue: 12,
    max_lines: 2,
    avoid_covering_core_motion: true,
    prefer_object_anchored_text: true,
  },
  execution_policy: {
    direction_survives_missing_assets: true,
    preserve_entity_ids_for_late_binding: true,
    asset_resolution_owner: "myway",
    renderer_compiles_behaviours: true,
    allow_abstract_proxy_until_asset_ready: true,
  },
};

const adapted = buildSceneResourcePlanFromDirector(
  directorPlan,
  {
    source: "scaffold",
    scene_id: "phase2b_fixture",
    primitive_requirements: [
      {
        instance_id: "main_actor",
        concept: "fixture object",
        target_extent_m: 1.5,
        placement_anchor: "top",
        appearance_request: {
          visual_brief:
            "A clean readable fixture object.",
          preferred_traits: ["clean"],
        },
      },
    ],
  },
);

assert.equal(adapted.validation.valid, true);
assert.equal(
  adapted.plan.entity_intents[0]?.entity_id,
  "main_actor",
);
assert.equal(
  adapted.plan.fallback_policy
    .acquisition_policy,
  "never",
);
assert.equal(
  adapted.plan.fallback_policy
    .preserve_entity_ids,
  true,
);
assert.equal(
  adapted.plan.entity_intents[0]
    ?.model_requirement?.target_extent_m,
  1.5,
);

const normalized = normalizeSceneResourcePlan(
  adapted.plan,
  {
    source: "compatibility_adapter",
    scene_id: "phase2b_fixture",
    director_schema_version:
      directorPlan.schema_version,
  },
);
assert.equal(normalized.validation.valid, true);

const invalid = structuredClone(adapted.plan);
invalid.surface_intents.push({
  intent_id: "bad_surface",
  target_entity_id: "missing_actor",
  material_slot: "default",
  instructional_purpose:
    "This fixture must fail cross-reference validation.",
  runtime_target: "both",
  material_requirement: {
    semantic_tags: ["metal"],
    appearance_tags: ["matte"],
    required_maps: ["base_color"],
    max_resolution_px: 1024,
    preferred_encoding: "automatic",
    transparency: "forbidden",
    tiling: [1, 1],
    rotation_degrees: 0,
    uv_assumption: "existing_uv",
    color_tint_allowed: true,
    displacement: "forbidden",
    closeup_importance: "medium",
  },
});

const invalidReport =
  validateSceneResourcePlan(invalid);
assert.equal(invalidReport.valid, false);
assert.equal(
  invalidReport.unresolved_reference_count,
  1,
);
assert.ok(
  invalidReport.issues.some(
    (issue) =>
      issue.code ===
      "surface_target_unknown",
  ),
);

console.log(
  "Phase 2B resource contract verification passed.",
);
