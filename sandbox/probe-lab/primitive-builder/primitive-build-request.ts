import {
  SCENE_GRAPH_CAMERA_PRESETS,
  SCENE_GRAPH_MOTION_TYPES,
  SCENE_GRAPH_NODE_KINDS,
  SCENE_GRAPH_PLANES,
} from "./primitive-scene-graph";

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
    nodes: [
      {
        id: "stable_snake_case_id",
        kind: SCENE_GRAPH_NODE_KINDS.join(" | "),
        display_name: "optional name",
        position: [0, 0, 0],
        scale: [1, 1, 1],
        rotation: [0, 0, 0],
        color: "#94a3b8",
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
        semantic_tags: ["meaningful tags"],
        style_tags: ["style needs"],
        motion_role: "short role",
        must_be_separate: true,
        reusable: true,
        required: true,
        target_extent_m: 1.5,
        fallback_primitive:
          "box | softBox | cylinder | sphere | group | none",
        fallback_node_id: "existing node or group id",
        parent_id: "optional existing parent group id",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ],
    beats: [
      {
        id: "beat_1",
        title: "short title",
        reveal: ["node ids"],
        emphasize: ["optional node ids"],
        camera: "optional camera preset",
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

  const system = `You are MyWay's Primitive Scene Planner.
Return exactly one valid JSON object. Do not use markdown, code fences, commentary, or hidden reasoning.
Build a clear grouped primitive_scene_graph_v2 from the request.
Use local child coordinates inside meaningful groups.
Use only the allowed node and motion values.
You may request reusable GLB objects, but never output asset IDs, URLs, providers, paths, React, Three.js, JavaScript, or executable code.
Every asset requirement must reference an existing primitive fallback node or group.
MyWay—not the model—will infer replacement ownership, physical attachment relationships, verified asset identity, and final GLB placement.`;

  const allowed = {
    node_kind: SCENE_GRAPH_NODE_KINDS,
    motion_type: SCENE_GRAPH_MOTION_TYPES,
    motion_plane: SCENE_GRAPH_PLANES,
    camera: SCENE_GRAPH_CAMERA_PRESETS,
    look: SCENE_LOOKS,
    mood: SCENE_MOODS,
    complexity: SCENE_COMPLEXITIES,
    asset_fallback_primitive: [
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
- Use groups for recognizable objects and subsystems.
- Keep the requested composition coherent and omit unrelated demo objects.
- Add asset_requirements for reusable objects whose fidelity benefits from a GLB.
- Do not request assets for floors, walls, paths, smoke, glows, or basic filler.
- Every fallback_node_id and every beat node ID must exist in nodes.
- MyWay will infer on-surface placement, grounding, replacement ownership, and asset ranking after parsing.`;

  return {
    model_task: "hybrid_primitive_scene_graph_planner",
    schema_version:
      "primitive_scene_graph_model_request_compact_v3",
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

Create a fresh request-specific scene. Use 3 to 16 meaningful nodes and one or more beats. Do not include unrelated demonstration cars, panels, or glows. MyWay will handle asset placement and replacement metadata after parsing.`;

  return {
    model_task:
      "hybrid_primitive_scene_graph_json_repair",
    schema_version:
      "primitive_scene_graph_json_repair_v1",
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
