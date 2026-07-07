import type {
  AnswerKey,
  DiagnosisLabel,
  MisconceptionMarker,
  PersonalizationSignalDirection,
  PersonalizationSignalKind,
  PersonalizationSignalScope,
  PresentationStyle,
  ProbeAttemptType,
  ProbeType,
  RendererParams,
} from "@/lib/engine/schemas/shared";
import type { ProbeContractModelOutput } from "@/lib/engine/schemas/probe-contract-model";
import type {
  GuidedVisualInteraction,
  SemanticSceneAction,
  SemanticSceneBeat,
  SemanticSceneEntity,
  SemanticSceneRelationship,
  VisualExperienceMode,
  VisualLearningTurnInput,
  VisualLearningTurnOutput,
  VisualOrientationSegment,
  VisualPersonalizationHypothesis,
  VisualPrimitiveKind,
  VisualSceneActionType,
} from "./visual-learning-turn";
import type { VisualLearningSemanticDraft } from "./visual-learning-semantic-draft";

export type VisualLearningSemanticDraftAssemblyReport = {
  source_shape: "semantic_draft" | "semantic_draft_near_miss";
  notes: string[];
  warnings: string[];
  model_intelligence_fields_used: string[];
  myway_deterministic_fields_added: string[];
};

export type VisualLearningSemanticDraftAssemblyResult = {
  output: VisualLearningTurnOutput;
  report: VisualLearningSemanticDraftAssemblyReport;
};

const DIAGNOSIS_LABELS: DiagnosisLabel[] = [
  "unknown",
  "no_gap_detected",
  "recall_gap",
  "representation_gap",
  "procedure_gap",
  "discrimination_gap",
  "transfer_gap",
  "metacognitive_gap",
];

const EXPERIENCE_MODES: VisualExperienceMode[] = [
  "model_selected_scene",
  "process_loop",
  "mechanism",
  "compare_contrast",
  "spatial_structure",
  "generic_scene",
];

const PRIMITIVE_KINDS: Array<VisualPrimitiveKind | "registered_asset" | "any"> = [
  "sphere",
  "box",
  "arrow",
  "path",
  "label",
  "particle",
  "registered_asset",
  "any",
];

const ACTION_TYPES: VisualSceneActionType[] = [
  "show_entity",
  "highlight_entity",
  "move_entity",
  "trace_path",
  "show_label",
  "show_relationship",
  "fade_in",
  "fade_out",
  "pause_for_check",
];

const ORIENTATION_PURPOSES: VisualOrientationSegment["purpose"][] = [
  "introduce_scene",
  "show_main_structure",
  "show_motion_or_change",
  "show_relationship",
  "prepare_interaction",
  "connect_to_probe",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanId(value: unknown, fallback: string) {
  const raw = typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, "_").replace(/_+/g, "_");
  return cleaned || fallback;
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function clamp01(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function numberFromConfidence(value: unknown, fallback: number) {
  const record = asRecord(value);
  if (record) return clamp01(record.overall, fallback);
  return clamp01(value, fallback);
}

function inferTopicLabel(input: VisualLearningTurnInput) {
  const known = input.known_topic_state?.topic_label;
  if (known && known.trim()) return known.trim();

  const message = input.user_message?.text.toLowerCase() ?? "";
  if (message.includes("krebs")) return "Krebs cycle";
  if (message.includes("mitochond")) return "mitochondria";
  if (message.includes("force") || message.includes("motion")) return "forces and motion";
  if (message.includes("code") || message.includes("debug")) return "debugging";
  if (message.includes("pipe") || message.includes("plumb")) return "plumbing";
  return "visual learning request";
}

function supportedDiagnosis(value: unknown): DiagnosisLabel {
  return DIAGNOSIS_LABELS.includes(value as DiagnosisLabel) ? (value as DiagnosisLabel) : "representation_gap";
}

function supportedExperienceMode(value: unknown): VisualExperienceMode {
  return EXPERIENCE_MODES.includes(value as VisualExperienceMode) ? (value as VisualExperienceMode) : "model_selected_scene";
}

function supportedPrimitive(value: unknown, description = ""): VisualPrimitiveKind | "registered_asset" | "any" {
  if (PRIMITIVE_KINDS.includes(value as VisualPrimitiveKind | "registered_asset" | "any")) {
    return value as VisualPrimitiveKind | "registered_asset" | "any";
  }

  const lower = description.toLowerCase();
  if (lower.includes("loop") || lower.includes("path") || lower.includes("circle") || lower.includes("track")) return "path";
  if (lower.includes("arrow") || lower.includes("flow")) return "arrow";
  if (lower.includes("label") || lower.includes("text") || lower.includes("marker")) return "label";
  if (lower.includes("particle") || lower.includes("dot") || lower.includes("cluster")) return "particle";
  if (lower.includes("container") || lower.includes("box") || lower.includes("shell") || lower.includes("volume")) return "box";
  return "sphere";
}

function supportedActionType(value: unknown): VisualSceneActionType {
  return ACTION_TYPES.includes(value as VisualSceneActionType) ? (value as VisualSceneActionType) : "show_entity";
}

function supportedOrientationPurpose(value: unknown, index: number): VisualOrientationSegment["purpose"] {
  if (ORIENTATION_PURPOSES.includes(value as VisualOrientationSegment["purpose"])) {
    return value as VisualOrientationSegment["purpose"];
  }
  if (index === 0) return "show_main_structure";
  if (index === 1) return "show_motion_or_change";
  return "connect_to_probe";
}

function supportedProbeType(value: unknown, input: VisualLearningTurnInput): ProbeType {
  return input.available_probe_types.includes(value as ProbeType)
    ? (value as ProbeType)
    : input.available_probe_types.includes("single_choice")
      ? "single_choice"
      : input.available_probe_types[0] ?? "explain";
}

function expectedAttemptTypeForProbe(probeType: ProbeType): ProbeAttemptType {
  if (probeType === "multi_choice") return "multi_choice";
  if (probeType === "sequence") return "ordered_items";
  if (probeType === "drag_drop_placements") return "drag_drop_placements";
  if (probeType === "graph_relationship") return "graph";
  if (probeType === "slider") return "numeric";
  if (probeType === "audio_response_question") return "audio_response";
  if (probeType === "video_click_interval") return "video_click";
  if (probeType === "single_choice") return "single_choice";
  return "text";
}

function normalizeOrientationSegments(draft: Record<string, unknown>, rootProblem: string, targetTakeaway: string, input: VisualLearningTurnInput) {
  const rawSegments = asArray(draft.orientation_segments).slice(0, input.output_preferences.max_orientation_segments);

  const segments = rawSegments.map((item, index): VisualOrientationSegment => {
    const record = asRecord(item) ?? {};
    return {
      id: cleanId(record.id, `orientation_${index + 1}`),
      text: text(record.text, index === 0 ? targetTakeaway : rootProblem),
      purpose: supportedOrientationPurpose(record.purpose, index),
    };
  });

  if (segments.length) return segments;

  return [
    {
      id: "orientation_1",
      text: targetTakeaway,
      purpose: "show_main_structure" as const,
    },
  ];
}

function normalizeEntities(scene: Record<string, unknown> | null): SemanticSceneEntity[] {
  const rawEntities = asArray(scene?.entities).length ? asArray(scene?.entities) : asArray(scene?.visual_entities);

  const entities = rawEntities.map((item, index): SemanticSceneEntity => {
    const record = asRecord(item) ?? {};
    const visualNeedRecord = asRecord(record.visual_need);
    const visualNeedDescription = text(
      visualNeedRecord?.description,
      text(record.visual_need, `A visible element for ${text(record.display_name, `entity ${index + 1}`)}.`),
    );
    const id = cleanId(record.id ?? record.entity_id, `entity_${index + 1}`);

    return {
      id,
      display_name: text(record.display_name, text(record.label, id.replace(/_/g, " "))),
      semantic_role: text(record.semantic_role, text(record.role, "visual part of the explanation")),
      visual_need: {
        description: visualNeedDescription,
        semantic_tags: asArray(visualNeedRecord?.semantic_tags ?? record.semantic_tags)
          .map((tag) => String(tag).trim())
          .filter(Boolean)
          .slice(0, 8),
        preferred_render_kind: supportedPrimitive(
          visualNeedRecord?.preferred_render_kind ?? record.preferred_render_kind,
          visualNeedDescription,
        ),
        fallback_allowed: true,
      },
      position_hint: [index * 1.6 - Math.max(0, rawEntities.length - 1) * 0.8, 0, 0],
    };
  });

  if (entities.length) return entities;

  return [
    {
      id: "main_idea",
      display_name: "main idea",
      semantic_role: "the main thing the learner needs to picture",
      visual_need: {
        description: "A simple central object representing the main idea.",
        semantic_tags: ["main idea", "placeholder"],
        preferred_render_kind: "sphere",
        fallback_allowed: true,
      },
      position_hint: [0, 0, 0],
    },
  ];
}

function normalizeRelationships(scene: Record<string, unknown> | null, entityIds: string[]): SemanticSceneRelationship[] {
  return asArray(scene?.relationships)
    .map((item, index): SemanticSceneRelationship | null => {
      const record = asRecord(item) ?? {};
      const source = cleanId(record.source_entity_id, "");
      const targets = asArray(record.target_entity_ids)
        .map((id) => cleanId(id, ""))
        .filter((id) => entityIds.includes(id));

      if (!entityIds.includes(source) || targets.length === 0) return null;

      const rawType = record.relationship_type;
      const relationship_type =
        rawType === "connects_to" ||
        rawType === "contrasts_with" ||
        rawType === "causes" ||
        rawType === "becomes" ||
        rawType === "enters" ||
        rawType === "leaves" ||
        rawType === "cycles_back" ||
        rawType === "supports_takeaway"
          ? rawType
          : "connects_to";

      return {
        id: cleanId(record.id, `relationship_${index + 1}`),
        source_entity_id: source,
        target_entity_ids: targets,
        relationship_type,
        explanation: text(record.explanation, "These parts are connected in the visual explanation."),
      };
    })
    .filter((item): item is SemanticSceneRelationship => Boolean(item));
}

function normalizeAction(item: unknown, index: number, entityIds: string[]): SemanticSceneAction {
  const record = asRecord(item) ?? {};
  const target = cleanId(record.target_entity_id ?? record.entity_id ?? record.from_entity_id ?? record.to_entity_id, entityIds[0] ?? "main_idea");
  const safeTarget = entityIds.includes(target) ? target : entityIds[0] ?? "main_idea";

  return {
    id: cleanId(record.id, `action_${index + 1}`),
    type: supportedActionType(record.type ?? record.action),
    target_entity_id: safeTarget,
    narration: optionalText(record.narration),
    params: asRecord(record.params) ?? {},
  };
}

function normalizeBeats(
  scene: Record<string, unknown> | null,
  orientationIds: string[],
  entityIds: string[],
  input: VisualLearningTurnInput,
): SemanticSceneBeat[] {
  const rawBeats = asArray(scene?.beats).slice(0, input.output_preferences.max_visual_beats);

  const beats = rawBeats.map((item, index): SemanticSceneBeat => {
    const record = asRecord(item) ?? {};
    const sourceIds = asArray(record.source_orientation_segment_ids)
      .map((id) => cleanId(id, ""))
      .filter((id) => orientationIds.includes(id));
    const safeSourceIds = sourceIds.length
      ? sourceIds
      : [orientationIds[Math.min(index, orientationIds.length - 1)] ?? orientationIds[0] ?? "orientation_1"];
    const actions = asArray(record.actions).map((action, actionIndex) => normalizeAction(action, actionIndex, entityIds));
    const activeIds = asArray(record.active_entity_ids)
      .map((id) => cleanId(id, ""))
      .filter((id) => entityIds.includes(id));
    const activeFromActions = actions.map((action) => action.target_entity_id).filter((id) => entityIds.includes(id));
    const safeActiveIds = Array.from(new Set([...activeIds, ...activeFromActions]));

    return {
      id: cleanId(record.id ?? record.beat_id, `beat_${index + 1}`),
      title: text(record.title, `Beat ${index + 1}`),
      source_orientation_segment_ids: safeSourceIds,
      duration_ms: 3500 + index * 500,
      active_entity_ids: safeActiveIds.length ? safeActiveIds : [entityIds[0] ?? "main_idea"],
      actions: actions.length
        ? actions
        : [
            {
              id: `action_${index + 1}_show`,
              type: "show_entity",
              target_entity_id: entityIds[0] ?? "main_idea",
              narration: "Look at the main visual idea.",
              params: {},
            },
          ],
    };
  });

  if (beats.length) return beats;

  return [
    {
      id: "beat_1",
      title: "Build the main picture",
      source_orientation_segment_ids: [orientationIds[0] ?? "orientation_1"],
      duration_ms: 3500,
      active_entity_ids: [entityIds[0] ?? "main_idea"],
      actions: [
        {
          id: "action_1_show_main",
          type: "show_entity",
          target_entity_id: entityIds[0] ?? "main_idea",
          narration: "Start by looking at the main visual idea.",
          params: {},
        },
      ],
    },
  ];
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  return record && Object.keys(record).length > 0 ? record : null;
}

function normalizeRecordArray(value: unknown, max = 8): Array<Record<string, unknown>> {
  return asArray(value)
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .slice(0, max);
}

function normalizeDirectedStoryBeats(scene: Record<string, unknown> | null, beats: SemanticSceneBeat[]): Array<Record<string, unknown>> {
  const raw = asArray(scene?.story_beats).length
    ? asArray(scene?.story_beats)
    : asArray(scene?.directed_story_beats);

  const normalized = normalizeRecordArray(raw, beats.length || 8).map((beat, index) => {
    const fallbackBeat = beats[index];
    return {
      ...beat,
      id: cleanId(beat.id, fallbackBeat?.id ?? `beat_${index + 1}`),
      title: text(beat.title, fallbackBeat?.title ?? `Beat ${index + 1}`),
    };
  });

  if (normalized.length) return normalized;

  return beats.map((beat) => ({
    id: beat.id,
    title: beat.title,
    director_intent: beat.actions.map((action) => action.narration).filter(Boolean).join(" ") || "Guide the learner through this visual beat.",
    camera: {
      shot_type: "follow",
      focus_entity_ids: beat.active_entity_ids,
      movement: "Follow the active visual idea without losing the overall scene.",
    },
    visual_events: beat.actions.map((action) => ({
      type: action.type,
      entity_id: action.target_entity_id,
      description: action.narration ?? "Show the active visual event.",
    })),
    spoken_caption: {
      text: beat.actions.map((action) => action.narration).filter(Boolean).join(" ") || beat.title,
      display_mode: "one_word_at_a_time",
      cadence: "natural_speech",
    },
  }));
}

function normalizeGuidedInteraction(
  draft: Record<string, unknown>,
  entityIds: string[],
): GuidedVisualInteraction {
  const raw = asRecord(draft.guided_interaction) ?? {};
  const rawActionType = raw.required_action_type;
  const required_action_type =
    rawActionType === "orbit" ||
    rawActionType === "zoom" ||
    rawActionType === "scrub_beats" ||
    rawActionType === "inspect_entity" ||
    rawActionType === "compare_entities" ||
    rawActionType === "drag_object" ||
    rawActionType === "toggle_layer" ||
    rawActionType === "answer_in_scene" ||
    rawActionType === "none"
      ? rawActionType
      : "scrub_beats";

  const targetIds = asArray(raw.target_entity_ids)
    .map((id) => cleanId(id, ""))
    .filter((id) => entityIds.includes(id));

  return {
    instruction: text(raw.instruction, "Scrub through the scene and explain what changes from one beat to the next."),
    required_action_type,
    target_entity_ids: targetIds.length ? targetIds : entityIds.slice(0, 3),
    success_observation: text(raw.success_observation, "The learner can connect the visual scene back to the target takeaway."),
  };
}

function normalizeProbe(draft: Record<string, unknown>, input: VisualLearningTurnInput, rootProblem: string, targetTakeaway: string): ProbeContractModelOutput {
  const raw = asRecord(draft.probe) ?? asRecord(draft.followup_probe) ?? {};
  const probeType = supportedProbeType(raw.probe_type, input);
  const expectedAttemptType = expectedAttemptTypeForProbe(probeType);
  const rawOptions = asArray(raw.options).slice(0, input.output_preferences.max_probe_options);
  const options = rawOptions.map((item, index) => {
    const record = asRecord(item) ?? {};
    return {
      id: cleanId(record.id, `option_${String.fromCharCode(97 + index)}`),
      label: text(record.label, String.fromCharCode(65 + index)),
      text: text(record.text, `Option ${index + 1}`),
    };
  });

  let answerKey: AnswerKey;
  if (expectedAttemptType === "single_choice") {
    answerKey = {
      kind: "single_choice",
      correct_option_id: optionalText(raw.correct_option_id) ?? options[0]?.id ?? null,
    };
  } else if (expectedAttemptType === "multi_choice") {
    const correctIds = asArray(raw.correct_option_ids)
      .map(String)
      .filter((id) => options.some((option) => option.id === id));
    answerKey = {
      kind: "multi_choice",
      correct_option_ids: correctIds.length ? correctIds : options[0] ? [options[0].id] : [],
    };
  } else {
    const expectedIdeas = asArray(raw.expected_ideas).map(String).filter(Boolean).slice(0, 5);
    answerKey = {
      kind: expectedAttemptType === "ordered_items" ? "ordered_items" : expectedAttemptType === "graph" ? "graph" : "text",
      expected_ideas: expectedIdeas.length ? expectedIdeas : [targetTakeaway],
      success_markers: [targetTakeaway],
    };
  }

  const rendererParams: RendererParams =
    expectedAttemptType === "single_choice" || expectedAttemptType === "multi_choice"
      ? { options }
      : {};

  const misconceptions: MisconceptionMarker[] = asArray(raw.misconception_markers).map((item, index) => {
    const record = asRecord(item) ?? {};
    return {
      misconception_id: cleanId(record.misconception_id, `misconception_${index + 1}`),
      label: text(record.label, `Misconception ${index + 1}`),
      description: optionalText(record.description),
      confidence: 0.65,
    };
  });

  return {
    schema_version: "probe_contract_model_output_v1" as const,
    probe_type: probeType,
    expected_attempt_type: expectedAttemptType,
    prompt: {
      root_problem_explanation: rootProblem,
      reshaping_explanation: text(raw.what_it_measures, "The scene built the mental picture needed for the check."),
      task: expectedAttemptType === "text" ? "Explain the main idea from the scene." : "Choose the best answer.",
      full_prompt: text(raw.question, `Based on the scene, which choice best matches this takeaway: ${targetTakeaway}`),
    },
    presentation_support: [],
    answer_key: answerKey,
    misconception_markers: misconceptions,
    renderer_params: rendererParams,
    delivery_context: {
      bridge_level: input.personalization_context.bridge_level,
      language_policy: input.personalization_context.language_policy,
      presentation_styles_used: [input.personalization_context.preferred_style ?? ("visual_description" as PresentationStyle)],
      support_kinds_used: ["visual_description" as const],
      example_domains_used: [],
      personalization_signals_used: [],
    },
    confidence: 0.78,
  };
}

function normalizePersonalizationHypotheses(draft: Record<string, unknown>): VisualPersonalizationHypothesis[] {
  return asArray(draft.personalization_hypotheses).slice(0, 4).map((item, index): VisualPersonalizationHypothesis => {
    const record = asRecord(item) ?? {};
    const kind: PersonalizationSignalKind =
      record.kind === "bridge_level" ||
      record.kind === "jargon_level" ||
      record.kind === "presentation_style" ||
      record.kind === "support_kind" ||
      record.kind === "probe_type" ||
      record.kind === "verification_pattern"
        ? record.kind
        : "presentation_style";
    const direction: PersonalizationSignalDirection =
      record.direction === "avoid" || record.direction === "verify" ? record.direction : "prefer";
    const scope: PersonalizationSignalScope =
      record.scope === "global" || record.scope === "topic" || record.scope === "probe_type" || record.scope === "diagnosis_label"
        ? record.scope
        : "diagnosis_label";

    return {
      kind,
      value: text(record.value, `hypothesis_${index + 1}`),
      direction,
      scope,
      scope_key: optionalText(record.scope_key) ?? (scope === "diagnosis_label" ? "representation_gap" : null),
      confidence: clamp01(record.confidence, 0.45),
      reason: text(record.reason, "This is a tentative pre-attempt personalization hypothesis."),
    };
  });
}

export function assembleVisualLearningTurnFromSemanticDraft(
  rawDraft: VisualLearningSemanticDraft | unknown,
  input: VisualLearningTurnInput,
): VisualLearningSemanticDraftAssemblyResult {
  const draft = asRecord(rawDraft) ?? {};
  const clarification = asRecord(draft.clarification) ?? {};
  const confidenceRecord = asRecord(clarification.confidence) ?? {};

  if (draft.turn_status === "needs_clarification") {
    return {
      output: {
        schema_version: "myway_visual_learning_turn_output_v1",
        turn_status: "needs_clarification",
        clarification_gate: {
          schema_version: "myway_turn_clarification_gate_output_v1",
          action: "ask_clarifying_question",
          confidence: {
            overall: clamp01(confidenceRecord.overall, 0.42),
            topic: clamp01(confidenceRecord.topic, 0.25),
            learner_goal: clamp01(confidenceRecord.learner_goal, 0.5),
          },
          clarification_question: text(clarification.question, "What topic or problem are you trying to understand?"),
          scope_choices: [],
          reason: text(clarification.reason, "The learner request was not clear enough to safely build a visual learning turn."),
        },
      },
      report: {
        source_shape: draft.schema_version === "myway_visual_learning_semantic_draft_v1" ? "semantic_draft" : "semantic_draft_near_miss",
        notes: ["MyWay assembled a needs_clarification output from the model's semantic draft."],
        warnings: [],
        model_intelligence_fields_used: ["clarification.question", "clarification.reason", "clarification.confidence"],
        myway_deterministic_fields_added: ["schema_version", "clarification_gate.action", "scope_choices"],
      },
    };
  }

  const topic = asRecord(draft.topic) ?? {};
  const diagnosis = asRecord(draft.diagnosis) ?? {};
  const focus = asRecord(draft.learning_focus) ?? draft;
  const scene = asRecord(draft.scene) ?? asRecord(draft.semantic_scene_plan);

  const topicLabel = text(topic.label, inferTopicLabel(input));
  const diagnosisLabel = supportedDiagnosis(diagnosis.label);
  const rootProblem = text(
    focus.root_problem,
    "The learner does not yet have a stable mental picture of the idea, so the pieces feel disconnected.",
  );
  const targetTakeaway = text(
    focus.target_takeaway,
    "The learner should leave with one simple mental picture they can use to organize the idea.",
  );
  const whyVisualFirst = text(
    focus.why_visual_first,
    "A visual scene should come first because the learner's current gap is about picturing the idea.",
  );
  const orientationSegments = normalizeOrientationSegments(draft, rootProblem, targetTakeaway, input);
  const orientationIds = orientationSegments.map((segment) => segment.id);
  const entities = normalizeEntities(scene);
  const entityIds = entities.map((entity) => entity.id);
  const relationships = normalizeRelationships(scene, entityIds);
  const beats = normalizeBeats(scene, orientationIds, entityIds, input);
  const directedScene = normalizeRecord(scene?.directed_scene ?? (draft as Record<string, unknown>).directed_scene);
  const storyBeats = normalizeDirectedStoryBeats(scene, beats);
  const captionPolicy = normalizeRecord(scene?.caption_policy ?? directedScene?.caption_policy) ?? {
    display_mode: "one_word_at_a_time",
    cadence: "natural_speech",
    max_words_on_screen: 1,
  };
  const labelPolicy = normalizeRecord(scene?.label_policy ?? directedScene?.label_policy) ?? {
    default_visibility: "active_only",
    show_labels_when: "introduced_or_selected",
    avoid_covering_core_motion: true,
  };
  const guidedInteraction = normalizeGuidedInteraction(draft, entityIds);
  const followupProbe = normalizeProbe(draft, input, rootProblem, targetTakeaway);
  const personalizationHypotheses = normalizePersonalizationHypotheses(draft);

  return {
    output: {
      schema_version: "myway_visual_learning_turn_output_v1",
      turn_status: "proceed",
      clarification_gate: {
        schema_version: "myway_turn_clarification_gate_output_v1",
        action: "proceed",
        confidence: {
          overall: clamp01(confidenceRecord.overall, 0.86),
          topic: clamp01(confidenceRecord.topic ?? topic.confidence, 0.82),
          learner_goal: clamp01(confidenceRecord.learner_goal, 0.82),
        },
        clarification_question: null,
        scope_choices: [],
        reason: text(clarification.reason, "The learner provided enough signal to build a visual learning turn."),
      },
      topic_resolution: {
        topic_label: topicLabel,
        topic_id: input.known_topic_state?.topic_id ?? null,
        topic_confidence: clamp01(topic.confidence, 0.82),
        topic_reference_type: input.known_topic_state?.topic_label ? "existing_topic" : "new_topic",
        reason: text(topic.reason, "The topic was inferred from the learner message."),
      },
      diagnosis: {
        schema_version: "diagnosis_model_output_v1",
        diagnosis: diagnosisLabel,
        diagnosis_confidence: clamp01(diagnosis.confidence, 0.78),
        next_action: "generate_probe_contract",
        next_action_confidence: 0.82,
        suggested_question: null,
      },
      learning_focus: {
        root_problem: rootProblem,
        target_takeaway: targetTakeaway,
        why_visual_first: whyVisualFirst,
      },
      visual_experience: {
        schema_version: "myway_visual_experience_compiler_output_v1",
        title: text(scene?.title, `${topicLabel} visual model`),
        experience_mode: supportedExperienceMode(scene?.experience_mode),
        orientation_segments: orientationSegments,
        semantic_scene_plan: {
          directed_scene: directedScene,
          story_beats: storyBeats,
          caption_policy: captionPolicy,
          label_policy: labelPolicy,
          entities,
          relationships,
          beats,
          camera_notes: optionalText(scene?.camera_notes),
          interaction_notes: optionalText(scene?.interaction_notes),
        },
      },
      guided_interaction: guidedInteraction,
      followup_probe: followupProbe,
      personalization_hypotheses: personalizationHypotheses,
      confidence: numberFromConfidence(draft.confidence, 0.82),
    },
    report: {
      source_shape: draft.schema_version === "myway_visual_learning_semantic_draft_v1" ? "semantic_draft" : "semantic_draft_near_miss",
      notes: ["MyWay assembled the strict VisualLearningTurnOutput from the model's compact semantic draft."],
      warnings: [],
      model_intelligence_fields_used: [
        "clarification",
        "topic",
        "diagnosis",
        "learning_focus",
        "orientation_segments",
        "scene.directed_scene",
        "scene.story_beats",
        "scene.entities",
        "scene.relationships",
        "scene.beats",
        "guided_interaction",
        "probe",
        "personalization_hypotheses",
        "confidence",
      ],
      myway_deterministic_fields_added: [
        "schema_version fields",
        "clarification_gate wrapper",
        "topic_resolution wrapper",
        "diagnosis.next_action",
        "visual_experience wrapper",
        "duration_ms defaults",
        "action ids",
        "position hints",
        "followup_probe ProbeContractModelOutput wrapper",
        "delivery_context",
        "renderer_params",
        "answer_key shape",
      ],
    },
  };
}

