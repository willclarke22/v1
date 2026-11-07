/** S1.6B.4D research transport, not durable learner state. */
export type MyWayInterestDecision={
  chosen_interest:string|null;
  use_interest:'structural_bridge'|'light_tone'|'do_not_use';
  reason:string;
  structural_mapping:string;
  anti_distortion_guard:string;
};
export type MyWayTeachingVariant='baseline'|'contract'|'personalized';
export type MyWayCompactContext={
  topic:string;root_problem:string;evidence_quote:string;original_statement:string;clarification_answer:string;
};
export type MyWay4DTeacherRequest={
  format:'myway_s16b4d_teaching_v1';
  variant:'contract'|'personalized';
  model:'gpt-4.1-mini';
  action:'explain_missing_mechanism'|'repair_misconception'|'extend_follow_up'|'acknowledge_correction'|'close_clarification'|'verify_understanding'|'advance_after_progress';
  context:MyWayCompactContext;
  personalization:MyWayInterestDecision;
};
export type MyWayTeacherOutput={teaching_strategy:string;next_step:string;visual_intent:string};
/** Cost input tokens are returned by the provider; selected-context estimates are only heuristics. */
export type MyWay4DCostEstimate={attemptedCalls:number;knownEstimatedUsd:number;unknownOrIncompleteCalls:number;complete:boolean;notInvoice:true};
