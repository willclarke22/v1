import type {
  EntityId,
} from "@/types/contracts";
import type {
  ProbeContractSource,
  ProbeContractSourceMetadata,
  ProbeGenerationMode,
  ProbeRendererKind,
} from "@/archive/old-engine/probes/probe-types";
import type {
  NormalizedLearningSourceChunk,
} from "@/archive/old-engine/source-processing/source-types";
import type {
  ProbeAuthoringContext,
} from "@/archive/old-engine/probe-authoring/authoring-types";

/**
 * Probe Source Policy V1.3
 *
 * This layer lets MyWay distinguish:
 * - "This probe can collect useful learning evidence"
 * from
 * - "This probe has enough authority to make strong correctness claims."
 *
 * Early MyWay can still use generic scaffold probes, but the contract should
 * explicitly say that their source authority is limited.
 *
 * V1.3 keeps the authoring context bridge and is ready for source-grounded
 * probe inputs produced by lib/engine/probe-authoring.
 */

export const PROBE_SOURCE_POLICY_VERSION = "probe_source_policy_v1_3" as const;

export type ProbeSourcePolicyVersion = typeof PROBE_SOURCE_POLICY_VERSION;

export type SourceConfidenceLevel =
  | "very_low"
  | "low"
  | "moderate"
  | "high"
  | "very_high";

export type AllowedClaimStrength =
  | "none"
  | "conservative"
  | "moderate"
  | "strong";

export type SourcePolicyRuntimeRecommendation =
  | "use_as_low_stakes_probe"
  | "use_for_moderate_progress_evidence"
  | "allow_strong_correctness_if_judging_supports_it"
  | "invite_source_upload"
  | "requires_review_before_strong_claims";

export type ProbeSourcePolicyInput = {
  generationMode: ProbeGenerationMode | null;
  sourceContentIds: EntityId[];
  sourceTopicIds: EntityId[];

  /**
   * Optional normalized source chunks from lib/engine/source-processing.
   * This field gives source-grounded authoring a bridge from uploads/notes/
   * excerpts into probe contracts.
   */
  normalizedSourceChunks?: NormalizedLearningSourceChunk[] | null;

  /**
   * Optional precomputed authoring context. Source policy can later use this
   * to decide whether the contract should be template-only, reviewable
   * source-grounded, or trusted.
   */
  authoringContext?: ProbeAuthoringContext | null;

  providedSourceMetadata?: ProbeContractSourceMetadata | null;
  rendererKind: ProbeRendererKind;
  deterministicJudgingAvailable: boolean;
  expectedEvidenceTier: string | null;
};

export type ProbeSourcePolicyEvaluation = {
  policy_version: ProbeSourcePolicyVersion;

  source_metadata: ProbeContractSourceMetadata;

  contract_source: ProbeContractSource;
  confidence_level: SourceConfidenceLevel;
  allowed_claim_strength: AllowedClaimStrength;

  can_make_strong_correctness_claim: boolean;
  can_make_moderate_correctness_claim: boolean;
  should_invite_source_upload: boolean;
  should_prefer_low_stakes_probe: boolean;
  requires_review_before_strong_claims: boolean;

  runtime_recommendations: SourcePolicyRuntimeRecommendation[];

  reasons: string[];
  cautions: string[];
};

