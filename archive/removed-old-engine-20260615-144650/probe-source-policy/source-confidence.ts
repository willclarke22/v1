import type {
  ProbeContractSource,
} from "@/archive/old-engine/probes/probe-types";
import type {
  AllowedClaimStrength,
  SourceConfidenceLevel,
} from "./source-policy-types";

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function averageConfidence(values: number[]) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return 0;

  return clamp01(usable.reduce((sum, value) => sum + value, 0) / usable.length);
}

export function confidenceLevel(value: number): SourceConfidenceLevel {
  const score = clamp01(value);

  if (score >= 0.9) return "very_high";
  if (score >= 0.75) return "high";
  if (score >= 0.55) return "moderate";
  if (score >= 0.32) return "low";
  return "very_low";
}

export function defaultConfidenceForSource(source: ProbeContractSource) {
  switch (source) {
    case "human_reviewed_library":
      return {
        authoring_confidence: 0.94,
        content_confidence: 0.95,
        pedagogical_confidence: 0.86,
      };
    case "uploaded_source":
      return {
        authoring_confidence: 0.72,
        content_confidence: 0.82,
        pedagogical_confidence: 0.68,
      };
    case "trusted_public_source":
      return {
        authoring_confidence: 0.7,
        content_confidence: 0.78,
        pedagogical_confidence: 0.64,
      };
    case "cached_generated":
      return {
        authoring_confidence: 0.62,
        content_confidence: 0.58,
        pedagogical_confidence: 0.62,
      };
    case "llm_general_prior":
      return {
        authoring_confidence: 0.48,
        content_confidence: 0.42,
        pedagogical_confidence: 0.58,
      };
    case "template_only":
      return {
        authoring_confidence: 0.48,
        content_confidence: 0.32,
        pedagogical_confidence: 0.55,
      };
    case "unknown":
    default:
      return {
        authoring_confidence: 0.24,
        content_confidence: 0.22,
        pedagogical_confidence: 0.28,
      };
  }
}

export function allowedClaimStrengthFor(args: {
  contentConfidence: number;
  authoringConfidence: number;
  pedagogicalConfidence: number;
  requiresReview: boolean;
  contractSource: ProbeContractSource;
}): AllowedClaimStrength {
  const sourceConfidence = averageConfidence([
    args.contentConfidence,
    args.authoringConfidence,
    args.pedagogicalConfidence,
  ]);

  if (args.requiresReview) {
    if (sourceConfidence >= 0.7 && args.contentConfidence >= 0.7) return "moderate";
    if (sourceConfidence >= 0.28) return "conservative";
    return "none";
  }

  if (
    args.contractSource === "human_reviewed_library" &&
    args.contentConfidence >= 0.88 &&
    args.authoringConfidence >= 0.82
  ) {
    return "strong";
  }

  if (args.contentConfidence >= 0.72 && sourceConfidence >= 0.68) {
    return "moderate";
  }

  if (args.contentConfidence >= 0.3 && sourceConfidence >= 0.32) {
    return "conservative";
  }

  return "none";
}

