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
  action_types: string[];
  should_show_label: boolean;
  is_story_focus: boolean;
  is_output_like: boolean;
};

export type PreparedSemanticSceneCamera = {
  target: [number, number, number];
  wide_position: [number, number, number];
  close_position: [number, number, number];
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
  active_narration_text: string;
  camera_notes: string | null;
  interaction_notes: string | null;
  has_loop_layout: boolean;
  loop_radius: number;
  loop_points: Array<[number, number, number]>;
  active_loop_position: [number, number, number] | null;
  story_focus_entity_id: string | null;
  camera: PreparedSemanticSceneCamera;
  directed_scene: Record<string, unknown> | null;
  directed_story_beat: Record<string, unknown> | null;
  scene_concept: string | null;
  director_intent: string | null;
  cinematic_caption_text: string;
  caption_policy: Record<string, unknown> | null;
  label_policy: Record<string, unknown> | null;
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

function nonEmptyRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  return record && Object.keys(record).length > 0 ? record : null;
}

function stringArray(value: unknown, max = 12) {
  return asArray(value).map(String).filter(Boolean).slice(0, max);
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
    duration_ms: Number.isFinite(Number(record.duration_ms)) ? Number(record.duration_ms) : 4200,
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

function isOutputLike(entity: SemanticSceneEntity) {
  const combined = [entity.id, entity.display_name, entity.semantic_role, entity.visual_need?.description, ...(entity.visual_need?.semantic_tags ?? [])]
    .join(" ")
    .toLowerCase();

  return (
    combined.includes("waste") ||
    combined.includes("output") ||
    combined.includes("leaving") ||
    combined.includes("carbon dioxide") ||
    combined.includes("co2") ||
    combined.includes("energy") ||
    combined.includes("packet")
  );
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
  for (let step = 0; step <= 128; step += 1) {
    const angle = (step / 128) * Math.PI * 2;
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
    if (kind === "particle") return [position[0], 0.26, position[2]];
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

function narrationTextForBeat(beat: SemanticSceneBeat | null, orientationText: string, targetTakeaway: string) {
  const narrations = (beat?.actions ?? [])
    .map((action) => text(action.narration, ""))
    .filter(Boolean);

  if (narrations.length) return narrations.join(" ");
  return orientationText || targetTakeaway;
}

function chooseStoryFocusEntityId(input: {
  entities: SemanticSceneEntity[];
  activeBeat: SemanticSceneBeat | null;
  relationships: SemanticSceneRelationship[];
  hasLoopLayout: boolean;
}) {
  const activeIds = new Set(input.activeBeat?.active_entity_ids ?? []);
  const actionTargets = new Set((input.activeBeat?.actions ?? []).map((action) => action.target_entity_id).filter(Boolean));

  if (input.hasLoopLayout) {
    const carrier = input.entities.find((entity) => {
      const combined = [entity.id, entity.display_name, entity.semantic_role, entity.visual_need?.description, ...(entity.visual_need?.semantic_tags ?? [])]
        .join(" ")
        .toLowerCase();
      return combined.includes("carrier") || combined.includes("recycled") || combined.includes("backbone") || combined.includes("regenerated");
    });
    if (carrier) return carrier.id;
  }

  const cycleSource = input.relationships.find((relationship) => relationship.relationship_type === "cycles_back")?.source_entity_id;
  if (cycleSource) return cycleSource;

  const firstActive = input.entities.find((entity) => activeIds.has(entity.id) && !isOutputLike(entity));
  if (firstActive) return firstActive.id;

  const firstTarget = input.entities.find((entity) => actionTargets.has(entity.id));
  if (firstTarget) return firstTarget.id;

  return input.entities[0]?.id ?? null;
}

function storyBeatsFromPlan(scenePlan: Record<string, unknown>, beats: SemanticSceneBeat[]) {
  const raw = asArray(scenePlan.story_beats)
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item));

  if (!raw.length) return [];

  return raw.map((beat, index) => ({
    ...beat,
    id: text(beat.id, beats[index]?.id ?? `beat_${index + 1}`),
  }));
}

function directedBeatForActiveBeat(storyBeats: Array<Record<string, unknown>>, activeBeat: SemanticSceneBeat | null, activeBeatIndex: number) {
  if (!storyBeats.length) return null;
  const byId = activeBeat ? storyBeats.find((beat) => text(beat.id, "") === activeBeat.id) : null;
  return byId ?? storyBeats[activeBeatIndex] ?? null;
}

function captionTextForDirectedBeat(directedBeat: Record<string, unknown> | null, fallback: string) {
  const spokenCaption = asRecord(directedBeat?.spoken_caption);
  return text(spokenCaption?.text, fallback);
}

function directorIntentForBeat(directedBeat: Record<string, unknown> | null) {
  return text(directedBeat?.director_intent, "") || null;
}

function focusIdsFromDirectedBeat(directedBeat: Record<string, unknown> | null) {
  const camera = asRecord(directedBeat?.camera);
  return stringArray(camera?.focus_entity_ids, 8);
}

function averagePosition(points: Array<[number, number, number]>, fallback: [number, number, number]): [number, number, number] {
  if (!points.length) return fallback;
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
    points.reduce((sum, point) => sum + point[2], 0) / points.length,
  ];
}

function buildCamera(input: {
  activeBeatIndex: number;
  beatCount: number;
  activeLoopPosition: [number, number, number] | null;
  activeEntityPositions: Array<[number, number, number]>;
  hasLoopLayout: boolean;
}): PreparedSemanticSceneCamera {
  const target = input.activeLoopPosition ?? averagePosition(input.activeEntityPositions, [0, 0, 0]);
  const angle = (input.activeBeatIndex / Math.max(1, input.beatCount)) * Math.PI * 2 - Math.PI / 2;
  const orbitX = Math.cos(angle + Math.PI / 5);
  const orbitZ = Math.sin(angle + Math.PI / 5);

  if (input.hasLoopLayout) {
    return {
      target: [target[0], 0.16, target[2]],
      wide_position: [orbitX * 4.6, 4.9, orbitZ * 4.6],
      close_position: [target[0] + orbitX * 2.3, 2.45, target[2] + orbitZ * 2.3],
    };
  }

  return {
    target: [target[0], target[1] + 0.2, target[2]],
    wide_position: [target[0] + 4.8, 3.9, target[2] + 5.2],
    close_position: [target[0] + 2.8, 2.4, target[2] + 3.1],
  };
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

  const directedScene = nonEmptyRecord(scenePlan.directed_scene);
  const captionPolicy = nonEmptyRecord(scenePlan.caption_policy ?? directedScene?.caption_policy);
  const labelPolicy = nonEmptyRecord(scenePlan.label_policy ?? directedScene?.label_policy);
  const entities = asArray(scenePlan.entities).map(normalizeEntity);
  const beats = asArray(scenePlan.beats).map(normalizeBeat);
  const storyBeats = storyBeatsFromPlan(scenePlan, beats);
  const relationships = asArray(scenePlan.relationships).map(normalizeRelationship).filter((item): item is SemanticSceneRelationship => Boolean(item));
  const activeBeatIndex = Math.max(0, Math.min(input.activeBeatIndex, Math.max(0, beats.length - 1)));
  const activeBeat = beats[activeBeatIndex] ?? null;
  const directedBeat = directedBeatForActiveBeat(storyBeats, activeBeat, activeBeatIndex);
  const actionTargetIds = new Set((activeBeat?.actions ?? []).map((action) => action.target_entity_id).filter(Boolean));
  const directedFocusIds = focusIdsFromDirectedBeat(directedBeat);
  const activeEntityIds = new Set([...(activeBeat?.active_entity_ids ?? []), ...directedFocusIds, ...Array.from(actionTargetIds)]);
  const renderBindings = asArray(resolved?.render_bindings)
    .map(asRecord)
    .filter((item): item is RenderBindingRecord => Boolean(item));
  const title = text(visualExperience?.title, "Semantic scene");
  const targetTakeaway = text(learningFocus?.target_takeaway, "");
  const orientationText = orientationTextForBeat(root, activeBeat);
  const experienceMode = inferExperienceMode({
    rawMode: text(visualExperience?.experience_mode, "generic_scene"),
    title,
    relationships,
  });
  const hasLoopLayout = isLoopMode(experienceMode, relationships);
  const orderedIds = beatOrderedEntityIds(entities, beats);
  const loopRadius = Math.max(2.25, Math.min(3.1, 1.35 + entities.length * 0.24));
  const activeLoopPosition = hasLoopLayout ? loopPosition(activeBeatIndex, Math.max(1, beats.length), loopRadius) : null;
  const storyFocusEntityId = chooseStoryFocusEntityId({ entities, activeBeat, relationships, hasLoopLayout });
  const actionTypesByEntity = new Map<string, string[]>();

  for (const action of activeBeat?.actions ?? []) {
    if (!action.target_entity_id) continue;
    const list = actionTypesByEntity.get(action.target_entity_id) ?? [];
    list.push(action.type);
    actionTypesByEntity.set(action.target_entity_id, list);
  }

  const preparedEntities = entities.map((entity, index): PreparedSemanticSceneEntity => {
    const binding = renderBindings.find((candidate) => String(candidate.entity_id ?? "") === entity.id) ?? null;
    const loopIndex = hasLoopLayout ? Math.max(0, orderedIds.indexOf(entity.id)) : null;
    const basePosition = computePosition({ entity, index, total: entities.length, orderedIds, hasLoopLayout, loopRadius });
    const isStoryFocus = storyFocusEntityId === entity.id;
    const position = hasLoopLayout && isStoryFocus && activeLoopPosition ? activeLoopPosition : basePosition;
    const actionTypes = actionTypesByEntity.get(entity.id) ?? [];
    const isActive = activeEntityIds.has(entity.id);
    const selected = input.selectedEntityId === entity.id;

    return {
      ...entity,
      position,
      render_kind: getPreferredRenderKind(entity, binding),
      unit_count: inferUnitCount(entity),
      is_active: isActive,
      is_action_target: actionTargetIds.has(entity.id),
      selected,
      loop_index: loopIndex,
      action_types: actionTypes,
      should_show_label: selected || actionTargetIds.has(entity.id) || (isActive && actionTypes.length > 0),
      is_story_focus: isStoryFocus,
      is_output_like: isOutputLike(entity),
    };
  });

  const activeEntityPositions = preparedEntities
    .filter((entity) => activeEntityIds.has(entity.id))
    .map((entity) => entity.position);
  const baseNarration = narrationTextForBeat(activeBeat, orientationText, targetTakeaway);
  const cinematicCaptionText = captionTextForDirectedBeat(directedBeat, baseNarration);

  return {
    title,
    experience_mode: experienceMode,
    orientation_text: orientationText,
    target_takeaway: targetTakeaway,
    active_beat: activeBeat,
    active_beat_index: activeBeatIndex,
    beat_count: beats.length,
    relationships,
    actions: activeBeat?.actions ?? [],
    active_narration_text: cinematicCaptionText,
    camera_notes: text(scenePlan.camera_notes, "") || null,
    interaction_notes: text(scenePlan.interaction_notes, "") || null,
    has_loop_layout: hasLoopLayout,
    loop_radius: loopRadius,
    loop_points: hasLoopLayout ? buildLoopPoints(loopRadius) : [],
    active_loop_position: activeLoopPosition,
    story_focus_entity_id: storyFocusEntityId,
    camera: buildCamera({ activeBeatIndex, beatCount: beats.length, activeLoopPosition, activeEntityPositions, hasLoopLayout }),
    directed_scene: directedScene,
    directed_story_beat: directedBeat,
    scene_concept: text(directedScene?.scene_concept, "") || null,
    director_intent: directorIntentForBeat(directedBeat),
    cinematic_caption_text: cinematicCaptionText,
    caption_policy: captionPolicy,
    label_policy: labelPolicy,
    entities: preparedEntities,
  };
}
