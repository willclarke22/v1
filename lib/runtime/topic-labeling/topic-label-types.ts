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

export type TopicCandidate = {
  span: string;
  normalizedSpan: string;
  sourceClause: string;
  sourceRole: SentenceRole;
  clauseIndex: number;
  questionAboutTopic: string | null;
  comparisonTarget: string | null;
  qualifiers: string[];
  score: number;
  scoreBreakdown: CandidateScoreBreakdown | null;
};