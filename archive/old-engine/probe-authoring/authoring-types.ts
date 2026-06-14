import type {
  EntityId,
  ISO8601String,
  LearningSourceRightsScope,
  LearningSourceTrustLevel,
  ProbeAuthoringMode,
  ProbeAuthoringReadiness,
} from "@/types/contracts";
import type {
  NormalizedLearningSourceChunk,
} from "@/archive/old-engine/source-processing/source-types";
import type {
  BuildProbeContractInput,
  ProbeAssessmentTarget,
  ProbeContractSourceMetadata,
  ProbeGenerationMode,
  ProbeRendererConfigOverrides,
  ProbeRendererKind,
  ProbeSourceGroundedJudgingScaffold,
} from "@/archive/old-engine/probes/probe-types";

/**
 * Probe Authoring V1.3
 *
 * This is the boundary between source-processing and actual probe contract
 * generation.
 *
 * It does not call an LLM and it does not write a trusted probe contract. It
 * evaluates whether normalized source chunks are usable for low-stakes or
 * stronger source-grounded probe authoring.
 *
 * V1.3 adds provisional source-grounded judging scaffold support. These are
 * candidate hints, not trusted answer keys or reviewed rubrics.
 */

export const PROBE_AUTHORING_VERSION = "probe_authoring_v1_3" as const;

export type ProbeAuthoringVersion = typeof PROBE_AUTHORING_VERSION;

export type ProbeAuthoringTrustSummary = {
  highest_trust_level: LearningSourceTrustLevel;
  lowest_trust_level: LearningSourceTrustLevel;
  trust_levels_present: LearningSourceTrustLevel[];
};

export type ProbeAuthoringRightsSummary = {
  rights_scopes_present: LearningSourceRightsScope[];
  contains_private_upload: boolean;
  contains_public_reference: boolean;
  contains_generated_or_unknown: boolean;
};

export type BuildProbeAuthoringContextInput = {
  topicLabel: string;
  targetTopicId?: EntityId | null;
  assessmentTarget?: ProbeAssessmentTarget | null;
  sourceChunks: NormalizedLearningSourceChunk[];
  preferredRendererKinds?: ProbeRendererKind[] | null;
  createdAt?: ISO8601String | null;
};

export type ProbeAuthoringContext = {
  authoring_context_id: EntityId;
  version: ProbeAuthoringVersion;
  created_at: ISO8601String;

  target_topic_id: EntityId | null;
  topic_label: string;
  assessment_target: ProbeAssessmentTarget | null;

  source_ids: EntityId[];
  source_chunk_ids: EntityId[];
  source_chunks: NormalizedLearningSourceChunk[];

  source_confidence: number;
  trust_summary: ProbeAuthoringTrustSummary;
  rights_summary: ProbeAuthoringRightsSummary;

  recommended_generation_mode: ProbeGenerationMode;
  readiness: ProbeAuthoringReadiness;

  allowed_authoring_modes: ProbeAuthoringMode[];
  preferred_renderer_kinds: ProbeRendererKind[];

  can_author_low_stakes_probe: boolean;
  can_author_source_grounded_probe: boolean;
  can_author_strong_answer_key: boolean;
  requires_review_before_use: boolean;

  source_summary: string | null;
  reasons: string[];
  cautions: string[];
};

export type BuildSourceGroundedProbeInputOptions = {
  targetDiagnosis?: BuildProbeContractInput["targetDiagnosis"];
  intent?: BuildProbeContractInput["intent"];
  probeType?: BuildProbeContractInput["probeType"];
  expectedResponseType?: BuildProbeContractInput["expectedResponseType"];
  diagnosisState?: BuildProbeContractInput["diagnosisState"];
  createdAt?: ISO8601String | null;
  rendererKind?: ProbeRendererKind | null;

  /**
   * When true, force a text explanation probe even if the authoring context
   * suggests a structured candidate. This is useful while source-grounded
   * answer-key authoring is still immature.
   */
  preferTextExplanationUntilReviewed?: boolean;

  /**
   * Defaults to true. When true, source chunks are used to shape the
   * learner-facing renderer prompt/title/instructions conservatively.
   */
  applySourceGroundedScaffold?: boolean;

  maxScaffoldSourceSummaryChars?: number;

  /**
   * Defaults to true. When true, source chunks are used to attach provisional
   * judging hints. These hints are reviewable candidates, not trusted rubrics.
   */
  applySourceGroundedJudgingScaffold?: boolean;

  maxJudgingSourceSummaryChars?: number;
};

export type SourceGroundedScaffold = {
  scaffold_id: EntityId;
  created_at: ISO8601String;
  topic_label: string;
  source_title: string | null;
  source_chunk_ids: EntityId[];
  source_focus_summary: string | null;
  renderer_config_overrides: ProbeRendererConfigOverrides;
  scaffold_confidence: number;
  requires_review: boolean;
  reasons: string[];
  cautions: string[];
};

export type SourceGroundedProbeInputBuildResult = {
  probe_input: BuildProbeContractInput;
  source_metadata: ProbeContractSourceMetadata;
  selected_renderer_kind: ProbeRendererKind;
  source_grounded_scaffold?: SourceGroundedScaffold | null;
  source_grounded_judging_scaffold?: ProbeSourceGroundedJudgingScaffold | null;
  reasons: string[];
  cautions: string[];
};

export type ApplySourceGroundedScaffoldOptions = {
  createdAt?: ISO8601String | null;
  maxSourceSummaryChars?: number;
};

export type ApplySourceGroundedScaffoldResult =
  SourceGroundedProbeInputBuildResult & {
    source_grounded_scaffold: SourceGroundedScaffold;
  };

export type ApplySourceGroundedJudgingScaffoldOptions = {
  createdAt?: ISO8601String | null;
  maxSourceSummaryChars?: number;
};

export type ApplySourceGroundedJudgingScaffoldResult =
  SourceGroundedProbeInputBuildResult & {
    source_grounded_judging_scaffold: ProbeSourceGroundedJudgingScaffold;
  };

