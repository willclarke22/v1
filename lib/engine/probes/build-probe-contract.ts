import type {
  DiagnosisDelta,
  DiagnosisType,
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
  type ProbeInputSchema,
  type ProbeMisconceptionMapping,
  type ProbeRendererConfig,
  type ProbeRendererKind,
  type ProbeSuccessMarker,
  type ProbeTelemetryKey,
} from "./probe-types";

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

function defaultIntent(probeType: ProbeType): ProbeIntent {
  if (probeType === "apply_transfer") return "verification";
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

  switch (args.rendererKind) {
    case "multiple_choice":
      return {
        renderer_kind: "multiple_choice",
        expected_response_type: expectedResponseType,
        required: true,
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
        min: 0,
        max: 100,
        step: 1,
        target_value: null,
        acceptable_range: null,
        left_label: "Much less / unlikely",
        right_label: "Much more / likely",
      };

    case "drag_drop_match":
      return {
        renderer_kind: "drag_drop_match",
        expected_response_type: expectedResponseType,
        required: true,
        draggable_items: [
          {
            item_id: makeId("drag-item"),
            label: "Concept",
            text: `A key idea from ${args.topicLabel}.`,
          },
          {
            item_id: makeId("drag-item"),
            label: "Example",
            text: "A concrete example or situation.",
          },
        ],
        drop_targets: [
          {
            target_id: makeId("drop-target"),
            label: "Mechanism",
            text: "What explains why it happens.",
          },
          {
            target_id: makeId("drop-target"),
            label: "Surface detail",
            text: "A detail that may be related but is not the mechanism.",
          },
        ],
        correct_matches: [],
      };

    case "graph_match":
      return {
        renderer_kind: "graph_match",
        expected_response_type: expectedResponseType,
        required: true,
        graph_prompt: `Choose the relationship graph that best represents ${args.topicLabel}.`,
        nodes: [
          { node_id: makeId("graph-node"), label: "Cause / input" },
          { node_id: makeId("graph-node"), label: "Mechanism" },
          { node_id: makeId("graph-node"), label: "Effect / output" },
        ],
        candidate_edges: [],
      };

    case "simulation":
      return {
        renderer_kind: "simulation",
        expected_response_type: expectedResponseType,
        required: true,
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
        min_duration_ms: 5_000,
        max_duration_ms: 90_000,
        transcript_required: true,
      };

    case "video_checkpoint":
      return {
        renderer_kind: "video_checkpoint",
        expected_response_type: expectedResponseType,
        required: true,
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

function buildRendererConfig(args: {
  rendererKind: ProbeRendererKind;
  topicLabel: string;
  assessmentTarget: ProbeAssessmentTarget;
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
    },
  };
}

export function buildProbeContract(
  input: BuildProbeContractInput,
): BuildProbeContractResult {
  const targetTopicLabel = normalizeTopicLabel(input.targetTopicLabel);
  const targetDiagnosis = input.targetDiagnosis ?? null;
  const probeType = input.probeType ?? defaultProbeType(targetDiagnosis);
  const intent = input.intent ?? defaultIntent(probeType);
  const assessmentTarget = defaultAssessmentTarget(targetDiagnosis, probeType);
  const rendererKind =
    input.rendererKind ??
    defaultRendererKind({
      diagnosis: targetDiagnosis,
      probeType,
      expectedResponseType: input.expectedResponseType ?? null,
    });

  const successMarkers = buildSuccessMarkers(targetTopicLabel, assessmentTarget);
  const failureMarkers = buildFailureMarkers(targetTopicLabel, assessmentTarget);
  const misconceptionMappings = buildMisconceptionMappings(
    failureMarkers,
    assessmentTarget,
  );

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

    input_schema: buildInputSchema({
      rendererKind,
      topicLabel: targetTopicLabel,
    }),
    judging_schema: {
      success_markers: successMarkers,
      failure_markers: failureMarkers,
      misconception_mappings: misconceptionMappings,
      telemetry_to_capture: telemetryForRenderer(rendererKind),
      allow_partial_credit: true,
      minimum_evidence_strength_for_success: 0.62,
    },
    renderer_config: buildRendererConfig({
      rendererKind,
      topicLabel: targetTopicLabel,
      assessmentTarget,
    }),

    diagnosis_state_snapshot: input.diagnosisState ?? null,

    reasons: [
      `Built a ${rendererKind} probe contract for ${targetTopicLabel}.`,
      `Assessment target selected as ${assessmentTarget}.`,
      targetDiagnosis
        ? `Target diagnosis was ${targetDiagnosis}.`
        : "No target diagnosis was provided, so the contract used a representation-oriented default.",
    ],
    cautions: [
      "Probe Contract V1 is scaffold logic. Renderer-specific generation and judging should replace generic placeholders over time.",
    ],
  };

  return {
    contract,
    selected_renderer_kind: rendererKind,
    reasons: contract.reasons,
  };
}
