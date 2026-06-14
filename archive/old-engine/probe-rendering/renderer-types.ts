import type {
  DiagnosisType,
  ProbeExpectedResponseType,
  ProbeIntent,
  ProbeType,
} from "@/types/contracts";
import type {
  ProbeAssessmentTarget,
  ProbePersonalizationApplication,
  ProbeRendererKind,
  ProbeScaffoldLevel,
  ProbeTelemetryKey,
} from "@/archive/old-engine/probes/probe-types";
import type {
  EvidenceJudgingTier,
  JudgingMethod,
} from "@/archive/old-engine/judging";

/**
 * Probe Rendering Policy V1
 *
 * This layer owns reusable renderer intelligence:
 * - what each renderer can measure
 * - what response shape it expects
 * - whether it can be judged deterministically
 * - what telemetry it captures
 * - how renderer choice should respond to diagnosis/probe type/personalization
 *
 * Probe contracts still own the final measurement contract.
 * Frontend renderers still own UI rendering.
 */

export const PROBE_RENDERING_POLICY_VERSION = "probe_rendering_policy_v1" as const;

export type ProbeRenderingPolicyVersion = typeof PROBE_RENDERING_POLICY_VERSION;

export type RendererSelectionReason = {
  code:
    | "explicit_renderer_requested"
    | "expected_response_type_match"
    | "probe_type_match"
    | "diagnosis_match"
    | "assessment_target_match"
    | "deterministic_preference"
    | "fallback_default"
    | "unsupported_renderer_fallback"
    | "personalization_nudge";
  message: string;
  weight: number;
};

export type RendererCapability = {
  renderer_kind: ProbeRendererKind;
  label: string;
  description: string;

  expected_response_type: ProbeExpectedResponseType;
  normalized_value_kind:
    | "text"
    | "choice"
    | "ordering"
    | "slider"
    | "drag_drop"
    | "graph_match"
    | "classification"
    | "interaction"
    | "structured";

  answer_capture_keys: string[];
  telemetry_to_capture: ProbeTelemetryKey[];

  supported_probe_types: ProbeType[];
  supported_diagnoses: DiagnosisType[];
  supported_assessment_targets: ProbeAssessmentTarget[];

  deterministic_judging_available: boolean;
  rubric_judging_required: boolean;
  expected_judging_methods: JudgingMethod[];
  expected_evidence_tier: EvidenceJudgingTier;

  default_scaffold_level: ProbeScaffoldLevel;
  thumbnail_icon: string;
  estimated_seconds: number | null;

  supports_reasoning_box: boolean;
  supports_retry: boolean;
  supports_hint: boolean;
  supports_confidence_rating: boolean;

  cautions: string[];
};

export type RendererSelectionInput = {
  requestedRendererKind?: ProbeRendererKind | null;
  diagnosis?: DiagnosisType | null;
  probeType: ProbeType;
  intent: ProbeIntent;
  expectedResponseType?: ProbeExpectedResponseType | null;
  assessmentTarget: ProbeAssessmentTarget;

  /**
   * Prefer deterministic renderers when MyWay needs stronger correctness
   * evidence and the diagnosis/probe context allows it.
   */
  preferDeterministic?: boolean | null;

  /**
   * Optional personalization from the probe contract builder. This should nudge,
   * not override, measurement intent.
   */
  personalization?: Partial<ProbePersonalizationApplication> | null;
};

export type RendererSelectionResult = {
  renderer_kind: ProbeRendererKind;
  capability: RendererCapability;
  confidence: number;
  reasons: RendererSelectionReason[];
  cautions: string[];
};

export type RendererPersonalizationInput = {
  rendererKind: ProbeRendererKind;
  personalization?: Partial<ProbePersonalizationApplication> | null;
};

export type RendererPersonalizationResult = {
  scaffold_level: ProbeScaffoldLevel;
  compact: boolean;
  show_confidence_rating: boolean;
  allow_hint: boolean;
  allow_retry: boolean;
  show_explanation_box: boolean;
  require_reasoning_after_structured_answer: boolean;
  reasons: string[];
};

