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

export type SentenceRole =
  | "confusion"
  | "question"
  | "comparison"
  | "request"
  | "attempt"
  | "context"
  | "other";

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

export type TopicCandidateScoreBreakdown = {
  roleWeight: number;
  focusWeight: number;
  contrastWeight: number;
  confusionAdjacencyWeight: number;
  requestAdjacencyWeight: number;
  contextRecoveryWeight: number;
  mentionWeight: number;
  specificityWeight: number;
  reuseHintWeight: number;
  genericPenalty: number;
  clausePenalty: number;
  learnerStatePenalty: number;
  lengthPenalty: number;
  total: number;

  /**
   * Extra discourse/concept/QCS diagnostics.
   * These are optional so older score objects remain compatible.
   */
  discourseRoleWeight?: number;
  durabilityWeight?: number;
  mechanismWeight?: number;
  conceptPhraseWeight?: number;
  questionSynthesisWeight?: number;
  competitionRiskPenalty?: number;
  contaminationPenalty?: number;
  structurePenalty?: number;
  nounChunkPenalty?: number;
};

export type TopicLabelingCandidateKind =
  | "named_concept"
  | "concept_phrase"
  | "question_synthesis"
  | "of_phrase"
  | "comparison_pair"
  | "domain_shaped"
  | "focus_target"
  | "context_anchor"
  | "subpart_reference"
  | "followup_reference"
  | "question_target"
  | "request_target"
  | "noun_chunk"
  | "synthetic_anchor"
  | "other";

export type TopicLabelingCandidateFamily =
  | "paired"
  | "synthesis"
  | "concept"
  | "bottleneck"
  | "mechanism"
  | "comparison"
  | "terminology"
  | "structured"
  | "anchor"
  | "other"
  | "residue";

export type TopicLabelingQuestionSynthesisFrame =
  | "definition"
  | "criteria"
  | "cause"
  | "mechanism"
  | "process"
  | "skill"
  | "selection"
  | "comparison"
  | "boundary"
  | "timing"
  | "role_responsibility"
  | "monitoring"
  | "analysis"
  | "source_analysis"
  | "translation"
  | "classification"
  | "unknown";

export type TopicLabelingQuestionTriggerKind =
  | "explicit_question"
  | "implicit_problem";

export type TopicLabelingQuestionWord =
  | "who"
  | "what"
  | "when"
  | "where"
  | "why"
  | "how"
  | "which"
  | null;

export type TopicLabelingQuestionSynthesisSlots = {
  actor: string | null;
  verb: string | null;
  object: string | null;
  leftText: string | null;
  rightText: string | null;
  domainText: string | null;
};

export type TopicLabelingScoredCandidate = {
  span: string;
  normalized_span: string;
  source_clause: string;
  source_role: SentenceRole;
  clause_index: number;
  question_about_topic: string | null;
  comparison_target: string | null;
  qualifiers: string[];
  score: number;
  score_breakdown: TopicCandidateScoreBreakdown | null;
  display_label: string | null;

  /**
   * Richer candidate diagnostics added for naturalistic-language debugging.
   * These are optional to preserve compatibility with older callers.
   */
  family?: TopicLabelingCandidateFamily | string;
  kind?: TopicLabelingCandidateKind | string;
  should_compete_as_topic?: boolean;
  is_subpart_reference?: boolean;
  tail_text?: string | null;
  domain_text?: string | null;

  /**
   * Optional concept-phrase diagnostics.
   */
  concept_phrase_shape?: string | null;
  concept_head?: string | null;
  concept_modifiers?: string[];
  is_durable_concept?: boolean;
  is_weak_noun_chunk?: boolean;
  residue_risk?: "none" | "low" | "medium" | "high" | string | null;

  /**
   * Optional Question-to-Concept Synthesis diagnostics.
   *
   * These make debug output explain the reusable frame that produced a
   * synthesized label, rather than only showing the final label.
   */
  question_synthesis_frame?: TopicLabelingQuestionSynthesisFrame | string | null;
  question_trigger_kind?: TopicLabelingQuestionTriggerKind | string | null;
  question_word?: TopicLabelingQuestionWord | string | null;
  question_actor?: string | null;
  question_verb?: string | null;
  question_object?: string | null;
  question_left_text?: string | null;
  question_right_text?: string | null;
  question_domain_text?: string | null;
  question_synthesis_slots?: TopicLabelingQuestionSynthesisSlots | null;
  synthesized_label?: string | null;
};

export type TopicLabelingDiscourseZone = {
  clauseIndex: number;
  raw: string;
  normalized: string;
  cues: string[];
};

export type TopicLabelingDiscourseProfile = {
  broad_anchor_zones: TopicLabelingDiscourseZone[];
  bottleneck_zones: TopicLabelingDiscourseZone[];
  residue_zones: TopicLabelingDiscourseZone[];
  contrast_boundary_index: number | null;

  has_broad_to_narrow_shape: boolean;
  has_late_bottleneck_shape: boolean;
  has_language_barrier_shape: boolean;
  has_terminology_barrier_shape: boolean;
  has_mechanism_request_shape: boolean;
  has_comparison_shape: boolean;
  has_null_only_emotional_shape: boolean;

  domain_hints: string[];
  target_hints: string[];
  notes: string[];
};

export type TopicLabelingDiagnostics = {
  reasoning_summary: string[];
  rejection_reasons: string[];
  ambiguity_flags: string[];
  scored_candidates: TopicLabelingScoredCandidate[];

  /**
   * Optional because older deterministic results may not emit this yet.
   */
  discourse_profile?: TopicLabelingDiscourseProfile;
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

function normalizeTopicLabelForContract(label: string | null) {
  return label?.toLowerCase().replace(/\s+/g, " ").trim() ?? "";
}

function looksLikeQcsSynthesizedLabel(label: string | null) {
  const normalized = normalizeTopicLabelForContract(label);
  if (!normalized) return false;

  return (
    /^causes of .+$/.test(normalized) ||
    /^why .+ happens?$/.test(normalized) ||
    /^how .+ works?$/.test(normalized) ||
    /^.+ analysis$/.test(normalized) ||
    /^.+ evaluation$/.test(normalized) ||
    /^.+ criteria$/.test(normalized) ||
    /^.+ selection$/.test(normalized) ||
    /^.+ timing$/.test(normalized) ||
    /^monitoring .+$/.test(normalized) ||
    /^balancing .+$/.test(normalized) ||
    /\bvs\b/.test(normalized)
  );
}

/**
 * A structurally strong label may deserve creation even when confidence is
 * slightly below the normal generic-create threshold.
 *
 * This is intentionally not a global threshold loosener. It only protects
 * durable, teachable labels like:
 * - "Speed of Sound"
 * - "Se In Spanish"
 * - "Tax Terminology And Forms"
 * - "Metaphase vs Anaphase"
 * - "Primary Source Analysis"
 * - "Causes of the French Revolution"
 */
export function isStructurallyStrongTopicLabel(label: string | null) {
  if (!label) return false;

  const normalized = normalizeTopicLabelForContract(label);

  if (!normalized) return false;
  if (looksLikeQcsSynthesizedLabel(label)) return true;

  return (
    /\bvs\b/.test(normalized) ||
    /\bof\b/.test(normalized) ||
    /\bin\b/.test(normalized) ||
    /\bon\b/.test(normalized) ||
    /^how .+ works?$/.test(normalized) ||
    /^why .+ happens?$/.test(normalized) ||
    /\bterminology\b/.test(normalized) ||
    /\bjargon\b/.test(normalized) ||
    /\bforms\b/.test(normalized) ||
    normalized === "speed of sound" ||
    normalized === "law of cosines" ||
    normalized === "law of sines" ||
    normalized === "compound interest" ||
    normalized === "standard deviation" ||
    normalized === "opportunity cost" ||
    normalized === "negative feedback" ||
    normalized === "event loop" ||
    normalized === "refractory period" ||
    normalized === "secondary dominants" ||
    normalized === "membrane potential" ||
    normalized === "equilibrium constant" ||
    normalized === "insurance deductible" ||
    normalized === "insurance premium" ||
    normalized === "loan principal" ||
    normalized === "credit card interest" ||
    normalized === "balancing a budget" ||
    normalized === "primary source analysis" ||
    normalized === "source analysis" ||
    normalized === "graph analysis" ||
    normalized === "poetry analysis" ||
    normalized === "monitoring understanding" ||
    normalized === "consideration in contracts" ||
    normalized === "causes of the french revolution" ||
    normalized === "balancing chemical equations" ||
    normalized === "behavioral interview questions" ||
    normalized === "accomplishment-based resume bullets" ||
    normalized === "react state updates" ||
    normalized === "api error handling" ||
    normalized === "burden of proof" ||
    normalized === "right of way" ||
    normalized === "oil change intervals" ||
    normalized === "moon phases" ||
    normalized === "emotion regulation" ||
    normalized === "concept mapping"
  );
}

/**
 * Useful for distinguishing a broad reusable topic from a narrower new topic.
 * Example:
 * - Existing broad topic: "Spanish"
 * - New narrow label: "Se In Spanish"
 */
export function isNarrowerThanExistingBroadTopic(args: {
  label: string | null;
  existingTopicName: string | null;
}) {
  const label = normalizeTopicLabelForContract(args.label);
  const existing = normalizeTopicLabelForContract(args.existingTopicName);

  if (!label || !existing) return false;
  if (label === existing) return false;

  if (label.includes(existing) && label.split(/\s+/).length > existing.split(/\s+/).length) {
    return true;
  }

  const broadToNarrowPairs: Array<[string, RegExp]> = [
    ["spanish", /\b(se in spanish|word order in spanish)\b/],
    ["taxes", /\b(tax terminology|tax jargon|tax terminology and forms|tax forms)\b/],
    ["tax", /\b(tax terminology|tax jargon|tax terminology and forms|tax forms)\b/],
    ["neurotransmitters", /\b(reuptake|how reuptake works)\b/],
    ["neurotransmission", /\b(reuptake|how reuptake works)\b/],
    ["budgeting", /\b(balancing a budget|compound interest)\b/],
    ["waves", /\b(speed of sound)\b/],
    ["sound", /\b(speed of sound)\b/],
    ["triangles", /\b(law of cosines|law of sines|law of sines vs law of cosines)\b/],
    ["mitosis", /\b(metaphase vs anaphase|metaphase|anaphase)\b/],
    ["meiosis", /\b(crossing over)\b/],
    ["programming", /\b(event loop|asynchronous code|react state updates|api error handling|recursion)\b/],
    ["coding", /\b(event loop|asynchronous code|react state updates|api error handling|recursion)\b/],
    ["economics", /\b(opportunity cost|mean vs median|fixed vs variable expenses)\b/],
    ["finance", /\b(compound interest|apr|fixed vs variable expenses|index funds|depreciation)\b/],
    ["personal finance", /\b(compound interest|apr|fixed vs variable expenses|index funds|depreciation)\b/],
    ["homeostasis", /\b(negative feedback)\b/],
    ["insurance", /\b(insurance deductible|insurance premium)\b/],
    ["loans", /\b(loan principal|interest on student loans)\b/],
    ["loan", /\b(loan principal|interest on student loans)\b/],
    ["history", /\b(causes of the french revolution|primary source analysis|proxy wars|historical significance)\b/],
    ["french revolution", /\b(causes of the french revolution)\b/],
    ["law", /\b(burden of proof|civil law vs criminal law|legal precedent|consideration in contracts)\b/],
    ["contracts", /\b(consideration in contracts)\b/],
    ["grammar", /\b(comma splices|subject-verb agreement|passive voice|your vs you're|affect vs effect)\b/],
    ["biology", /\b(osmosis|natural selection|mitosis vs meiosis|activation energy|photosynthesis|pollination|ecological succession)\b/],
    ["chemistry", /\b(mole concept|balancing chemical equations|electronegativity vs ionization energy|ph|ph scale)\b/],
    ["driving", /\b(parallel parking|right of way|merge lanes|blind spot checks)\b/],
    ["music", /\b(rhythm notation|secondary dominants|interval recognition|circle of fifths)\b/],
    ["art", /\b(one-point perspective|color mixing|negative space|shading values|baroque vs renaissance art)\b/],
    ["space", /\b(orbital velocity|moon phases|gravity vs weight|redshift)\b/],
    ["emotions", /\b(emotion regulation|rumination|cognitive reappraisal)\b/],
  ];

  return broadToNarrowPairs.some(
    ([broad, narrowRegex]) => existing === broad && narrowRegex.test(label)
  );
}
