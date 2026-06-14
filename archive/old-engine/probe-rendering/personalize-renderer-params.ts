import type {
  ProbePersonalizationApplication,
  ProbeRendererKind,
  ProbeScaffoldLevel,
} from "@/archive/old-engine/probes/probe-types";
import type {
  RendererPersonalizationInput,
  RendererPersonalizationResult,
} from "./renderer-types";
import { getRendererCapability } from "./renderer-registry";

function normalizeScaffoldLevel(
  value: ProbeScaffoldLevel | null | undefined,
  fallback: ProbeScaffoldLevel,
): ProbeScaffoldLevel {
  return value === "none" || value === "low" || value === "medium" || value === "high"
    ? value
    : fallback;
}

function shouldShowExplanationBox(rendererKind: ProbeRendererKind) {
  return (
    rendererKind === "multiple_choice" ||
    rendererKind === "ordering" ||
    rendererKind === "slider_prediction"
  );
}

function shouldRequireReasoningAfterStructuredAnswer(rendererKind: ProbeRendererKind) {
  return (
    rendererKind === "multiple_choice" ||
    rendererKind === "ordering" ||
    rendererKind === "slider_prediction"
  );
}

export function personalizeRendererParams(
  input: RendererPersonalizationInput,
): RendererPersonalizationResult {
  const capability = getRendererCapability(input.rendererKind);
  const personalization: Partial<ProbePersonalizationApplication> =
    input.personalization ?? {};
  const scaffoldLevel = normalizeScaffoldLevel(
    personalization.scaffold_level,
    capability.default_scaffold_level,
  );

  const reasons: string[] = [
    `Base renderer scaffold level is ${capability.default_scaffold_level}.`,
  ];

  if (personalization.scaffold_level) {
    reasons.push(`Personalization requested ${personalization.scaffold_level} scaffold level.`);
  }

  if (personalization.tone) {
    reasons.push(`Tone preference noted as ${personalization.tone}.`);
  }

  if (personalization.pacing) {
    reasons.push(`Pacing preference noted as ${personalization.pacing}.`);
  }

  return {
    scaffold_level: scaffoldLevel,
    compact: false,
    show_confidence_rating: capability.supports_confidence_rating,
    allow_hint: capability.supports_hint,
    allow_retry: capability.supports_retry,
    show_explanation_box: shouldShowExplanationBox(input.rendererKind),
    require_reasoning_after_structured_answer:
      shouldRequireReasoningAfterStructuredAnswer(input.rendererKind),
    reasons,
  };
}

