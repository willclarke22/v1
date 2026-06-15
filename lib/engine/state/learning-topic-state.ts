import type {
  BridgeLevel,
  ConfidenceScore,
  CorrectnessScore,
  DiagnosisLabel,
  PersonalizationProfileSnapshot,
} from "../schemas";

export type DiagnosisBelief = {
  diagnosis: DiagnosisLabel;
  score: ConfidenceScore;
  evidence_count: number;
  last_updated_at?: string | null;
  summary?: string | null;
};

export type MisconceptionState = {
  misconception_id: string;
  label?: string | null;
  confidence: ConfidenceScore;
  evidence_count: number;
  last_seen_at?: string | null;
};

export type UnderstandingState = {
  score: ConfidenceScore;
  evidence_count: number;
  last_correctness?: CorrectnessScore | null;
  last_evidence_strength?: ConfidenceScore | null;
  may_be_lucky_guess?: boolean;
  needs_verification_probe?: boolean;
  verification_reason?: string | null;
  last_updated_at?: string | null;
};

export type VerificationState = {
  pending: boolean;
  reason?: string | null;
  source?: "lucky_guess" | "partial_success" | "transfer_needed" | "manual" | null;
  last_requested_at?: string | null;
};

export type LearningTopicState = {
  schema_version: "learning_topic_state_v1";

  topic_id?: string | null;
  topic_label: string;

  diagnosis_beliefs: Partial<Record<DiagnosisLabel, DiagnosisBelief>>;

  current_bridge_level?: BridgeLevel | null;

  understanding: UnderstandingState;

  misconceptions: Record<string, MisconceptionState>;

  verification: VerificationState;

  personalization_profile?: PersonalizationProfileSnapshot | null;

  updated_at?: string | null;
};

export type TopicStateUpdateResult<TState = LearningTopicState> = {
  state: TState;
  applied_changes: string[];
  warnings: string[];
};

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function clampPreferenceScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(-1, value));
}

export function getNowIso(now?: string | null): string {
  if (now && now.trim().length > 0) {
    return now;
  }

  return new Date().toISOString();
}

export function createEmptyLearningTopicState(input: {
  topic_id?: string | null;
  topic_label: string;
  current_bridge_level?: BridgeLevel | null;
  personalization_profile?: PersonalizationProfileSnapshot | null;
  now?: string | null;
}): LearningTopicState {
  const now = getNowIso(input.now);

  return {
    schema_version: "learning_topic_state_v1",
    topic_id: input.topic_id ?? null,
    topic_label: input.topic_label,
    diagnosis_beliefs: {},
    current_bridge_level: input.current_bridge_level ?? null,
    understanding: {
      score: 0,
      evidence_count: 0,
      last_correctness: null,
      last_evidence_strength: null,
      may_be_lucky_guess: false,
      needs_verification_probe: false,
      verification_reason: null,
      last_updated_at: now,
    },
    misconceptions: {},
    verification: {
      pending: false,
      reason: null,
      source: null,
      last_requested_at: null,
    },
    personalization_profile: input.personalization_profile ?? null,
    updated_at: now,
  };
}

export function cloneLearningTopicState(state: LearningTopicState): LearningTopicState {
  return {
    ...state,
    diagnosis_beliefs: {
      ...state.diagnosis_beliefs,
    },
    understanding: {
      ...state.understanding,
    },
    misconceptions: {
      ...state.misconceptions,
    },
    verification: {
      ...state.verification,
    },
    personalization_profile: state.personalization_profile
      ? {
          ...state.personalization_profile,
          teaching_signals: [...state.personalization_profile.teaching_signals],
          example_domains: [...state.personalization_profile.example_domains],
        }
      : state.personalization_profile ?? null,
  };
}

