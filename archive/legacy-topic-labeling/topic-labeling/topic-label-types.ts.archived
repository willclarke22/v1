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

  /**
   * Optional discourse/concept diagnostics used by the newer
   * naturalistic-language scorer.
   *
   * These are optional so older score objects remain valid.
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

export type TopicCandidateKind =
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

export type ConceptPhraseShape =
  | "compound_noun"
  | "skill_phrase"
  | "process_phrase"
  | "mechanism_phrase"
  | "academic_phrase"
  | "practical_phrase"
  | "comparison_like"
  | "domain_modified"
  | "unknown";

export type QuestionSynthesisFrame =
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

export type QuestionSynthesisTriggerKind =
  | "explicit_question"
  | "implicit_problem";

export type QuestionSynthesisWord =
  | "who"
  | "what"
  | "when"
  | "where"
  | "why"
  | "how"
  | "which"
  | null;

export type QuestionSynthesisSlots = {
  /**
   * The grammatical actor/subject when available.
   * This is intentionally not assumed to be "I".
   *
   * Examples:
   * - "I"
   * - "you"
   * - "someone"
   * - "people"
   * - "students"
   * - null for passive/implicit forms
   */
  actor: string | null;

  /**
   * Main action/relationship cue.
   *
   * Examples:
   * - "analyze"
   * - "tell whether"
   * - "caused"
   * - "count as"
   * - "use"
   * - "prove"
   */
  verb: string | null;

  /**
   * Main object of the question/problem frame.
   *
   * Examples:
   * - "primary source"
   * - "French Revolution"
   * - "mean and median"
   * - "promise"
   */
  object: string | null;

  /**
   * Comparison/selective frames can use left/right.
   *
   * Examples:
   * - leftText: "mean"
   * - rightText: "median"
   */
  leftText: string | null;
  rightText: string | null;

  /**
   * Optional domain/container.
   *
   * Examples:
   * - "contracts"
   * - "blood pressure"
   * - "politics class"
   */
  domainText: string | null;
};

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
   * Structured candidate kind.
   *
   * "concept_phrase" is a durable teachable phrase that is not merely a
   * loose noun chunk.
   *
   * "question_synthesis" is a durable topic label synthesized from an
   * explicit question or implicit problem frame.
   *
   * Examples:
   * - "How do people analyze a graph?" -> "Graph Analysis"
   * - "What caused the French Revolution?" -> "Causes of the French Revolution"
   * - "I can't tell whether to use mean or median." -> "Mean vs Median"
   * - "The assignment says analyze the source..." -> "Primary Source Analysis"
   */
  kind: TopicCandidateKind;

  /**
   * The concept-bearing part of the candidate.
   * Examples:
   * - "speed of sound"
   * - "rules of curling"
   * - "law of sines vs law of cosines"
   * - "insurance deductible"
   * - "React state updates"
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
   * Optional concept-phrase metadata.
   *
   * These fields support making durable teachable concepts outrank weak noun
   * chunks.
   */
  conceptPhraseShape?: ConceptPhraseShape;
  conceptHead?: string | null;
  conceptModifiers?: string[];
  isDurableConcept?: boolean;
  isWeakNounChunk?: boolean;
  residueRisk?: "none" | "low" | "medium" | "high";

  /**
   * Optional Question-to-Concept Synthesis metadata.
   *
   * These fields allow the candidate/debug layers to show not only the final
   * label, but also the reusable frame that produced it.
   */
  questionSynthesisFrame?: QuestionSynthesisFrame;
  questionTriggerKind?: QuestionSynthesisTriggerKind;
  questionWord?: QuestionSynthesisWord;
  questionActor?: string | null;
  questionVerb?: string | null;
  questionObject?: string | null;
  questionLeftText?: string | null;
  questionRightText?: string | null;
  questionDomainText?: string | null;
  questionSynthesisSlots?: QuestionSynthesisSlots;
  synthesizedLabel?: string | null;

  /**
   * Existing scoring fields.
   */
  score: number;
  scoreBreakdown: CandidateScoreBreakdown | null;
};