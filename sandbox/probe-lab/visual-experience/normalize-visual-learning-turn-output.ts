import type {
  GuidedVisualInteraction,
  SemanticSceneAction,
  SemanticSceneBeat,
  SemanticSceneEntity,
  SemanticSceneRelationship,
  VisualExperienceMode,
  VisualLearningTurnInput,
  VisualLearningTurnOutput,
  VisualLearningTurnProceedOutput,
  VisualOrientationSegment,
  VisualPersonalizationHypothesis,
  VisualPrimitiveKind,
  VisualSceneActionType,
} from "./visual-learning-turn";

import {
  directorPlanToCaptionPolicy,
  directorPlanToLegacyDirectedScene,
  directorPlanToLegacySemanticBeats,
  directorPlanToLegacyStoryBeats,
  normalizeEducationalSceneDirectorPlan,
} from "../director";
import {
  buildSceneResourcePlanFromDirector,
  normalizeSceneResourcePlan,
} from "../scene-resources";

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

export type VisualLearningTurnNormalizationReport = {
  applied: boolean;
  source_shape: "already_strict" | "near_miss_flat" | "near_miss_partial" | "unknown";
  notes: string[];
  warnings: string[];
};

export type VisualLearningTurnNormalizationResult = {
  output: VisualLearningTurnOutput;
  report: VisualLearningTurnNormalizationReport;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function pickRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const record = asRecord(value);
    if (record) return record;
  }
  return null;
}

function pickArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    const array = asArray(value);
    if (array.length) return array;
  }
  return [];
}

function supportedExperienceMode(value: unknown): VisualExperienceMode {
  return EXPERIENCE_MODES.includes(value as VisualExperienceMode) ? (value as VisualExperienceMode) : "model_selected_scene";
}

function supportedPrimitive(value: unknown, description = ""): VisualPrimitiveKind | "registered_asset" | "any" {
  if (typeof value === "string" && PRIMITIVE_KINDS.includes(value as VisualPrimitiveKind | "registered_asset" | "any")) {
    return value as VisualPrimitiveKind | "registered_asset" | "any";
  }

  const lower = description.toLowerCase();
  if (lower.includes("loop") || lower.includes("path") || lower.includes("track") || lower.includes("circle")) return "path";
  if (lower.includes("arrow") || lower.includes("flow")) return "arrow";
  if (lower.includes("label") || lower.includes("text") || lower.includes("marker")) return "label";
  if (lower.includes("particle") || lower.includes("cluster") || lower.includes("dot")) return "particle";
  if (lower.includes("shell") || lower.includes("container") || lower.includes("volume") || lower.includes("box")) return "box";
  return "sphere";
}

function supportedActionType(value: unknown): VisualSceneActionType {
  if (ACTION_TYPES.includes(value as VisualSceneActionType)) return value as VisualSceneActionType;
  if (value === "action") return "show_entity";
  return "show_entity";
}

function inferTopicLabel(input: VisualLearningTurnInput, raw: Record<string, unknown>): string {
  const nestedTopic = asRecord(raw.topic_resolution)?.topic_label;
  return text(nestedTopic, text(input.known_topic_state?.topic_label, "Unknown topic"));
}

function makeClarificationOutput(raw: Record<string, unknown>, input: VisualLearningTurnInput): VisualLearningTurnOutput {
  const gate = pickRecord(raw.clarification_gate, raw) ?? {};
  const learnerText = input.user_message?.text?.trim() ?? "";

  return {
    schema_version: "myway_visual_learning_turn_output_v1",
    turn_status: "needs_clarification",
    clarification_gate: {
      schema_version: "myway_turn_clarification_gate_output_v1",
      action: "ask_clarifying_question",
      confidence: {
        overall: number(asRecord(gate.confidence)?.overall, 0.42),
        topic: number(asRecord(gate.confidence)?.topic, 0.2),
        learner_goal: number(asRecord(gate.confidence)?.learner_goal, 0.55),
      },
      clarification_question: text(
        gate.clarification_question,
        learnerText ? "What part of this are you trying to understand?" : "What topic or problem are you trying to understand?",
      ),
      scope_choices: asArray(gate.scope_choices).map((choice, index) => {
        const record = asRecord(choice) ?? {};
        return {
          id: text(record.id, `choice_${index + 1}`),
          label: text(record.label, `Choice ${index + 1}`),
          description: text(record.description, "Clarify this direction."),
        };
      }),
      reason: text(gate.reason, "The learner request was not clear enough to safely build a visual learning turn."),
    },
  };
}

function normalizeOrientationSegments(raw: Record<string, unknown>, rootProblem: string, targetTakeaway: string): VisualOrientationSegment[] {
  const visualExperience = asRecord(raw.visual_experience);
  const rawSegments = pickArray(visualExperience?.orientation_segments, raw.orientation_segments);

  const segments = rawSegments.slice(0, 5).map((segment, index): VisualOrientationSegment => {
    const record = asRecord(segment) ?? {};
    const id = text(record.id, `orientation_${index + 1}`);
    return {
      id,
      text: text(record.text, index === 0 ? targetTakeaway : rootProblem),
      purpose: (
        record.purpose === "introduce_scene" ||
        record.purpose === "show_main_structure" ||
        record.purpose === "show_motion_or_change" ||
        record.purpose === "show_relationship" ||
        record.purpose === "prepare_interaction" ||
        record.purpose === "connect_to_probe"
          ? record.purpose
          : index === 0
            ? "show_main_structure"
            : index === rawSegments.length - 1
              ? "connect_to_probe"
              : "show_motion_or_change"
      ) as VisualOrientationSegment["purpose"],
    };
  });

  if (segments.length) return segments;

  return [
    {
      id: "orientation_1",
      text: targetTakeaway,
      purpose: "show_main_structure",
    },
  ];
}

function normalizeEntities(rawScenePlan: Record<string, unknown> | null): SemanticSceneEntity[] {
  const rawEntities = pickArray(rawScenePlan?.entities, rawScenePlan?.visual_entities);

  const entities = rawEntities.map((entity, index): SemanticSceneEntity => {
    const record = asRecord(entity) ?? {};
    const visualNeedRecord = asRecord(record.visual_need);
    const visualNeedDescription = text(
      visualNeedRecord?.description,
      text(record.visual_need, text(record.description, `A visible element for ${text(record.display_name, text(record.entity_id, `entity ${index + 1}`))}.`)),
    );
    const id = text(record.id, text(record.entity_id, `entity_${index + 1}`)).replace(/[^a-zA-Z0-9_\-]/g, "_");
    const displayName = text(record.display_name, text(record.label, id.replace(/_/g, " ")));

    return {
      id,
      display_name: displayName,
      semantic_role: text(record.semantic_role, text(record.role, "visual part of the explanation")),
      visual_need: {
        description: visualNeedDescription,
        semantic_tags: asArray(visualNeedRecord?.semantic_tags ?? record.semantic_tags)
          .map((tag) => String(tag).trim())
          .filter(Boolean)
          .slice(0, 8),
        preferred_render_kind: supportedPrimitive(visualNeedRecord?.preferred_render_kind ?? record.preferred_render_kind, visualNeedDescription),
        fallback_allowed: typeof visualNeedRecord?.fallback_allowed === "boolean" ? visualNeedRecord.fallback_allowed : true,
      },
      actor_kind:
        typeof record.actor_kind === "string"
          ? record.actor_kind
          : undefined,
      asset_policy: asRecord(record.asset_policy)
        ? {
            asset_required:
              asRecord(record.asset_policy)?.asset_required === true,
            can_use_proxy_until_asset_ready:
              asRecord(record.asset_policy)?.can_use_proxy_until_asset_ready !== false,
            fallback_representation:
              typeof asRecord(record.asset_policy)?.fallback_representation === "string"
                ? String(asRecord(record.asset_policy)?.fallback_representation)
                : undefined,
            capability_needs: asArray(asRecord(record.asset_policy)?.capability_needs)
              .map(String)
              .filter(Boolean)
              .slice(0, 16),
            anchor_needs: asArray(asRecord(record.asset_policy)?.anchor_needs)
              .map(String)
              .filter(Boolean)
              .slice(0, 16),
          }
        : null,
      position_hint: Array.isArray(record.position_hint) && record.position_hint.length === 3
        ? [Number(record.position_hint[0]) || 0, Number(record.position_hint[1]) || 0, Number(record.position_hint[2]) || 0]
        : [index * 1.6 - Math.max(0, rawEntities.length - 1) * 0.8, 0, 0],
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

function normalizeRelationships(rawScenePlan: Record<string, unknown> | null, entityIds: string[]): SemanticSceneRelationship[] {
  const rawRelationships = asArray(rawScenePlan?.relationships);

  return rawRelationships
    .map((relationship, index): SemanticSceneRelationship | null => {
      const record = asRecord(relationship) ?? {};
      const source = text(record.source_entity_id, text(record.from_entity_id, ""));
      const targets = asArray(record.target_entity_ids).map(String).filter((id) => entityIds.includes(id));

      if (!entityIds.includes(source) || targets.length === 0) return null;

      const relationshipType =
        record.relationship_type === "connects_to" ||
        record.relationship_type === "contrasts_with" ||
        record.relationship_type === "causes" ||
        record.relationship_type === "becomes" ||
        record.relationship_type === "enters" ||
        record.relationship_type === "leaves" ||
        record.relationship_type === "cycles_back" ||
        record.relationship_type === "supports_takeaway"
          ? record.relationship_type
          : "connects_to";

      return {
        id: text(record.id, `relationship_${index + 1}`),
        source_entity_id: source,
        target_entity_ids: targets,
        relationship_type: relationshipType,
        explanation: text(record.explanation, "These parts are connected in the visual explanation."),
      };
    })
    .filter((relationship): relationship is SemanticSceneRelationship => Boolean(relationship));
}

function normalizeAction(action: unknown, index: number, entityIds: string[]): SemanticSceneAction {
  const record = asRecord(action) ?? {};
  const targetCandidate = text(record.target_entity_id, text(record.entity_id, text(record.from_entity_id, text(record.to_entity_id, ""))));
  const target = entityIds.includes(targetCandidate) ? targetCandidate : entityIds[0] ?? "main_idea";
  const rawType = record.type ?? record.action;

  return {
    id: text(record.id, `action_${index + 1}`),
    type: supportedActionType(rawType),
    target_entity_id: target,
    narration: text(record.narration, text(record.caption, text(record.text, ""))) || null,
    params: {
      ...record,
      normalized_from_near_miss: true,
    },
  };
}

function normalizeBeats(rawScenePlan: Record<string, unknown> | null, orientationIds: string[], entityIds: string[]): SemanticSceneBeat[] {
  const rawBeats = asArray(rawScenePlan?.beats).slice(0, 5);

  const beats = rawBeats.map((beat, index): SemanticSceneBeat => {
    const record = asRecord(beat) ?? {};
    const sourceIds = asArray(record.source_orientation_segment_ids)
      .map(String)
      .filter((id) => orientationIds.includes(id));
    const safeSourceIds = sourceIds.length ? sourceIds : [orientationIds[Math.min(index, orientationIds.length - 1)] ?? orientationIds[0] ?? "orientation_1"];

    const actions = asArray(record.actions).map((action, actionIndex) => normalizeAction(action, actionIndex, entityIds));
    const activeFromActions = actions.map((action) => action.target_entity_id).filter((id) => entityIds.includes(id));
    const activeEntityIds = asArray(record.active_entity_ids).map(String).filter((id) => entityIds.includes(id));
    const safeActiveEntityIds = Array.from(new Set([...activeEntityIds, ...activeFromActions])).slice(0, 8);

    return {
      id: text(record.id, text(record.beat_id, `beat_${index + 1}`)),
      title: text(record.title, text(record.caption, `Beat ${index + 1}`)),
      source_orientation_segment_ids: safeSourceIds,
      duration_ms: typeof record.duration_ms === "number" ? Math.max(1000, record.duration_ms) : 4500,
      active_entity_ids: safeActiveEntityIds.length ? safeActiveEntityIds : [entityIds[0] ?? "main_idea"],
      actions: actions.length
        ? actions
        : [
            {
              id: `action_${index + 1}_show`,
              type: "show_entity",
              target_entity_id: entityIds[0] ?? "main_idea",
              narration: text(record.caption, null as unknown as string) || null,
              params: { normalized_default_action: true },
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
      duration_ms: 4500,
      active_entity_ids: [entityIds[0] ?? "main_idea"],
      actions: [
        {
          id: "action_1_show_main",
          type: "show_entity",
          target_entity_id: entityIds[0] ?? "main_idea",
          narration: "Start by looking at the main visual idea.",
          params: { normalized_default_action: true },
        },
      ],
    },
  ];
}

function normalizeGuidedInteraction(raw: Record<string, unknown>, entityIds: string[]): GuidedVisualInteraction {
  const rawGuided = asRecord(raw.guided_interaction) ?? {};
  const rawMode = text(rawGuided.mode, "");
  const promptCount = asArray(rawGuided.scrub_prompts).length;

  return {
    instruction: text(
      rawGuided.instruction,
      rawMode === "scrub_with_prompts" || promptCount > 0
        ? "Scrub through the scene beats and explain what changes from one beat to the next."
        : "Interact with the scene and point out the part that matches the main takeaway.",
    ),
    required_action_type:
      rawGuided.required_action_type === "orbit" ||
      rawGuided.required_action_type === "zoom" ||
      rawGuided.required_action_type === "scrub_beats" ||
      rawGuided.required_action_type === "inspect_entity" ||
      rawGuided.required_action_type === "compare_entities" ||
      rawGuided.required_action_type === "drag_object" ||
      rawGuided.required_action_type === "toggle_layer" ||
      rawGuided.required_action_type === "answer_in_scene" ||
      rawGuided.required_action_type === "none"
        ? rawGuided.required_action_type
        : rawMode === "scrub_with_prompts" || promptCount > 0
          ? "scrub_beats"
          : "inspect_entity",
    target_entity_ids: entityIds.slice(0, 4),
    success_observation: text(rawGuided.success_observation, "The learner can connect the visual scene back to the target takeaway."),
  };
}

function normalizeFollowupProbe(raw: Record<string, unknown>, input: VisualLearningTurnInput, rootProblem: string, targetTakeaway: string) {
  const rawProbe = asRecord(raw.followup_probe) ?? {};
  const rawRendererParams = asRecord(rawProbe.renderer_params) ?? {};
  const rawPrompt = rawProbe.prompt;
  const promptRecord = asRecord(rawPrompt);
  const options = asArray(rawRendererParams.options).slice(0, input.output_preferences.max_probe_options).map((option, index) => {
    const record = asRecord(option) ?? {};
    return {
      id: text(record.id, String.fromCharCode(97 + index)),
      label: text(record.label, String.fromCharCode(65 + index)),
      text: text(record.text, `Option ${index + 1}`),
    };
  });
  const probeType = input.available_probe_types.includes(rawProbe.probe_type as never)
    ? (rawProbe.probe_type as never)
    : input.available_probe_types.includes("single_choice" as never)
      ? "single_choice"
      : input.available_probe_types[0];
  const expectedAttemptType = probeType === "multi_choice" ? "multi_choice" : probeType === "sequence" ? "ordered_items" : probeType === "drag_drop_placements" ? "drag_drop_placements" : probeType === "graph_relationship" ? "graph" : probeType === "explain" ? "text" : "single_choice";
  const answerKeyCandidate = asRecord(rawProbe.answer_key) ?? rawRendererParams.answer_key;
  const correctOptionId = typeof answerKeyCandidate === "string" ? answerKeyCandidate : text(asRecord(answerKeyCandidate)?.correct_option_id, options[0]?.id ?? null as unknown as string);

  return {
    schema_version: "probe_contract_model_output_v1",
    probe_type: probeType,
    expected_attempt_type: expectedAttemptType,
    prompt: {
      root_problem_explanation: text(promptRecord?.root_problem_explanation, rootProblem),
      reshaping_explanation: text(promptRecord?.reshaping_explanation, "The visual scene built the mental picture needed for the check."),
      task: text(promptRecord?.task, expectedAttemptType === "text" ? "Explain the main idea from the scene." : "Choose the best answer."),
      full_prompt: text(typeof rawPrompt === "string" ? rawPrompt : promptRecord?.full_prompt, `Based on the scene, which choice best matches this takeaway: ${targetTakeaway}`),
    },
    presentation_support: asArray(rawProbe.presentation_support),
    answer_key: expectedAttemptType === "text"
      ? {
          kind: "text",
          expected_ideas: [targetTakeaway],
          success_markers: ["loop", "enter", "leave", "reset"],
        }
      : {
          kind: expectedAttemptType === "multi_choice" ? "multi_choice" : "single_choice",
          correct_option_id: correctOptionId || options[0]?.id || null,
        },
    misconception_markers: asArray(rawProbe.misconception_markers),
    renderer_params: {
      ...rawRendererParams,
      options,
    },
    delivery_context: {
      bridge_level: input.personalization_context.bridge_level,
      language_policy: input.personalization_context.language_policy,
      presentation_styles_used: [input.personalization_context.preferred_style ?? "visual_description"],
      support_kinds_used: ["visual_description"],
      example_domains_used: [],
      personalization_signals_used: [],
    },
    confidence: number(rawProbe.confidence, 0.72),
  };
}

function normalizePersonalizationHypotheses(raw: Record<string, unknown>): VisualPersonalizationHypothesis[] {
  return asArray(raw.personalization_hypotheses).slice(0, 4).map((hypothesis, index): VisualPersonalizationHypothesis => {
    const record = asRecord(hypothesis) ?? {};
    const kind =
      record.kind === "bridge_level" ||
      record.kind === "jargon_level" ||
      record.kind === "presentation_style" ||
      record.kind === "support_kind" ||
      record.kind === "probe_type" ||
      record.kind === "verification_pattern"
        ? record.kind
        : "presentation_style";

    return {
      kind,
      value: text(record.value, text(record.signal, `hypothesis_${index + 1}`)),
      direction: record.direction === "avoid" || record.direction === "verify" ? record.direction : "prefer",
      scope: record.scope === "global" || record.scope === "topic" || record.scope === "probe_type" ? record.scope : "diagnosis_label",
      scope_key: typeof record.scope_key === "string" ? record.scope_key : "representation_gap",
      confidence: number(record.confidence, 0.45),
      reason: text(record.reason, text(record.hypothesis, "This is a tentative pre-attempt personalization hypothesis.")),
    };
  });
}

function isStrictProceed(raw: Record<string, unknown>): boolean {
  return raw.schema_version === "myway_visual_learning_turn_output_v1" &&
    raw.turn_status === "proceed" &&
    Boolean(asRecord(raw.learning_focus)) &&
    Boolean(asRecord(raw.visual_experience)) &&
    Boolean(asRecord(asRecord(raw.visual_experience)?.semantic_scene_plan)) &&
    Boolean(asRecord(raw.followup_probe));
}

function isStrictClarification(raw: Record<string, unknown>): boolean {
  return raw.schema_version === "myway_visual_learning_turn_output_v1" &&
    raw.turn_status === "needs_clarification" &&
    Boolean(asRecord(raw.clarification_gate));
}

export function normalizeVisualLearningTurnOutput(
  value: unknown,
  input: VisualLearningTurnInput,
): VisualLearningTurnNormalizationResult {
  const raw = asRecord(value);
  const notes: string[] = [];
  const warnings: string[] = [];

  if (!raw) {
    return {
      output: makeClarificationOutput({}, input),
      report: {
        applied: true,
        source_shape: "unknown",
        notes: ["Model output was not an object; normalized to clarification output."],
        warnings: ["No usable object was returned by the model."],
      },
    };
  }

  if (isStrictProceed(raw)) {
    const strictOutput =
      raw as unknown as VisualLearningTurnProceedOutput;
    const visualExperience =
      asRecord(strictOutput.visual_experience) ?? {};
    const scenePlan =
      asRecord(visualExperience.semantic_scene_plan) ?? {};
    const learningFocus =
      asRecord(strictOutput.learning_focus) ?? {};
    const directorResult =
      normalizeEducationalSceneDirectorPlan(
        scenePlan.director_plan ??
          scenePlan.directed_scene ??
          {},
        {
          source: "visual_experience",
          title: text(
            visualExperience.title,
            "Directed educational scene",
          ),
          scene_thesis: text(
            visualExperience.full_prompt,
            text(
              learningFocus.root_problem,
              "Build a clear mental model.",
            ),
          ),
          learner_takeaway: text(
            learningFocus.target_takeaway,
            "The learner can explain the central relationship.",
          ),
          entities: scenePlan.entities,
          relationships: scenePlan.relationships,
          explanation_pieces:
            visualExperience.explanation_pieces,
          legacy_directed_scene:
            scenePlan.directed_scene,
          legacy_story_beats:
            scenePlan.story_beats ??
            scenePlan.scene_moments,
          legacy_beats: scenePlan.beats,
        },
      );
    const resourceSceneId = text(
      strictOutput.topic_resolution
        ?.topic_id,
      text(
        visualExperience.title,
        "visual_experience_scene",
      ),
    );
    const resourceResult =
      scenePlan.resource_plan
        ? normalizeSceneResourcePlan(
            scenePlan.resource_plan,
            {
              source: "visual_experience",
              scene_id: resourceSceneId,
              director_schema_version:
                directorResult.plan
                  .schema_version,
            },
          )
        : buildSceneResourcePlanFromDirector(
            directorResult.plan,
            {
              source: "visual_experience",
              scene_id: resourceSceneId,
            },
          );
    const orientationIds = asArray(
      visualExperience.orientation_segments,
    )
      .map((segment) =>
        text(asRecord(segment)?.id, ""),
      )
      .filter(Boolean);
    const semanticBeats =
      directorPlanToLegacySemanticBeats(
        directorResult.plan,
        orientationIds,
      ) as unknown as SemanticSceneBeat[];
    const storyBeats =
      directorPlanToLegacyStoryBeats(
        directorResult.plan,
      );

    return {
      output: {
        ...strictOutput,
        visual_experience: {
          ...strictOutput.visual_experience,
          semantic_scene_plan: {
            ...strictOutput.visual_experience
              .semantic_scene_plan,
            director_plan:
              directorResult.plan,
            director_validation:
              directorResult.validation,
            resource_plan:
              resourceResult.plan,
            resource_plan_validation:
              resourceResult.validation,
            directed_scene:
              directorPlanToLegacyDirectedScene(
                directorResult.plan,
              ),
            scene_moments:
              storyBeats,
            story_beats:
              storyBeats,
            caption_policy:
              directorPlanToCaptionPolicy(
                directorResult.plan,
              ),
            beats:
              semanticBeats.length
                ? semanticBeats
                : strictOutput.visual_experience
                    .semantic_scene_plan
                    .beats,
          },
        },
      },
      report: {
        applied:
          !scenePlan.director_plan,
        source_shape: "already_strict",
        notes: [
          scenePlan.director_plan
            ? "Strict output already contained a director plan; MyWay normalized and validated it."
            : "Strict output was upgraded with a canonical director plan and derived compatibility views.",
        ],
        warnings: [
          ...directorResult.warnings,
          ...resourceResult.warnings,
        ],
      },
    };
  }

  if (isStrictClarification(raw)) {
    return {
      output: raw as VisualLearningTurnOutput,
      report: {
        applied: false,
        source_shape: "already_strict",
        notes: ["Model output already matched the strict clarification wrapper shape."],
        warnings: [],
      },
    };
  }

  if (raw.turn_status === "needs_clarification") {
    return {
      output: makeClarificationOutput(raw, input),
      report: {
        applied: true,
        source_shape: "near_miss_partial",
        notes: ["Normalized a near-miss clarification output into the strict wrapper shape."],
        warnings,
      },
    };
  }

  const topicLabel = inferTopicLabel(input, raw);
  const rootProblem = text(asRecord(raw.learning_focus)?.root_problem, text(raw.root_problem, `The learner needs a clearer mental model for ${topicLabel}.`));
  const targetTakeaway = text(asRecord(raw.learning_focus)?.target_takeaway, text(raw.target_takeaway, `The learner should be able to picture the main structure of ${topicLabel}.`));
  const visualExperience = asRecord(raw.visual_experience);
  const rawScenePlan = pickRecord(visualExperience?.semantic_scene_plan, raw.semantic_scene_plan);
  const orientationSegments = normalizeOrientationSegments(raw, rootProblem, targetTakeaway);
  const entities = normalizeEntities(rawScenePlan);
  const entityIds = entities.map((entity) => entity.id);
  const relationships = normalizeRelationships(rawScenePlan, entityIds);
  const compatibilityBeats = normalizeBeats(
    rawScenePlan,
    orientationSegments.map(
      (segment) => segment.id,
    ),
    entityIds,
  );
  const directorResult =
    normalizeEducationalSceneDirectorPlan(
      rawScenePlan?.director_plan ??
        rawScenePlan?.directed_scene ??
        {},
      {
        source: "visual_experience",
        title: text(
          visualExperience?.title,
          `${topicLabel} visual model`,
        ),
        scene_thesis: text(
          visualExperience?.full_prompt,
          rootProblem,
        ),
        learner_takeaway:
          targetTakeaway,
        entities,
        relationships,
        explanation_pieces:
          visualExperience?.explanation_pieces,
        legacy_directed_scene:
          rawScenePlan?.directed_scene,
        legacy_story_beats:
          rawScenePlan?.story_beats ??
          rawScenePlan?.scene_moments,
        legacy_beats:
          compatibilityBeats,
      },
    );
  const directorPlan =
    directorResult.plan;
  const resourceSceneId = text(
    asRecord(raw.topic_resolution)
      ?.topic_id,
    text(
      visualExperience?.title,
      `${topicLabel} visual model`,
    ),
  );
  const resourceResult =
    rawScenePlan?.resource_plan
      ? normalizeSceneResourcePlan(
          rawScenePlan.resource_plan,
          {
            source: "visual_experience",
            scene_id: resourceSceneId,
            director_schema_version:
              directorPlan.schema_version,
          },
        )
      : buildSceneResourcePlanFromDirector(
          directorPlan,
          {
            source: "visual_experience",
            scene_id: resourceSceneId,
          },
        );
  const storyBeats =
    directorPlanToLegacyStoryBeats(
      directorPlan,
    );
  const beats =
    directorPlanToLegacySemanticBeats(
      directorPlan,
      orientationSegments.map(
        (segment) => segment.id,
      ),
    ) as unknown as SemanticSceneBeat[];
  const guidedInteraction = normalizeGuidedInteraction(raw, entityIds);
  const followupProbe = normalizeFollowupProbe(raw, input, rootProblem, targetTakeaway);
  const personalizationHypotheses = normalizePersonalizationHypotheses(raw);

  if (!asRecord(raw.learning_focus)) notes.push("Moved top-level root_problem/target_takeaway into learning_focus.");
  if (!visualExperience) notes.push("Wrapped top-level orientation_segments and semantic_scene_plan into visual_experience.");
  if (rawScenePlan && asArray(rawScenePlan.visual_entities).length) notes.push("Converted semantic_scene_plan.visual_entities to semantic_scene_plan.entities.");
  if (beats.some((beat) => beat.actions.some((action) => asRecord(action.params)?.normalized_from_near_miss))) {
    notes.push("Converted near-miss action/entity fields to strict action target_entity_id/type fields.");
  }
  if (!asRecord(raw.followup_probe)?.schema_version) notes.push("Expanded loose followup_probe into ProbeContractModelOutput shape.");

  const normalized: VisualLearningTurnOutput = {
    schema_version: "myway_visual_learning_turn_output_v1",
    turn_status: "proceed",
    clarification_gate: {
      schema_version: "myway_turn_clarification_gate_output_v1",
      action: "proceed",
      confidence: {
        overall: number(asRecord(asRecord(raw.clarification_gate)?.confidence)?.overall, 0.86),
        topic: number(asRecord(asRecord(raw.clarification_gate)?.confidence)?.topic, 0.86),
        learner_goal: number(asRecord(asRecord(raw.clarification_gate)?.confidence)?.learner_goal, 0.82),
      },
      clarification_question: null,
      scope_choices: [],
      reason: text(asRecord(raw.clarification_gate)?.reason, "The model provided enough detail to proceed after normalization."),
    },
    topic_resolution: {
      topic_label: topicLabel,
      topic_id: null,
      topic_confidence: number(asRecord(raw.topic_resolution)?.topic_confidence, input.known_topic_state?.topic_label ? 0.88 : 0.72),
      topic_reference_type: "new_topic",
      reason: text(asRecord(raw.topic_resolution)?.reason, input.known_topic_state?.topic_label ? "The topic was provided in the request." : "The topic was inferred from the learner message."),
    },
    diagnosis: {
      schema_version: "diagnosis_model_output_v1",
      diagnosis: "representation_gap",
      diagnosis_confidence: 0.84,
      next_action: "generate_probe_contract",
      next_action_confidence: 0.86,
      suggested_question: null,
    },
    learning_focus: {
      root_problem: rootProblem,
      target_takeaway: targetTakeaway,
      why_visual_first: text(asRecord(raw.learning_focus)?.why_visual_first, "The learner needs a visual mental model before a follow-up probe can solidify the idea."),
    },
    visual_experience: {
      schema_version: "myway_visual_experience_compiler_output_v1",
      title: text(visualExperience?.title, `${topicLabel} visual model`),
      experience_mode: supportedExperienceMode(visualExperience?.experience_mode ?? rawScenePlan?.experience_mode),
      orientation_segments: orientationSegments,
      semantic_scene_plan: {
        director_plan: directorPlan,
        director_validation:
          directorResult.validation,
        resource_plan:
          resourceResult.plan,
        resource_plan_validation:
          resourceResult.validation,
        directed_scene:
          directorPlanToLegacyDirectedScene(
            directorPlan,
          ),
        scene_moments:
          storyBeats,
        story_beats:
          storyBeats,
        caption_policy:
          directorPlanToCaptionPolicy(
            directorPlan,
          ),
        entities,
        relationships,
        beats,
        camera_notes: text(rawScenePlan?.camera_notes, "Start wide, then focus on the active part of each beat."),
        interaction_notes: text(rawScenePlan?.interaction_notes, guidedInteraction.instruction),
      },
    },
    guided_interaction: guidedInteraction,
    followup_probe: followupProbe as any,
    personalization_hypotheses: personalizationHypotheses,
    confidence: number(raw.confidence, 0.78),
  };

  return {
    output: normalized,
    report: {
      applied: true,
      source_shape: raw.root_problem || raw.orientation_segments || raw.semantic_scene_plan ? "near_miss_flat" : "near_miss_partial",
      notes,
      warnings: [
        ...warnings,
        ...directorResult.warnings,
        ...resourceResult.warnings,
      ],
    },
  };
}
