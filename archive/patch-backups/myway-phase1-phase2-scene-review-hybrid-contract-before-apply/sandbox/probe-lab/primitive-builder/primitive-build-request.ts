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

export function makePrimitiveBuildModelRequest(input: {
  user_request: string;
  style?: PrimitiveBuilderRequestBody["style"];
}) {
  const look = allowedOr(input.style?.look, SCENE_LOOKS, "clean_stylized");
  const mood = allowedOr(input.style?.mood, SCENE_MOODS, "neutral");
  const complexity = allowedOr(input.style?.complexity, SCENE_COMPLEXITIES, "medium");
  const cutaway = input.style?.cutaway === true;

  const system = `You are MyWay's Primitive Scene Graph Planner.
Return only valid JSON. No markdown or commentary.
Turn the request into primitive_scene_graph_v1 for procedural 3D rendering.
Think like a careful Lego builder and animator:
- build the big composition first
- divide the scene into meaningful groups
- put child parts in local coordinates inside their parent groups
- use repeated child parts for repeated details
- describe mechanisms as grouped subsystems
- use allowed motion semantics for motion, not code
MyWay owns rendering, validation, runtime animation, camera execution, lighting polish, and safety.
Do not output React, Three.js, JavaScript, assets, file paths, or textures.
Use only allowed node kinds and motion types.
Prefer clear, beautiful, stylized construction over realism when primitives are limited.`;

  const schema = {
    schema_version: "primitive_scene_graph_v1",
    user_request: "string",
    scene_title: "string",
    scene_summary: "string",
    style: {
      look: SCENE_LOOKS.join(" | "),
      mood: SCENE_MOODS.join(" | "),
      complexity: SCENE_COMPLEXITIES.join(" | "),
      cutaway: true,
    },
    camera: {
      preset: SCENE_GRAPH_CAMERA_PRESETS.join(" | "),
      position: [6.4, 5.2, 7.2],
      target: [0, 1.2, -0.8],
    },
    lighting: {
      mood: "short lighting description",
      key_light: [4, 8, 6],
      fill_light: [-1.5, 2.4, -2.7],
    },
    nodes: [
      {
        id: "stable_snake_case_id",
        kind: "group | box | softBox | cylinder | sphere | torus | cone | rod | plane | glow | cloud",
        display_name: "optional learner-facing name",
        position: [0, 0, 0],
        scale: [1, 1, 1],
        rotation: [0, 0, 0],
        color: "#94a3b8",
        radius: 0.08,
        metalness: 0.1,
        roughness: 0.55,
        opacity: 1,
        motion: {
          type: "optional allowed motion type",
          speed: 0.8,
          phase: 0,
          amplitude: 0.4,
          pivot: [0, 0, 0],
          minAngle: 0,
          maxAngle: 1,
          points: [[0, 0, 0]],
          faceDirection: true,
          center: [0, 0, 0],
          radius: 1,
          plane: "xy | xz | yz",
          target: "existing node id",
          from: "existing node id",
          to: "existing node id",
          thickness: 0.08,
          minOpacity: 0.08,
          maxOpacity: 0.65,
        },
        children: ["same node shape when kind is group"],
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

  const allowed = {
    node_kind: SCENE_GRAPH_NODE_KINDS,
    motion_type: SCENE_GRAPH_MOTION_TYPES,
    motion_plane: SCENE_GRAPH_PLANES,
    camera: SCENE_GRAPH_CAMERA_PRESETS,
    look: SCENE_LOOKS,
    mood: SCENE_MOODS,
    complexity: SCENE_COMPLEXITIES,
  };

  const user = `Create primitive_scene_graph_v1.

USER_REQUEST: ${shortText(input.user_request, "build something interesting")}

STYLE_PREFERENCES: ${JSON.stringify({ look, mood, complexity, cutaway })}

ALLOWED_VALUES: ${JSON.stringify(allowed)}

OUTPUT_SCHEMA: ${JSON.stringify(schema)}

RULES:
- Return only JSON.
- Use nodes[], not flat parts[].
- Use groups for meaningful objects and subsystems.
- Use local child coordinates inside groups. Do not make every object a top-level node.
- Use top-level nodes only for major scene regions such as room, vehicle, inset, environment, or mechanism.
- Make the requested thing recognizable from primitives alone.
- For motion requests, attach motion objects to groups or parts using only allowed motion types.
- For hinges/doors/cabinets, use swingX/Y/Z with a pivot.
- For vehicles/toy cars/actors, use pathLoop and faceDirection when helpful.
- For wheels/fans/gears/crank discs, use rotateX/Y/Z.
- For pistons, use oscillateY for the piston group, orbitAround for the crank pin, connectBetween for the rod, followTarget for bearings, and pulse for firing/steam/glow.
- Every target/from/to/reveal/emphasize id must exist somewhere in nodes.
- Prefer clear grouped construction over decorative clutter.
- Do not invent assets, file paths, textures, React, Three.js, or executable code.`;

  return {
    model_task: "primitive_scene_graph_planner",
    schema_version: "primitive_scene_graph_model_request_debug_v1",
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
