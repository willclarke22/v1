export const TOPIC_LABEL_SCHEMA_VERSION = "topic_label_v1" as const;

export type TopicMessageIntent =
  | "confusion_help"
  | "explain_request"
  | "quiz_request"
  | "compare_request"
  | "apply_request"
  | "attempt_like"
  | "general_question"
  | "unclear";

export type TopicSpecificity =
  | "too_vague"
  | "broad_but_usable"
  | "good"
  | "very_specific";

export type TopicResolutionDecision =
  | "reuse_existing"
  | "create_new"
  | "no_persistent_topic_yet";

export type RetrievalCandidate = {
  topic_id: string;
  topic_name: string;
  similarity: number;
};

export type TopicLabelingInput = {
  raw_message: string;
  active_topic_id: string | null;
  active_topic_name: string | null;
  recent_topic_names: string[];
  retrieval_candidates: RetrievalCandidate[];
};

export type TopicLabelingInterpretation = {
  message_intent: TopicMessageIntent;
  is_topic_reference_to_existing_topic: boolean | null;
  references_active_topic: boolean | null;
  concept_span: string | null;
  concept_span_start: number | null;
  concept_span_end: number | null;
  question_about_topic: string | null;
  qualifiers: string[];
  comparison_target: string | null;
};

export type TopicLabelingDecision = {
  canonical_label: string | null;
  label_short: string | null;
  label_plurality: "singular" | "plural" | "mixed" | null;
  resolution_decision: TopicResolutionDecision;
  should_reuse_existing_topic: boolean;
  reused_topic_id: string | null;
  reused_topic_name: string | null;
  should_create_new_topic: boolean;
  topic_specificity: TopicSpecificity;
  confidence: number;
};

export type TopicLabelingDiagnostics = {
  reasoning_summary: string[];
  rejection_reasons: string[];
  ambiguity_flags: string[];
};

export type TopicLabelingResult = {
  schema_version: typeof TOPIC_LABEL_SCHEMA_VERSION;
  input: TopicLabelingInput;
  interpretation: TopicLabelingInterpretation;
  topic_decision: TopicLabelingDecision;
  diagnostics: TopicLabelingDiagnostics;
};

export function clampTopicConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function isHighConfidenceTopicLabel(confidence: number) {
  return confidence >= 0.9;
}

export function isUsableTopicLabel(confidence: number) {
  return confidence >= 0.75;
}

export function isLowConfidenceTopicLabel(confidence: number) {
  return confidence < 0.55;
}