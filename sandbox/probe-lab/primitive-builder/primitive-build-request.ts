import {
  SCENE_GRAPH_CAMERA_PRESETS,
  SCENE_GRAPH_MOTION_TYPES,
  SCENE_GRAPH_NODE_KINDS,
  SCENE_GRAPH_PLANES,
  SCENE_GRAPH_RENDER_POLICIES,
} from "./primitive-scene-graph";

import {
  DIRECTOR_BEHAVIOURS,
  DIRECTOR_BLOCKING_RELATIONS,
  DIRECTOR_CAMERA_ANGLES,
  DIRECTOR_CAMERA_FRAMINGS,
  DIRECTOR_CAMERA_LENSES,
  DIRECTOR_CAMERA_MOVEMENTS,
  DIRECTOR_CAMERA_SHOTS,
  DIRECTOR_CAPTION_SAFE_REGIONS,
  DIRECTOR_CONTINUITY_RULES,
  DIRECTOR_COORDINATE_SPACES,
  DIRECTOR_LIGHTING_INTENTS,
  DIRECTOR_KINEMATIC_CONSTRAINTS,
  DIRECTOR_NARRATIVE_JOBS,
  DIRECTOR_REPRESENTATION_MODES,
  DIRECTOR_SCREEN_ANCHORS,
} from "../director";

export type PrimitiveBuilderModelProvider = "deepseek" | "glm";
export type PrimitiveBuilderFallbackProvider = "none" | "deepseek" | "glm";

export type PrimitiveBuilderRequestBody = {
  prompt?: string;
  provider?: PrimitiveBuilderModelProvider | string;
  fallback_provider?: PrimitiveBuilderFallbackProvider | string;
  style?: {
    look?: string;
    mood?: string;
    complexity?: string;
    cutaway?: boolean;
  };
};

const SCENE_LOOKS = ["clean_stylized", "diagrammatic", "miniature", "technical_cutaway"] as const;
const SCENE_MOODS = ["neutral", "warm", "energetic", "clinical"] as const;
const SCENE_COMPLEXITIES = ["low", "medium", "high"] as const;

export function normalizePrimitiveBuilderProvider(value: unknown): PrimitiveBuilderModelProvider {
  return value === "glm" ? "glm" : "deepseek";
}

export function normalizePrimitiveBuilderFallback(value: unknown, primary: PrimitiveBuilderModelProvider): PrimitiveBuilderFallbackProvider {
  if (value === "none") return "none";
  if (value === "glm" || value === "deepseek") return value === primary ? "none" : value;
  return primary === "glm" ? "deepseek" : "glm";
}

function shortText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function allowedOr<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]) {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value : fallback;
}

function normalizedStyle(
  style: PrimitiveBuilderRequestBody["style"] | undefined,
) {
  return {
    look: allowedOr(
      style?.look,
      SCENE_LOOKS,
      "clean_stylized",
    ),
    mood: allowedOr(
      style?.mood,
      SCENE_MOODS,
      "neutral",
    ),
    complexity: allowedOr(
      style?.complexity,
      SCENE_COMPLEXITIES,
      "medium",
    ),
    cutaway: style?.cutaway === true,
  };
}

function compactResponseContract() {
  return {
    schema_version: "primitive_scene_graph_v2",
    user_request: "string",
    scene_title: "string",
    scene_summary: "string",
    style: {
      look: SCENE_LOOKS.join(" | "),
      mood: SCENE_MOODS.join(" | "),
      complexity: SCENE_COMPLEXITIES.join(" | "),
      cutaway: false,
    },
    camera: {
      preset: SCENE_GRAPH_CAMERA_PRESETS.join(" | "),
      position: [6.4, 5.2, 7.2],
      target: [0, 1.2, -0.8],
    },
    lighting: {
      mood: "short description",
      key_light: [4, 8, 6],
      fill_light: [-1.5, 2.4, -2.7],
    },
    director_plan: {
      schema_version:
        "myway_educational_scene_director_v1",
      capability_language_version: "v2",
      title: "short scene title",
      scene_thesis:
        "what the scene must make visually undeniable",
      learner_takeaway:
        "the mental model the learner should leave with",
      representation_strategy: {
        primary_mode:
          DIRECTOR_REPRESENTATION_MODES.join(" | "),
        secondary_modes: [],
        reason:
          "why this representation exposes the requested relationship",
        fidelity_priority:
          "causal_clarity | spatial_clarity | comparison_clarity | literal_fidelity",
      },
      style: {
        look: "clean stylized",
        mood: "clear and calm",
        continuity:
          "what remains visible across moments",
        attention_policy:
          "how each moment keeps one visual job",
      },
      moments: [
        {
          id: "moment_1",
          title: "short title",
          learning_job:
            "the single teaching job of this moment",
          director_intent:
            "what the viewer must notice",
          duration_ms: 4200,
          introduces_entity_ids: [
            "asset requirement instance ids or procedural node ids",
          ],
          keeps_visible_entity_ids: [],
          active_entity_ids: [],
          camera: {
            shot_type:
              DIRECTOR_CAMERA_SHOTS.join(" | "),
            movement:
              DIRECTOR_CAMERA_MOVEMENTS.join(" | "),
            focus_entity_ids: [],
            framing_intent:
              "compact V1 compatibility cue derived from the richer shot direction",
            keep_visible_entity_ids: [],
          },
          shot: {
            narrative_job:
              DIRECTOR_NARRATIVE_JOBS.join(" | "),
            visual_claim:
              "what this shot makes visually undeniable",
            composition: {
              framing:
                DIRECTOR_CAMERA_FRAMINGS.join(" | "),
              angle:
                DIRECTOR_CAMERA_ANGLES.join(" | "),
              screen_anchor:
                DIRECTOR_SCREEN_ANCHORS.join(" | "),
              keep_visible_entity_ids: [],
              foreground_entity_ids: [],
              background_entity_ids: [],
              preserve_relationship_entity_ids: [],
              preserve_relative_scale: false,
              caption_safe_region:
                DIRECTOR_CAPTION_SAFE_REGIONS.join(" | "),
              negative_space_side:
                "left | right | none",
            },
            lens: {
              preset:
                DIRECTOR_CAMERA_LENSES.join(" | "),
              focal_length_mm: 50,
              field_of_view_degrees: 44,
              depth_of_field:
                "deep | moderate | shallow",
              aperture_f: 5.6,
              focus_entity_id:
                "actor id or null",
            },
            camera: {
              focus_entity_ids: [],
              movement_steps: [
                {
                  movement:
                    DIRECTOR_CAMERA_MOVEMENTS.join(" | "),
                  start_progress: 0,
                  end_progress: 1,
                  strength: 0.55,
                  easing:
                    "linear | ease_in | ease_out | ease_in_out | spring | step",
                  coordinate_space:
                    DIRECTOR_COORDINATE_SPACES.join(" | "),
                  target_entity_id:
                    "actor id or null",
                  parameters: {},
                },
              ],
              start_intent:
                "what is framed first",
              end_intent:
                "what is framed after the move",
              movement_reason:
                "why the camera movement helps the teaching job",
            },
            blocking: [
              {
                relation:
                  DIRECTOR_BLOCKING_RELATIONS.join(" | "),
                actor_entity_id:
                  "actor id",
                target_entity_id:
                  "actor id or null",
                screen_region:
                  DIRECTOR_SCREEN_ANCHORS.join(" | "),
                preserve_clearance: true,
                parameters: {},
              },
            ],
            constraints: [
              {
                kind:
                  DIRECTOR_KINEMATIC_CONSTRAINTS.join(" | "),
                actor_entity_id:
                  "actor id",
                target_entity_id:
                  "optional actor id or null",
                secondary_target_entity_id:
                  "optional second actor id for rigid_link",
                axis: "x | y | z | auto",
                distance_m: null,
                parameters: {},
              },
            ],
            lighting: {
              intents:
                [DIRECTOR_LIGHTING_INTENTS[0]],
              motivated_source_entity_id:
                "actor id or null",
              emphasized_entity_ids: [],
              preserve_shadow_entity_ids: [],
            },
            continuity: {
              rules:
                ["keep_visible", "avoid_occlusion"],
              maximum_occlusion_ratio: 0.2,
              maintain_axis_entity_ids: [],
            },
            reveal_at: null,
            hold_after_ms: 700,
            success_observation:
              "what should be visually obvious when the shot ends",
          },
          events: [
            {
              id: "event_1",
              behaviour:
                DIRECTOR_BEHAVIOURS.join(" | "),
              actor_entity_id:
                "asset requirement instance id or procedural node id",
              target_entity_id:
                "optional actor id or null",
              supporting_entity_ids: [],
              start_ms: 0,
              duration_ms: 1800,
              easing:
                "linear | ease_in | ease_out | ease_in_out | spring | step",
              path_hint:
                "semantic path description or null",
              description:
                "the visible change MyWay should compile",
              parameters: {},
              fallback_behaviour:
                "optional simpler behaviour or null",
            },
          ],
          text_cues: [
            {
              id: "text_1",
              kind:
                "object_anchor | world_label | screen_caption | screen_center",
              text:
                "short educational phrase",
              anchor_entity_id:
                "actor id or null",
              placement:
                "above | below | left | right | center | top | bottom | auto",
              start_ms: 250,
              end_ms: 3600,
              emphasis_words: [],
              entrance:
                "fade | fade_up | pop | type_on | none",
              exit:
                "fade | hold | none",
            },
          ],
          success_observation:
            "what should be obvious by the end",
        },
      ],
    },
    nodes: [
      {
        id: "stable_snake_case_id",
        kind: SCENE_GRAPH_NODE_KINDS.join(" | "),
        display_name: "optional name",
        position: [0, 0, 0],
        scale: [1, 1, 1],
        rotation: [0, 0, 0],
        color: "#94a3b8",
        render_policy:
          SCENE_GRAPH_RENDER_POLICIES.join(" | "),
        motion: {
          type: SCENE_GRAPH_MOTION_TYPES.join(" | "),
        },
        children: ["same node shape for groups"],
      },
    ],
    asset_requirements: [
      {
        instance_id: "stable_requirement_id",
        concept: "plain-language object",
        aliases: ["useful synonyms"],
        semantic_tags: ["meaningful identity or scene-role tags"],
        appearance_request: {
          visual_brief:
            "object-specific visible appearance requested by the user, or empty string",
          required_traits: [],
          preferred_traits: [
            "visible materials, colors, era, finish, or shape that would be better",
          ],
          avoid_traits: [
            "visible traits that would conflict with the requested look",
          ],
        },
        motion_role: "short role",
        must_be_separate: true,
        reusable: true,
        required: true,
        target_extent_m: 0,
        layout_proxy_kind:
          "box | softBox | cylinder | sphere | group | none",
        layout_proxy_node_id:
          "existing invisible layout-proxy node or group id",
        parent_id: "optional existing parent group id",
        placement_relation:
          "absolute | on_ground | on_surface | beside | inside | attached_to",
        placement_target_instance_id:
          "required target requirement id for relative placement",
        placement_anchor:
          "short semantic anchor such as top, top_shelf, side, center, interior",
        placement_region: {
          region_kind:
            "any | support | containment | attachment | adjacent",
          exposure: "any | exterior | interior",
          orientation:
            "any | upward | vertical | downward | sloped",
          vertical_rank:
            "any | highest | upper | middle | lower | lowest",
          openness: "any | open | enclosed",
          side: "any | left | right | front | back",
          require_ground_contact: false,
          allow_intersection: false,
        },
        placement_offset: [0, 0, 0],
        placement_uv: [0, 0],
        clearance_m: 0.01,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ],
  };
}

export function makePrimitiveBuildModelRequest(input: {
  user_request: string;
  style?: PrimitiveBuilderRequestBody["style"];
}) {
  const style = normalizedStyle(input.style);
  const schema = compactResponseContract();

  const system = `You are MyWay's Asset Scene Planner.
Return exactly one valid JSON object. Do not use markdown, code fences, commentary, or hidden reasoning.
Build a clear grouped primitive_scene_graph_v2 from the request.
The director_plan is the source of truth for teaching sequence, movement, camera, timed text, and stable actor ids.
Direct the scene before casting final assets. The direction must remain exceptional even when every physical actor is unresolved.
Each director moment must have one learning_job, one director_intent, a rich shot direction, at least one semantic event, and concise timed text.
Use Director Capability Language V2: compose narrative job, framing, angle, lens, one or more parameterized camera movement steps, blocking, lighting, continuity, and success observation into one coherent shot.
Prefer semantic target-relative instructions over raw coordinates. A shot may combine several compatible capabilities; do not reduce a cinematic idea to one camera word.
Use movement strength and parameters to vary execution. Use camera_relative or target_relative coordinates when direction depends on the camera or another actor.
Treat physical placement (on_surface, inside, attached_to) separately from cinematic blocking (foreground, behind, screen_left, facing). MyWay resolves final geometry and collisions.
Use asset requirement instance_ids as the actor ids for physical objects and procedural node ids for abstract effects.
Never omit a requested actor or weaken the motion sequence because MyWay may not have the asset yet.
Describe semantic behaviours and actor capability/anchor needs; MyWay compiles them into supported Three.js or Blender execution later.
Use shot.constraints for relationships that must remain true during motion (axis locks, attachments, maintained distance, rigid links, look-at constraints) instead of hoping independent keyframes line up.
The primitive nodes are invisible layout proxies only. They communicate approximate bounds, grouping, relative position, support relationships, and motion intent; they are never shown as substitutes for missing assets.
Use local child coordinates inside meaningful groups and use only allowed values.
Create an asset requirement for every physical object that should appear in the final scene.
Never output asset IDs, URLs, providers, paths, React, Three.js, JavaScript, or executable code.
Every asset requirement must reference an existing layout proxy node or group.
Every physical actor referenced by director_plan must use the matching asset requirement instance_id. Abstract effects may reference procedural_required node ids.
For each physical object, describe object-specific visible appearance in appearance_request using open vocabulary. Keep identity in concept and appearance separate.
Default required_traits to an empty array. Add a required trait only when the user explicitly requested that visible property and omitting it would make the scene meaningfully wrong. Never promote parts inferred only from general object knowledge into required traits. Put ordinary preferences in preferred_traits and clear conflicts in avoid_traits.
Set target_extent_m to 0 unless the user explicitly gives a physical measurement for that object. MyWay applies a deterministic real-world size policy and parent-relative caps after parsing, so never guess an object's size from the example schema.
Do not choose from style tags and do not output generic boilerplate such as "realistic", "high quality", or "detailed" unless the user explicitly requested it.
Translate explicit spatial wording into placement_relation, placement_target_instance_id, and placement_region. Use generic spatial properties rather than object-specific assumptions.
"On top of X" means on_surface with exterior, upward, highest, open. "On the top shelf" means on_surface with interior, upward, highest, enclosed. "Inside X" means inside with containment and interior. "Beside" or "next to" means beside with adjacent, exterior, and ground contact. "Attached to the side" means attached_to with attachment, vertical, and the requested side.
Set placement_region.allow_intersection true only when the user explicitly requests insertion, embedding, penetration, or another physical intersection. It must otherwise be false.
MyWay—not the model—resolves verified assets, logical real-world size, exact geometry, generic spatial regions, appearance embeddings, packing, strict collision validation, and final placement.
Only an explicitly requested abstract glow or particle cloud may use render_policy procedural_required. All other nodes must use layout_proxy.`;

  const allowed = {
    node_kind: SCENE_GRAPH_NODE_KINDS,
    motion_type: SCENE_GRAPH_MOTION_TYPES,
    motion_plane: SCENE_GRAPH_PLANES,
    camera: SCENE_GRAPH_CAMERA_PRESETS,
    look: SCENE_LOOKS,
    mood: SCENE_MOODS,
    complexity: SCENE_COMPLEXITIES,
    render_policy:
      SCENE_GRAPH_RENDER_POLICIES,
    asset_layout_proxy_kind: [
      "box",
      "softBox",
      "cylinder",
      "sphere",
      "group",
      "none",
    ],
  };

  const user = `Create primitive_scene_graph_v2.

USER_REQUEST: ${shortText(
    input.user_request,
    "build something interesting",
  )}

STYLE: ${JSON.stringify(style)}

ALLOWED_VALUES: ${JSON.stringify(allowed)}

OUTPUT_SHAPE: ${JSON.stringify(schema)}

RULES:
- The first character must be { and the final character must be }.
- Return only the JSON object.
- Use nodes[], not flat parts[].
- Include director_plan and treat it as the source of truth for the educational sequence.
- Do not output legacy beats; MyWay derives reveal beats from director_plan.moments.
- Use groups for recognizable objects and subsystems.
- Keep the requested composition coherent and omit unrelated demo objects.
- Every requested physical object that should be visible must have an asset_requirement.
- Each asset_requirement must keep object identity in concept and visible look in appearance_request.
- appearance_request.visual_brief must be object-specific, not a summary of the whole scene.
- Default required_traits to []. Use it only for an explicitly requested visible property whose absence would make the scene meaningfully wrong. Do not infer required parts from general object knowledge.
- Most era, material, color, finish, and shape wording belongs in preferred_traits.
- Set target_extent_m to 0 unless the user explicitly provided a physical measurement for that specific object.
- For explicit spatial language, emit placement_relation, placement_target_instance_id, placement_anchor, and placement_region.
- "On top of" is exterior + upward + highest + open. "Top shelf" is interior + upward + highest + enclosed. Do not treat these phrases as equivalent.
- Default placement_region.allow_intersection to false. Set it true only for an explicitly requested physical intersection.
- Do not create visible primitive substitutes, decorative floors, stages, walls, or backdrops.
- Physical-object nodes must use render_policy "layout_proxy".
- Use render_policy "procedural_required" only for an explicitly requested abstract glow or particle cloud.
- Every layout_proxy_node_id must exist in nodes.
- Every director event, camera focus, and text anchor must reference a physical asset requirement instance_id or a procedural_required node id.
- Give each director moment one visual job and preserve stable actor ids across the full sequence.
- Fill moment.shot with the composable V2 direction. Combine framing + angle + lens + camera movement + blocking + lighting + continuity when they clarify the visual argument.
- Never output exact camera/world coordinates inside moment.shot. Use semantic actor ids, coordinate spaces, strengths, durations/progress windows, screen anchors, and movement parameters; MyWay solves the exact camera against final asset geometry.
- Use 1-3 camera movement_steps for a normal shot. Use more only when the request truly needs a continuous complex take. Include settle or a hold when the viewer needs time to understand the result.
- Use shot.constraints only for semantic kinematic relationships that must remain true during motion. Do not use constraints to bypass measured physical placement or collision safety.
- Missing assets may be absent from the current rendered scene, but their direction, capability needs, anchors, movement, camera cues, and text cues must remain complete.
- MyWay will preserve explicit spatial intent, infer missing relations from proxy geometry, and enforce collision-safe final placement after assets load.`;

  return {
    model_task: "hybrid_primitive_scene_graph_planner",
    schema_version:
      "asset_scene_graph_model_request_v8_director_consolidation",
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ],
    response_contract: schema,
    prompt_stats: {
      system_chars: system.length,
      user_chars: user.length,
      total_chars: system.length + user.length,
    },
  };
}

export function makePrimitiveBuildRepairRequest(input: {
  user_request: string;
  style?: PrimitiveBuilderRequestBody["style"];
  previous_response?: string;
}) {
  const style = normalizedStyle(input.style);
  const schema = compactResponseContract();
  const previousPreview =
    typeof input.previous_response === "string"
      ? input.previous_response.slice(0, 1800)
      : "";

  const system = `Return one compact valid JSON object only.
No markdown, no code fence, no explanation, and no reasoning text.
The first character must be { and the final character must be }.
Regenerate the requested primitive_scene_graph_v2 from scratch when the previous response is unusable.`;

  const user = `The previous scene-planner response could not be parsed.

USER_REQUEST: ${shortText(
    input.user_request,
    "build something interesting",
  )}

STYLE: ${JSON.stringify(style)}

REQUIRED_OUTPUT_SHAPE: ${JSON.stringify(schema)}

PREVIOUS_RESPONSE_PREVIEW:
${previousPreview || "(empty or unavailable)"}

Create a fresh request-specific scene. Include a complete director_plan plus meaningful invisible layout proxies. Do not output legacy beats; MyWay derives them from director_plan.moments. Every physical object that should appear must have an asset requirement, and every physical actor in the director plan must reference that requirement's stable instance_id. Keep identity in concept and object-specific visible appearance in appearance_request. Default required_traits to [] and never invent required parts from general object knowledge. Do not include unrelated demonstrations, decorative floors, stages, or visible primitive substitutes. Preserve explicit spatial relations with generic placement_region properties and keep allow_intersection false unless the request explicitly requires intersection. MyWay will handle asset selection, appearance ranking, measured spatial regions, collision-safe placement, renderer compilation, and late-bound actors after parsing.`;

  return {
    model_task:
      "hybrid_primitive_scene_graph_json_repair",
    schema_version:
      "asset_scene_graph_json_repair_v5_director_consolidation",
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ],
    response_contract: schema,
    prompt_stats: {
      system_chars: system.length,
      user_chars: user.length,
      total_chars: system.length + user.length,
    },
  };
}
