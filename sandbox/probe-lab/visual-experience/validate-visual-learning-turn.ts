import type {
  VisualLearningTurnInput,
  VisualLearningTurnOutput,
  VisualLearningTurnProceedOutput,
  VisualLearningTurnValidationReport,
} from "./visual-learning-turn";

const SIMPLE_JARGON_WORDS = [
  "acetyl",
  "coa",
  "nadh",
  "fadh",
  "oxidation",
  "decarboxylation",
];

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return asArray(value).map(String).filter(Boolean);
}

function emptyReport(fatalErrors: string[], warnings: string[] = []): VisualLearningTurnValidationReport {
  return {
    valid: fatalErrors.length === 0,
    root_problem_present: false,
    orientation_coverage_valid: false,
    covered_orientation_segment_ids: [],
    uncovered_orientation_segment_ids: [],
    all_action_targets_valid: false,
    unknown_action_target_entity_ids: [],
    followup_probe_valid: false,
    bridge_policy_valid: true,
    fatal_errors: fatalErrors,
    warnings,
  };
}

function validateProceedOutput(
  output: VisualLearningTurnProceedOutput,
  input: VisualLearningTurnInput,
): VisualLearningTurnValidationReport {
  const fatalErrors: string[] = [];
  const warnings: string[] = [];

  const learningFocus = asRecord(output.learning_focus);
  const visualExperience = asRecord(output.visual_experience);
  const scenePlan = asRecord(visualExperience?.semantic_scene_plan);
  const followupProbe = asRecord(output.followup_probe);
  const followupPrompt = asRecord(followupProbe?.prompt);

  const rootProblemPresent = hasText(learningFocus?.root_problem);
  if (!rootProblemPresent) fatalErrors.push("learning_focus.root_problem is required for proceed output.");

  const orientationSegments = asArray(visualExperience?.orientation_segments).map((segment) => asRecord(segment)).filter(Boolean) as Record<string, unknown>[];
  const orientationIds = orientationSegments.map((segment) => String(segment.id ?? "")).filter(Boolean);
  if (!orientationIds.length) fatalErrors.push("visual_experience.orientation_segments must contain at least one segment.");

  const entities = asArray(scenePlan?.entities).map((entity) => asRecord(entity)).filter(Boolean) as Record<string, unknown>[];
  const entityIds = entities.map((entity) => String(entity.id ?? "")).filter(Boolean);
  if (!entityIds.length) fatalErrors.push("visual_experience.semantic_scene_plan.entities must contain at least one entity.");

  const beats = asArray(scenePlan?.beats).map((beat) => asRecord(beat)).filter(Boolean) as Record<string, unknown>[];
  if (!beats.length) fatalErrors.push("visual_experience.semantic_scene_plan.beats must contain at least one beat.");

  const usedOrientationIds: string[] = [];
  const unknownOrientationIds: string[] = [];
  const unknownActionTargets: string[] = [];

  for (const beat of beats) {
    const beatId = String(beat.id ?? beat.beat_id ?? "unknown_beat");
    const sourceOrientationSegmentIds = asStringArray(beat.source_orientation_segment_ids);
    const activeEntityIds = asStringArray(beat.active_entity_ids);
    const actions = asArray(beat.actions).map((action) => asRecord(action)).filter(Boolean) as Record<string, unknown>[];

    if (!sourceOrientationSegmentIds.length) {
      fatalErrors.push(`Beat ${beatId} does not cite source_orientation_segment_ids.`);
    }

    for (const sourceId of sourceOrientationSegmentIds) {
      if (orientationIds.includes(sourceId)) usedOrientationIds.push(sourceId);
      else unknownOrientationIds.push(sourceId);
    }

    for (const entityId of activeEntityIds) {
      if (!entityIds.includes(entityId)) unknownActionTargets.push(entityId);
    }

    if (!actions.length) fatalErrors.push(`Beat ${beatId} must contain at least one action.`);

    for (const action of actions) {
      const targetEntityId = String(action.target_entity_id ?? "");
      const actionType = String(action.type ?? "");

      if (!targetEntityId) fatalErrors.push(`Action ${String(action.id ?? "unknown_action")} is missing target_entity_id.`);
      else if (!entityIds.includes(targetEntityId)) unknownActionTargets.push(targetEntityId);

      if (!input.renderer_capabilities.supported_scene_actions.includes(actionType as never)) {
        fatalErrors.push(`Unsupported scene action type: ${actionType || "missing"}`);
      }
    }
  }

  const coveredOrientationSegmentIds = unique(usedOrientationIds);
  const uncoveredOrientationSegmentIds = orientationIds.filter((id) => !coveredOrientationSegmentIds.includes(id));

  const orientationCoverageValid =
    unknownOrientationIds.length === 0 && orientationIds.length > 0 && uncoveredOrientationSegmentIds.length === 0;

  if (unknownOrientationIds.length) {
    fatalErrors.push(`Unknown orientation segment ids: ${unique(unknownOrientationIds).join(", ")}`);
  }

  if (uncoveredOrientationSegmentIds.length) {
    warnings.push(`Uncovered orientation segment ids: ${uncoveredOrientationSegmentIds.join(", ")}`);
  }

  const unknownActionTargetEntityIds = unique(unknownActionTargets);
  const allActionTargetsValid = unknownActionTargetEntityIds.length === 0;
  if (!allActionTargetsValid) {
    fatalErrors.push(`Unknown entity ids referenced by beats/actions: ${unknownActionTargetEntityIds.join(", ")}`);
  }

  const probeType = followupProbe?.probe_type;
  const expectedAttemptType = followupProbe?.expected_attempt_type;
  const probeTypeSupported = input.available_probe_types.includes(probeType as never);
  const hasAnswerKey = Boolean(followupProbe?.answer_key) || expectedAttemptType === "text";
  const followupProbeValid = probeTypeSupported && hasText(followupPrompt?.full_prompt) && hasAnswerKey;

  if (!followupProbe) fatalErrors.push("followup_probe is required for proceed output.");
  if (followupProbe && !probeTypeSupported) fatalErrors.push(`Unsupported followup probe type: ${String(probeType)}`);
  if (followupProbe && !hasText(followupPrompt?.full_prompt)) fatalErrors.push("followup_probe.prompt.full_prompt is required.");
  if (followupProbe && !hasAnswerKey) fatalErrors.push("followup_probe.answer_key is required unless expected_attempt_type is text.");

  const noJargon = input.output_preferences.no_jargon || input.personalization_context.language_policy.jargon_level === "none";
  const allLearnerFacingText = [
    learningFocus?.root_problem,
    learningFocus?.target_takeaway,
    ...orientationSegments.map((segment) => segment.text),
    asRecord(output.guided_interaction)?.instruction,
    followupPrompt?.full_prompt,
  ]
    .filter(hasText)
    .join(" ")
    .toLowerCase();

  const bridgePolicyValid = !noJargon || SIMPLE_JARGON_WORDS.every((word) => !allLearnerFacingText.includes(word));
  if (!bridgePolicyValid) warnings.push("Possible jargon detected despite bridge_0/no-jargon policy.");

  return {
    valid: fatalErrors.length === 0,
    root_problem_present: rootProblemPresent,
    orientation_coverage_valid: orientationCoverageValid,
    covered_orientation_segment_ids: coveredOrientationSegmentIds,
    uncovered_orientation_segment_ids: uncoveredOrientationSegmentIds,
    all_action_targets_valid: allActionTargetsValid,
    unknown_action_target_entity_ids: unknownActionTargetEntityIds,
    followup_probe_valid: followupProbeValid,
    bridge_policy_valid: bridgePolicyValid,
    fatal_errors: fatalErrors,
    warnings,
  };
}

export function validateVisualLearningTurnOutput(
  output: VisualLearningTurnOutput,
  input: VisualLearningTurnInput,
): VisualLearningTurnValidationReport {
  const record = asRecord(output);

  if (!record) return emptyReport(["Visual learning turn output must be an object."]);

  if (record.turn_status === "needs_clarification") {
    const gate = asRecord(record.clarification_gate);
    const hasQuestion = hasText(gate?.clarification_question);
    return {
      valid: hasQuestion,
      root_problem_present: false,
      orientation_coverage_valid: false,
      covered_orientation_segment_ids: [],
      uncovered_orientation_segment_ids: [],
      all_action_targets_valid: true,
      unknown_action_target_entity_ids: [],
      followup_probe_valid: false,
      bridge_policy_valid: true,
      fatal_errors: hasQuestion ? [] : ["Clarification output must include clarification_question."],
      warnings: [],
    };
  }

  if (record.turn_status !== "proceed") {
    return emptyReport([`turn_status must be "proceed" or "needs_clarification". Received: ${String(record.turn_status)}`]);
  }

  return validateProceedOutput(output as VisualLearningTurnProceedOutput, input);
}
