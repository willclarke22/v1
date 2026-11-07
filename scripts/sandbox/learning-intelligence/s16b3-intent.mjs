/** S1.6B.3 intent + compact MyWay teaching policy; deterministic signals, not proof of semantics. No I/O. */
import {clipped} from './s16b1-continuity.mjs';

const YES=/^(?:yes[, .!]|exactly\b|to clarify[, :]|right[, :]|correct[, :]|no[, .!]|i meant\b|what i meant\b|i was asking\b)/i;
const CORRECT=/\b(?:was not confused|wasn't confused|never (?:confused|had trouble)|i meant|what i meant|specifically|to correct|you (?:linked|filed|classified|mixed|mistook)|wrongly (?:linked|filed)|my (?:earlier|previous) (?:question|comment) (?:was|is))\b/i;
const PROGRESS=/\b(?:i (?:now )?understand|i (?:finally )?get|i learned|i know now|makes sense now|i can (?:follow|explain))\b/i;
const QUESTION=/[?]|\b(?:why|how|what|where|which|explain|don't understand|do not understand|still confused|still do not get)\b/i;
export function inferIntent(message,{pending=null,previous=[]}={}){
 const m=clipped(message,500),p=previous.at(-1),hasPending=Boolean(pending?.status==='AWAITING_CLARIFICATION');
 // A clarification response can mention the prior disagreement; route it BEFORE new correction detection.
 const answering=hasPending&&(YES.test(m)||/\b(?:earlier (?:note|statement|question)|keep (?:the|my) earlier|don't (?:change|move)|do not (?:change|move)|should (?:stay|remain)|it should be (?:linked|connected)|that (?:T\d\d|question))\b/i.test(m));
 if(answering)return {intent:'clarification_answer',confidence:'heuristic',reason:'pending_clarification_plus_answer_language',parentCorrectionId:pending.id};
 if(CORRECT.test(m))return {intent:'correction',confidence:'heuristic',reason:'explicit_contrast_or_prior_attribution'};
 if(PROGRESS.test(m)&&!QUESTION.test(m))return {intent:'reported_progress',confidence:'heuristic',reason:'understanding_report_not_mastery'};
 if(PROGRESS.test(m)&&QUESTION.test(m))return {intent:'follow_up',confidence:'heuristic',reason:'progress_plus_new_question'};
 if(p&&QUESTION.test(m)&&/\b(?:but|this|that|same|still|earlier|again|so|then)\b/i.test(m))return {intent:'follow_up',confidence:'heuristic',reason:'followup_reference'};
 return {intent:'new_difficulty',confidence:'heuristic',reason:'default_new_learning_question'};
}
export function assessmentSkip(intent){return ['correction','clarification_answer','reported_progress'].includes(intent);}
export function memorySkip(intent){return ['clarification_answer','correction','reported_progress'].includes(intent);}
const MODE_RULES={
 correction:'Acknowledge the learner correction FIRST in plain language, without claiming you already changed the history. Do not re-explain the entire mechanism unless asked. Ask one short, specific question to disambiguate the earlier record. Avoid unrelated analogies. Example tone (not fixed wording): Ah, I see—you mean X, not Y. I have not changed the earlier note yet.',
 clarification_answer:'Thank the learner briefly for clarifying. Mirror the precise distinction they made. Do NOT claim a memory record was repaired unless the supplied status explicitly says it was; an unverified proposal is not an applied correction. If no additional question is needed, offer one small next step rather than a second lecture. Example tone (not fixed wording): Thanks, that clears up what you meant earlier.',
 reported_progress:'Acknowledge what the learner reports, without declaring mastery. Prefer a quick check-for-understanding or a natural next step to a full explanation.',
 follow_up:'Respond to the NEW missing link, briefly relating it to the prior teaching only if that connection is helpful. Avoid repeating a completed lesson.',
 new_difficulty:'Explain the exact gap in 2–4 conversational sentences, then offer one grounded check or next step. Avoid generic praise and boilerplate.'
};
/** Fixed teaching schema remains: teaching_strategy, next_step, visual_intent. Compact prompts, capped context. */
export function teacherContextB3(message,assessment,ctx,intent,{clarification=null,resolution=null}={}){
 const prior=ctx.short?`\nRECENT CONTEXT (not new evidence): ${clipped(ctx.short,430)}`:'';
 const focus=clarification?.question?`\nTARGETED QUESTION (use natural wording, do not print technical roots): ${clipped(clarification.question,210)}`:'';
 const result=resolution?`\nCORRECTION STATUS: ${resolution.status}; applied=${Boolean(resolution.applied)}. Never claim an unperformed repair.`:'';
 const instructions=`INTENT=${intent.intent}. ${MODE_RULES[intent.intent]??MODE_RULES.new_difficulty} Treat learner's words as authoritative about their reported intent, not as automatic proof of a past erroneous link. Be direct, calm, natural; never say 'Great question!' by default. Prefer one useful question over a decorative diagram.`;
 return {topic:clipped(assessment?.topic_name,110)||'Continuing conversation',root_problem:clipped(assessment?.root_problem,400)||'Clarification of prior explanation',evidence_quote:clipped(assessment?.evidence_quote,300)||clipped(message,220),original_statement:clipped(`CURRENT: ${message}${prior}\n${instructions}${focus}${result}`,1850),clarification_answer:''};
}
/** Heuristic warnings only; neither educational quality nor actual learner comprehension is scored. */
export function teacherReview(teaching,intent){const body=String(teaching?.teaching_strategy??'');return {intent:intent.intent,acknowledgmentCheckRequired:['correction','clarification_answer'].includes(intent.intent),possibleCannedPraise:/^(great question|awesome|fantastic|excellent question)/i.test(body),possibleUnverifiedRepairClaim:/\b(?:i (?:have|already) (?:fixed|updated|corrected)|your record (?:is|has been) (?:fixed|updated))\b/i.test(body),humanReviewRequired:true};}
