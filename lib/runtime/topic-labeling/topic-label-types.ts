import type {
  TopicMessageIntent,
} from "./topic-label-contract";

export type SentenceRole =
  | "confusion"
  | "question"
  | "comparison"
  | "request"
  | "attempt"
  | "context"
  | "other";

export type ClauseInfo = {
  raw: string;
  normalized: string;
  index: number;
  role: SentenceRole;
  hasContrastBoundary: boolean;
  hasFocusMarker: boolean;
  hasConfusionMarker: boolean;
  hasQuestionMarker: boolean;
  hasRequestMarker: boolean;
  hasContextMarker: boolean;
};

export type MessageInterpretation = {
  messageIntent: TopicMessageIntent;
  clauses: ClauseInfo[];
};

export type CandidateScoreBreakdown = {
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
};

export type TopicCandidateKind =
  | "named_concept"
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

export type TopicCandidate = {
  /**
   * Backward-compatible raw candidate span that older code can still use.
   */
  span: string;

  /**
   * Backward-compatible normalized form of the span.
   */
  normalizedSpan: string;

  /**
   * New structured candidate fields.
   */
  kind: TopicCandidateKind;

  /**
   * The concept-bearing part of the candidate.
   * Examples:
   * - "speed of sound"
   * - "rules of curling"
   * - "law of sines vs law of cosines"
   * - "insurance deductible"
   */
  coreText: string;

  /**
   * Normalized form of coreText.
   */
  normalizedCoreText: string;

  /**
   * Optional raw tail/commentary that was attached to the core concept.
   * Examples:
   * - "and everyone else seems to get..."
   * - "are still what make the whole thing confusing"
   */
  tailText: string | null;

  /**
   * For comparison candidates.
   */
  leftText: string | null;
  rightText: string | null;

  /**
   * For domain-shaped concepts like "offside in soccer"
   * or "insurance deductible".
   */
  domainText: string | null;

  /**
   * Optional parent-topic hint for subparts like "scoring",
   * "sweeping", or "second part".
   */
  parentHint: string | null;

  /**
   * Whether this candidate should compete as a possible
   * new topic label, versus mainly acting as a discourse cue
   * for fallback/reuse logic.
   */
  shouldCompeteAsTopic: boolean;

  /**
   * Whether this candidate is likely only meaningful in the
   * context of a previously active topic.
   */
  isSubpartReference: boolean;

  /**
   * Existing provenance fields.
   */
  sourceClause: string;
  sourceRole: SentenceRole;
  clauseIndex: number;

  /**
   * Existing optional interpretation fields.
   */
  questionAboutTopic: string | null;
  comparisonTarget: string | null;

  /**
   * Existing lightweight flags.
   */
  qualifiers: string[];

  /**
   * Existing scoring fields.
   */
  score: number;
  scoreBreakdown: CandidateScoreBreakdown | null;
};