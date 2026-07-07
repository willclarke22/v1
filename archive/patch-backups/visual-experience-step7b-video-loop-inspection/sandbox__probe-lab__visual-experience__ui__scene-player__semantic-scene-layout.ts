import type {
  SemanticSceneAction,
  SemanticSceneBeat,
  SemanticSceneEntity,
  SemanticSceneRelationship,
  VisualPrimitiveKind,
} from "../../visual-learning-turn";

export type PrimitiveRenderKind = VisualPrimitiveKind | "registered_asset" | "any" | "placeholder";

export type PreparedSemanticSceneEntity = SemanticSceneEntity & {
  position: [number, number, number];
  render_kind: PrimitiveRenderKind;
  is_active: boolean;
  is_action_target: boolean;
};

export type PreparedSemanticScene = {
  title: string;
  orientation_text: string;
  target_takeaway: string;
  active_beat: SemanticSceneBeat | null;
  active_beat_index: number;
  entities: PreparedSemanticSceneEntity[];
  relationships: SemanticSceneRelationship[];
  actions: SemanticSceneAction[];
  camera_notes: string | null;
  interaction_notes: string | null;
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
      preferred_render_kind: text(visualNeed.preferred_render_kind, text(record.preferred_render_kind, "sphere")) as SemanticSceneEntity["visual_need"]["preferred_render_kind"],
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

function computePosition(entity: SemanticSceneEntity, index: number, total: number): [number, number, number] {
  if (entity.position_hint) return entity.position_hint;

  const kind = entity.visual_need?.preferred_render_kind;
  if (kind === "path") return [0, 0, 0];

  const count = Math.max(1, total - 1);
  const nonPathIndex = Math.max(0, index - 1);
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
  const activeBeatIndex = Math.max(0, Math.min(input.activeBeatIndex, Math.max(0, beats.length - 1)));
  const activeBeat = beats[activeBeatIndex] ?? null;
  const actionTargetIds = new Set((activeBeat?.actions ?? []).map((action) => action.target_entity_id).filter(Boolean));
  const activeEntityIds = new Set([...(activeBeat?.active_entity_ids ?? []), ...Array.from(actionTargetIds)]);
  const renderBindings = asArray(resolved?.render_bindings)
    .map(asRecord)
    .filter((item): item is RenderBindingRecord => Boolean(item));

  return {
    title: text(visualExperience?.title, "Semantic scene"),
    orientation_text: orientationTextForBeat(root, activeBeat),
    target_takeaway: text(learningFocus?.target_takeaway, ""),
    active_beat: activeBeat,
    active_beat_index: activeBeatIndex,
    relationships: asArray(scenePlan.relationships).map(normalizeRelationship).filter((item): item is SemanticSceneRelationship => Boolean(item)),
    actions: activeBeat?.actions ?? [],
    camera_notes: text(scenePlan.camera_notes, "") || null,
    interaction_notes: text(scenePlan.interaction_notes, "") || null,
    entities: entities.map((entity, index) => {
      const binding = renderBindings.find((candidate) => String(candidate.entity_id ?? "") === entity.id) ?? null;
      return {
        ...entity,
        position: computePosition(entity, index, entities.length),
        render_kind: getPreferredRenderKind(entity, binding),
        is_active: activeEntityIds.has(entity.id),
        is_action_target: actionTargetIds.has(entity.id),
      };
    }),
  };
}
