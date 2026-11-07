/** S1.6B.4A: TYPE-ONLY contracts, aligned with the EXISTING MyWay engine.
 * No compiled runtime imports and no alteration of production engine schemas. */
import type {
  BridgeLevel, JargonLevel, PresentationStyle, PersonalizationProfileSnapshot,
  PersonalizationSignal, ExampleDomainSignal, ConfidenceScore
} from '../../../lib/engine/schemas/shared';
import type {VisualPersonalizationDecision} from '../../../sandbox/probe-lab/visual-experience/visual-learning-turn';

export type MyWayTeachingActionV1 =
 | 'explain_missing_mechanism' | 'repair_misconception' | 'extend_follow_up'
 | 'acknowledge_correction' | 'close_clarification' | 'verify_understanding'
 | 'advance_after_progress';
export type MyWayLearnerIntentV1 =
 | 'new_difficulty' | 'follow_up' | 'correction' | 'clarification_answer' | 'reported_progress';
export type MyWayContextSourceV1 =
 | 'historical_learner_statement' | 'prior_teaching' | 'canonical_difficulty'
 | 'reported_progress' | 'demonstrated_understanding' | 'pending_correction'
 | 'recent_exchange' | 'other_relevant_history';
export type MyWayContextCandidateV1 = {
  evidence_id: string;
  source: MyWayContextSourceV1;
  text: string;
  turn_id?: string | null;
  difficulty_id?: string | null;
  reason_for_consideration: string;
  /** A candidate is NOT necessarily selected or included in the prompt. */
  verified_as_learner_evidence: boolean;
};
export type MyWayTeachingProfileProjectionV1 = {
  source_schema: 'personalization_profile_snapshot_v1';
  summary: string;
  teaching_signals: PersonalizationSignal[];
  example_domains: ExampleDomainSignal[];
  /** Interests separately supplied by the learner/client, not inferred from profile successes. */
  explicitly_provided_interests: Array<{interest:string;user_interest_confidence:ConfidenceScore}>;
  presentation: {
    bridge_level?: BridgeLevel | null;
    jargon_level?: JargonLevel | null;
    preferred_style?: PresentationStyle | null;
    preferred_order?: PresentationStyle[];
  };
  source_counts: {signals:number;example_domains:number;explicit_interests:number};
  omitted_counts: {signals:number;example_domains:number;explicit_interests:number};
};
export type MyWayTeachingContextEnvelopeV1 = {
  schema_version: 'myway_teaching_context_envelope_v1';
  learner: {message:string;intent:MyWayLearnerIntentV1;turn_id?:string|null};
  assessment: {topic:string;root_problem:string;evidence_quote:string};
  state: {
    canonical_difficulty?: {difficulty_id:string;root_problem:string}|null;
    pending_correction_id?:string|null;
    reported_progress_note?:string|null;
    demonstrated_understanding_note?:string|null;
  };
  /** B will select/rank these in a later patch; A defines provenance and safe boundaries only. */
  context_candidates: MyWayContextCandidateV1[];
  personalization: MyWayTeachingProfileProjectionV1|null;
  limits: {ordinary_context_token_target:number;correction_context_token_ceiling:number};
  context_selection_status:'NOT_IMPLEMENTED_IN_4A';
};
export type MyWayTeachingPlanV1 = {
  schema_version:'myway_teaching_plan_v1';
  action: MyWayTeachingActionV1;
  objective: string;
  reasoning_evidence_ids: string[];
  /** This is a proposed selection, not a claim that an interest is effective. */
  personalization_decision: VisualPersonalizationDecision;
  status:'PLANNED_UNTESTED';
};
/** Strictly preserve the current S1.5/S1.6 Model B transport shape. */
export type MyWayLegacyModelBResponseV1 = {teaching_strategy:string;next_step:string;visual_intent:string};
/** A future engine can accept an existing profile as input; no new durable profile schema. */
export type MyWayExistingPersonalizationSnapshotV1 = PersonalizationProfileSnapshot;
