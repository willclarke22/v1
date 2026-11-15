/** S62A-FIX1B: learner-first assessment schema and explicit-polarity memory adapter.
 * Research-only. Does NOT call any model, write a DB, or grade scientific correctness.
 */
const obj=(properties)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const stringArray={type:'array',items:{type:'string'}};
const nullable={type:['string','null']};
const confidence={type:'string',enum:['low','medium','high']};
const evidenceRole=obj({id:{type:'string'},role:{type:'string',enum:['support','counter','context']}});
export const LEARNER_FIRST_SCHEMA=obj({
 current_understanding:obj({
  presenting_question:nullable,
  demonstrated:{type:'array',items:obj({claim:{type:'string'},observation_ids:stringArray})},
  task_conditions:{type:'string'},
  not_yet_demonstrated:stringArray,
  uncertainty:confidence
 }),
 learner_model_delta:obj({
  observations:{type:'array',items:obj({kind:{type:'string',enum:['strength','progress','uncertainty','strategy','interest','difficulty','teaching_effect']},claim:{type:'string'},observation_ids:stringArray,confounds:stringArray})},
  underlying_cause_hypotheses:{type:'array',items:obj({claim:{type:'string'},support_ids:stringArray,counter_ids:stringArray,alternatives:stringArray,uncertainty:confidence})},
  memory_actions:{type:'array',items:obj({kind:{type:'string',enum:['root','relationship']},existing_id:nullable,action:{type:'string',enum:['propose','support','weaken','refine','challenge','no_change']},reason:{type:'string'},evidence_roles:{type:'array',items:evidenceRole},contexts:stringArray,learner_pattern:{type:'string'},alternatives:stringArray})},
  explicit_instructions:{type:'array',items:obj({instruction:{type:'string'},scope:{type:'string'},evidence_id:{type:'string'},exact_excerpt:{type:'string'}})}
 }),
 next_teaching:obj({
  advisory:{type:'string'},
  next_probe:obj({purpose:nullable,probe_type:nullable,separates_hypotheses:stringArray}),
  request_more_context:obj({scope:nullable,why:nullable})
 })
});
export const LEARNER_FIRST_PROMPT=`You are Model A: the evidence-sensitive investigator of ONE learner, not a misconception classifier. You do not speak to the learner. You have only their observable actions and prior tutor dialogue, not direct access to their mind. Your job is to make the best provisional learner assessment that the observations warrant.

Think learner-first in this order (in ONE response):
(1) CURRENT UNDERSTANDING: What did this interaction actually demonstrate about reasoning, strengths and uncertainty? Distinguish a question or practice request from an answer, and a coached answer from independent novel transfer. Look at the prior tutor text, hints, validity of probes and missing information. Report limitations frankly; don't assume a permanent difficulty or mastery.
(2) EVOLVING LEARNER MODEL: What actually changed about our provisional understanding of this person, if anything? Attend to progress, strategy, strengths, interests and effective teaching as well as difficulties. Proposed underlying causes must be learner-specific mechanisms, not generic topic labels. Preserve alternatives and contradictory evidence. A historical difficulty can remain true as history while no longer accurately describing the current learner. Do not force roots or relationships simply because a turn occurred. Cross-topic similarity is not proof of a shared mechanism.
(3) MEMORY AND TUTOR GUIDANCE: Suggest a root/relationship action ONLY if evidence warrants it. Each cited ID must have an explicit evidence role: support for a CURRENT hypothesis, counterevidence, or contextual/ambiguous. For refine, never relabel counterevidence as support. Prefer no action when uncertain. Current success may justify weakening a root when adequately tested; an immediately coached answer may justify uncertainty instead. Explain the next useful tutor move naturally; suggest discriminating probes only when they help. Do not lead the learner or overprobe.

The complete historical evidence ledger may contain information omitted from this bounded input; request more context if that would change your judgment. Cite only IDs provided in allowed_observation_ids. Do not invent root IDs. A learner's explicit instruction must be quoted verbatim from the supplied utterance. Do not claim scientific validation, diagnosis, writes, or hidden persona access. Return ONLY the exact three-part strict JSON schema.`;
const uniq=a=>[...new Set(a)];
function isObj(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)}
function requireShape(x,keys,label){if(!isObj(x)||Object.keys(x).sort().join('|')!==keys.slice().sort().join('|'))throw Error('FIX1B malformed '+label)}
const top=['current_understanding','learner_model_delta','next_teaching'];
export function parseLearnerFirst(raw,allowedIds){
 const x=typeof raw==='string'?JSON.parse(raw):structuredClone(raw);
 requireShape(x,top,'top-level assessment');
 const u=x.current_understanding,m=x.learner_model_delta,t=x.next_teaching;
 requireShape(u,['presenting_question','demonstrated','task_conditions','not_yet_demonstrated','uncertainty'],'current understanding');
 requireShape(m,['observations','underlying_cause_hypotheses','memory_actions','explicit_instructions'],'model delta');
 requireShape(t,['advisory','next_probe','request_more_context'],'next teaching');
 if(!Array.isArray(u.demonstrated)||!Array.isArray(m.observations)||!Array.isArray(m.underlying_cause_hypotheses)||!Array.isArray(m.memory_actions)||!Array.isArray(m.explicit_instructions)||m.memory_actions.length>8)throw Error('FIX1B invalid learner-first arrays');
 const allowed=new Set(allowedIds??[]);
 const validIds=(ids)=>Array.isArray(ids)&&ids.length<=14&&ids.every(id=>typeof id==='string'&&allowed.has(id));
 for(const d of u.demonstrated)if(typeof d.claim!=='string'||!validIds(d.observation_ids))throw Error('FIX1B invalid demonstrated evidence');
 for(const d of m.observations)if(!['strength','progress','uncertainty','strategy','interest','difficulty','teaching_effect'].includes(d.kind)||!validIds(d.observation_ids)||!Array.isArray(d.confounds))throw Error('FIX1B invalid delta evidence');
 for(const h of m.underlying_cause_hypotheses)if(!validIds(h.support_ids)||!validIds(h.counter_ids)||!Array.isArray(h.alternatives))throw Error('FIX1B invalid underlying-cause evidence');
 for(const action of m.memory_actions){
  if(!['root','relationship'].includes(action.kind)||!['propose','support','weaken','refine','challenge','no_change'].includes(action.action)||!Array.isArray(action.evidence_roles)||!Array.isArray(action.contexts)||!Array.isArray(action.alternatives))throw Error('FIX1B invalid action');
  const refs=action.evidence_roles.map(z=>z.id);
  if(!validIds(refs)||uniq(refs).length!==refs.length||action.evidence_roles.some(z=>!['support','counter','context'].includes(z.role)))throw Error('FIX1B invalid/duplicated evidence role');
  if(action.action!=='no_change'&&refs.length===0)throw Error('FIX1B nonempty action requires evidenced roles');
 }
 return x;
}
export function toLegacyAssessment(x){
 const m=x.learner_model_delta,t=x.next_teaching;
 const root_actions=[],relationship_actions=[];
 for(const z of m.memory_actions){
  const a={existing_id:z.existing_id,action:z.action,reason:z.reason,observation_ids:z.evidence_roles.map(r=>r.id),evidence_roles:structuredClone(z.evidence_roles)};
  if(z.kind==='root')root_actions.push(a);
  else relationship_actions.push({...a,contexts:z.contexts,learner_pattern:z.learner_pattern,alternatives:z.alternatives});
 }
 return {
  observed_understanding:x.current_understanding.demonstrated,
  presenting_difficulty:x.current_understanding.presenting_question,
  possible_underlying_causes:m.underlying_cause_hypotheses,
  root_actions,relationship_actions,
  explicit_instruction_observations:m.explicit_instructions,
  teaching_effect_hypotheses:m.observations.filter(z=>z.kind==='teaching_effect'&&z.observation_ids.length>=2).map(z=>({context:z.claim.slice(0,300),method:'observed prior teaching (not causally established)',observations:z.observation_ids,confounds:z.confounds,status:'provisional'})),
  next_probe:t.next_probe,request_more_context:t.request_more_context,overall_uncertainty:x.current_understanding.uncertainty
 };
}
export function evidenceBuckets(action,relatedCause){
 const groups={support:[],counter:[],context:[]};
 const roles=action.evidence_roles??[];
 // ONLY explicit role annotations govern polarity. Mixed evidence cannot be reduced by action type.
 for(const r of roles){if(!groups[r.role].includes(r.id))groups[r.role].push(r.id)}
 return groups;
}
export function summarizeLearnerDelta(x,currentId){
 const m=x.learner_model_delta;
 return {source_observation_id:currentId,demonstrated:x.current_understanding.demonstrated.slice(0,4),not_yet_demonstrated:x.current_understanding.not_yet_demonstrated.slice(0,4),conditions:x.current_understanding.task_conditions.slice(0,500),observations:m.observations.slice(0,5),hypotheses:m.underlying_cause_hypotheses.slice(0,3),advisory:x.next_teaching.advisory.slice(0,450),uncertainty:x.current_understanding.uncertainty,provisional:true};
}
export function classifyActionConflicts(x){
 const causes=x.learner_model_delta.underlying_cause_hypotheses;
 const counter=new Set(causes.flatMap(h=>h.counter_ids));
 const support=new Set(causes.flatMap(h=>h.support_ids));
 return x.learner_model_delta.memory_actions.flatMap(z=>z.evidence_roles.filter(r=>(r.role==='support'&&counter.has(r.id)&&!support.has(r.id))||(r.role==='counter'&&support.has(r.id)&&!counter.has(r.id))).map(r=>({id:r.id,action:z.action,role:r.role,warning:'Cross-field evidence polarity conflict; interpret context, not an automatic correctness verdict'})));
}
