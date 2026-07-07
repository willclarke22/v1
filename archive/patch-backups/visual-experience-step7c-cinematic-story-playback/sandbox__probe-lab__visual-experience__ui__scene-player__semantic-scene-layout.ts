import type {
  SemanticSceneAction,
  SemanticSceneBeat,
  SemanticSceneEntity,
  SemanticSceneRelationship,
  VisualExperienceMode,
  VisualPrimitiveKind,
} from "../../visual-learning-turn";

export type PrimitiveRenderKind = VisualPrimitiveKind | "registered_asset" | "any" | "placeholder";
export type SemanticSceneLayoutMode = VisualExperienceMode | "inferred_process_loop";

export type PreparedSemanticSceneEntity = SemanticSceneEntity & {
  position: [number, number, number];
  render_kind: PrimitiveRenderKind;
  unit_count: number;
  is_active: boolean;
  is_action_target: boolean;
  selected: boolean;
  loop_index: number | null;
};

export type PreparedSemanticScene = {
  title: string;
  experience_mode: SemanticSceneLayoutMode;
  orientation_text: string;
  target_takeaway: string;
  active_beat: SemanticSceneBeat | null;
  active_beat_index: number;
  beat_count: number;
  entities: PreparedSemanticSceneEntity[];
  relationships: SemanticSceneRelationship[];
  actions: SemanticSceneAction[];
  camera_notes: string | null;
  interaction_notes: string | null;
  has_loop_layout: boolean;
  loop_radius: number;
  loop_points: Array<[number, number, number]>;
  active_loop_position: [number, number, number] | null;
};

type RenderBindingRecord = {
  entity_id?: unknown;
  binding?: {
    kind?: unknown;
    primitive?: unknown;
    label?: unknown;
  } | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function tuple3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;

  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2] ?? 0);

  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : null;
}

function getPreferredRenderKind(entity: SemanticSceneEntity, binding?: RenderBindingRecord | null): PrimitiveRenderKind {
  const primitive = text(binding?.binding?.primitive, "");
  if (primitive) return primitive as PrimitiveRenderKind;

  const preferred = entity.visual_need?.preferred_render_kind;
  if (preferred) return preferred;

  return "placeholder";
}

function normalizeEntity(raw: unknown, index: number): SemanticSceneEntity {
  const record = asRecord(raw) ?? {};
  const visualNeed = asRecord(record.visual_need) ?? {};

  return {
    id: text(record.id, `entity_${index + 1}`),
    display_name: text(record.display_name, text(record.label, `Entity ${index + 1}`)),
    semantic_role: text(record.semantic_role, "A visible part of the explanation."),
    visual_need: {
      description: text(visualNeed.description, text(record.visual_need, "A visible learning-scene element.")),
      semantic_tags: asArray(visualNeed.semantic_tags).map(String).filter(Boolean).slice(0, 10),
      preferred_render_kind: text(
        visualNeed.preferred_render_kind,
        text(record.preferred_render_kind, "sphere"),
      ) as SemanticSceneEntity["visual_need"]["preferred_render_kind"],
      fallback_allowed: visualNeed.fallback_allowed !== false,
    },
    position_hint: tuple3(record.position_hint),
  };
}

function normalizeBeat(raw: unknown, index: number): SemanticSceneBeat {
  const record = asRecord(raw) ?? {};

  return {
    id: text(record.id, `beat_${index + 1}`),
    title: text(record.title, `Beat ${index + 1}`),
    source_orientation_segment_ids: asArray(record.source_orientation_segment_ids).map(String).filter(Boolean),
    duration_ms: Number.isFinite(Number(record.duration_ms)) ? Number(record.duration_ms) : 3500,
    active_entity_ids: asArray(record.active_entity_ids).map(String).filter(Boolean),
    actions: asArray(record.actions).map((action, actionIndex): SemanticSceneAction => {
      const actionRecord = asRecord(action) ?? {};
      return {
        id: text(actionRecord.id, `action_${actionIndex + 1}`),
        type: text(actionRecord.type, "show_entity") as SemanticSceneAction["type"],
        target_entity_id: text(actionRecord.target_entity_id, ""),
        narration: text(actionRecord.narration, "") || null,
        params: asRecord(actionRecord.params) ?? {},
      };
    }),
  };
}

function normalizeRelationship(raw: unknown, index: number): SemanticSceneRelationship | null {
  const record = asRecord(raw) ?? {};
  const source = text(record.source_entity_id, "");
  const targets = asArray(record.target_entity_ids).map(String).filter(Boolean);

  if (!source || !targets.length) return null;

  return {
    id: text(record.id, `relationship_${index + 1}`),
    source_entity_id: source,
    target_entity_ids: targets,
    relationship_type: text(record.relationship_type, "connects_to") as SemanticSceneRelationship["relationship_type"],
    explanation: text(record.explanation, "These parts are connected."),
  };
}

function numberWordToCount(value: string) {
  const lower = value.toLowerCase();
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
  };

  for (const [word, count] of Object.entries(words)) {
    if (lower.includes(`${word} connected`) || lower.includes(`${word}-unit`) || lower.includes(`${word} unit`)) return count;
  }

  return null;
}

function inferUnitCount(entity: SemanticSceneEntity) {
  const combined = [
    entity.id,
    entity.display_name,
    entity.semantic_role,
    entity.visual_need?.description,
    ...(entity.visual_need?.semantic_tags ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const carbonMatch = combined.match(/\b([2-8])\s*[- ]?carbon\b/);
  if (carbonMatch) return Math.max(1, Math.min(8, Number(carbonMatch[1])));

  const unitMatch = combined.match(/\b([2-8])\s*[- ]?(unit|segment|part|sphere|bead)/);
  if (unitMatch) return Math.max(1, Math.min(8, Number(unitMatch[1])));

  const wordCount = numberWordToCount(combined);
  if (wordCount) return wordCount;

  if (combined.includes("energy") && (combined.includes("nadh") || combined.includes("fadh") || combined.includes("gtp") || combined.includes("atp"))) return 3;

  return 1;
}

function beatOrderedEntityIds(entities: SemanticSceneEntity[], beats: SemanticSceneBeat[]) {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const beat of beats) {
    for (const id of beat.active_entity_ids) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    for (const action of beat.actions) {
      if (action.target_entity_id && !seen.has(action.target_entity_id)) {
        seen.add(action.target_entity_id);
        ids.push(action.target_entity_id);
      }
    }
  }

  for (const entity of entities) {
    if (!seen.has(entity.id)) ids.push(entity.id);
  }

  return ids.filter((id) => entities.some((entity) => entity.id === id));
}

function inferExperienceMode(input: {
  rawMode: string;
  title: string;
  relationships: SemanticSceneRelationship[];
}): SemanticSceneLayoutMode {
  if (
    input.rawMode === "process_loop" ||
    input.rawMode === "mechanism" ||
    input.rawMode === "compare_contrast" ||
    input.rawMode === "spatial_structure" ||
    input.rawMode === "generic_scene" ||
    input.rawMode === "model_selected_scene"
  ) {
    return input.rawMode;
  }

  const title = input.title.toLowerCase();
  if (title.includes("cycle") || title.includes("loop") || input.relationships.some((rel) => rel.relationship_type === "cycles_back")) {
    return "inferred_process_loop";
  }

  return "generic_scene";
}

function isLoopMode(mode: SemanticSceneLayoutMode, relationships: SemanticSceneRelationship[]) {
  return mode === "process_loop" || mode === "inferred_process_loop" || relationships.some((rel) => rel.relationship_type === "cycles_back");
}

function loopPosition(index: number, total: number, radius: number): [number, number, number] {
  const safeTotal = Math.max(1, total);
  const angle = (index / safeTotal) * Math.PI * 2 - Math.PI / 2;
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
}

function buildLoopPoints(radius: number, y = -0.08): Array<[number, number, number]> {
  const points: Array<[number, number, number]> = [];
  for (let step = 0; step <= 96; step += 1) {
    const angle = (step / 96) * Math.PI * 2;
    points.push([Math.cos(angle) * radius, y, Math.sin(angle) * radius]);
  }
  return points;
}

function computePosition(input: {
  entity: SemanticSceneEntity;
  index: number;
  total: number;
  orderedIds: string[];
  hasLoopLayout: boolean;
  loopRadius: number;
}): [number, number, number] {
  if (input.hasLoopLayout) {
    const loopIndex = Math.max(0, input.orderedIds.indexOf(input.entity.id));
    const position = loopPosition(loopIndex, input.orderedIds.length, input.loopRadius);
    const kind = input.entity.visual_need?.preferred_render_kind;
    if (kind === "particle") return [position[0], 0.18, position[2]];
    return position;
  }

  if (input.entity.position_hint) return input.entity.position_hint;

  const kind = input.entity.visual_need?.preferred_render_kind;
  if (kind === "path") return [0, 0, 0];

  const count = Math.max(1, input.total - 1);
  const nonPathIndex = Math.max(0, input.index - 1);
  const angle = (nonPathIndex / count) * Math.PI * 2 - Math.PI / 2;
  const radius = 2.55;
  const y = kind === "particle" ? 0.18 : 0;

  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

function orientationTextForBeat(root: Record<string, unknown> | null, beat: SemanticSceneBeat | null) {
  const output = asRecord(root?.output);
  const visualExperience = asRecord(output?.visual_experience);
  const segments = asArray(visualExperience?.orientation_segments)
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item));

  if (!segments.length) return "";
  if (!beat) return text(segments[0].text, "");

  const wanted = new Set(beat.source_orientation_segment_ids);
  const selected = segments.filter((segment) => wanted.has(text(segment.id, "")));
  const source = selected.length ? selected : [segments[Math.min(segments.length - 1, Math.max(0, beat.active_entity_ids.length - 1))] ?? segments[0]];

  return source.map((segment) => text(segment.text, "")).filter(Boolean).join(" ");
}

export function prepareSemanticSceneFromTurnResult(input: {
  result: unknown;
  activeBeatIndex: number;
  selectedEntityId?: string | null;
}): PreparedSemanticScene | null {
  const root = asRecord(input.result);
  const output = asRecord(root?.output);
  const resolved = asRecord(root?.resolved);
  const visualExperience = asRecord(output?.visual_experience);
  const learningFocus = asRecord(output?.learning_focus);
  const scenePlan = asRecord(visualExperience?.semantic_scene_plan);

  if (!root || text(output?.turn_status, "") !== "proceed" || !scenePlan) return null;

  const entities = asArray(scenePlan.entities).map(normalizeEntity);
  const beats = asArray(scenePlan.beats).map(normalizeBeat);
  const relationships = asArray(scenePlan.relationships).map(normalizeRelationship).filter((item): item is SemanticSceneRelationship => Boolean(item));
  const activeBeatIndex = Math.max(0, Math.min(input.activeBeatIndex, Math.max(0, beats.length - 1)));
  const activeBeat = beats[activeBeatIndex] ?? null;
  const actionTargetIds = new Set((activeBeat?.actions ?? []).map((action) => action.target_entity_id).filter(Boolean));
  const activeEntityIds = new Set([...(activeBeat?.active_entity_ids ?? []), ...Array.from(actionTargetIds)]);
  const renderBindings = asArray(resolved?.render_bindings)
    .map(asRecord)
    .filter((item): item is RenderBindingRecord => Boolean(item));
  const title = text(visualExperience?.title, "Semantic scene");
  const experienceMode = inferExperienceMode({
    rawMode: text(visualExperience?.experience_mode, "generic_scene"),
    title,
    relationships,
  });
  const hasLoopLayout = isLoopMode(experienceMode, relationships);
  const orderedIds = beatOrderedEntityIds(entities, beats);
  const loopRadius = Math.max(2.25, Math.min(3.05, 1.35 + entities.length * 0.22));
  const activeEntityId = activeBeat?.active_entity_ids[0] ?? activeBeat?.actions[0]?.target_entity_id ?? null;
  const activeLoopIndex = activeEntityId ? Math.max(0, orderedIds.indexOf(activeEntityId)) : activeBeatIndex;

  return {
    title,
    experience_mode: experienceMode,
    orientation_text: orientationTextForBeat(root, activeBeat),
    target_takeaway: text(learningFocus?.target_takeaway, ""),
    active_beat: activeBeat,
    active_beat_index: activeBeatIndex,
    beat_count: beats.length,
    relationships,
    actions: activeBeat?.actions ?? [],
    camera_notes: text(scenePlan.camera_notes, "") || null,
    interaction_notes: text(scenePlan.interaction_notes, "") || null,
    has_loop_layout: hasLoopLayout,
    loop_radius: loopRadius,
    loop_points: hasLoopLayout ? buildLoopPoints(loopRadius) : [],
    active_loop_position: hasLoopLayout ? loopPosition(activeLoopIndex, Math.max(1, orderedIds.length), loopRadius) : null,
    entities: entities.map((entity, index) => {
      const binding = renderBindings.find((candidate) => String(candidate.entity_id ?? "") === entity.id) ?? null;
      const loopIndex = hasLoopLayout ? Math.max(0, orderedIds.indexOf(entity.id)) : null;
      return {
        ...entity,
        position: computePosition({ entity, index, total: entities.length, orderedIds, hasLoopLayout, loopRadius }),
        render_kind: getPreferredRenderKind(entity, binding),
        unit_count: inferUnitCount(entity),
        is_active: activeEntityIds.has(entity.id),
        is_action_target: actionTargetIds.has(entity.id),
        selected: input.selectedEntityId === entity.id,
        loop_index: loopIndex,
      };
    }),
  };
}
