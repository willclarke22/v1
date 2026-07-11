import {
  ANCHOR_POINTS,
  BUILD_EFFECT_TYPES,
  CAMERA_PRESETS,
  MATERIAL_KINDS,
  MODIFIERS,
  PLACEMENT_RELATIONS,
  PRIMITIVE_KINDS,
  SCENE_COMPLEXITIES,
  SCENE_LOOKS,
  SCENE_MOODS,
  VISUAL_ROLES,
} from "./primitive-build-plan";

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

export function makePrimitiveBuildModelRequest(input: {
  user_request: string;
  style?: PrimitiveBuilderRequestBody["style"];
}) {
  const look = allowedOr(input.style?.look, SCENE_LOOKS, "clean_stylized");
  const mood = allowedOr(input.style?.mood, SCENE_MOODS, "neutral");
  const complexity = allowedOr(input.style?.complexity, SCENE_COMPLEXITIES, "medium");
  const cutaway = input.style?.cutaway === true;

  const system = `You are MyWay's Primitive Build Planner.
Return only valid JSON. No markdown or commentary.
Turn the request into primitive_build_plan_v1 for procedural 3D rendering.
Think like a Lego builder: visible parts, primitive shapes, visual roles, relative placement, relationships, assembly beats.
MyWay handles exact coordinates, spacing, proportions, lighting, camera, polish, collision cleanup, and rendering.
Use relationships and anchors first. Offsets are optional small nudges, not coordinates.
Use only allowed values. Use as many parts and beat reveals as the scene genuinely needs. Avoid decorative clutter.
Prefer clear, beautiful, stylized construction. Assets are not available. Build from primitives.`;

  const schema = {
    schema_version: "primitive_build_plan_v1",
    user_request: "string",
    scene_title: "string",
    scene_summary: "string",
    style: {
      look: SCENE_LOOKS.join(" | "),
      mood: SCENE_MOODS.join(" | "),
      complexity: SCENE_COMPLEXITIES.join(" | "),
      cutaway: true,
    },
    parts: [
      {
        id: "stable_snake_case_id",
        display_name: "learner-facing name",
        primitive: "allowed primitive",
        role: "allowed role",
        size: [1, 1, 1],
        material: "allowed material",
        style_hint: "short optional hint",
        placement: {
          relation: "allowed placement relation",
          target_id: "existing part id or omit for root",
          anchor: "optional allowed anchor",
          offset: [0, 0, 0],
        },
        modifiers: ["optional allowed modifiers"],
      },
    ],
    relationships: [{ type: "allowed relationship type", source_id: "existing part id", target_id: "existing part id" }],
    beats: [
      {
        id: "beat_1",
        title: "short title",
        reveal: ["part ids"],
        emphasize: ["optional part ids"],
        camera: "optional allowed camera",
        effects: [{ type: "allowed effect type", target_id: "existing part id" }],
      },
    ],
  };

  const allowed = {
    primitive: PRIMITIVE_KINDS,
    role: VISUAL_ROLES,
    material: MATERIAL_KINDS,
    placement_relation: PLACEMENT_RELATIONS,
    anchor: ANCHOR_POINTS,
    relationship_type: ["supports", "contains", "connects_to", "aligns_with", "emits", "flows_to", "rotates_with", "slides_with"],
    effect_type: BUILD_EFFECT_TYPES,
    camera: CAMERA_PRESETS,
    modifiers: MODIFIERS,
  };

  const user = `Create primitive_build_plan_v1.

USER_REQUEST: ${shortText(input.user_request, "build something interesting")}

STYLE_PREFERENCES: ${JSON.stringify({ look, mood, complexity, cutaway })}

ALLOWED_VALUES: ${JSON.stringify(allowed)}

OUTPUT_SCHEMA: ${JSON.stringify(schema)}

RULES:
- Return only JSON.
- Use at least one root part.
- Every referenced id must exist.
- Use relative placement. Prefer relation + target_id + anchor over offsets.
- Use offset only for small nudges; never rely on offset to make the main layout work.
- Make the object recognizable and visually balanced from primitives alone.
- Do not invent assets, file paths, textures, or code.`;

  return {
    model_task: "primitive_build_plan_planner",
    schema_version: "primitive_build_plan_model_request_debug_v1",
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
