import type {
  SemanticSceneAction,
  SemanticSceneBeat,
  SemanticSceneEntity,
  SemanticSceneRelationship,
  VisualPrimitiveKind,
} from "../../visual-learning-turn";
import type { DirectedSceneRenderPlan, MotionTrack, Vec3 } from "./directed-scene-compiler";
import { compileDirectedSceneRenderPlan } from "./directed-scene-compiler";
import {
  directorPlanToLegacyDirectedScene,
  directorPlanToLegacyStoryBeats,
  type EducationalSceneDirectorPlanV1,
} from "../../../director";

export type PrimitiveRenderKind = VisualPrimitiveKind | "registered_asset" | "any" | "placeholder";

export type PreparedSemanticSceneEntity = SemanticSceneEntity & {
  position: Vec3;
  scale: Vec3;
  render_kind: PrimitiveRenderKind;
  render_role: string;
  resolved_asset?: {
    asset_id: string;
    public_path: string;
    source_type: string;
    scene_review_status: "pending" | "approved" | "rejected";
    dimensions_m: Vec3;
    default_scale: number;
    default_rotation: Vec3;
    ground_offset_m: number;
    match_score?: number | null;
  } | null;
  unit_count: number;
  is_active: boolean;
  is_action_target: boolean;
  selected: boolean;
  action_types: string[];
  event_types: string[];
  event_descriptions: string[];
  motion_tracks: MotionTrack[];
  should_show_label: boolean;
  is_story_focus: boolean;
  is_output_like: boolean;
  connector_from_id?: string | null;
  connector_to_id?: string | null;
  connector_from_position?: Vec3 | null;
  connector_to_position?: Vec3 | null;
  label_anchor: Vec3;
  geometry_evidence: string[];
};

export type PreparedSemanticSceneCamera = {
  target: Vec3;
  wide_position: Vec3;
  close_position: Vec3;
  shot_type: string;
  movement: string;
  focus_entity_ids: string[];
};

export type PreparedSemanticScene = {
  title: string;
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
  story_focus_entity_id: string | null;
  camera: PreparedSemanticSceneCamera;
  director_plan: EducationalSceneDirectorPlanV1 | null;
  directed_scene: Record<string, unknown> | null;
  directed_story_beat: Record<string, unknown> | null;
  scene_concept: string | null;
  director_intent: string | null;
  cinematic_caption_text: string;
  text_cues: Array<Record<string, unknown>>;
  caption_policy: Record<string, unknown> | null;
  label_policy: Record<string, unknown> | null;
  render_plan: DirectedSceneRenderPlan;
  faithfulness_warnings: string[];
};

type RenderBindingRecord = {
  entity_id?: unknown;
  binding?: {
    kind?: unknown;
    primitive?: unknown;
    label?: unknown;
    asset_id?: unknown;
    public_path?: unknown;
    source_type?: unknown;
    scene_review_status?: unknown;
    dimensions_m?: unknown;
    default_scale?: unknown;
    default_rotation?: unknown;
    ground_offset_m?: unknown;
    match_score?: unknown;
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

function tuple3(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length < 2) return null;

  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2] ?? 0);

  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : null;
}

function resolvedAssetFromBinding(
  binding?: RenderBindingRecord | null,
): PreparedSemanticSceneEntity["resolved_asset"] {
  const source = binding?.binding;
  if (
    source?.kind !== "registered_asset" ||
    typeof source.asset_id !== "string" ||
    typeof source.public_path !== "string"
  ) {
    return null;
  }

  return {
    asset_id: source.asset_id,
    public_path: source.public_path,
    source_type: text(source.source_type, "manual"),
    scene_review_status:
      source.scene_review_status === "approved" ||
      source.scene_review_status === "rejected"
        ? source.scene_review_status
        : "pending",
    dimensions_m:
      tuple3(source.dimensions_m) ?? [1, 1, 1],
    default_scale:
      Number.isFinite(Number(source.default_scale))
        ? Number(source.default_scale)
        : 1,
    default_rotation:
      tuple3(source.default_rotation) ?? [0, 0, 0],
    ground_offset_m:
      Number.isFinite(Number(source.ground_offset_m))
        ? Number(source.ground_offset_m)
        : 0,
    match_score:
      Number.isFinite(Number(source.match_score))
        ? Number(source.match_score)
        : null,
  };
}

function getPreferredRenderKind(entity: SemanticSceneEntity, binding?: RenderBindingRecord | null): PrimitiveRenderKind {
  if (binding?.binding?.kind === "registered_asset") {
    return "registered_asset";
  }

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
    // Position hints can still arrive from older assembly code, but Step 8c does not use them as layout source of truth.
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
    combined.includes("packet") ||
    combined.includes("wheel") ||
    combined.includes("result")
  );
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

function narrationTextForBeat(_beat: SemanticSceneBeat | null, orientationText: string, targetTakeaway: string) {
  // Step 13c: learner-visible words should come from full_prompt/explanation_pieces.
  // Event descriptions are kept as renderer instructions only.
  return orientationText || targetTakeaway;
}

function firstStoryFocusEntityId(storyBeats: Array<Record<string, unknown>>, entities: SemanticSceneEntity[]) {
  for (const beat of storyBeats) {
    const camera = asRecord(beat.camera);
    const focused = stringArray(camera?.focus_entity_ids, 8).find((id) => entities.some((entity) => entity.id === id));
    if (focused) return focused;

    const eventTarget = activeEventRecords(beat)
      .map((event) => text(event.entity_id, ""))
      .find((id) => entities.some((entity) => entity.id === id));
    if (eventTarget) return eventTarget;
  }

  return entities[0]?.id ?? null;
}

function storyBeatsFromPlan(
  scenePlan: Record<string, unknown>,
  fallbackBeats: SemanticSceneBeat[],
  _learningFocus: Record<string, unknown> | null,
  _entities: SemanticSceneEntity[],
) {
  const directorPlan =
    asRecord(scenePlan.director_plan);
  if (
    directorPlan?.schema_version ===
    "myway_educational_scene_director_v1"
  ) {
    return directorPlanToLegacyStoryBeats(
      directorPlan as unknown as EducationalSceneDirectorPlanV1,
    );
  }

  const raw = asArray(scenePlan.story_beats)
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((beat, index) => ({
      ...beat,
      id: text(beat.id, fallbackBeats[index]?.id ?? `story_beat_${index + 1}`),
    }));

  // Step 13c: do not inject the old synthetic root_problem_intro beat.
  // The model's full_prompt/explanation_pieces are now the source of learner-visible words,
  // and scene_moments are the source of the animation timeline.
  return raw;
}

function sceneActionTypeForVisualEvent(eventType: string): SemanticSceneAction["type"] {
  if (eventType === "move" || eventType === "transform") return "move_entity";
  if (eventType === "trace") return "trace_path";
  if (eventType === "fade") return "fade_in";
  if (eventType === "glow" || eventType === "pop") return "highlight_entity";
  return "highlight_entity";
}

function semanticBeatFromStoryBeat(
  storyBeat: Record<string, unknown>,
  index: number,
  fallbackBeat: SemanticSceneBeat | undefined,
): SemanticSceneBeat {
  const events = activeEventRecords(storyBeat);
  const camera = asRecord(storyBeat.camera);
  const focusEntityIds = stringArray(camera?.focus_entity_ids, 16);
  const eventEntityIds = events.map((event) => text(event.entity_id, "")).filter(Boolean);
  const introducedIds = stringArray(storyBeat.introduces_entity_ids, 16);
  const keptIds = stringArray(storyBeat.keeps_visible_entity_ids, 16);
  const explicitActiveIds = stringArray(storyBeat.active_entity_ids, 16);
  const activeEntityIds = Array.from(new Set([...keptIds, ...introducedIds, ...explicitActiveIds, ...focusEntityIds, ...eventEntityIds, ...(fallbackBeat?.active_entity_ids ?? [])]));
  const fallbackDuration = fallbackBeat?.duration_ms ?? 5200;
  const sourceOrientationIds = stringArray(storyBeat.source_orientation_segment_ids, 16);

  return {
    id: text(storyBeat.id, fallbackBeat?.id ?? `story_beat_${index + 1}`),
    title: text(storyBeat.title, fallbackBeat?.title ?? `Beat ${index + 1}`),
    source_orientation_segment_ids: sourceOrientationIds.length ? sourceOrientationIds : fallbackBeat?.source_orientation_segment_ids ?? [],
    duration_ms: Number.isFinite(Number(storyBeat.duration_ms)) ? Number(storyBeat.duration_ms) : fallbackDuration,
    active_entity_ids: activeEntityIds,
    actions: events.map((event, eventIndex): SemanticSceneAction => {
      const eventType = text(event.type, "highlight");
      const targetEntityId = text(event.entity_id, activeEntityIds[0] ?? "");
      return {
        id: text(event.id, `story_event_${index + 1}_${eventIndex + 1}`),
        type: sceneActionTypeForVisualEvent(eventType),
        target_entity_id: targetEntityId,
        // These descriptions drive motion, not learner-facing narration. The visible words come from
        // the full_prompt-derived explanation piece selected by source_orientation_segment_ids.
        narration: null,
        params: { visual_event_type: eventType, event_description: text(event.description, "") },
      };
    }),
  };
}

function executableBeatsFromStoryBeats(storyBeats: Array<Record<string, unknown>>, fallbackBeats: SemanticSceneBeat[]) {
  if (!storyBeats.length) return fallbackBeats;

  return storyBeats.map((storyBeat, index) => semanticBeatFromStoryBeat(storyBeat, index, fallbackBeats[index]));
}

function directedBeatForActiveBeat(storyBeats: Array<Record<string, unknown>>, activeBeat: SemanticSceneBeat | null, activeBeatIndex: number) {
  if (!storyBeats.length) return null;
  const byId = activeBeat ? storyBeats.find((beat) => text(beat.id, "") === activeBeat.id) : null;
  return byId ?? storyBeats[activeBeatIndex] ?? null;
}

function captionTextForDirectedBeat(
  directedBeat: Record<string, unknown> | null,
  fallback: string,
) {
  const firstCue = asRecord(
    asArray(
      directedBeat?.text_cues,
    )[0],
  );
  const canonicalText = text(
    firstCue?.text,
    "",
  );

  // Canonical director text cues are intentionally short and synchronized with
  // the visual job. Fall back to the explanation piece for older saved turns.
  return canonicalText || fallback;
}

function directorIntentForBeat(directedBeat: Record<string, unknown> | null) {
  return text(directedBeat?.director_intent, "") || null;
}

function focusIdsFromDirectedBeat(directedBeat: Record<string, unknown> | null) {
  const camera = asRecord(directedBeat?.camera);
  return stringArray(camera?.focus_entity_ids, 8);
}

function activeEventRecords(directedBeat: Record<string, unknown> | null) {
  return asArray(directedBeat?.visual_events)
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function cameraForBeat(renderPlan: DirectedSceneRenderPlan, activeBeat: SemanticSceneBeat | null, activeBeatIndex: number): PreparedSemanticSceneCamera {
  const track = (activeBeat ? renderPlan.camera_tracks.find((candidate) => candidate.beat_id === activeBeat.id) : null)
    ?? renderPlan.camera_tracks[activeBeatIndex]
    ?? {
      target: [0, 0, 0] as Vec3,
      wide_position: [4.8, 3.2, 4.8] as Vec3,
      close_position: [2.3, 1.9, 2.8] as Vec3,
      shot_type: "wide",
      movement: "follow active entities",
      focus_entity_ids: [],
    };

  return {
    target: track.target,
    wide_position: track.wide_position,
    close_position: track.close_position,
    shot_type: track.shot_type,
    movement: track.movement,
    focus_entity_ids: track.focus_entity_ids,
  };
}

function chooseStoryFocusEntityId(directedFocusIds: string[], activeBeat: SemanticSceneBeat | null, entities: SemanticSceneEntity[]) {
  const directed = directedFocusIds.find((id) => entities.some((entity) => entity.id === id));
  if (directed) return directed;
  const target = activeBeat?.actions.find((action) => action.target_entity_id)?.target_entity_id;
  if (target) return target;
  return activeBeat?.active_entity_ids[0] ?? entities[0]?.id ?? null;
}

export function getSemanticSceneTimelineBeats(result: unknown): Array<Record<string, unknown>> {
  const root = asRecord(result);
  const output = asRecord(root?.output);
  const visualExperience = asRecord(output?.visual_experience);
  const learningFocus = asRecord(output?.learning_focus);
  const scenePlan = asRecord(visualExperience?.semantic_scene_plan);

  if (!scenePlan) return [];

  const entities = asArray(scenePlan.entities).map(normalizeEntity);
  const fallbackBeats = asArray(scenePlan.beats).map(normalizeBeat);
  const storyBeats = storyBeatsFromPlan(scenePlan, fallbackBeats, learningFocus, entities);
  const executableBeats = executableBeatsFromStoryBeats(storyBeats, fallbackBeats);

  return executableBeats.map((beat) => ({
    id: beat.id,
    title: beat.title,
    active_entity_ids: beat.active_entity_ids,
    source_orientation_segment_ids: beat.source_orientation_segment_ids,
    duration_ms: beat.duration_ms,
  }));
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

  const rawDirectorPlan =
    asRecord(scenePlan.director_plan);
  const directorPlan =
    rawDirectorPlan?.schema_version ===
    "myway_educational_scene_director_v1"
      ? (rawDirectorPlan as unknown as EducationalSceneDirectorPlanV1)
      : null;
  const directedScene =
    directorPlan
      ? directorPlanToLegacyDirectedScene(
          directorPlan,
        )
      : nonEmptyRecord(
          scenePlan.directed_scene,
        );
  const captionPolicy = nonEmptyRecord(scenePlan.caption_policy ?? directedScene?.caption_policy);
  const labelPolicy = nonEmptyRecord(scenePlan.label_policy ?? directedScene?.label_policy);
  const entities = asArray(scenePlan.entities).map(normalizeEntity);
  const fallbackBeats = asArray(scenePlan.beats).map(normalizeBeat);
  const storyBeats = storyBeatsFromPlan(scenePlan, fallbackBeats, learningFocus, entities);
  const beats = executableBeatsFromStoryBeats(storyBeats, fallbackBeats);
  const relationships = asArray(scenePlan.relationships).map(normalizeRelationship).filter((item): item is SemanticSceneRelationship => Boolean(item));
  const activeBeatIndex = Math.max(0, Math.min(input.activeBeatIndex, Math.max(0, beats.length - 1)));
  const activeBeat = beats[activeBeatIndex] ?? null;
  const directedBeat = directedBeatForActiveBeat(storyBeats, activeBeat, activeBeatIndex);
  const actionTargetIds = new Set((activeBeat?.actions ?? []).map((action) => action.target_entity_id).filter(Boolean));
  const directedFocusIds = focusIdsFromDirectedBeat(directedBeat);
  const activeEventIds = activeEventRecords(directedBeat).map((event) => text(event.entity_id, "")).filter(Boolean);
  const activeEntityIds = new Set([...(activeBeat?.active_entity_ids ?? []), ...directedFocusIds, ...activeEventIds, ...Array.from(actionTargetIds)]);
  const renderBindings = asArray(resolved?.render_bindings)
    .map(asRecord)
    .filter((item): item is RenderBindingRecord => Boolean(item));
  const title = text(visualExperience?.title, "Semantic scene");
  const targetTakeaway = text(learningFocus?.target_takeaway, "");
  const orientationText = orientationTextForBeat(root, activeBeat);
  const renderPlan = compileDirectedSceneRenderPlan({
    title,
    directedScene,
    storyBeats,
    entities,
    relationships,
    beats,
    activeBeatIndex,
    activeEntityIds,
  });
  const storyFocusEntityId = chooseStoryFocusEntityId(directedFocusIds, activeBeat, entities);
  const actionTypesByEntity = new Map<string, string[]>();

  for (const action of activeBeat?.actions ?? []) {
    if (!action.target_entity_id) continue;
    const list = actionTypesByEntity.get(action.target_entity_id) ?? [];
    list.push(action.type);
    actionTypesByEntity.set(action.target_entity_id, list);
  }

  const activeEventsByEntity = new Map<string, Record<string, unknown>[]>();
  for (const event of activeEventRecords(directedBeat)) {
    const entityId = text(event.entity_id, "");
    if (!entityId) continue;
    const list = activeEventsByEntity.get(entityId) ?? [];
    list.push(event);
    activeEventsByEntity.set(entityId, list);
  }

  const preparedEntities = entities.map((entity): PreparedSemanticSceneEntity => {
    const binding = renderBindings.find((candidate) => String(candidate.entity_id ?? "") === entity.id) ?? null;
    const geometry = renderPlan.entity_geometry.find((candidate) => candidate.entity_id === entity.id);
    const actionTypes = actionTypesByEntity.get(entity.id) ?? [];
    const events = activeEventsByEntity.get(entity.id) ?? [];
    const eventTypes = events.map((event) => text(event.type, "")).filter(Boolean);
    const eventDescriptions = events.map((event) => text(event.description, "")).filter(Boolean);
    const isActive = activeEntityIds.has(entity.id);
    const selected = input.selectedEntityId === entity.id;
    const motionTracks = renderPlan.motion_tracks.filter((track) => track.entity_id === entity.id && (!track.beat_id || track.beat_id === activeBeat?.id));

    return {
      ...entity,
      position: geometry?.position ?? [0, 0, 0],
      scale: geometry?.scale ?? [0.72, 0.72, 0.72],
      render_kind:
        binding?.binding?.kind === "registered_asset"
          ? "registered_asset"
          : geometry?.render_kind ?? getPreferredRenderKind(entity, binding),
      render_role: geometry?.render_role ?? "generic_body",
      resolved_asset: resolvedAssetFromBinding(binding),
      unit_count: inferUnitCount(entity),
      is_active: isActive,
      is_action_target: actionTargetIds.has(entity.id),
      selected,
      action_types: actionTypes,
      event_types: eventTypes,
      event_descriptions: eventDescriptions,
      motion_tracks: motionTracks,
      should_show_label: selected || actionTargetIds.has(entity.id) || (isActive && actionTypes.length > 0),
      is_story_focus: storyFocusEntityId === entity.id,
      is_output_like: isOutputLike(entity),
      connector_from_id: geometry?.connector_from_id ?? null,
      connector_to_id: geometry?.connector_to_id ?? null,
      connector_from_position: geometry?.connector_from_position ?? null,
      connector_to_position: geometry?.connector_to_position ?? null,
      label_anchor: geometry?.label_anchor ?? [0, 0.72, 0],
      geometry_evidence: geometry?.evidence ?? [],
    };
  });

  const baseNarration = narrationTextForBeat(activeBeat, orientationText, targetTakeaway);
  const cinematicCaptionText = captionTextForDirectedBeat(directedBeat, baseNarration);

  return {
    title,
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
    story_focus_entity_id: storyFocusEntityId,
    camera: cameraForBeat(renderPlan, activeBeat, activeBeatIndex),
    director_plan: directorPlan,
    directed_scene: directedScene,
    directed_story_beat: directedBeat,
    scene_concept: text(directedScene?.scene_concept, "") || null,
    director_intent: directorIntentForBeat(directedBeat),
    cinematic_caption_text: cinematicCaptionText,
    text_cues: asArray(
      directedBeat?.text_cues,
    )
      .map(asRecord)
      .filter(
        (
          cue,
        ): cue is Record<string, unknown> =>
          Boolean(cue),
      ),
    caption_policy: captionPolicy,
    label_policy: labelPolicy,
    render_plan: renderPlan,
    faithfulness_warnings: renderPlan.faithfulness_warnings,
    entities: preparedEntities,
  };
}
