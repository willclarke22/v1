import type { DiagnosisType, ProbeType } from "@/types/contracts";
import type {
  ProbeAssessmentTarget,
  ProbeRendererKind,
} from "@/archive/old-engine/probes/probe-types";
import type { RendererCapability } from "./renderer-types";
import {
  answerCaptureKeysForRenderer,
  defaultScaffoldLevelForRenderer,
  deterministicJudgingAvailable,
  expectedEvidenceTierForRenderer,
  expectedJudgingMethodsForRenderer,
  expectedResponseTypeForRenderer,
  rendererIcon,
  telemetryForRenderer,
} from "./renderer-capabilities";

const ALL_DIAGNOSES: DiagnosisType[] = [
  "recall_gap",
  "representation_gap",
  "procedure_gap",
  "discrimination_gap",
  "transfer_gap",
];

const ALL_PROBE_TYPES: ProbeType[] = [
  "predict",
  "explain",
  "discriminate",
  "transform",
  "apply_transfer",
];

const ALL_TARGETS: ProbeAssessmentTarget[] = [
  "recall",
  "representation",
  "procedure",
  "discrimination",
  "transfer",
  "metacognition",
];

function buildCapability(args: {
  rendererKind: ProbeRendererKind;
  label: string;
  description: string;
  normalizedValueKind: RendererCapability["normalized_value_kind"];
  supportedProbeTypes?: ProbeType[];
  supportedDiagnoses?: DiagnosisType[];
  supportedAssessmentTargets?: ProbeAssessmentTarget[];
  estimatedSeconds?: number | null;
  supportsReasoningBox?: boolean;
  cautions?: string[];
}): RendererCapability {
  const deterministic = deterministicJudgingAvailable(args.rendererKind);

  return {
    renderer_kind: args.rendererKind,
    label: args.label,
    description: args.description,
    expected_response_type: expectedResponseTypeForRenderer(args.rendererKind),
    normalized_value_kind: args.normalizedValueKind,
    answer_capture_keys: answerCaptureKeysForRenderer(args.rendererKind),
    telemetry_to_capture: telemetryForRenderer(args.rendererKind),
    supported_probe_types: args.supportedProbeTypes ?? ALL_PROBE_TYPES,
    supported_diagnoses: args.supportedDiagnoses ?? ALL_DIAGNOSES,
    supported_assessment_targets: args.supportedAssessmentTargets ?? ALL_TARGETS,
    deterministic_judging_available: deterministic,
    rubric_judging_required: !deterministic,
    expected_judging_methods: expectedJudgingMethodsForRenderer(args.rendererKind),
    expected_evidence_tier: expectedEvidenceTierForRenderer(args.rendererKind),
    default_scaffold_level: defaultScaffoldLevelForRenderer(args.rendererKind),
    thumbnail_icon: rendererIcon(args.rendererKind),
    estimated_seconds: args.estimatedSeconds ?? 45,
    supports_reasoning_box: args.supportsReasoningBox ?? deterministic,
    supports_retry: true,
    supports_hint: true,
    supports_confidence_rating:
      args.rendererKind !== "audio_explanation" &&
      args.rendererKind !== "video_checkpoint",
    cautions: args.cautions ?? [],
  };
}

export const RENDERER_REGISTRY: Record<ProbeRendererKind, RendererCapability> = {
  text_explanation: buildCapability({
    rendererKind: "text_explanation",
    label: "Text explanation",
    description: "Open-ended explanation probe for representation, recall, transfer, or metacognitive checks.",
    normalizedValueKind: "text",
    estimatedSeconds: 45,
    supportsReasoningBox: false,
    cautions: [
      "Open-ended text uses heuristic rubric judging for now; source-grounded semantic or model judging is still needed for strong correctness claims.",
    ],
  }),
  multiple_choice: buildCapability({
    rendererKind: "multiple_choice",
    label: "Multiple choice",
    description: "Structured discrimination or recall probe with deterministic option judging.",
    normalizedValueKind: "choice",
    supportedProbeTypes: ["discriminate", "explain", "predict"],
    supportedDiagnoses: ["recall_gap", "representation_gap", "discrimination_gap"],
    supportedAssessmentTargets: ["recall", "representation", "discrimination", "metacognition"],
    estimatedSeconds: 35,
  }),
  ordering: buildCapability({
    rendererKind: "ordering",
    label: "Ordering",
    description: "Structured sequence probe for procedures, causal chains, and dependency ordering.",
    normalizedValueKind: "ordering",
    supportedProbeTypes: ["transform", "explain"],
    supportedDiagnoses: ["procedure_gap", "representation_gap"],
    supportedAssessmentTargets: ["procedure", "representation"],
    estimatedSeconds: 45,
  }),
  slider_prediction: buildCapability({
    rendererKind: "slider_prediction",
    label: "Slider prediction",
    description: "Structured prediction probe for directional or magnitude-based reasoning.",
    normalizedValueKind: "slider",
    supportedProbeTypes: ["predict", "apply_transfer"],
    supportedDiagnoses: ["representation_gap", "transfer_gap", "procedure_gap"],
    supportedAssessmentTargets: ["representation", "transfer", "procedure"],
    estimatedSeconds: 35,
  }),
  drag_drop_match: buildCapability({
    rendererKind: "drag_drop_match",
    label: "Drag/drop match",
    description: "Structured matching probe for transfer, categorization, part-to-role mapping, and relationship mapping.",
    normalizedValueKind: "drag_drop",
    supportedProbeTypes: ["apply_transfer", "discriminate", "transform"],
    supportedDiagnoses: ["transfer_gap", "discrimination_gap", "representation_gap", "procedure_gap"],
    supportedAssessmentTargets: ["transfer", "discrimination", "representation", "procedure"],
    estimatedSeconds: 60,
  }),
  graph_match: buildCapability({
    rendererKind: "graph_match",
    label: "Graph match",
    description: "Structured relationship-map probe for mechanism and causal-link understanding.",
    normalizedValueKind: "graph_match",
    supportedProbeTypes: ["explain", "discriminate", "apply_transfer"],
    supportedDiagnoses: ["representation_gap", "discrimination_gap", "transfer_gap"],
    supportedAssessmentTargets: ["representation", "discrimination", "transfer"],
    estimatedSeconds: 60,
  }),
  simulation: buildCapability({
    rendererKind: "simulation",
    label: "Simulation",
    description: "Interactive manipulation probe for observing state changes and inferring mechanisms.",
    normalizedValueKind: "interaction",
    supportedProbeTypes: ["predict", "apply_transfer", "transform"],
    supportedDiagnoses: ["representation_gap", "procedure_gap", "transfer_gap"],
    supportedAssessmentTargets: ["representation", "procedure", "transfer"],
    estimatedSeconds: 90,
    supportsReasoningBox: false,
    cautions: [
      "Simulation judging is currently scaffold-level unless a deterministic state evaluator is attached.",
    ],
  }),
  audio_explanation: buildCapability({
    rendererKind: "audio_explanation",
    label: "Audio explanation",
    description: "Spoken explanation probe for learners who may express understanding more naturally out loud.",
    normalizedValueKind: "text",
    estimatedSeconds: 90,
    supportsReasoningBox: false,
    cautions: [
      "Audio probes use transcript-based heuristic rubric judging for now; source-grounded semantic or model judging is still needed for strong correctness claims.",
    ],
  }),
  video_checkpoint: buildCapability({
    rendererKind: "video_checkpoint",
    label: "Video checkpoint",
    description: "Video pause/checkpoint probe for noticing change, contrast, or mechanism in a visual explanation.",
    normalizedValueKind: "text",
    estimatedSeconds: 90,
    supportsReasoningBox: false,
    cautions: [
      "Video probes use text/checkpoint heuristic rubric judging for now; source-grounded semantic or model judging is still needed for strong correctness claims.",
    ],
  }),
};

export function getRendererCapability(
  rendererKind: ProbeRendererKind,
): RendererCapability {
  return RENDERER_REGISTRY[rendererKind];
}

export function getAllRendererCapabilities(): RendererCapability[] {
  return Object.values(RENDERER_REGISTRY);
}

export function isKnownRendererKind(value: unknown): value is ProbeRendererKind {
  return typeof value === "string" && value in RENDERER_REGISTRY;
}

