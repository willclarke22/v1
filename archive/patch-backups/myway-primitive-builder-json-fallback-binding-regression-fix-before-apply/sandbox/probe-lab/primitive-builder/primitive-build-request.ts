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

  const system = `You are MyWay's Hybrid Primitive Scene Planner.
Return only valid JSON. No markdown or commentary.
Turn the request into primitive_scene_graph_v2 for procedural 3D rendering with explicit reusable-asset requirements.
Think like a careful Lego builder and animator:
- build the big composition first
- divide the scene into meaningful groups
- put child parts in local coordinates inside their parent groups
- use repeated child parts for repeated details
- describe mechanisms as grouped subsystems
- use allowed motion semantics for motion, not code
MyWay owns asset lookup, asset IDs, file paths, rendering, validation, runtime animation, camera execution, lighting polish, and safety.
You may describe asset requirements, but never output an asset ID, URL, provider result, file path, React, Three.js, JavaScript, or executable code.
Use only allowed node kinds and motion types.
Every asset requirement must point to a recognizable primitive fallback node or group so the scene works before asset resolution.
Prefer clear, beautiful, stylized construction over realism when primitives are limited.`;

  const schema = {
    schema_version: "primitive_scene_graph_v2",
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
    asset_requirements: [
      {
        instance_id: "stable_requirement_id",
        concept: "plain-language reusable object",
        aliases: ["useful synonyms"],
        semantic_tags: ["meaningful matching tags"],
        style_tags: ["visual style needs"],
        motion_role: "how the object participates in motion",
        must_be_separate: true,
        reusable: true,
        required: true,
        target_extent_m: 1.5,
        fallback_primitive: "box | softBox | cylinder | sphere | group | none",
        fallback_node_id: "existing node or group id",
        parent_id: "optional existing parent group id",
        replacement_node_ids: ["all primitive node ids owned by this fallback"],
        placement_relation:
          "absolute | on_ground | on_surface | beside | inside | attached_to",
        placement_target_instance_id:
          "optional existing asset requirement id",
        placement_anchor: "center | top | bottom | front | back | left | right",
        placement_offset: [0, 0, 0],
        clearance_m: 0.01,
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
    asset_placement_relation: [
      "absolute",
      "on_ground",
      "on_surface",
      "beside",
      "inside",
      "attached_to",
    ],
  };

  const user = `Create primitive_scene_graph_v2.

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
- Add asset_requirements only for reusable objects whose fidelity would materially improve with a GLB, such as vehicles, furniture, appliances, buildings, animals, instruments, or detailed mechanisms.
- Do not request assets for floors, walls, simple rods, smoke, glows, labels, or basic structural filler.
- Every asset requirement must use a plain-language concept and must reference an existing fallback_node_id unless fallback_primitive is none.
- List every primitive node owned by an asset fallback in replacement_node_ids. When the GLB resolves, those owned nodes are removed together.
- Express physical relationships instead of guessing unrelated world coordinates: use on_surface for cups, food, books, or tools resting on tables, counters, shelves, or desks; use on_ground for floor-standing furniture and plants; use inside, beside, or attached_to when appropriate.
- placement_target_instance_id must reference another asset requirement when placement_relation depends on another object.
- placement_offset is local to the target object. clearance_m keeps objects from intersecting surfaces.
- The fallback node or group remains the source of placement and motion until MyWay resolves an approved asset and actual GLB bounds.
- Never output an asset_id, public_path, URL, source provider ID, or filename.
- For motion requests, attach motion objects to groups or parts using only allowed motion types.
- For hinges/doors/cabinets, use swingX/Y/Z with a pivot.
- For vehicles/toy cars/actors, use pathLoop and faceDirection when helpful.
- For wheels/fans/gears/crank discs, use rotateX/Y/Z.
- For pistons, use oscillateY for the piston group, orbitAround for the crank pin, connectBetween for the rod, followTarget for bearings, and pulse for firing/steam/glow.
- Every target/from/to/reveal/emphasize id must exist somewhere in nodes.
- Prefer clear grouped construction over decorative clutter.
- Do not invent asset IDs, file paths, URLs, textures, React, Three.js, or executable code.`;

  return {
    model_task: "hybrid_primitive_scene_graph_planner",
    schema_version: "primitive_scene_graph_model_request_debug_v2",
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
