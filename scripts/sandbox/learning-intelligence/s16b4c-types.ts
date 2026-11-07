/** S1.6B.4C type boundary: prospective teaching plan, no production imports. */
import type {MyWayTeachingActionV1,MyWayTeachingContextEnvelopeV1,MyWayTeachingPlanV1,MyWayLegacyModelBResponseV1} from './s16b4a-types';
import type {MyWayContextSelectionResultV1} from './s16b4b-types';
export type MyWayTeachingFocusV1='auto'|'mechanism'|'misconception'|'check'|'progress';
export type MyWayClarificationStatusV1='UNRESOLVED'|'RESOLVED_NO_CHANGE'|'REPAIR_PROPOSED_UNAPPLIED';
export type MyWayTeachingDecisionV1={
 schema_version:'myway_teaching_decision_v1';planner_version:'myway_teaching_planner_v1';status:'READY_UNTESTED'|'BLOCKED_CONTEXT';
 action:MyWayTeachingActionV1|null;plan:MyWayTeachingPlanV1|null;reason:string;context_status:MyWayContextSelectionResultV1['status'];
 selected_evidence_ids:string[];requires_human_review:boolean;model_generation_authorized:false;
 clarification_status?:MyWayClarificationStatusV1;memory_change_claim_authorized?:false;
};
export type MyWayTeachingLegacyContextV1={topic:string;root_problem:string;evidence_quote:string;original_statement:string;clarification_answer:string};
export type MyWayTeachingPreparedRequestV1={schema_version:'myway_teaching_request_v1';status:'READY_UNTESTED'|'BLOCKED_CONTEXT'|'BLOCKED_SIZE';
 request:MyWayTeachingLegacyContextV1|null;format?:'myway_s15_shadow_model_v1';proposed_system_prompt?:string;reason?:string;audit:Record<string,unknown>};
export type MyWayTeachingBuilderInputV1={envelope:MyWayTeachingContextEnvelopeV1;selected:MyWayContextSelectionResultV1;decision:MyWayTeachingDecisionV1};
export type MyWayTeachingMockOutputV1=MyWayLegacyModelBResponseV1;
