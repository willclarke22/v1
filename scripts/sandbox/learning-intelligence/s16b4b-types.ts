/** S1.6B.4B type-only boundary. No production code/prompt changes. */
import type {MyWayTeachingContextEnvelopeV1,MyWayContextSourceV1,MyWayLearnerIntentV1} from './s16b4a-types';
export type MyWayContextSelectionStatusV1 = 'READY'|'READY_WITH_GAPS'|'NEEDS_TARGET_EVIDENCE'|'NEEDS_BUDGET';
export type MyWayContextSelectionOptionsV1 = {
 /** Caller-grounded exact historical targets; required and never replaced with latest. */
 targetEvidenceIds?:string[];
 targetTurnIds?:string[];
 targetDifficultyIds?:string[];
 recentTurnIds?:string[];
 excludedEvidenceIds?:string[];
 relevanceTerms?:string[];
 maxSelected?:number;
};
export type MyWaySelectedEvidenceV1 = {
 evidence_id:string;
 source:MyWayContextSourceV1;
 text:string;
 turn_id:string|null;
 difficulty_id:string|null;
 verified_as_learner_evidence:boolean;
 score:number;
 inclusion_reason:'explicit_historical_target'|'matched_difficulty'|'relevance_ranked';
};
export type MyWayContextOmissionV1 = {evidence_id:string;reason:string;score:number};
export type MyWayContextSelectionResultV1 = {
 schema_version:'myway_context_selection_result_v1';
 selector_version:'myway_relevance_context_selector_v1';
 status:MyWayContextSelectionStatusV1;
 learner_intent:MyWayLearnerIntentV1;
 selected:MyWaySelectedEvidenceV1[];
 omitted:MyWayContextOmissionV1[];
 state_selected:string[];
 state_omitted:Array<{field:string;reason:string}>;
 /** Historical evidence is JSON-quoted, labeled by provenance and marked untrusted. */
 context_text:string;
 limits:{estimatedTokenBudget:number;utf8ByteCeiling:number;maxSelected:number};
 usage:{estimatedTokens:number;utf8Bytes:number;estimator:'ceil_utf8_bytes_div_3_plus_framing_v1'};
 audit:{requiredTargets:string[];requiredTurns:string[];requiredDifficulties:string[];missingTargets:Array<{kind:string;value:string}>;
  noCorrectionAnchor:boolean;exactEvidenceWasTruncated:false;unverifiedEvidencePresentedAsLearner:false;
  personalizationNotSelected:true;requiresHumanReview:boolean;requiredTargetCount?:number;
  selectedEvidenceCount?:number;omittedEvidenceCount?:number};
};
export type MyWayContextSelectorInputV1={envelope:MyWayTeachingContextEnvelopeV1;options:MyWayContextSelectionOptionsV1};
