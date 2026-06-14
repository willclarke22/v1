import type {
  DiagnosisType,
  ProbeExpectedResponseType,
  ProbeType,
} from "@/types/contracts";
import type {
  ProbeAssessmentTarget,
  ProbeRendererKind,
} from "@/archive/old-engine/probes/probe-types";
import type {
  RendererCapability,
  RendererSelectionInput,
  RendererSelectionReason,
  RendererSelectionResult,
} from "./renderer-types";
import {
  getAllRendererCapabilities,
  getRendererCapability,
  isKnownRendererKind,
} from "./renderer-registry";

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function pushReason(
  reasons: RendererSelectionReason[],
  code: RendererSelectionReason["code"],
  message: string,
  weight: number,
) {
  reasons.push({ code, message, weight });
}

function rendererFromExpectedResponseType(
  expectedResponseType: ProbeExpectedResponseType | null | undefined,
): ProbeRendererKind | null {
  switch (expectedResponseType) {
    case "choice":
    case "multiple_choice":
      return "multiple_choice";
    case "ordering":
      return "ordering";
    case "predict":
      return "slider_prediction";
    case "audio":
      return "audio_explanation";
    case "video":
      return "video_checkpoint";
    case "interactive_action":
      return "drag_drop_match";
    case "dynamic_task":
      return "simulation";
    case "text":
      return "text_explanation";
    default:
      return null;
  }
}

function preferredRendererFromProbeContext(args: {
  diagnosis: DiagnosisType | null | undefined;
  probeType: ProbeType;
  assessmentTarget: ProbeAssessmentTarget;
}): ProbeRendererKind {
  if (args.probeType === "discriminate") return "multiple_choice";
  if (args.probeType === "predict") return "slider_prediction";

  if (args.diagnosis === "procedure_gap" || args.assessmentTarget === "procedure") {
    return "ordering";
  }

  if (
    args.diagnosis === "discrimination_gap" ||
    args.assessmentTarget === "discrimination"
  ) {
    return "multiple_choice";
  }

  if (args.diagnosis === "transfer_gap" || args.assessmentTarget === "transfer") {
    return "drag_drop_match";
  }

  return "text_explanation";
}

function capabilitySupports(args: {
  capability: RendererCapability;
  diagnosis: DiagnosisType | null | undefined;
  probeType: ProbeType;
  assessmentTarget: ProbeAssessmentTarget;
}) {
  const diagnosisOk = args.diagnosis
    ? args.capability.supported_diagnoses.includes(args.diagnosis)
    : true;
  const probeTypeOk = args.capability.supported_probe_types.includes(args.probeType);
  const targetOk = args.capability.supported_assessment_targets.includes(
    args.assessmentTarget,
  );

  return { diagnosisOk, probeTypeOk, targetOk };
}

function scoreCapability(
  capability: RendererCapability,
  input: RendererSelectionInput,
): { score: number; reasons: RendererSelectionReason[] } {
  let score = 0.1;
  const reasons: RendererSelectionReason[] = [];

  const expectedRenderer = rendererFromExpectedResponseType(input.expectedResponseType);
  if (expectedRenderer === capability.renderer_kind) {
    score += 0.36;
    pushReason(
      reasons,
      "expected_response_type_match",
      `Renderer matches expected response type ${input.expectedResponseType}.`,
      0.36,
    );
  }

  const preferred = preferredRendererFromProbeContext({
    diagnosis: input.diagnosis,
    probeType: input.probeType,
    assessmentTarget: input.assessmentTarget,
  });

  if (preferred === capability.renderer_kind) {
    score += 0.28;
    pushReason(
      reasons,
      input.probeType === "discriminate" || input.probeType === "predict"
        ? "probe_type_match"
        : "diagnosis_match",
      `Renderer matches probe context for ${input.probeType}.`,
      0.28,
    );
  }

  const support = capabilitySupports({
    capability,
    diagnosis: input.diagnosis,
    probeType: input.probeType,
    assessmentTarget: input.assessmentTarget,
  });

  if (support.probeTypeOk) {
    score += 0.1;
    pushReason(
      reasons,
      "probe_type_match",
      `Renderer supports probe type ${input.probeType}.`,
      0.1,
    );
  }

  if (support.diagnosisOk && input.diagnosis) {
    score += 0.1;
    pushReason(
      reasons,
      "diagnosis_match",
      `Renderer supports diagnosis ${input.diagnosis}.`,
      0.1,
    );
  }

  if (support.targetOk) {
    score += 0.08;
    pushReason(
      reasons,
      "assessment_target_match",
      `Renderer supports assessment target ${input.assessmentTarget}.`,
      0.08,
    );
  }

  if (input.preferDeterministic && capability.deterministic_judging_available) {
    score += 0.1;
    pushReason(
      reasons,
      "deterministic_preference",
      "Renderer can produce deterministic structured judgment evidence.",
      0.1,
    );
  }

  if (!reasons.length && capability.renderer_kind === "text_explanation") {
    score += 0.18;
    pushReason(
      reasons,
      "fallback_default",
      "Renderer is the safest default when no structured renderer is clearly preferred.",
      0.18,
    );
  }

  return { score: clamp01(score), reasons };
}

export function selectRendererKind(
  input: RendererSelectionInput,
): RendererSelectionResult {
  if (input.requestedRendererKind) {
    if (isKnownRendererKind(input.requestedRendererKind)) {
      const capability = getRendererCapability(input.requestedRendererKind);
      return {
        renderer_kind: input.requestedRendererKind,
        capability,
        confidence: 0.96,
        reasons: [
          {
            code: "explicit_renderer_requested",
            message: `Using explicitly requested renderer ${input.requestedRendererKind}.`,
            weight: 0.96,
          },
        ],
        cautions: capability.cautions,
      };
    }
  }

  const ranked = getAllRendererCapabilities()
    .map((capability) => {
      const result = scoreCapability(capability, input);
      return { capability, ...result };
    })
    .sort((a, b) => b.score - a.score);

  const selected = ranked[0] ?? {
    capability: getRendererCapability("text_explanation"),
    score: 0.42,
    reasons: [
      {
        code: "fallback_default" as const,
        message: "No renderer candidates were available, so text explanation was selected.",
        weight: 0.42,
      },
    ],
  };

  return {
    renderer_kind: selected.capability.renderer_kind,
    capability: selected.capability,
    confidence: clamp01(selected.score),
    reasons: selected.reasons.length
      ? selected.reasons
      : [
          {
            code: "fallback_default",
            message: "Renderer selected by fallback scoring.",
            weight: selected.score,
          },
        ],
    cautions: selected.capability.cautions,
  };
}

