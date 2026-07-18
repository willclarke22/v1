import type { PrimitiveBeat, PrimitiveBuildPlanV1, PrimitiveKind, PrimitivePart, VisualRole } from "./primitive-build-plan";
import {
  normalizePrimitiveBuilderAssetRequirements,
  type PrimitiveBuilderAssetRequirement,
} from "./asset-requirement-plan";

export const SCENE_GRAPH_NODE_KINDS = [
  "group",
  "box",
  "softBox",
  "cylinder",
  "sphere",
  "torus",
  "cone",
  "rod",
  "plane",
  "glow",
  "cloud",
] as const;

export const SCENE_GRAPH_MOTION_TYPES = [
  "driftY",
  "oscillateY",
  "pathLoop",
  "pulse",
  "rotateX",
  "rotateY",
  "rotateZ",
  "swingX",
  "swingY",
  "swingZ",
  "orbitAround",
  "followTarget",
  "connectBetween",
] as const;

export const SCENE_GRAPH_PLANES = ["xy", "xz", "yz"] as const;
export const SCENE_GRAPH_CAMERA_PRESETS = ["wide", "medium", "close", "top", "isometric", "orbit"] as const;

export type Vec3 = [number, number, number];
export type PrimitiveSceneGraphNodeKind = (typeof SCENE_GRAPH_NODE_KINDS)[number];
export type PrimitiveSceneGraphMotionType = (typeof SCENE_GRAPH_MOTION_TYPES)[number];
export type PrimitiveSceneGraphPlane = (typeof SCENE_GRAPH_PLANES)[number];
export type PrimitiveSceneGraphCameraPreset = (typeof SCENE_GRAPH_CAMERA_PRESETS)[number];

export type PrimitiveSceneGraphMotion = {
  type: PrimitiveSceneGraphMotionType;
  speed?: number;
  phase?: number;
  amplitude?: number;
  centerY?: number;
  pivot?: Vec3;
  minAngle?: number;
  maxAngle?: number;
  points?: Vec3[];
  faceDirection?: boolean;
  center?: Vec3;
  radius?: number;
  plane?: PrimitiveSceneGraphPlane;
  target?: string;
  from?: string;
  to?: string;
  thickness?: number;
  minOpacity?: number;
  maxOpacity?: number;
  activeWindow?: [number, number];
};

export type PrimitiveSceneGraphNode = {
  id: string;
  kind: PrimitiveSceneGraphNodeKind;
  display_name?: string;
  position?: Vec3;
  scale?: Vec3;
  rotation?: Vec3;
  color?: string;
  radius?: number;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  motion?: PrimitiveSceneGraphMotion;
  children?: PrimitiveSceneGraphNode[];
};

export type PrimitiveSceneGraphBeat = {
  id: string;
  title: string;
  reveal: string[];
  emphasize?: string[];
  camera?: PrimitiveSceneGraphCameraPreset;
};

export type PrimitiveSceneGraphV2 = {
  schema_version: "primitive_scene_graph_v2";
  user_request: string;
  scene_title: string;
  scene_summary: string;
  style: {
    look: "clean_stylized" | "diagrammatic" | "miniature" | "technical_cutaway";
    mood: "neutral" | "warm" | "energetic" | "clinical";
    complexity: "low" | "medium" | "high";
    cutaway: boolean;
  };
  nodes: PrimitiveSceneGraphNode[];
  asset_requirements: PrimitiveBuilderAssetRequirement[];
  beats: PrimitiveSceneGraphBeat[];
  camera?: {
    preset?: PrimitiveSceneGraphCameraPreset;
    target?: Vec3;
    position?: Vec3;
  };
  lighting?: {
    mood?: string;
    key_light?: Vec3;
    fill_light?: Vec3;
  };
};

// Compatibility alias for older imports while the runtime migrates to the
// hybrid v2 contract.
export type PrimitiveSceneGraphV1 = PrimitiveSceneGraphV2;

const nodeKindSet = new Set<string>(SCENE_GRAPH_NODE_KINDS);
const motionTypeSet = new Set<string>(SCENE_GRAPH_MOTION_TYPES);
const planeSet = new Set<string>(SCENE_GRAPH_PLANES);
const cameraSet = new Set<string>(SCENE_GRAPH_CAMERA_PRESETS);
const lookSet = new Set<string>(["clean_stylized", "diagrammatic", "miniature", "technical_cutaway"]);
const moodSet = new Set<string>(["neutral", "warm", "energetic", "clinical"]);
const complexitySet = new Set<string>(["low", "medium", "high"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanId(value: unknown, fallback: string) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : fallback;
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9_\-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return cleaned || fallback;
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  return typeof value === "string" && allowed.has(value) ? (value as T) : fallback;
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}

function vec3(value: unknown, fallback: Vec3): Vec3 {
  const raw = asArray(value);
  if (raw.length < 3) return fallback;
  return [finiteNumber(raw[0], fallback[0]), finiteNumber(raw[1], fallback[1]), finiteNumber(raw[2], fallback[2])];
}

function positiveScale(value: unknown, fallback: Vec3): Vec3 {
  const raw = vec3(value, fallback);
  return raw.map((item, index) => Math.max(0.02, Math.min(24, Math.abs(item || fallback[index] || 1)))) as Vec3;
}

function color(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{3}$/.test(trimmed)) return trimmed;
  return fallback;
}

function defaultColorFor(kind: PrimitiveSceneGraphNodeKind) {
  if (kind === "glow") return "#fbbf24";
  if (kind === "cloud") return "#ffffff";
  if (kind === "torus" || kind === "cylinder" || kind === "rod") return "#94a3b8";
  if (kind === "plane") return "#64748b";
  return "#38bdf8";
}

function normalizeMotion(raw: unknown, warnings: string[]): PrimitiveSceneGraphMotion | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const type = oneOf<PrimitiveSceneGraphMotionType>(record.type, motionTypeSet, "pulse");
  if (!record.type || record.type !== type) warnings.push(`Unknown motion type ${String(record.type)} normalized to ${type}.`);

  const motion: PrimitiveSceneGraphMotion = {
    type,
    speed: boundedNumber(record.speed, 1, 0, 10),
    phase: boundedNumber(record.phase, 0, -100, 100),
    amplitude: boundedNumber(record.amplitude, 0.3, 0, 12),
    centerY: boundedNumber(record.centerY, 0, -12, 12),
    pivot: vec3(record.pivot, [0, 0, 0]),
    minAngle: boundedNumber(record.minAngle, 0, -Math.PI * 2, Math.PI * 2),
    maxAngle: boundedNumber(record.maxAngle, 1, -Math.PI * 2, Math.PI * 2),
    faceDirection: record.faceDirection === true,
    center: vec3(record.center, [0, 0, 0]),
    radius: boundedNumber(record.radius, 1, 0.01, 20),
    plane: oneOf<PrimitiveSceneGraphPlane>(record.plane, planeSet, "xz"),
    target: typeof record.target === "string" ? cleanId(record.target, "") : undefined,
    from: typeof record.from === "string" ? cleanId(record.from, "") : undefined,
    to: typeof record.to === "string" ? cleanId(record.to, "") : undefined,
    thickness: boundedNumber(record.thickness, 0.08, 0.01, 4),
    minOpacity: boundedNumber(record.minOpacity, 0.05, 0, 1),
    maxOpacity: boundedNumber(record.maxOpacity, 0.65, 0, 1),
  };

  const rawPoints = asArray(record.points);
  if (rawPoints.length) motion.points = rawPoints.map((point) => vec3(point, [0, 0, 0]));

  const activeWindow = asArray(record.activeWindow);
  if (activeWindow.length >= 2) {
    motion.activeWindow = [boundedNumber(activeWindow[0], 0, 0, 1), boundedNumber(activeWindow[1], 1, 0, 1)];
  }

  return motion;
}

function normalizeNode(raw: unknown, seen: Set<string>, warnings: string[], fallbackPrefix: string): PrimitiveSceneGraphNode | null {
  const record = asRecord(raw);
  if (!record) return null;

  let id = cleanId(record.id, `${fallbackPrefix}_${seen.size + 1}`);
  if (seen.has(id)) {
    const base = id;
    let suffix = 2;
    while (seen.has(`${base}_${suffix}`)) suffix += 1;
    id = `${base}_${suffix}`;
    warnings.push(`Duplicate scene graph id ${base} renamed to ${id}.`);
  }
  seen.add(id);

  const kind = oneOf<PrimitiveSceneGraphNodeKind>(record.kind, nodeKindSet, "softBox");
  const node: PrimitiveSceneGraphNode = {
    id,
    kind,
    display_name: text(record.display_name, id.replace(/_/g, " ")),
    position: vec3(record.position, [0, 0, 0]),
    scale: kind === "group" ? [1, 1, 1] : positiveScale(record.scale, [1, 1, 1]),
    rotation: vec3(record.rotation, [0, 0, 0]),
    color: color(record.color, defaultColorFor(kind)),
    radius: boundedNumber(record.radius, kind === "softBox" ? 0.08 : 0.035, 0, 2),
    metalness: boundedNumber(record.metalness, 0.08, 0, 1),
    roughness: boundedNumber(record.roughness, 0.55, 0, 1),
    opacity: boundedNumber(record.opacity, kind === "cloud" ? 0.35 : kind === "glow" ? 0.56 : 1, 0, 1),
    motion: normalizeMotion(record.motion, warnings),
  };

  if (kind === "group") {
    const children = asArray(record.children)
      .map((child, index) => normalizeNode(child, seen, warnings, `${id}_child_${index + 1}`))
      .filter((child): child is PrimitiveSceneGraphNode => Boolean(child));
    node.children = children;
  }

  return node;
}

function collectIds(nodes: PrimitiveSceneGraphNode[], ids = new Set<string>()) {
  nodes.forEach((node) => {
    ids.add(node.id);
    collectIds(node.children ?? [], ids);
  });
  return ids;
}

function sanitizeMotionReferences(nodes: PrimitiveSceneGraphNode[], ids: Set<string>, warnings: string[]) {
  nodes.forEach((node) => {
    const motion = node.motion;
    if (motion?.type === "followTarget" && (!motion.target || !ids.has(motion.target))) {
      warnings.push(`Motion on ${node.id} referenced missing target ${motion.target ?? ""}; motion removed.`);
      node.motion = undefined;
    }
    if (motion?.type === "connectBetween" && (!motion.from || !motion.to || !ids.has(motion.from) || !ids.has(motion.to))) {
      warnings.push(`connectBetween on ${node.id} referenced missing endpoint; motion removed.`);
      node.motion = undefined;
    }
    sanitizeMotionReferences(node.children ?? [], ids, warnings);
  });
}

function makeScaffoldSceneGraph(userRequest: string): PrimitiveSceneGraphV2 {
  return {
    schema_version: "primitive_scene_graph_v2",
    user_request: userRequest,
    scene_title: "Grouped Motion Scene",
    scene_summary:
      "A fallback grouped scene graph with a stage, a moving object, a hinged panel, and a pulsing glow. It exists only when the model response cannot be used.",
    style: { look: "clean_stylized", mood: "neutral", complexity: "medium", cutaway: false },
    camera: { preset: "orbit", position: [6.4, 5.2, 7.2], target: [0, 1.2, -0.8] },
    lighting: { mood: "warm neutral", key_light: [4, 8, 6], fill_light: [-1.5, 2.4, -2.7] },
    nodes: [
      {
        id: "stage",
        kind: "group",
        display_name: "Stage",
        position: [0, 0, 0],
        children: [
          { id: "base", kind: "softBox", display_name: "Base", position: [0, -0.16, 0], scale: [7.5, 0.28, 4.8], color: "#7b5a3d", radius: 0.16 },
          { id: "floor", kind: "softBox", display_name: "Floor", position: [0, 0, 0], scale: [7.1, 0.12, 4.4], color: "#d7c2a7", radius: 0.1 },
        ],
      },
      {
        id: "motion_demo",
        kind: "group",
        display_name: "Motion demo",
        position: [0, 0.25, 0],
        children: [
          {
            id: "moving_car",
            kind: "group",
            display_name: "Moving car",
            position: [-2, 0.2, 0.9],
            motion: { type: "pathLoop", points: [[-2, 0.2, 0.9], [1.8, 0.2, 0.9], [1.2, 0.2, -0.7], [-2, 0.2, -0.5]], speed: 0.25, faceDirection: true },
            children: [
              { id: "car_body", kind: "softBox", display_name: "Car body", position: [0, 0.22, 0], scale: [0.9, 0.3, 0.5], color: "#38bdf8", radius: 0.08 },
              { id: "car_roof", kind: "softBox", display_name: "Car roof", position: [-0.08, 0.43, 0], scale: [0.42, 0.22, 0.38], color: "#7dd3fc", radius: 0.08 },
            ],
          },
          {
            id: "hinged_panel",
            kind: "group",
            display_name: "Hinged panel",
            position: [2.4, 0.8, -0.9],
            motion: { type: "swingY", pivot: [-0.45, 0, 0], minAngle: 0, maxAngle: 1.1, speed: 0.7 },
            children: [{ id: "panel_body", kind: "softBox", display_name: "Panel body", position: [0, 0, 0], scale: [0.9, 1.1, 0.06], color: "#7c8048", radius: 0.05 }],
          },
          { id: "focus_glow", kind: "glow", display_name: "Motion glow", position: [0, 1.4, 0], scale: [1.2, 0.08, 0.8], color: "#fbbf24", opacity: 0.4, motion: { type: "pulse", speed: 0.8 } },
        ],
      },
    ],
    asset_requirements: [
      {
        instance_id: "moving_car_asset",
        concept: "small passenger car",
        aliases: ["car", "automobile"],
        semantic_tags: ["vehicle", "wheels", "transportation"],
        style_tags: ["clean", "reusable"],
        motion_role: "moves along the path loop",
        must_be_separate: true,
        reusable: true,
        required: false,
        target_extent_m: 1.8,
        fallback_primitive: "group",
        fallback_node_id: "moving_car",
        parent_id: "motion_demo",
        replacement_node_ids: ["moving_car"],
        placement_relation: "on_ground",
        placement_anchor: "bottom",
        placement_offset: [0, 0, 0],
        clearance_m: 0.01,
        position: [-2, 0, 0.9],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ],
    beats: [
      { id: "beat_1", title: "Build the grouped stage", reveal: ["stage"], camera: "wide" },
      { id: "beat_2", title: "Show motion semantics", reveal: ["motion_demo"], emphasize: ["moving_car", "hinged_panel", "focus_glow"], camera: "medium" },
    ],
  };
}

export function normalizePrimitiveSceneGraph(raw: unknown, userRequest: string): { scene_graph: PrimitiveSceneGraphV2; warnings: string[] } {
  const warnings: string[] = [];
  const rootRecord = asRecord(raw);
  const source = asRecord(rootRecord?.scene_graph) ?? asRecord(rootRecord?.scene) ?? rootRecord;
  if (!source) {
    return { scene_graph: makeScaffoldSceneGraph(userRequest), warnings: ["Model response was not an object; grouped scaffold scene used."] };
  }

  const styleRecord = asRecord(source.style) ?? {};
  const seen = new Set<string>();
  const rawNodes = asArray(source.nodes);
  const nodes = rawNodes
    .map((node, index) => normalizeNode(node, seen, warnings, `node_${index + 1}`))
    .filter((node): node is PrimitiveSceneGraphNode => Boolean(node));

  if (!nodes.length) {
    return { scene_graph: makeScaffoldSceneGraph(userRequest), warnings: ["Model response had no valid scene graph nodes; grouped scaffold scene used."] };
  }

  const ids = collectIds(nodes);
  sanitizeMotionReferences(nodes, ids, warnings);
  const assetRequirements =
    normalizePrimitiveBuilderAssetRequirements(
      source.asset_requirements,
      ids,
      warnings,
    );

  const beats: PrimitiveSceneGraphBeat[] = asArray(source.beats)
    .map((beat, index): PrimitiveSceneGraphBeat | null => {
      const record = asRecord(beat);
      if (!record) return null;
      const reveal = asArray(record.reveal).map((id) => cleanId(id, "")).filter((id) => ids.has(id));
      const emphasize = asArray(record.emphasize).map((id) => cleanId(id, "")).filter((id) => ids.has(id));
      if (!reveal.length && !emphasize.length) return null;
      return {
        id: cleanId(record.id, `beat_${index + 1}`),
        title: text(record.title, `Beat ${index + 1}`),
        reveal,
        emphasize: emphasize.length ? emphasize : undefined,
        camera: oneOf<PrimitiveSceneGraphCameraPreset>(record.camera, cameraSet, index === 0 ? "wide" : "medium"),
      };
    })
    .filter((beat): beat is PrimitiveSceneGraphBeat => Boolean(beat));

  const cameraRecord = asRecord(source.camera) ?? {};
  const lightingRecord = asRecord(source.lighting) ?? {};

  return {
    scene_graph: {
      schema_version: "primitive_scene_graph_v2",
      user_request: text(source.user_request, userRequest),
      scene_title: text(source.scene_title, "Grouped Primitive Scene"),
      scene_summary: text(source.scene_summary, "A grouped procedural scene graph assembled from primitives and allowed motion semantics."),
      style: {
        look: oneOf<PrimitiveSceneGraphV1["style"]["look"]>(styleRecord.look, lookSet, "clean_stylized"),
        mood: oneOf<PrimitiveSceneGraphV1["style"]["mood"]>(styleRecord.mood, moodSet, "neutral"),
        complexity: oneOf<PrimitiveSceneGraphV1["style"]["complexity"]>(styleRecord.complexity, complexitySet, "medium"),
        cutaway: styleRecord.cutaway === true,
      },
      nodes,
      asset_requirements: assetRequirements,
      beats: beats.length
        ? beats
        : [{ id: "beat_1", title: "Build the grouped scene", reveal: nodes.map((node) => node.id), camera: "wide" }],
      camera: {
        preset: oneOf<PrimitiveSceneGraphCameraPreset>(cameraRecord.preset, cameraSet, "orbit"),
        target: vec3(cameraRecord.target, [0, 1.2, -0.8]),
        position: vec3(cameraRecord.position, [6.4, 5.2, 7.2]),
      },
      lighting: {
        mood: text(lightingRecord.mood, "neutral studio"),
        key_light: vec3(lightingRecord.key_light, [4, 8, 6]),
        fill_light: vec3(lightingRecord.fill_light, [-1.5, 2.4, -2.7]),
      },
    },
    warnings,
  };
}

function flattenSceneGraphNodes(nodes: PrimitiveSceneGraphNode[], output: PrimitiveSceneGraphNode[] = []) {
  nodes.forEach((node) => {
    output.push(node);
    flattenSceneGraphNodes(node.children ?? [], output);
  });
  return output;
}

type RenderableSceneGraphEntry = {
  node: PrimitiveSceneGraphNode;
  world_position: Vec3;
};

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[0] + b[0],
    a[1] + b[1],
    a[2] + b[2],
  ];
}

function flattenRenderableSceneGraphNodes(
  nodes: PrimitiveSceneGraphNode[],
  parentPosition: Vec3 = [0, 0, 0],
  output: RenderableSceneGraphEntry[] = [],
) {
  nodes.forEach((node) => {
    const worldPosition = addVec3(
      parentPosition,
      vec3(node.position, [0, 0, 0]),
    );

    if (node.kind !== "group") {
      output.push({
        node,
        world_position: worldPosition,
      });
    }

    flattenRenderableSceneGraphNodes(
      node.children ?? [],
      worldPosition,
      output,
    );
  });

  return output;
}

function collectRenderableDescendantIds(
  nodes: PrimitiveSceneGraphNode[],
  output = new Map<string, string[]>(),
): Map<string, string[]> {
  function visit(node: PrimitiveSceneGraphNode): string[] {
    const own =
      node.kind === "group"
        ? []
        : [node.id];
    const nested = (node.children ?? []).flatMap(visit);
    const ids = [...own, ...nested];
    output.set(node.id, ids);
    return ids;
  }

  nodes.forEach(visit);
  return output;
}

function primitiveForKind(kind: PrimitiveSceneGraphNodeKind): PrimitiveKind {
  switch (kind) {
    case "softBox":
      return "rounded_box";
    case "cloud":
      return "particle_cloud";
    case "group":
      return "rounded_box";
    default:
      return kind as PrimitiveKind;
  }
}

function roleForKind(kind: PrimitiveSceneGraphNodeKind): VisualRole {
  if (kind === "group") return "container";
  if (kind === "plane") return "surface";
  if (kind === "rod") return "connector";
  if (kind === "torus") return "rotator";
  if (kind === "glow") return "light_source";
  if (kind === "cloud") return "particle_field";
  return "solid_body";
}

export function countSceneGraphNodes(nodes: PrimitiveSceneGraphNode[]) {
  return flattenSceneGraphNodes(nodes).length;
}

export function sceneGraphToPrimitiveBuildPlan(sceneGraph: PrimitiveSceneGraphV2): PrimitiveBuildPlanV1 {
  const entries = flattenRenderableSceneGraphNodes(
    sceneGraph.nodes,
  );
  const parts: PrimitivePart[] = entries.map(
    ({ node, world_position }) => ({
      id: node.id,
      display_name:
        node.display_name ??
        node.id.replace(/_/g, " "),
      primitive: primitiveForKind(node.kind),
      role: roleForKind(node.kind),
      size: positiveScale(node.scale, [1, 1, 1]),
      material:
        node.kind === "glow"
          ? "glow"
          : node.kind === "cloud"
            ? "particle"
            : node.metalness && node.metalness > 0.25
              ? "metal"
              : node.opacity && node.opacity < 0.75
                ? "glass"
                : "matte",
      style_hint: "scene_graph_absolute",
      placement: {
        relation: "root",
        anchor: "center",
        offset: world_position,
      },
      modifiers:
        node.kind === "softBox"
          ? ["rounded"]
          : node.opacity && node.opacity < 0.75
            ? ["transparent"]
            : undefined,
    }),
  );

  const partIds = new Set(
    parts.map((part) => part.id),
  );
  const descendants =
    collectRenderableDescendantIds(sceneGraph.nodes);

  function expandBeatTargets(values: string[]) {
    return Array.from(
      new Set(
        values.flatMap((id) => {
          if (partIds.has(id)) return [id];
          return descendants.get(id) ?? [];
        }),
      ),
    ).filter((id) => partIds.has(id));
  }

  const beats: PrimitiveBeat[] =
    sceneGraph.beats.map((beat, index) => {
      const reveal = expandBeatTargets(beat.reveal);
      const emphasize = expandBeatTargets(
        beat.emphasize ?? [],
      );

      return {
        id: beat.id || `beat_${index + 1}`,
        title: beat.title || `Beat ${index + 1}`,
        reveal:
          reveal.length > 0
            ? reveal
            : parts.map((part) => part.id),
        emphasize:
          emphasize.length > 0
            ? emphasize
            : undefined,
        camera:
          beat.camera ??
          (index === 0 ? "wide" : "medium"),
      };
    });

  return {
    schema_version: "primitive_build_plan_v1",
    user_request: sceneGraph.user_request,
    scene_title: sceneGraph.scene_title,
    scene_summary: sceneGraph.scene_summary,
    style: sceneGraph.style,
    parts,
    relationships: [],
    beats:
      beats.length > 0
        ? beats
        : [
            {
              id: "beat_1",
              title: "Build the grouped scene",
              reveal: parts.map((part) => part.id),
              camera: "wide",
            },
          ],
  };
}

export function makePrimitiveSceneGraphScaffoldText(userRequest: string) {
  return JSON.stringify(makeScaffoldSceneGraph(userRequest), null, 2);
}
