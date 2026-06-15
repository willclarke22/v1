import type {
  ProbeExpectedResponseType,
  ProbeIntent,
  ProbeType as RuntimeProbeType,
  DiagnosisType as RuntimeDiagnosisType,
} from "@/types/contracts";
import {
  toEngineRenderableProbe,
  type ProbeContractModelOutput,
  type DiagnosisLabel,
  type ProbeAttemptType,
  type ProbeType as EngineProbeType,
  type RendererParams,
} from "@/lib/engine";

import type {
  LegacyCompatibleProbeContractInput,
  LegacyCompatibleProbeContractResult,
  LegacyCompatibleProbeContractSnapshot,
} from "./types";

function nowIso() {
  return new Date().toISOString();
}

function normalizeTopicLabel(value: string) {
  const trimmed = value.trim();
  return trimmed || "this topic";
}

function normalizeDiagnosis(
  diagnosis: LegacyCompatibleProbeContractInput["targetDiagnosis"],
): DiagnosisLabel {
  switch (diagnosis) {
    case "recall_gap":
    case "representation_gap":
    case "procedure_gap":
    case "discrimination_gap":
    case "transfer_gap":
    case "no_gap_detected":
    case "unknown":
      return diagnosis;
    default:
      return "representation_gap";
  }
}

function normalizeRuntimeProbeType(
  probeType: LegacyCompatibleProbeContractInput["probeType"],
): RuntimeProbeType {
  switch (probeType) {
    case "predict":
    case "explain":
    case "discriminate":
    case "transform":
    case "apply_transfer":
      return probeType;
    case "sequence":
      return "transform";
    case "single_choice":
    case "multi_choice":
    case "drag_drop_placements":
    case "slider":
    case "graph_relationship":
    case "audio_clip_question":
    case "audio_response_question":
    case "video_click_interval":
    case "video_explanation":
      return "explain";
    default:
      return "explain";
  }
}

function probeTypeFromRendererKind(
  rendererKind: string | null | undefined,
  expectedResponseType: LegacyCompatibleProbeContractInput["expectedResponseType"],
): EngineProbeType | null {
  switch (rendererKind) {
    case "multiple_choice":
      return expectedResponseType === "multiple_choice" ? "multi_choice" : "single_choice";
    case "ordering":
      return "sequence";
    case "slider_prediction":
      return "slider";
    case "drag_drop_match":
      return "drag_drop_placements";
    case "graph_match":
      return "graph_relationship";
    case "audio_explanation":
      return "audio_response_question";
    case "video_checkpoint":
      return "video_explanation";
    case "text_explanation":
    default:
      return null;
  }
}

function normalizeEngineProbeType(
  input: LegacyCompatibleProbeContractInput,
): EngineProbeType {
  const fromRenderer = probeTypeFromRendererKind(
    input.rendererKind,
    input.expectedResponseType,
  );

  if (fromRenderer) return fromRenderer;

  switch (input.probeType) {
    case "predict":
    case "explain":
    case "discriminate":
    case "apply_transfer":
      return input.probeType;
    case "transform":
    case "sequence":
      return "sequence";
    case "single_choice":
    case "multi_choice":
    case "drag_drop_placements":
    case "slider":
    case "graph_relationship":
    case "audio_clip_question":
    case "audio_response_question":
    case "video_click_interval":
    case "video_explanation":
      return input.probeType;
    default:
      return "explain";
  }
}

function normalizeAttemptType(args: {
  probeType: EngineProbeType;
  expectedResponseType: LegacyCompatibleProbeContractInput["expectedResponseType"];
}): ProbeAttemptType {
  const expected = args.expectedResponseType;

  switch (expected) {
    case "text":
    case "predict":
    case "mixed":
      return "text";
    case "choice":
      return "single_choice";
    case "multiple_choice":
      return "multi_choice";
    case "ordering":
    case "transform":
      return "ordered_items";
    case "interactive_action":
    case "dynamic_task":
    case "classify":
      return "drag_drop_placements";
    case "audio":
      return "audio_response";
    case "video":
      return "none";
    case "single_choice":
    case "multi_choice":
    case "ordered_items":
    case "drag_drop_placements":
    case "numeric":
    case "graph":
    case "audio_response":
    case "video_click":
    case "none":
    case "unknown":
      return expected;
    default:
      break;
  }

  switch (args.probeType) {
    case "single_choice":
    case "discriminate":
      return "single_choice";
    case "multi_choice":
      return "multi_choice";
    case "sequence":
      return "ordered_items";
    case "drag_drop_placements":
      return "drag_drop_placements";
    case "slider":
      return "numeric";
    case "graph_relationship":
      return "graph";
    case "audio_response_question":
      return "audio_response";
    case "video_click_interval":
      return "video_click";
    case "video_explanation":
      return "none";
    default:
      return "text";
  }
}

function rendererKindForProbeType(
  probeType: EngineProbeType,
  fallback: string | null | undefined,
) {
  if (fallback) return fallback;

  switch (probeType) {
    case "single_choice":
    case "multi_choice":
      return "multiple_choice";
    case "sequence":
      return "ordering";
    case "slider":
      return "slider_prediction";
    case "drag_drop_placements":
      return "drag_drop_match";
    case "graph_relationship":
      return "graph_match";
    case "audio_clip_question":
    case "audio_response_question":
      return "audio_explanation";
    case "video_click_interval":
    case "video_explanation":
      return "video_checkpoint";
    case "explain":
    case "discriminate":
    case "apply_transfer":
    case "predict":
    default:
      return "text_explanation";
  }
}

function titleForProbe(args: {
  topicLabel: string;
  runtimeProbeType: RuntimeProbeType;
  engineProbeType: EngineProbeType;
}) {
  const { topicLabel, runtimeProbeType, engineProbeType } = args;

  if (engineProbeType === "single_choice") {
    return `Choose the best answer for ${topicLabel}`;
  }

  if (engineProbeType === "multi_choice") {
    return `Select what fits ${topicLabel}`;
  }

  if (engineProbeType === "drag_drop_placements") {
    return `Sort the pieces of ${topicLabel}`;
  }

  if (engineProbeType === "sequence") {
    return `Put ${topicLabel} in order`;
  }

  if (engineProbeType === "slider") {
    return `Estimate ${topicLabel}`;
  }

  if (engineProbeType === "graph_relationship") {
    return `Read the pattern in ${topicLabel}`;
  }

  switch (runtimeProbeType) {
    case "predict":
      return `Predict what happens in ${topicLabel}`;
    case "discriminate":
      return `Distinguish ${topicLabel}`;
    case "transform":
      return `Walk through ${topicLabel}`;
    case "apply_transfer":
      return `Apply ${topicLabel} in a new situation`;
    case "explain":
    default:
      return `Explain ${topicLabel}`;
  }
}

function taskForProbe(args: {
  topicLabel: string;
  diagnosis: DiagnosisLabel;
  runtimeProbeType: RuntimeProbeType;
  engineProbeType: EngineProbeType;
}) {
  const { topicLabel, diagnosis, runtimeProbeType, engineProbeType } = args;

  if (engineProbeType === "single_choice" || engineProbeType === "multi_choice") {
    return `Choose the option that best shows how ${topicLabel} works.`;
  }

  if (engineProbeType === "drag_drop_placements") {
    return `Place each item where it belongs for ${topicLabel}.`;
  }

  if (engineProbeType === "sequence") {
    return `Put the pieces of ${topicLabel} in the order that makes the most sense.`;
  }

  if (engineProbeType === "slider") {
    return `Move the slider to show your best estimate for ${topicLabel}.`;
  }

  if (engineProbeType === "graph_relationship") {
    return `Describe the important pattern you notice for ${topicLabel}.`;
  }

  switch (runtimeProbeType) {
    case "predict":
      return `Predict what would happen in a simple case involving ${topicLabel}, and explain why.`;
    case "discriminate":
      return `Explain the key difference that helps distinguish ${topicLabel} from a closely related idea.`;
    case "transform":
      return `Walk through ${topicLabel} step by step and explain why the order matters.`;
    case "apply_transfer":
      return `Apply ${topicLabel} in a new but related situation. What changes, what stays the same, and why?`;
    case "explain":
    default:
      return diagnosis === "representation_gap"
        ? `Explain ${topicLabel} in your own words, focusing on the key relationship or mechanism.`
        : `Explain ${topicLabel} clearly in your own words.`;
  }
}

function rendererParamsForProbeType(
  probeType: EngineProbeType,
): RendererParams | null {
  /**
   * Keep rich renderer params null until the Probe Contract Model is actually
   * authoring answer keys/options/items. Text-compatible probes should stay
   * renderable, and interactive probes should fail validation loudly if a caller
   * asks for one without enough config.
   */
  switch (probeType) {
    case "explain":
    case "discriminate":
    case "apply_transfer":
    case "predict":
    case "sequence":
    case "graph_relationship":
      return null;
    default:
      return null;
  }
}

function buildProbeContractModelOutput(
  input: LegacyCompatibleProbeContractInput,
): ProbeContractModelOutput {
  const topicLabel = normalizeTopicLabel(input.targetTopicLabel);
  const diagnosis = normalizeDiagnosis(input.targetDiagnosis);
  const runtimeProbeType = normalizeRuntimeProbeType(input.probeType);
  const engineProbeType = normalizeEngineProbeType(input);
  const expectedAttemptType = normalizeAttemptType({
    probeType: engineProbeType,
    expectedResponseType: input.expectedResponseType,
  });
  const task = taskForProbe({
    topicLabel,
    diagnosis,
    runtimeProbeType,
    engineProbeType,
  });

  return {
    schema_version: "probe_contract_model_output_v1",
    probe_type: engineProbeType,
    expected_attempt_type: expectedAttemptType,
    prompt: {
      root_problem_explanation:
        `MyWay is checking the part of ${topicLabel} connected to ${diagnosis.replaceAll("_", " ")}.`,
      reshaping_explanation:
        "Use this probe to make the learner's current understanding visible.",
      task,
      full_prompt: task,
    },
    presentation_support: [],
    answer_key: null,
    misconception_markers: [],
    renderer_params: rendererParamsForProbeType(engineProbeType),
    delivery_context: {
      bridge_level: "bridge_0",
      language_policy: {
        jargon_level: "none",
      },
      presentation_styles_used: ["plain_direct"],
      support_kinds_used: [],
      example_domains_used: [],
    },
    confidence: 0.42,
  };
}

export function buildLegacyCompatibleProbeContract(
  input: LegacyCompatibleProbeContractInput,
): LegacyCompatibleProbeContractResult {
  const topicLabel = normalizeTopicLabel(input.targetTopicLabel);
  const runtimeProbeType = normalizeRuntimeProbeType(input.probeType);
  const engineContract = buildProbeContractModelOutput(input);
  const renderableProbe = toEngineRenderableProbe(engineContract);
  const rendererKind = rendererKindForProbeType(
    engineContract.probe_type,
    input.rendererKind,
  );
  const title = titleForProbe({
    topicLabel,
    runtimeProbeType,
    engineProbeType: engineContract.probe_type,
  });

  const warnings = [
    "Generated by lib/engine/probe-delivery instead of archive/old-engine.",
    "This is an engine-schema-compatible deterministic contract until the Probe Contract Model provider is connected.",
  ];

  const contract: LegacyCompatibleProbeContractSnapshot = {
    schema_version: "probe_contract_snapshot_v2_engine_backed",
    contract_id: `contract-${input.targetTopicId ?? "topic"}-${Date.now()}`,
    version: engineContract.schema_version,
    created_at: nowIso(),

    target_topic_id: input.targetTopicId ?? null,
    target_topic_label: topicLabel,
    target_diagnosis: normalizeDiagnosis(input.targetDiagnosis),

    intent: input.intent ?? null,
    probe_type: runtimeProbeType,
    engine_probe_type: engineContract.probe_type,
    renderer_kind: rendererKind,
    assessment_target: engineContract.prompt.root_problem_explanation,
    difficulty: "adaptive",

    expected_attempt_type: engineContract.expected_attempt_type,
    prompt: engineContract.prompt,
    presentation_support: engineContract.presentation_support,
    answer_key: engineContract.answer_key,
    misconception_markers: engineContract.misconception_markers,
    renderer_params: engineContract.renderer_params,
    delivery_context: engineContract.delivery_context,

    input_schema: {
      schema_version: "probe_contract_model_input_v1_legacy_adapter",
      target_topic: {
        topic_id: input.targetTopicId ?? null,
        topic_label: topicLabel,
      },
      target_diagnosis: normalizeDiagnosis(input.targetDiagnosis),
      requested_probe_type: input.probeType ?? null,
      requested_renderer_kind: input.rendererKind ?? null,
      requested_expected_response_type: input.expectedResponseType ?? null,
    },

    judging_schema: {
      answer_key: engineContract.answer_key,
      misconception_markers: engineContract.misconception_markers,
      expected_attempt_type: engineContract.expected_attempt_type,
    },

    renderer_config: {
      title,
      prompt: engineContract.prompt.full_prompt,
      instructions: engineContract.prompt.task,
      engine_probe_type: engineContract.probe_type,
      expected_attempt_type: engineContract.expected_attempt_type,
      renderer_params: engineContract.renderer_params,
      renderer_compatibility: renderableProbe.renderer_compatibility,
    },

    diagnosis_state_snapshot: {
      target_diagnosis: normalizeDiagnosis(input.targetDiagnosis),
    },

    reasons: [
      "Built from ProbeContractModelOutput shape.",
      "Kept JSON-safe for current ProbePlan and DeliveredProbe contracts.",
    ],

    cautions: renderableProbe.renderer_compatibility.warnings,

    engine_contract: engineContract,
    engine_renderable_probe: renderableProbe,
  };

  return {
    contract,
    engine_contract: engineContract,
    renderable_probe: renderableProbe,
    warnings,
  };
}


