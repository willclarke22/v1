import type {
  DiagnosisDelta,
  DiagnosisType,
  EntityId,
  ProbeExpectedResponseType,
  ProbeIntent,
  ProbeType,
} from "@/types/contracts";
import { makeId } from "@/lib/utils/ids";
import {
  PROBE_CONTRACT_VERSION,
  type BuildProbeContractInput,
  type BuildProbeContractResult,
  type ProbeAssessmentTarget,
  type ProbeContract,
  type ProbeFailureMarker,
  type ProbeGenerationMetadata,
  type ProbeInputSchema,
  type ProbeMisconceptionMapping,
  type ProbePersonalizationApplication,
  type ProbeRendererConfig,
  type ProbeRendererKind,
  type ProbeScaffoldLevel,
  type ProbeSuccessMarker,
  type ProbeTelemetryKey,
} from "./probe-types";
import type { EvidenceJudgingTier, JudgingMethod } from "@/lib/engine/judging";

/**
 * Probe Contract Builder V1.1
 *
 * This is still a scaffold builder, but it now makes the contract more explicit
 * about answer capture, deterministic judging availability, expected evidence
 * tier, and personalization metadata.
 *
 * Important:
 * - This builder does not yet generate truly content-grounded probe content.
 * - It creates contracts that are ready for content grounding and deterministic
 *   judging once the renderer/generator layer fills in real options/items/etc.
 */

function nowIso() {
  return new Date().toISOString();
}

function emptyDelta(): DiagnosisDelta {
  return {
    recall_gap: 0,
    representation_gap: 0,
    procedure_gap: 0,
    discrimination_gap: 0,
    transfer_gap: 0,
  };
}

function deltaFor(diagnosis: DiagnosisType, amount: number): DiagnosisDelta {
  return {
    ...emptyDelta(),
    [diagnosis]: amount,
  };
}

function normalizeTopicLabel(label: string) {
  return label.trim() || "this topic";
}

function defaultIntent(args: {
  probeType: ProbeType;
  diagnosis: DiagnosisType | null;
  hasDiagnosisState: boolean;
}): ProbeIntent {
  /**
   * Transfer probes can be diagnostic when transfer_gap is suspected.
   * They become verification when no active transfer gap is being targeted.
   */
  if (args.probeType === "apply_transfer" && args.diagnosis !== "transfer_gap") {
    return "verification";
  }

  return "diagnostic";
}

function defaultProbeType(diagnosis: DiagnosisType | null): ProbeType {
  if (diagnosis === "transfer_gap") return "apply_transfer";
  if (diagnosis === "discrimination_gap") return "discriminate";
  if (diagnosis === "procedure_gap") return "transform";
  return "explain";
}

function defaultAssessmentTarget(
  diagnosis: DiagnosisType | null,
  probeType: ProbeType,
): ProbeAssessmentTarget {
  if (diagnosis === "recall_gap") return "recall";
  if (diagnosis === "procedure_gap") return "procedure";
  if (diagnosis === "discrimination_gap") return "discrimination";
  if (diagnosis === "transfer_gap") return "transfer";
  if (probeType === "predict") return "representation";
  return "representation";
}

function defaultRendererKind(args: {
  diagnosis: DiagnosisType | null;
  probeType: ProbeType;
  expectedResponseType: ProbeExpectedResponseType | null;
}): ProbeRendererKind {
  if (
    args.expectedResponseType === "choice" ||
    args.expectedResponseType === "multiple_choice"
  ) {
    return "multiple_choice";
  }

  if (args.expectedResponseType === "ordering") return "ordering";
  if (args.expectedResponseType === "predict") return "slider_prediction";
  if (args.expectedResponseType === "audio") return "audio_explanation";
  if (args.expectedResponseType === "video") return "video_checkpoint";
  if (args.expectedResponseType === "interactive_action") return "drag_drop_match";
  if (args.expectedResponseType === "dynamic_task") return "simulation";

  if (args.probeType === "discriminate") return "multiple_choice";
  if (args.probeType === "predict") return "slider_prediction";
  if (args.diagnosis === "procedure_gap") return "ordering";
  if (args.diagnosis === "discrimination_gap") return "multiple_choice";
  if (args.diagnosis === "transfer_gap") return "drag_drop_match";

  return "text_explanation";
}

function expectedResponseTypeForRenderer(
  rendererKind: ProbeRendererKind,
): ProbeExpectedResponseType {
  switch (rendererKind) {
    case "multiple_choice":
      return "multiple_choice";
    case "ordering":
      return "ordering";
    case "slider_prediction":
      return "predict";
    case "drag_drop_match":
    case "graph_match":
    case "simulation":
      return "interactive_action";
    case "audio_explanation":
      return "audio";
    case "video_checkpoint":
      return "video";
    case "text_explanation":
    default:
      return "text";
  }
}

function diagnosisFromAssessmentTarget(
  target: ProbeAssessmentTarget,
): DiagnosisType {
  if (target === "recall") return "recall_gap";
  if (target === "procedure") return "procedure_gap";
  if (target === "discrimination") return "discrimination_gap";
  if (target === "transfer") return "transfer_gap";
  return "representation_gap";
}

function answerCaptureKeysForRenderer(rendererKind: ProbeRendererKind): string[] {
  switch (rendererKind) {
    case "multiple_choice":
      return ["selected_option_ids", "choice_selected", "confidence_rating"];
    case "ordering":
      return ["ordered_item_ids", "ordering_sequence", "confidence_rating"];
    case "slider_prediction":
      return ["slider_value", "prediction", "confidence_rating"];
    case "drag_drop_match":
      return ["matches", "drag_drop_positions", "confidence_rating"];
    case "graph_match":
      return ["selected_edge_ids", "graph_selection", "confidence_rating"];
    case "simulation":
      return ["actions", "simulation_actions", "final_state", "confidence_rating"];
    case "audio_explanation":
      return ["transcript", "audio_duration_ms"];
    case "video_checkpoint":
      return ["transcript", "video_checkpoint_time"];
    case "text_explanation":
    default:
      return ["text", "revision_count", "confidence_rating"];
  }
}

function deterministicJudgingAvailable(rendererKind: ProbeRendererKind) {
  switch (rendererKind) {
    case "multiple_choice":
    case "ordering":
    case "slider_prediction":
    case "drag_drop_match":
    case "graph_match":
      return true;
    default:
      return false;
  }
}

function expectedJudgingMethods(rendererKind: ProbeRendererKind): JudgingMethod[] {
  switch (rendererKind) {
    case "multiple_choice":
      return ["deterministic_multiple_choice", "contract_marker_estimate"];
    case "ordering":
      return ["deterministic_ordering", "contract_marker_estimate"];
    case "slider_prediction":
      return ["deterministic_slider", "contract_marker_estimate"];
    case "drag_drop_match":
      return ["deterministic_drag_drop", "contract_marker_estimate"];
    case "graph_match":
      return ["deterministic_graph_match", "contract_marker_estimate"];
    case "text_explanation":
      return ["llm_rubric_text", "contract_marker_estimate"];
    case "audio_explanation":
      return ["llm_rubric_audio_transcript", "contract_marker_estimate"];
    case "video_checkpoint":
      return ["llm_rubric_video_checkpoint", "contract_marker_estimate"];
    case "simulation":
    default:
      return ["contract_marker_estimate"];
  }
}

function expectedEvidenceTier(rendererKind: ProbeRendererKind): EvidenceJudgingTier {
  if (deterministicJudgingAvailable(rendererKind)) {
    return "deterministic_structured_judgment";
  }

  if (
    rendererKind === "text_explanation" ||
    rendererKind === "audio_explanation" ||
    rendererKind === "video_checkpoint"
  ) {
    return "llm_rubric_judgment";
  }

  return "contract_marker_estimate";
}

function buildSuccessMarkers(
  topicLabel: string,
  assessmentTarget: ProbeAssessmentTarget,
): ProbeSuccessMarker[] {
  const topic = normalizeTopicLabel(topicLabel);

  const markers: ProbeSuccessMarker[] = [
    {
      marker_id: makeId("success-marker"),
      label: "Stays on target",
      description: `The response stays grounded in ${topic}.`,
      required: true,
      weight: 0.28,
    },
    {
      marker_id: makeId("success-marker"),
      label: "Shows the key relationship",
      description: `The response identifies a meaningful relationship, mechanism, or contrast in ${topic}.`,
      required: true,
      weight: 0.36,
    },
  ];

  if (assessmentTarget === "procedure") {
    markers.push({
      marker_id: makeId("success-marker"),
      label: "Correct sequence",
      description: "The learner orders the steps or dependencies in a reasonable sequence.",
      required: true,
      weight: 0.36,
    });
  } else if (assessmentTarget === "discrimination") {
    markers.push({
      marker_id: makeId("success-marker"),
      label: "Distinguishes close cases",
      description: "The learner distinguishes the target idea from a tempting near-miss.",
      required: true,
      weight: 0.36,
    });
  } else if (assessmentTarget === "transfer") {
    markers.push({
      marker_id: makeId("success-marker"),
      label: "Transfers to a new case",
      description: "The learner applies the idea to a new example without changing the core mechanism.",
      required: true,
      weight: 0.36,
    });
  } else {
    markers.push({
      marker_id: makeId("success-marker"),
      label: "Concrete explanation",
      description: "The learner uses a concrete example or cause-and-effect chain.",
      required: false,
      weight: 0.26,
    });
  }

  return markers;
}

function buildFailureMarkers(
  topicLabel: string,
  assessmentTarget: ProbeAssessmentTarget,
): ProbeFailureMarker[] {
  const topic = normalizeTopicLabel(topicLabel);
  const primaryDiagnosis = diagnosisFromAssessmentTarget(assessmentTarget);

  return [
    {
      marker_id: makeId("failure-marker"),
      label: "Off-target response",
      description: `The response does not stay grounded in ${topic}.`,
      maps_to_diagnosis: "representation_gap",
      diagnosis_delta: deltaFor("representation_gap", 0.16),
      severity: 0.5,
    },
    {
      marker_id: makeId("failure-marker"),
      label: "Missing mechanism",
      description: "The response lacks a clear relationship, mechanism, or cause-and-effect chain.",
      maps_to_diagnosis: primaryDiagnosis,
      diagnosis_delta: deltaFor(primaryDiagnosis, 0.18),
      severity: 0.58,
    },
  ];
}

function buildMisconceptionMappings(
  failureMarkers: ProbeFailureMarker[],
  assessmentTarget: ProbeAssessmentTarget,
): ProbeMisconceptionMapping[] {
  const primaryDiagnosis = diagnosisFromAssessmentTarget(assessmentTarget);

  return [
    {
      misconception_id: makeId("misconception"),
      label: "Surface-level match",
      description:
        "The learner may be matching familiar words without using the underlying relationship.",
      likely_diagnosis: primaryDiagnosis,
      failure_marker_ids: failureMarkers.map((marker) => marker.marker_id),
    },
  ];
}

function telemetryForRenderer(rendererKind: ProbeRendererKind): ProbeTelemetryKey[] {
  const base: ProbeTelemetryKey[] = ["latency_ms", "hint_usage", "retry_count"];

  switch (rendererKind) {
    case "multiple_choice":
      return [...base, "choice_selected", "confidence_rating"];
    case "ordering":
      return [...base, "ordering_sequence", "confidence_rating"];
    case "slider_prediction":
      return [...base, "slider_value", "confidence_rating"];
    case "drag_drop_match":
      return [...base, "drag_drop_positions", "confidence_rating"];
    case "graph_match":
      return [...base, "graph_selection", "confidence_rating"];
    case "simulation":
      return [...base, "simulation_actions", "confidence_rating"];
    case "audio_explanation":
      return [...base, "audio_duration_ms"];
    case "video_checkpoint":
      return [...base, "video_checkpoint_time"];
    case "text_explanation":
    default:
      return [...base, "revision_count", "confidence_rating"];
  }
}

function buildInputSchema(args: {
  rendererKind: ProbeRendererKind;
  topicLabel: string;
}): ProbeInputSchema {
  const expectedResponseType = expectedResponseTypeForRenderer(args.rendererKind);
  const answer_capture_keys = answerCaptureKeysForRenderer(args.rendererKind);

  switch (args.rendererKind) {
    case "multiple_choice":
      return {
        renderer_kind: "multiple_choice",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "choice",
        answer_capture_keys,
        allow_multiple: false,
        options: [
          {
            option_id: makeId("option"),
            label: "Best answer",
            text: `The option that best explains the key relationship in ${args.topicLabel}.`,
            is_correct: true,
            maps_to_misconception_id: null,
          },
          {
            option_id: makeId("option"),
            label: "Near miss",
            text: "A tempting answer that uses related words but misses the mechanism.",
            is_correct: false,
            maps_to_misconception_id: null,
          },
        ],
      };

    case "ordering":
      return {
        renderer_kind: "ordering",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "ordering",
        answer_capture_keys,
        items: [
          {
            item_id: makeId("order-item"),
            label: "First",
            text: "Identify the starting condition.",
            correct_position: 0,
          },
          {
            item_id: makeId("order-item"),
            label: "Then",
            text: "Apply the key relationship or mechanism.",
            correct_position: 1,
          },
          {
            item_id: makeId("order-item"),
            label: "Result",
            text: "Infer the consequence.",
            correct_position: 2,
          },
        ],
      };

    case "slider_prediction":
      return {
        renderer_kind: "slider_prediction",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "slider",
        answer_capture_keys,
        min: 0,
        max: 100,
        step: 1,
        target_value: null,
        acceptable_range: null,
        left_label: "Much less / unlikely",
        right_label: "Much more / likely",
      };

    case "drag_drop_match": {
      const conceptItemId = makeId("drag-item");
      const exampleItemId = makeId("drag-item");
      const mechanismTargetId = makeId("drop-target");
      const surfaceTargetId = makeId("drop-target");

      return {
        renderer_kind: "drag_drop_match",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "drag_drop",
        answer_capture_keys,
        draggable_items: [
          {
            item_id: conceptItemId,
            label: "Concept",
            text: `A key idea from ${args.topicLabel}.`,
          },
          {
            item_id: exampleItemId,
            label: "Example",
            text: "A concrete example or situation.",
          },
        ],
        drop_targets: [
          {
            target_id: mechanismTargetId,
            label: "Mechanism",
            text: "What explains why it happens.",
          },
          {
            target_id: surfaceTargetId,
            label: "Surface detail",
            text: "A detail that may be related but is not the mechanism.",
          },
        ],
        /**
         * This scaffold match exists so deterministic judging has a valid shape.
         * A content-grounded generator should replace these placeholder matches.
         */
        correct_matches: [
          {
            item_id: conceptItemId,
            target_id: mechanismTargetId,
          },
          {
            item_id: exampleItemId,
            target_id: surfaceTargetId,
          },
        ],
      };
    }

    case "graph_match": {
      const causeNodeId = makeId("graph-node");
      const mechanismNodeId = makeId("graph-node");
      const effectNodeId = makeId("graph-node");
      const correctEdgeId = makeId("graph-edge");
      const nearMissEdgeId = makeId("graph-edge");

      return {
        renderer_kind: "graph_match",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "graph_match",
        answer_capture_keys,
        graph_prompt: `Choose the relationship graph that best represents ${args.topicLabel}.`,
        nodes: [
          { node_id: causeNodeId, label: "Cause / input" },
          { node_id: mechanismNodeId, label: "Mechanism" },
          { node_id: effectNodeId, label: "Effect / output" },
        ],
        candidate_edges: [
          {
            edge_id: correctEdgeId,
            source_node_id: causeNodeId,
            target_node_id: mechanismNodeId,
            label: "Cause leads into mechanism",
            is_correct: true,
          },
          {
            edge_id: nearMissEdgeId,
            source_node_id: causeNodeId,
            target_node_id: effectNodeId,
            label: "Cause skips directly to effect",
            is_correct: false,
          },
        ],
      };
    }

    case "simulation":
      return {
        renderer_kind: "simulation",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "interaction",
        answer_capture_keys,
        simulation_kind: "generic_concept_simulation",
        initial_state: {},
        controllable_variables: [],
        target_observations: [
          `Notice what changes and what stays stable in ${args.topicLabel}.`,
        ],
      };

    case "audio_explanation":
      return {
        renderer_kind: "audio_explanation",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "text",
        answer_capture_keys,
        min_duration_ms: 5_000,
        max_duration_ms: 90_000,
        transcript_required: true,
      };

    case "video_checkpoint":
      return {
        renderer_kind: "video_checkpoint",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "text",
        answer_capture_keys,
        checkpoint_time_ms: null,
        prompt_at_checkpoint: `Pause and explain what changed in ${args.topicLabel}.`,
        expected_observation: "The learner notices the target relationship or mechanism.",
      };

    case "text_explanation":
    default:
      return {
        renderer_kind: "text_explanation",
        expected_response_type: expectedResponseType,
        required: true,
        normalized_value_kind: "text",
        answer_capture_keys,
        min_words: 8,
        max_words: 120,
        require_example: true,
      };
  }
}

function rendererIcon(rendererKind: ProbeRendererKind) {
  switch (rendererKind) {
    case "multiple_choice":
      return "✓";
    case "ordering":
      return "≡";
    case "slider_prediction":
      return "◒";
    case "drag_drop_match":
      return "⠿";
    case "graph_match":
      return "⌁";
    case "simulation":
      return "✦";
    case "audio_explanation":
      return "◌";
    case "video_checkpoint":
      return "▶";
    case "text_explanation":
    default:
      return "T";
  }
}

function defaultScaffoldLevel(rendererKind: ProbeRendererKind): ProbeScaffoldLevel {
  switch (rendererKind) {
    case "multiple_choice":
    case "ordering":
    case "slider_prediction":
      return "low";
    case "drag_drop_match":
    case "graph_match":
    case "simulation":
      return "medium";
    case "audio_explanation":
    case "video_checkpoint":
    case "text_explanation":
    default:
      return "medium";
  }
}

function buildRendererConfig(args: {
  rendererKind: ProbeRendererKind;
  topicLabel: string;
  assessmentTarget: ProbeAssessmentTarget;
  personalization: ProbePersonalizationApplication | null;
}): ProbeRendererConfig {
  const title =
    args.rendererKind === "multiple_choice"
      ? `Choose the best match for ${args.topicLabel}`
      : args.rendererKind === "ordering"
        ? `Put ${args.topicLabel} in order`
        : args.rendererKind === "slider_prediction"
          ? `Predict what happens in ${args.topicLabel}`
          : args.rendererKind === "drag_drop_match"
            ? `Match the pieces of ${args.topicLabel}`
            : args.rendererKind === "graph_match"
              ? `Map the relationship in ${args.topicLabel}`
              : args.rendererKind === "simulation"
                ? `Test ${args.topicLabel} in a simulation`
                : args.rendererKind === "audio_explanation"
                  ? `Explain ${args.topicLabel} out loud`
                  : args.rendererKind === "video_checkpoint"
                    ? `Pause and notice ${args.topicLabel}`
                    : `Explain ${args.topicLabel}`;

  const scaffoldLevel =
    args.personalization?.scaffold_level ?? defaultScaffoldLevel(args.rendererKind);

  return {
    renderer_kind: args.rendererKind,
    title,
    instructions:
      "Use this as a focused check of understanding. It is okay if the learner is unsure; the goal is to reveal the next useful gap.",
    prompt: `Show what you understand about ${args.topicLabel}, focusing on the ${args.assessmentTarget} part.`,
    thumbnail_label: "Probe",
    thumbnail_icon: rendererIcon(args.rendererKind),
    estimated_seconds: args.rendererKind === "simulation" ? 90 : 45,
    ui_hints: {
      compact: false,
      show_confidence_rating: true,
      allow_hint: true,
      allow_retry: true,
      scaffold_level: scaffoldLevel,
      show_explanation_box:
        args.rendererKind === "multiple_choice" ||
        args.rendererKind === "ordering" ||
        args.rendererKind === "slider_prediction",
      require_reasoning_after_structured_answer:
        args.rendererKind === "multiple_choice" ||
        args.rendererKind === "ordering" ||
        args.rendererKind === "slider_prediction",
    },
  };
}

function buildJudgingSchema(args: {
  rendererKind: ProbeRendererKind;
  successMarkers: ProbeSuccessMarker[];
  failureMarkers: ProbeFailureMarker[];
  misconceptionMappings: ProbeMisconceptionMapping[];
}) {
  const deterministicAvailable = deterministicJudgingAvailable(args.rendererKind);

  return {
    success_markers: args.successMarkers,
    failure_markers: args.failureMarkers,
    misconception_mappings: args.misconceptionMappings,
    telemetry_to_capture: telemetryForRenderer(args.rendererKind),
    allow_partial_credit: true,
    minimum_evidence_strength_for_success: 0.62,
    expected_judging_methods: expectedJudgingMethods(args.rendererKind),
    expected_evidence_tier: expectedEvidenceTier(args.rendererKind),
    deterministic_judging_available: deterministicAvailable,
    rubric_judging_required: !deterministicAvailable,
  };
}

function buildGenerationMetadata(input: BuildProbeContractInput): ProbeGenerationMetadata {
  return {
    generation_mode: input.generationMode ?? "generic_scaffold",
    source_content_ids: input.sourceContentIds ?? [],
    source_topic_ids: input.sourceTopicIds ?? [],
    generated_by: "engine_scaffold",
    generator_version: null,
    content_grounding_summary:
      input.generationMode && input.generationMode !== "generic_scaffold"
        ? "Probe contract requested non-generic grounding, but this scaffold builder does not yet generate content-grounded items."
        : null,
  };
}

function buildPersonalizationApplication(
  input: BuildProbeContractInput,
): ProbePersonalizationApplication | null {
  if (!input.personalization) return null;

  return {
    mode: input.personalization.mode ?? "light",
    tone: input.personalization.tone ?? null,
    pacing: input.personalization.pacing ?? null,
    language_style: input.personalization.language_style ?? null,
    scaffold_level: input.personalization.scaffold_level ?? "medium",
    preferred_modality_reason: input.personalization.preferred_modality_reason ?? null,
    example_context: input.personalization.example_context ?? null,
    adaptation_reasons: input.personalization.adaptation_reasons ?? [],
  };
}

export function buildProbeContract(
  input: BuildProbeContractInput,
): BuildProbeContractResult {
  const targetTopicLabel = normalizeTopicLabel(input.targetTopicLabel);
  const targetDiagnosis = input.targetDiagnosis ?? null;
  const probeType = input.probeType ?? defaultProbeType(targetDiagnosis);
  const intent =
    input.intent ??
    defaultIntent({
      probeType,
      diagnosis: targetDiagnosis,
      hasDiagnosisState: Boolean(input.diagnosisState),
    });
  const assessmentTarget = defaultAssessmentTarget(targetDiagnosis, probeType);
  const rendererKind =
    input.rendererKind ??
    defaultRendererKind({
      diagnosis: targetDiagnosis,
      probeType,
      expectedResponseType: input.expectedResponseType ?? null,
    });

  const personalizationApplication = buildPersonalizationApplication(input);
  const successMarkers = buildSuccessMarkers(targetTopicLabel, assessmentTarget);
  const failureMarkers = buildFailureMarkers(targetTopicLabel, assessmentTarget);
  const misconceptionMappings = buildMisconceptionMappings(
    failureMarkers,
    assessmentTarget,
  );

  const inputSchema = buildInputSchema({
    rendererKind,
    topicLabel: targetTopicLabel,
  });

  const contract: ProbeContract = {
    contract_id: makeId("probe-contract"),
    version: PROBE_CONTRACT_VERSION,
    created_at: input.createdAt ?? nowIso(),

    target_topic_id: input.targetTopicId ?? null,
    target_topic_label: targetTopicLabel,
    target_diagnosis: targetDiagnosis,

    intent,
    probe_type: probeType,
    renderer_kind: rendererKind,
    assessment_target: assessmentTarget,
    difficulty: "medium",

    input_schema: inputSchema,
    judging_schema: buildJudgingSchema({
      rendererKind,
      successMarkers,
      failureMarkers,
      misconceptionMappings,
    }),
    renderer_config: buildRendererConfig({
      rendererKind,
      topicLabel: targetTopicLabel,
      assessmentTarget,
      personalization: personalizationApplication,
    }),

    generation_metadata: buildGenerationMetadata(input),
    personalization_application: personalizationApplication,

    diagnosis_state_snapshot: input.diagnosisState ?? null,

    reasons: [
      `Built a ${rendererKind} probe contract for ${targetTopicLabel}.`,
      `Assessment target selected as ${assessmentTarget}.`,
      `Expected evidence tier is ${expectedEvidenceTier(rendererKind)}.`,
      deterministicJudgingAvailable(rendererKind)
        ? "Deterministic structured judging is available for this renderer kind."
        : "This renderer kind will require scaffold/rubric/model judging for stronger correctness claims.",
      targetDiagnosis
        ? `Target diagnosis was ${targetDiagnosis}.`
        : "No target diagnosis was provided, so the contract used a representation-oriented default.",
    ],
    cautions: [
      "Probe Contract V1.1 still uses scaffold content. A content-grounded generator should replace generic options/items/prompts over time.",
      deterministicJudgingAvailable(rendererKind)
        ? "Deterministic judging can evaluate the structured answer shape, but the scaffold content may still be too generic to prove deep understanding."
        : "Open-ended probe judging still needs rubric/model support before strong correctness claims are reliable.",
    ],
  };

  return {
    contract,
    selected_renderer_kind: rendererKind,
    reasons: contract.reasons,
  };
}
