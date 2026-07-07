import type { EngineRenderableProbe } from "@/lib/engine/renderers/probe-renderer-contract";

export type VisualStoryEntityKind = string;
export type VisualStoryActionType = string;

export type VisualStoryEntity = {
  id: string;
  kind: VisualStoryEntityKind;
  semantic_role: string;
  display_name?: string | null;
  meaning?: string | null;
  visual_style?: Record<string, unknown> | null;
  geometry?: Record<string, unknown> | null;
};

export type VisualStoryRelationship = {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  explanation: string;
};

export type VisualStoryTransformation = {
  id: string;
  type: string;
  description: string;
  entity_ids?: string[];
  concept_goal?: string | null;
};

export type VisualStorySupportingExample = {
  id: string;
  label: string;
  example_type: string;
  why_it_matters: string;
  explicitly_mentioned?: boolean;
};

export type VisualStoryAction = {
  id: string;
  type: VisualStoryActionType;
  entity_id?: string | null;
  target_entity_id?: string | null;
  relationship_id?: string | null;
  params?: Record<string, unknown> | null;
  easing?: string | null;
};

export type VisualStoryCameraDirective = {
  mode?: string;
  focus_entity_id?: string | null;
  position?: [number, number, number];
  look_at?: [number, number, number];
  zoom?: number;
  duration_ms?: number;
  easing?: string;
};

export type VisualStoryTextOverlay = {
  layout?: string;
  emphasis?: string;
};

export type VisualStoryBeat = {
  id: string;
  script_segment: string;
  title?: string | null;
  duration_ms: number;
  active_entity_ids?: string[];
  actions: VisualStoryAction[];
  camera?: VisualStoryCameraDirective | null;
  text_overlay?: VisualStoryTextOverlay | null;
};

export type VisualStoryInteractionPhase = {
  unlock_after: "story_complete" | string;
  controls: {
    orbit?: boolean;
    zoom?: boolean;
    pan?: boolean;
    drag_objects?: boolean;
    toggle_layers?: boolean;
    scrub_story?: boolean;
    replay?: boolean;
    pause?: boolean;
  };
  free_exploration?: {
    enabled: boolean;
    instructions?: string;
    highlight_interactive_entities?: string[];
  };
  manipulators?: Array<{
    id: string;
    type: string;
    label: string;
    target_entity_id?: string;
    params?: Record<string, unknown>;
  }>;
};

export type VisualStoryScene = {
  schema_version: string;
  scene_kind: "visual_story" | string;
  title: string;
  orientation_script: string;
  root_problem_focus: string;
  target_takeaway: string;
  scene_family: string;
  entities: VisualStoryEntity[];
  relationships: VisualStoryRelationship[];
  transformations: VisualStoryTransformation[];
  supporting_examples: VisualStorySupportingExample[];
  beats: VisualStoryBeat[];
  script_display: {
    show_full_script: boolean;
    reveal_mode: "sentence_by_sentence" | "phrase_by_phrase" | "beat_synced" | string;
    layout: "top_banner" | "bottom_caption" | "side_panel" | "floating_cards" | string;
    max_visible_segments: number;
    animate_text: boolean;
  };
  interaction_phase: VisualStoryInteractionPhase;
  optional_check: {
    type?: string;
    prompt?: string;
    success_criteria?: Record<string, unknown>;
    renderer_params?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
};

export type BeatProgress = {
  beat: VisualStoryBeat;
  index: number;
  localProgress: number;
};

const FALLBACK_ORIENTATION_SCRIPT =
  "This visual story turns the idea into a scene you can watch, explore, and connect back to the question.";

const DEFAULT_INTERACTION: VisualStoryInteractionPhase = {
  unlock_after: "story_complete",
  controls: {
    orbit: true,
    zoom: true,
    pan: false,
    drag_objects: true,
    toggle_layers: true,
    scrub_story: true,
    replay: true,
    pause: true,
  },
  free_exploration: {
    enabled: true,
    instructions: "Explore the model's visual plan.",
  },
  manipulators: [
    {
      id: "explore_scene",
      type: "explore_scene",
      label: "Explore the scene",
      target_entity_id: "anchor",
    },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown, fallback: string, max = 4000) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, max)
    : fallback;
}

function readOptionalString(value: unknown, max = 1600) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, max)
    : null;
}

function readNumber(value: unknown, fallback: number, min = 200, max = 30000) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue)
    ? Math.min(max, Math.max(min, numberValue))
    : fallback;
}

function readId(value: unknown, fallback: string) {
  return readString(value, fallback, 120);
}

function readStringArray(value: unknown, max = 32) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 160))
        .slice(0, max)
    : [];
}

function tuple3(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;

  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2] ?? 0);

  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
    ? [x, y, z]
    : undefined;
}

function readRawVisualStory(probe: EngineRenderableProbe) {
  const params = asRecord(probe.renderer_params);

  if (isRecord(params.visual_story)) return params.visual_story;
  if (isRecord(params.visualStory)) return params.visualStory;
  if (isRecord(params.visual_story_v1)) return params.visual_story_v1;

  return params;
}

function normalizeEntities(value: unknown): VisualStoryEntity[] {
  const entities = asArray(value)
    .map((item, index): VisualStoryEntity => {
      const entity = asRecord(item);

      return {
        id: readId(entity.id, `entity_${index + 1}`),
        kind: readString(entity.kind ?? entity.type, "custom", 120),
        semantic_role: readString(entity.semantic_role ?? entity.role, "visible_idea", 220),
        display_name: readOptionalString(entity.display_name ?? entity.label ?? entity.name, 160),
        meaning: readOptionalString(entity.meaning ?? entity.description, 700),
        visual_style: isRecord(entity.visual_style ?? entity.visualStyle)
          ? asRecord(entity.visual_style ?? entity.visualStyle)
          : null,
        geometry: isRecord(entity.geometry) ? asRecord(entity.geometry) : null,
      };
    })
    .slice(0, 40);

  return entities.length
    ? entities
    : [
        {
          id: "anchor",
          kind: "node",
          semantic_role: "main_visible_idea",
          display_name: "main idea",
          meaning: "Fallback anchor because the model did not provide entities.",
          visual_style: null,
          geometry: null,
        },
      ];
}

function normalizeRelationships(value: unknown): VisualStoryRelationship[] {
  return asArray(value)
    .map((item, index): VisualStoryRelationship => {
      const relationship = asRecord(item);

      return {
        id: readId(relationship.id, `relationship_${index + 1}`),
        source_entity_id: readId(
          relationship.source_entity_id ??
            relationship.sourceEntityId ??
            relationship.source_id ??
            relationship.source ??
            relationship.from,
          "source",
        ),
        target_entity_id: readId(
          relationship.target_entity_id ??
            relationship.targetEntityId ??
            relationship.target_id ??
            relationship.target ??
            relationship.to,
          "target",
        ),
        relationship_type: readString(
          relationship.relationship_type ?? relationship.relationshipType ?? relationship.type,
          "maps_to",
          120,
        ),
        explanation: readString(
          relationship.explanation ??
            relationship.description ??
            relationship.meaning ??
            relationship.label,
          "These visible parts are connected.",
          900,
        ),
      };
    })
    .slice(0, 40);
}

function normalizeTransformations(value: unknown): VisualStoryTransformation[] {
  return asArray(value)
    .map((item, index): VisualStoryTransformation => {
      const transformation = asRecord(item);

      return {
        id: readId(transformation.id, `transformation_${index + 1}`),
        type: readString(
          transformation.type ??
            transformation.transformation_type ??
            transformation.transformationType ??
            transformation.kind,
          "show_cause_effect",
          160,
        ),
        description: readString(
          transformation.description ??
            transformation.explanation ??
            transformation.summary ??
            transformation.label,
          "A visible change reinforces the concept.",
          900,
        ),
        entity_ids: readStringArray(
          transformation.entity_ids ??
            transformation.entityIds ??
            transformation.entities,
          24,
        ),
        concept_goal: readOptionalString(
          transformation.concept_goal ??
            transformation.conceptGoal ??
            transformation.goal ??
            transformation.why,
          700,
        ),
      };
    })
    .slice(0, 40);
}

function normalizeSupportingExamples(value: unknown): VisualStorySupportingExample[] {
  return asArray(value)
    .map((item, index): VisualStorySupportingExample => {
      const example = asRecord(item);
      const label = readString(
        example.label ??
          example.mentioned_text ??
          example.mentionedText ??
          example.id,
        `example ${index + 1}`,
        180,
      );

      return {
        id: readId(example.id ?? example.entity_id ?? example.entityId ?? label, `example_${index + 1}`),
        label,
        example_type: readString(
          example.example_type ??
            example.exampleType ??
            example.type ??
            label.toLowerCase(),
          "custom",
          140,
        ),
        why_it_matters: readString(
          example.why_it_matters ??
            example.whyItMatters ??
            example.maps_back_to ??
            example.mapsBackTo ??
            example.meaning ??
            example.description,
          "This example supports the visual story.",
          900,
        ),
        explicitly_mentioned:
          example.explicitly_mentioned === true ||
          example.explicitlyMentioned === true ||
          typeof example.mentioned_text === "string" ||
          typeof example.mentionedText === "string",
      };
    })
    .slice(0, 20);
}

function normalizeActions(value: unknown): VisualStoryAction[] {
  return asArray(value)
    .map((item, index): VisualStoryAction => {
      const action = asRecord(item);

      const entityId =
        action.entity_id ??
        action.entityId ??
        action.target_id ??
        action.targetId ??
        action.target ??
        action.entity ??
        action.focus_entity_id ??
        action.focusEntityId;

      const targetEntityId =
        action.target_entity_id ??
        action.targetEntityId ??
        action.to;

      const relationshipId =
        action.relationship_id ??
        action.relationshipId;

      const params: Record<string, unknown> = { ...action };
      delete params.id;
      delete params.type;
      delete params.action_type;
      delete params.actionType;
      delete params.entity_id;
      delete params.entityId;
      delete params.target_entity_id;
      delete params.targetEntityId;
      delete params.easing;

      if (isRecord(action.params)) {
        Object.assign(params, action.params);
      }

      return {
        id: readId(action.id, `action_${index + 1}`),
        type: readString(action.type ?? action.action_type ?? action.actionType ?? action.kind, "highlight_entity", 160),
        entity_id: readOptionalString(entityId, 160),
        target_entity_id: readOptionalString(targetEntityId, 160),
        relationship_id: readOptionalString(relationshipId, 160),
        params: Object.keys(params).length ? params : null,
        easing: readOptionalString(action.easing, 120),
      };
    })
    .slice(0, 80);
}

function normalizeCamera(value: unknown): VisualStoryCameraDirective | null {
  if (!isRecord(value)) return null;

  return {
    mode: readOptionalString(value.mode ?? value.move, 120) ?? undefined,
    focus_entity_id: readOptionalString(value.focus_entity_id ?? value.focusEntityId ?? value.target, 160),
    position: tuple3(value.position),
    look_at: tuple3(value.look_at ?? value.lookAt),
    zoom: typeof value.zoom === "number" ? value.zoom : undefined,
    duration_ms: typeof value.duration_ms === "number" ? value.duration_ms : undefined,
    easing: readOptionalString(value.easing, 120) ?? undefined,
  };
}

function titleFromSegment(segment: string, index: number) {
  return segment.replace(/["“”]/g, "").split(/\s+/).slice(0, 5).join(" ") || `Beat ${index + 1}`;
}

function splitIntoSentences(script: string) {
  const normalized = script.replace(/\s+/g, " ").trim();
  if (!normalized) return [FALLBACK_ORIENTATION_SCRIPT];

  return (normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [normalized])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeBeats(value: unknown, orientationScript: string): VisualStoryBeat[] {
  const beats = asArray(value)
    .map((item, index): VisualStoryBeat | null => {
      const beat = asRecord(item);

      const scriptSegment = readOptionalString(
        beat.script_segment ??
          beat.scriptSegment ??
          beat.script_text ??
          beat.scriptText ??
          beat.words ??
          beat.text,
        1400,
      );

      if (!scriptSegment) return null;

      const textOverlay = asRecord(beat.text_overlay ?? beat.textOverlay);

      return {
        id: readId(beat.id, `beat_${index + 1}`),
        script_segment: scriptSegment,
        title: readOptionalString(beat.title, 180) ?? titleFromSegment(scriptSegment, index),
        duration_ms: readNumber(beat.duration_ms ?? beat.durationMs, 4800, 800, 30000),
        active_entity_ids: readStringArray(
          beat.active_entity_ids ??
            beat.activeEntityIds ??
            beat.focus_object_ids ??
            beat.focusObjectIds,
          32,
        ),
        actions: normalizeActions(beat.actions ?? beat.scene_actions ?? beat.sceneActions),
        camera: normalizeCamera(beat.camera),
        text_overlay: Object.keys(textOverlay).length
          ? {
              layout: readOptionalString(textOverlay.layout, 120) ?? undefined,
              emphasis: readOptionalString(textOverlay.emphasis, 120) ?? undefined,
            }
          : null,
      };
    })
    .filter((beat): beat is VisualStoryBeat => Boolean(beat))
    .slice(0, 20);

  return beats.length
    ? beats
    : splitIntoSentences(orientationScript).map((segment, index) => ({
        id: `beat_${index + 1}`,
        script_segment: segment,
        title: titleFromSegment(segment, index),
        duration_ms: index === 0 ? 4200 : 5200,
        active_entity_ids: [],
        actions: [],
        camera: null,
        text_overlay: null,
      }));
}

function normalizeControls(value: unknown): VisualStoryInteractionPhase["controls"] {
  if (Array.isArray(value)) {
    const set = new Set(value.filter((item): item is string => typeof item === "string"));

    return {
      orbit: set.has("orbit"),
      zoom: set.has("zoom"),
      pan: set.has("pan"),
      drag_objects: set.has("drag_objects") || set.has("dragObjects"),
      toggle_layers: set.has("toggle_layers") || set.has("toggleLayers"),
      scrub_story: set.has("scrub_story") || set.has("scrubStory"),
      replay: set.has("replay"),
      pause: set.has("pause"),
    };
  }

  const controls = asRecord(value);

  return {
    orbit: controls.orbit !== false,
    zoom: controls.zoom !== false,
    pan: controls.pan === true,
    drag_objects: controls.drag_objects !== false && controls.dragObjects !== false,
    toggle_layers: controls.toggle_layers !== false && controls.toggleLayers !== false,
    scrub_story: controls.scrub_story !== false && controls.scrubStory !== false,
    replay: controls.replay !== false,
    pause: controls.pause !== false,
  };
}

function normalizeInteraction(value: unknown): VisualStoryInteractionPhase {
  if (!isRecord(value)) return DEFAULT_INTERACTION;

  const free = asRecord(value.free_exploration ?? value.freeExploration);
  const requiredActions = asArray(value.required_actions ?? value.requiredActions);

  const manipulators = asArray(value.manipulators).length
    ? asArray(value.manipulators)
    : requiredActions;

  return {
    unlock_after: readString(value.unlock_after ?? value.unlockAfter, "story_complete", 120),
    controls: normalizeControls(value.controls),
    free_exploration: {
      enabled: free.enabled !== false,
      instructions:
        readOptionalString(free.instructions, 500) ??
        readOptionalString(value.instructions, 500) ??
        DEFAULT_INTERACTION.free_exploration?.instructions,
      highlight_interactive_entities: readStringArray(
        free.highlight_interactive_entities ??
          free.highlightInteractiveEntities,
        16,
      ),
    },
    manipulators: manipulators
      .map((item, index) => {
        const manipulator = asRecord(item);

        return {
          id: readId(manipulator.id, `manipulator_${index + 1}`),
          type: readString(manipulator.type, "explore_scene", 160),
          label: readString(manipulator.label ?? manipulator.instructions, "Explore the scene", 240),
          target_entity_id:
            readOptionalString(
              manipulator.target_entity_id ??
                manipulator.targetEntityId ??
                manipulator.target,
              160,
            ) ?? undefined,
          params: isRecord(manipulator.params) ? manipulator.params : undefined,
        };
      })
      .slice(0, 16),
  };
}

function normalizeOptionalCheck(value: unknown): VisualStoryScene["optional_check"] {
  if (!isRecord(value)) return null;

  const successCriteria = isRecord(value.success_criteria ?? value.successCriteria)
    ? asRecord(value.success_criteria ?? value.successCriteria)
    : Array.isArray(value.success_markers ?? value.successMarkers)
      ? { success_markers: value.success_markers ?? value.successMarkers }
      : undefined;

  return {
    ...value,
    type: readOptionalString(value.type ?? value.expected_response_type ?? value.expectedResponseType, 160) ?? undefined,
    prompt: readOptionalString(value.prompt, 1000) ?? undefined,
    success_criteria: successCriteria,
    renderer_params: isRecord(value.renderer_params ?? value.rendererParams)
      ? asRecord(value.renderer_params ?? value.rendererParams)
      : undefined,
  };
}

export function normalizeVisualStoryScene(probe: EngineRenderableProbe): VisualStoryScene {
  const rawStoryContract = readRawVisualStory(probe);
  const story = isRecord(rawStoryContract.story) ? rawStoryContract.story : rawStoryContract;
  const visualSemantics = asRecord(story.visual_semantics ?? story.visualSemantics);

  const orientationScript = readString(
    story.orientation_script ??
      story.orientationScript ??
      rawStoryContract.canonical_orientation_script ??
      rawStoryContract.orientation_text ??
      rawStoryContract.teaching_script ??
      probe.prompt.reshaping_explanation ??
      probe.prompt.full_prompt ??
      probe.prompt.task,
    FALLBACK_ORIENTATION_SCRIPT,
    5000,
  );

  const entities = normalizeEntities(
    visualSemantics.key_entities ??
      visualSemantics.entities ??
      story.entities ??
      rawStoryContract.entities ??
      rawStoryContract.scene_objects,
  );

  const relationships = normalizeRelationships(
    visualSemantics.key_relationships ??
      visualSemantics.relationships ??
      story.relationships ??
      rawStoryContract.relationships ??
      rawStoryContract.key_relationships,
  );

  const transformations = normalizeTransformations(
    visualSemantics.key_transformations ??
      visualSemantics.transformations ??
      story.transformations ??
      rawStoryContract.transformations ??
      rawStoryContract.key_transformations,
  );

  const scriptDisplay = asRecord(story.script_display ?? story.scriptDisplay);

  return {
    schema_version: readString(rawStoryContract.schema_version, "myway_visual_story_renderer_v1", 160),
    scene_kind: readString(rawStoryContract.scene_kind ?? rawStoryContract.sceneKind, "visual_story", 120),
    title: readString(story.title ?? rawStoryContract.title, probe.prompt.task || "Visual story", 240),
    orientation_script: orientationScript,
    root_problem_focus: readString(
      story.root_problem_focus ?? story.rootProblemFocus,
      probe.prompt.root_problem_explanation || "The learner needs a visual bridge from words to the underlying relationship.",
      1000,
    ),
    target_takeaway: readString(
      story.target_takeaway ??
        story.targetTakeaway ??
        rawStoryContract.learning_goal ??
        rawStoryContract.story_goal,
      probe.prompt.reshaping_explanation || "Use the scene to see the hidden relationship.",
      1000,
    ),
    scene_family: readString(
      story.scene_family ??
        story.sceneFamily ??
        rawStoryContract.scene_family ??
        rawStoryContract.sceneFamily ??
        visualSemantics.scene_family ??
        visualSemantics.sceneFamily,
      "model_directed_scene",
      160,
    ),
    entities,
    relationships,
    transformations,
    supporting_examples: normalizeSupportingExamples(
      visualSemantics.supporting_examples ??
        visualSemantics.supportingExamples ??
        story.supporting_examples ??
        story.supportingExamples ??
        rawStoryContract.supporting_examples ??
        rawStoryContract.supportingExamples,
    ),
    beats: normalizeBeats(
      story.beats ??
        rawStoryContract.script_beats ??
        rawStoryContract.scriptBeats ??
        rawStoryContract.beats,
      orientationScript,
    ),
    script_display: {
      show_full_script: scriptDisplay.show_full_script !== false && scriptDisplay.showFullScript !== false,
      reveal_mode: readString(scriptDisplay.reveal_mode ?? scriptDisplay.revealMode, "beat_synced", 120),
      layout: readString(scriptDisplay.layout, "bottom_caption", 120),
      max_visible_segments: readNumber(scriptDisplay.max_visible_segments ?? scriptDisplay.maxVisibleSegments, 1, 1, 5),
      animate_text: scriptDisplay.animate_text !== false && scriptDisplay.animateText !== false,
    },
    interaction_phase: normalizeInteraction(rawStoryContract.interaction_phase ?? rawStoryContract.interactionPhase),
    optional_check: normalizeOptionalCheck(rawStoryContract.optional_check ?? rawStoryContract.optionalCheck),
  };
}

export function hasVisualStoryContract(probe: EngineRenderableProbe) {
  const params = asRecord(probe.renderer_params);
  const story = readRawVisualStory(probe);

  return (
    isRecord(params.visual_story) ||
    isRecord(params.visualStory) ||
    isRecord(params.visual_story_v1) ||
    story.schema_version === "myway_visual_story_renderer_v1" ||
    story.scene_kind === "visual_story" ||
    isRecord(story.story) ||
    typeof story.canonical_orientation_script === "string" ||
    Array.isArray(story.script_beats) ||
    Array.isArray(story.beats)
  );
}
