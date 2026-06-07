import type { DiagnosisDelta, ModelSignals } from "@/types/contracts";
import type {
  AttemptInterpretation,
  AttemptInterpretationOutcome,
  EvidenceFeatureVector,
  EvidenceModality,
  InterpretAttemptOptions,
  NormalizedEvidenceInput,
  NormalizedEvidenceValue,
} from "./evidence-types";

/**
 * Generic Attempt Interpretation V1.1
 *
 * This module estimates evidence availability, surface-level signal quality, and
 * weak diagnostic pressure from normalized learner evidence.
 *
 * Important distinction:
 * - This file does NOT decide final correctness.
 * - Deterministic/rubric contract judging should refine correctness later.
 * - evidence_strength means "how usable/judgeable is this evidence?", not
 *   "how correct was the learner?"
 */

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function emptyDiagnosisDelta(): DiagnosisDelta {
  return {
    recall_gap: 0,
    representation_gap: 0,
    procedure_gap: 0,
    discrimination_gap: 0,
    transfer_gap: 0,
  };
}

function safeModelSignal(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp01(value)
    : null;
}

function getTextSpecificity(text: string) {
  if (!text.trim()) return 0;

  const words = text.trim().split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words.map((word) => word.toLowerCase()));
  const lengthSignal = clamp01(words.length / 42);
  const diversitySignal = clamp01(uniqueWords.size / Math.max(1, words.length));

  return clamp01(lengthSignal * 0.7 + diversitySignal * 0.3);
}

function getStructuredSpecificity(keys: string[]) {
  return clamp01(keys.length / 6);
}

function getChoiceSpecificity(value: Extract<NormalizedEvidenceValue, { kind: "choice" }>) {
  return clamp01(
    value.selected_option_ids.length * 0.42 + value.selected_labels.length * 0.18,
  );
}

function getOrderingSpecificity(value: Extract<NormalizedEvidenceValue, { kind: "ordering" }>) {
  return clamp01(value.ordered_item_ids.length / 5);
}

function getDragDropSpecificity(value: Extract<NormalizedEvidenceValue, { kind: "drag_drop" }>) {
  return clamp01(value.matches.length / 5);
}

function getGraphMatchSpecificity(
  value: Extract<NormalizedEvidenceValue, { kind: "graph_match" }>,
) {
  return clamp01(value.selected_edge_ids.length / 5);
}

function getClassificationSpecificity(
  value: Extract<NormalizedEvidenceValue, { kind: "classification" }>,
) {
  const mapSize = Object.keys(value.labels_by_item_id).length;
  return clamp01((value.selected_label ? 0.46 : 0) + mapSize / 6);
}

function getInteractionSpecificity(
  value: Extract<NormalizedEvidenceValue, { kind: "interaction" }>,
) {
  return clamp01(value.action_count / 8 + (value.final_state ? 0.18 : 0));
}

function getEvidenceSpecificity(value: NormalizedEvidenceValue) {
  switch (value.kind) {
    case "text":
      return getTextSpecificity(value.text);
    case "structured":
      return getStructuredSpecificity(value.keys);
    case "choice":
      return getChoiceSpecificity(value);
    case "ordering":
      return getOrderingSpecificity(value);
    case "slider":
      return value.value === null ? 0 : 0.72;
    case "drag_drop":
      return getDragDropSpecificity(value);
    case "graph_match":
      return getGraphMatchSpecificity(value);
    case "classification":
      return getClassificationSpecificity(value);
    case "interaction":
      return getInteractionSpecificity(value);
    case "none":
      return 0;
  }
}

function getCompletionSignal(evidence: NormalizedEvidenceInput) {
  if (evidence.completion === "complete") return 0.9;
  if (evidence.completion === "partial") return 0.58;
  if (evidence.completion === "unclear") return 0.38;
  if (evidence.completion === "abandoned") return 0.2;
  return 0.05;
}

function getModalityEvidenceBase(modality: EvidenceModality) {
  switch (modality) {
    case "choice":
    case "multiple_choice":
    case "classification":
    case "prediction":
      return 0.5;
    case "ordering":
    case "drag_drop":
    case "slider":
    case "interactive_action":
    case "simulation":
      return 0.58;
    case "audio":
    case "video":
      return 0.46;
    case "text":
      return 0.52;
    case "mixed":
      return 0.58;
    case "none":
      return 0.02;
    case "unknown":
    default:
      return 0.34;
  }
}

function valueKindEvidenceBoost(value: NormalizedEvidenceValue) {
  switch (value.kind) {
    case "choice":
    case "ordering":
    case "slider":
    case "drag_drop":
    case "graph_match":
    case "classification":
      /**
       * Structured evidence is often more directly judgeable by deterministic
       * contract judges. This boosts evidence availability, not correctness.
       */
      return 0.06;
    case "interaction":
      return 0.04;
    case "structured":
      return 0.03;
    default:
      return 0;
  }
}

function buildEvidenceFeatures(
  evidence: NormalizedEvidenceInput,
  modelSignals: ModelSignals | null,
): EvidenceFeatureVector {
  const completionSignal = getCompletionSignal(evidence);
  const base = getModalityEvidenceBase(evidence.modality);
  const confusion = safeModelSignal(modelSignals?.model_confusion);
  const insight = safeModelSignal(modelSignals?.model_insight);
  const specificity = getEvidenceSpecificity(evidence.value);

  const hintDependence =
    evidence.submission_metadata?.used_hint === true
      ? 0.72
      : evidence.submission_metadata?.used_hint === false
        ? 0.12
        : null;

  const interactionEfficiency =
    typeof evidence.submission_metadata?.latency_ms === "number" &&
    Number.isFinite(evidence.submission_metadata.latency_ms)
      ? clamp01(1 - evidence.submission_metadata.latency_ms / 120_000)
      : null;

  const evidenceStrength = clamp01(
    base * 0.34 +
      completionSignal * 0.38 +
      specificity * 0.22 +
      valueKindEvidenceBoost(evidence.value),
  );

  const features: EvidenceFeatureVector = {
    response_specificity: specificity,
    hint_dependence: hintDependence,
    interaction_efficiency: interactionEfficiency,
    confusion_signal: confusion,
    insight_signal: insight,
    evidence_strength: evidenceStrength,
  };

  if (evidence.modality === "text" || evidence.modality === "audio") {
    features.conceptual_coherence = clamp01(
      specificity * 0.58 + (insight ?? 0.35) * 0.24 + (1 - (confusion ?? 0.5)) * 0.18,
    );
    features.representation_quality = features.conceptual_coherence;
  }

  if (
    evidence.modality === "choice" ||
    evidence.modality === "multiple_choice" ||
    evidence.modality === "classification"
  ) {
    features.discrimination_accuracy = clamp01(
      completionSignal * 0.5 + specificity * 0.32 + (insight ?? 0.35) * 0.18,
    );
  }

  if (evidence.modality === "prediction" || evidence.modality === "slider") {
    features.prediction_accuracy = clamp01(
      completionSignal * 0.46 + specificity * 0.3 + (insight ?? 0.35) * 0.24,
    );
  }

  if (
    evidence.modality === "ordering" ||
    evidence.modality === "drag_drop" ||
    evidence.modality === "interactive_action" ||
    evidence.modality === "simulation"
  ) {
    features.procedure_order_quality = clamp01(
      completionSignal * 0.42 +
        (interactionEfficiency ?? 0.5) * 0.18 +
        specificity * 0.24 +
        (insight ?? 0.35) * 0.16,
    );
  }

  if (evidence.modality === "simulation" || evidence.value.kind === "interaction") {
    features.transfer_success = clamp01(
      completionSignal * 0.34 + specificity * 0.32 + (insight ?? 0.35) * 0.18,
    );
  }

  return features;
}

function deriveOutcome(args: {
  evidence: NormalizedEvidenceInput;
  features: EvidenceFeatureVector;
}): AttemptInterpretationOutcome {
  if (args.evidence.completion === "skipped" || args.evidence.modality === "none") {
    return "no_evidence";
  }

  const strength = args.features.evidence_strength ?? 0;

  if (strength >= 0.72) return "strong_evidence";
  if (strength >= 0.48) return "partial_evidence";
  if (strength >= 0.2) return "weak_evidence";
  return "uninterpretable";
}

function deriveDiagnosisDelta(args: {
  evidence: NormalizedEvidenceInput;
  features: EvidenceFeatureVector;
  modelSignals: ModelSignals | null;
  options: InterpretAttemptOptions;
}): DiagnosisDelta {
  const delta = emptyDiagnosisDelta();
  const confusion = safeModelSignal(args.modelSignals?.model_confusion) ?? 0.5;
  const insight = safeModelSignal(args.modelSignals?.model_insight) ?? 0.35;
  const weakness = clamp01(confusion * 0.6 + (1 - insight) * 0.4);
  const strength = args.features.evidence_strength ?? 0.35;
  const evidenceWeakness = clamp01(1 - strength);

  if (args.evidence.completion === "skipped" || args.evidence.modality === "none") {
    delta.recall_gap = 0.16;
    delta.representation_gap = 0.1;
    return delta;
  }

  if (args.evidence.modality === "text" || args.evidence.modality === "audio") {
    delta.representation_gap = clamp01(weakness * 0.12 + evidenceWeakness * 0.08);
  }

  if (
    args.evidence.modality === "ordering" ||
    args.evidence.modality === "drag_drop" ||
    args.evidence.modality === "interactive_action" ||
    args.evidence.modality === "simulation"
  ) {
    delta.procedure_gap = clamp01(weakness * 0.12 + evidenceWeakness * 0.08);
  }

  if (
    args.evidence.modality === "choice" ||
    args.evidence.modality === "multiple_choice" ||
    args.evidence.modality === "classification"
  ) {
    delta.discrimination_gap = clamp01(weakness * 0.12 + evidenceWeakness * 0.08);
  }

  if (args.evidence.modality === "prediction" || args.evidence.modality === "slider") {
    delta.representation_gap = Math.max(
      delta.representation_gap,
      clamp01(weakness * 0.1 + evidenceWeakness * 0.06),
    );
  }

  if (args.options.probeType === "apply_transfer") {
    delta.transfer_gap = clamp01(weakness * 0.14 + evidenceWeakness * 0.08);
  }

  if (args.options.probeType === "predict") {
    delta.representation_gap = Math.max(
      delta.representation_gap,
      clamp01(weakness * 0.1 + evidenceWeakness * 0.06),
    );
  }

  return delta;
}

function structuredValueConfidenceBoost(value: NormalizedEvidenceValue) {
  switch (value.kind) {
    case "choice":
    case "ordering":
    case "slider":
    case "drag_drop":
    case "graph_match":
    case "classification":
      return 0.1;
    case "interaction":
    case "structured":
      return 0.06;
    default:
      return 0;
  }
}

function buildCautions(args: {
  evidence: NormalizedEvidenceInput;
  hasModelSignals: boolean;
}) {
  const cautions: string[] = [];

  if (!args.hasModelSignals) {
    cautions.push("No model-backed confusion/insight signals were available for this interpretation.");
  }

  if (
    args.evidence.value.kind === "choice" ||
    args.evidence.value.kind === "ordering" ||
    args.evidence.value.kind === "slider" ||
    args.evidence.value.kind === "drag_drop" ||
    args.evidence.value.kind === "graph_match" ||
    args.evidence.value.kind === "classification"
  ) {
    cautions.push("Structured evidence was normalized for deterministic judging; generic interpretation estimates evidence availability, not final correctness.");
  }

  if (args.evidence.value.kind === "structured") {
    cautions.push("Generic structured evidence is using broad V1.1 feature extraction until renderer-specific normalization is available.");
  }

  if (args.evidence.value.kind === "interaction") {
    cautions.push("Interactive/simulation evidence is preserved as an action trace, but renderer-specific judging is still needed for strong claims.");
  }

  if (args.evidence.value.kind === "text" && args.evidence.value.word_count < 4) {
    cautions.push("Text evidence is very short, so interpretation confidence should remain conservative.");
  }

  return cautions;
}

export function interpretAttemptEvidence(
  evidence: NormalizedEvidenceInput,
  options: InterpretAttemptOptions = {},
): AttemptInterpretation {
  const modelSignals = options.modelSignals ?? null;
  const features = buildEvidenceFeatures(evidence, modelSignals);
  const outcome = deriveOutcome({ evidence, features });
  const evidenceStrength = clamp01(features.evidence_strength ?? 0);
  const hasModelSignals =
    safeModelSignal(modelSignals?.model_confusion) !== null ||
    safeModelSignal(modelSignals?.model_insight) !== null;

  const judgmentConfidence = clamp01(
    0.26 +
      evidenceStrength * 0.4 +
      (hasModelSignals ? 0.12 : 0) +
      structuredValueConfidenceBoost(evidence.value) +
      (evidence.value.kind === "text" && evidence.value.word_count >= 8 ? 0.08 : 0),
  );

  const reasons = [
    `Evidence modality interpreted as ${evidence.modality}.`,
    `Evidence value kind normalized as ${evidence.value.kind}.`,
    `Evidence completion interpreted as ${evidence.completion}.`,
    `Evidence strength estimated at ${evidenceStrength.toFixed(2)}.`,
  ];

  if (options.probeType) {
    reasons.push(`Probe type context was ${options.probeType}.`);
  }

  if (options.expectedResponseType) {
    reasons.push(`Expected response type context was ${options.expectedResponseType}.`);
  }

  const cautions = buildCautions({
    evidence,
    hasModelSignals,
  });

  return {
    interpretation_id: null,
    evidence_id: evidence.evidence_id,
    linked_topic_id: evidence.linked_topic_id,
    linked_probe_id: evidence.linked_probe_id,

    modality: evidence.modality,
    outcome,

    features,

    evidence_strength: evidenceStrength,
    judgment_confidence: judgmentConfidence,

    diagnosis_delta: deriveDiagnosisDelta({
      evidence,
      features,
      modelSignals,
      options,
    }),

    model_signals_used: {
      confusion: safeModelSignal(modelSignals?.model_confusion),
      insight: safeModelSignal(modelSignals?.model_insight),
      model_version: modelSignals?.model_version ?? null,
      status: modelSignals?.status ?? null,
    },

    reasons,
    cautions,
  };
}
