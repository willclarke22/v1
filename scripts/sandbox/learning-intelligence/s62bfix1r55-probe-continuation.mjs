/** Versioned evidence wrapper: preserve opaque generated code origin as unverified. */
import {ATTEMPT_RE,probeContinuationContext,probeModelEvidence as originalEvidence} from './s62bfix1r54-probe-continuation.mjs';
export {ATTEMPT_RE,probeContinuationContext};
export function probeModelEvidence(info){return {...originalEvidence(info),comparison_exposure:info.attempt?.comparison_exposure??null,reported_event_origin_is_not_independently_authenticated:true,automatic_model_generated_events_not_evidence_of_correct_comprehension:true,unchosen_output_is_not_an_attempt:true};}
