export const PRIMITIVE_KINDS = [
  "box",
  "rounded_box",
  "sphere",
  "ellipsoid",
  "cylinder",
  "cone",
  "capsule",
  "torus",
  "plane",
  "rod",
  "path",
  "arrow",
  "label",
  "particle_cloud",
  "glow",
  "transparent_shell",
] as const;

export const VISUAL_ROLES = [
  "solid_body",
  "container",
  "surface",
  "connector",
  "rotator",
  "support",
  "opening",
  "flow",
  "particle_field",
  "light_source",
  "label",
  "cutaway_layer",
  "background",
] as const;

export const MATERIAL_KINDS = ["matte", "metal", "glass", "glow", "line", "particle"] as const;

export const PLACEMENT_RELATIONS = [
  "root",
  "inside",
  "on_top_of",
  "below",
  "left_of",
  "right_of",
  "in_front_of",
  "behind",
  "attached_to",
  "centered_on",
  "around",
  "along",
] as const;

export const ANCHOR_POINTS = ["center", "top", "bottom", "left", "right", "front", "back"] as const;
export const SCENE_LOOKS = ["clean_stylized", "diagrammatic", "miniature", "technical_cutaway"] as const;
export const SCENE_MOODS = ["neutral", "warm", "energetic", "clinical"] as const;
export const SCENE_COMPLEXITIES = ["low", "medium", "high"] as const;
export const CAMERA_PRESETS = ["wide", "medium", "close", "top", "isometric", "orbit"] as const;
export const BUILD_EFFECT_TYPES = ["show", "highlight", "pulse", "emit", "flow", "rotate", "slide"] as const;
export const MODIFIERS = ["rounded", "hollow", "transparent", "cutaway", "outlined", "stacked", "mirrored"] as const;

export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];
export type VisualRole = (typeof VISUAL_ROLES)[number];
export type MaterialKind = (typeof MATERIAL_KINDS)[number];
export type PlacementRelation = (typeof PLACEMENT_RELATIONS)[number];
export type AnchorPoint = (typeof ANCHOR_POINTS)[number];
export type SceneLook = (typeof SCENE_LOOKS)[number];
export type SceneMood = (typeof SCENE_MOODS)[number];
export type SceneComplexity = (typeof SCENE_COMPLEXITIES)[number];
export type CameraPreset = (typeof CAMERA_PRESETS)[number];
export type BuildEffectType = (typeof BUILD_EFFECT_TYPES)[number];
export type PrimitiveModifier = (typeof MODIFIERS)[number];

export type PrimitiveBuildPlanV1 = {
  schema_version: "primitive_build_plan_v1";
  user_request: string;
  scene_title: string;
  scene_summary: string;
  style: {
    look: SceneLook;
    mood: SceneMood;
    complexity: SceneComplexity;
    cutaway: boolean;
  };
  parts: PrimitivePart[];
  relationships: PrimitiveRelationship[];
  beats: PrimitiveBeat[];
};

export type PrimitivePart = {
  id: string;
  display_name: string;
  primitive: PrimitiveKind;
  role: VisualRole;
  size: [number, number, number];
  material: MaterialKind;
  style_hint?: string;
  placement: {
    relation: PlacementRelation;
    target_id?: string;
    anchor?: AnchorPoint;
    offset?: [number, number, number];
  };
  modifiers?: PrimitiveModifier[];
};

export type PrimitiveRelationship = {
  type: "supports" | "contains" | "connects_to" | "aligns_with" | "emits" | "flows_to" | "rotates_with" | "slides_with";
  source_id: string;
  target_id: string;
};

export type PrimitiveBeat = {
  id: string;
  title: string;
  reveal: string[];
  emphasize?: string[];
  camera?: CameraPreset;
  effects?: Array<{
    type: BuildEffectType;
    target_id: string;
  }>;
};

const primitiveSet = new Set<string>(PRIMITIVE_KINDS);
const roleSet = new Set<string>(VISUAL_ROLES);
const materialSet = new Set<string>(MATERIAL_KINDS);
const relationSet = new Set<string>(PLACEMENT_RELATIONS);
const anchorSet = new Set<string>(ANCHOR_POINTS);
const lookSet = new Set<string>(SCENE_LOOKS);
const moodSet = new Set<string>(SCENE_MOODS);
const complexitySet = new Set<string>(SCENE_COMPLEXITIES);
const cameraSet = new Set<string>(CAMERA_PRESETS);
const effectSet = new Set<string>(BUILD_EFFECT_TYPES);
const modifierSet = new Set<string>(MODIFIERS);
const relationshipSet = new Set<string>([
  "supports",
  "contains",
  "connects_to",
  "aligns_with",
  "emits",
  "flows_to",
  "rotates_with",
  "slides_with",
]);

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

function vec3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  const raw = asArray(value);
  if (raw.length < 3) return fallback;
  const nums = raw.slice(0, 3).map((item) => (typeof item === "number" && Number.isFinite(item) ? item : 0));
  return [nums[0] ?? fallback[0], nums[1] ?? fallback[1], nums[2] ?? fallback[2]];
}

function positiveSize(value: unknown, fallback: [number, number, number]): [number, number, number] {
  const size = vec3(value, fallback);
  return size.map((item, index) => {
    const fallbackValue = fallback[index] ?? 1;
    return Math.max(0.04, Math.min(20, Math.abs(item || fallbackValue)));
  }) as [number, number, number];
}

function makeScaffoldPlan(userRequest: string): PrimitiveBuildPlanV1 {
  return {
    schema_version: "primitive_build_plan_v1",
    user_request: userRequest,
    scene_title: "Primitive Draft Scene",
    scene_summary:
      "A simple fallback build made from a stage, main form, support pieces, and a focus marker. Use this only when a model plan is unavailable.",
    style: { look: "clean_stylized", mood: "neutral", complexity: "medium", cutaway: false },
    parts: [
      {
        id: "stage",
        display_name: "Stage",
        primitive: "rounded_box",
        role: "background",
        size: [5, 0.12, 3.4],
        material: "matte",
        style_hint: "dark_stage",
        placement: { relation: "root" },
        modifiers: ["rounded"],
      },
      {
        id: "main_body",
        display_name: "Main body",
        primitive: "rounded_box",
        role: "solid_body",
        size: [1.8, 1.1, 1.1],
        material: "matte",
        style_hint: "primary_form",
        placement: { relation: "on_top_of", target_id: "stage", anchor: "top" },
        modifiers: ["rounded"],
      },
      {
        id: "focus_glow",
        display_name: "Focus glow",
        primitive: "glow",
        role: "light_source",
        size: [0.5, 0.5, 0.5],
        material: "glow",
        style_hint: "purpose_marker",
        placement: { relation: "on_top_of", target_id: "main_body", anchor: "top" },
      },
    ],
    relationships: [
      { type: "supports", source_id: "stage", target_id: "main_body" },
      { type: "emits", source_id: "focus_glow", target_id: "main_body" },
    ],
    beats: [
      { id: "beat_1", title: "Set the stage", reveal: ["stage"], camera: "wide" },
      { id: "beat_2", title: "Build the main form", reveal: ["main_body"], emphasize: ["main_body"], camera: "medium" },
      { id: "beat_3", title: "Mark the focus", reveal: ["focus_glow"], emphasize: ["focus_glow"], camera: "close", effects: [{ type: "pulse", target_id: "focus_glow" }] },
    ],
  };
}

export function normalizePrimitiveBuildPlan(raw: unknown, userRequest: string): { plan: PrimitiveBuildPlanV1; warnings: string[] } {
  const warnings: string[] = [];
  const root = asRecord(raw);
  if (!root) {
    return { plan: makeScaffoldPlan(userRequest), warnings: ["Model response was not an object; scaffold plan used."] };
  }

  const styleRecord = asRecord(root.style) ?? {};
  const rawParts = asArray(root.parts);
  const seen = new Set<string>();
  const parts: PrimitivePart[] = [];

  rawParts.forEach((item, index) => {
    const record = asRecord(item);
    if (!record) return;

    let id = cleanId(record.id, `part_${index + 1}`);
    if (seen.has(id)) id = `${id}_${index + 1}`;
    seen.add(id);

    const placementRecord = asRecord(record.placement) ?? {};
    const relation = oneOf<PlacementRelation>(placementRecord.relation, relationSet, index === 0 ? "root" : "attached_to");
    const targetId = cleanId(placementRecord.target_id, "");
    const targetExists = targetId && seen.has(targetId);

    if (relation !== "root" && targetId && !targetExists) {
      warnings.push(`Part ${id} referenced unknown placement target ${targetId}; converted to root.`);
    }

    parts.push({
      id,
      display_name: text(record.display_name, id.replace(/_/g, " ")),
      primitive: oneOf<PrimitiveKind>(record.primitive, primitiveSet, "rounded_box"),
      role: oneOf<VisualRole>(record.role, roleSet, "solid_body"),
      size: positiveSize(record.size, [1, 1, 1]),
      material: oneOf<MaterialKind>(record.material, materialSet, "matte"),
      style_hint: typeof record.style_hint === "string" && record.style_hint.trim() ? record.style_hint.trim().slice(0, 80) : undefined,
      placement: {
        relation: relation === "root" || targetExists ? relation : "root",
        target_id: relation !== "root" && targetExists ? targetId : undefined,
        anchor: oneOf<AnchorPoint>(placementRecord.anchor, anchorSet, "center"),
        offset: vec3(placementRecord.offset, [0, 0, 0]),
      },
      modifiers: asArray(record.modifiers)
        .filter((modifier): modifier is PrimitiveModifier => typeof modifier === "string" && modifierSet.has(modifier))
        .filter((modifier, modifierIndex, all) => all.indexOf(modifier) === modifierIndex),
    });
  });

  if (!parts.length) {
    return { plan: makeScaffoldPlan(userRequest), warnings: ["Model response had no valid parts; scaffold plan used."] };
  }

  if (!parts.some((part) => part.placement.relation === "root")) {
    parts[0] = { ...parts[0]!, placement: { ...parts[0]!.placement, relation: "root", target_id: undefined } };
    warnings.push("No root part found; first part was converted to root.");
  }

  const ids = new Set(parts.map((part) => part.id));

  const relationships: PrimitiveRelationship[] = asArray(root.relationships)
    .map((item): PrimitiveRelationship | null => {
      const record = asRecord(item);
      if (!record) return null;
      const sourceId = cleanId(record.source_id, "");
      const targetId = cleanId(record.target_id, "");
      if (!ids.has(sourceId) || !ids.has(targetId)) return null;
      return {
        type: oneOf<PrimitiveRelationship["type"]>(record.type, relationshipSet, "connects_to"),
        source_id: sourceId,
        target_id: targetId,
      };
    })
    .filter((item): item is PrimitiveRelationship => Boolean(item));

  const beats: PrimitiveBeat[] = asArray(root.beats)
    .map((item, index): PrimitiveBeat | null => {
      const record = asRecord(item);
      if (!record) return null;
      const reveal = asArray(record.reveal).map((id) => cleanId(id, "")).filter((id) => ids.has(id));
      const emphasize = asArray(record.emphasize).map((id) => cleanId(id, "")).filter((id) => ids.has(id));
      const effects = asArray(record.effects)
        .map((effect): NonNullable<PrimitiveBeat["effects"]>[number] | null => {
          const effectRecord = asRecord(effect);
          if (!effectRecord) return null;
          const targetId = cleanId(effectRecord.target_id, "");
          if (!ids.has(targetId)) return null;
          return {
            type: oneOf<BuildEffectType>(effectRecord.type, effectSet, "show"),
            target_id: targetId,
          };
        })
        .filter((effect): effect is NonNullable<PrimitiveBeat["effects"]>[number] => Boolean(effect));

      if (!reveal.length && !emphasize.length) return null;
      return {
        id: cleanId(record.id, `beat_${index + 1}`),
        title: text(record.title, `Beat ${index + 1}`),
        reveal,
        emphasize: emphasize.length ? emphasize : undefined,
        camera: oneOf<CameraPreset>(record.camera, cameraSet, index === 0 ? "wide" : "medium"),
        effects: effects?.length ? effects : undefined,
      };
    })
    .filter((item): item is PrimitiveBeat => Boolean(item));

  const safeBeats = beats.length
    ? beats
    : [
        {
          id: "beat_1",
          title: "Build the scene",
          reveal: parts.map((part) => part.id),
          emphasize: [parts[0]!.id],
          camera: "wide" as const,
        },
      ];

  return {
    plan: {
      schema_version: "primitive_build_plan_v1",
      user_request: text(root.user_request, userRequest),
      scene_title: text(root.scene_title, "Primitive Build"),
      scene_summary: text(root.scene_summary, "A procedural scene assembled from small primitive parts."),
      style: {
        look: oneOf<SceneLook>(styleRecord.look, lookSet, "clean_stylized"),
        mood: oneOf<SceneMood>(styleRecord.mood, moodSet, "neutral"),
        complexity: oneOf<SceneComplexity>(styleRecord.complexity, complexitySet, "medium"),
        cutaway: styleRecord.cutaway === true,
      },
      parts,
      relationships,
      beats: safeBeats,
    },
    warnings,
  };
}

export function makePrimitiveBuildScaffoldText(userRequest: string) {
  return JSON.stringify(makeScaffoldPlan(userRequest), null, 2);
}
