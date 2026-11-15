/** S62A-FIX1C: learner-state coherence research module. No DB access or autonomous adjudication. */
import {LEARNER_FIRST_SCHEMA,LEARNER_FIRST_PROMPT,parseLearnerFirst,toLegacyAssessment,evidenceBuckets,summarizeLearnerDelta,classifyActionConflicts} from './s62a-fix1b-core.mjs';
const clone=x=>structuredClone(x);
const obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const enumOf=values=>({type:'string',enum:values});
const str={type:'string'},nullable={type:['string','null']};
const roles={type:'array',items:obj({id:str,role:enumOf(['support','counter','context'])})};
const arrayString={type:'array',items:str};
export const COHERENCE_SCHEMA=clone(LEARNER_FIRST_SCHEMA);
const u=COHERENCE_SCHEMA.properties.current_understanding;
delete u.properties.presenting_question;
u.properties.learner_intent=nullable;
u.properties.assessed_task=nullable;
u.required=Object.keys(u.properties);
const delta=COHERENCE_SCHEMA.properties.learner_model_delta;
delta.properties.knowledge_actions={type:'array',items:obj({
 existing_id:nullable,
 action:enumOf(['propose','revise','weaken','retire','no_change']),
 kind:enumOf(['understanding','strength','strategy','difficulty','progress','interest','teaching_response']),
 claim:str,
 rationale:str,
 uncertainty:enumOf(['low','medium','high']),
 task_conditions:str,
 evidence_roles:roles,
 confounds:arrayString
})};
delta.required=Object.keys(delta.properties);
export const COHERENCE_PROMPT=`You are Model A, an investigator of ONE learner's changing understanding. Your output is not a list of problems to find: it is a careful account of what the visible learner evidence demonstrates and what, if anything, MyWay should believe differently.

In ONE integrated assessment:
1. Distinguish learner intent from the tutor's assigned task. Describe demonstrated reasoning and its limits. Learner questions, requests for practice, agreeing to a probe, and restating a recent explanation are NOT independent proof of a deficit or mastery. Account for tutor cues, hints, timing, and novelty.
2. Compare the new evidence with the supplied provisional learner knowledge and historical observations. Maintain strengths, strategies, interests and development as seriously as difficulties. Make changes only when meaningful. An older difficulty can remain historically valid but no longer be active. A correct coached reply may warrant context or uncertainty, not a weakness or mastery claim.
3. Consider possible learner-specific underlying causes ONLY if actual difficulties need explaining. Alternative mechanisms may be more plausible; sometimes there is no cause hypothesis. NEVER use a cause field to restate the learner's success or ordinary curiosity. Do not invent a relationship merely because topics are similar.
4. Decide whether to PROPOSE, REVISE, WEAKEN, RETIRE or leave unchanged a compact learner-knowledge record. A record is a provisional current belief about the learner, not a diagnosis or established scientific truth. Explicitly distinguish supporting, contradicting and contextual evidence for the *record's current claim*. Retire is a change in the current state, not deletion of history. Reference an existing knowledge ID exactly as provided or null for a new proposal. Do not fill fields just because they exist; empty lists are often the best answer.
5. Root/relationship actions remain OPTIONAL and distinct from general learner knowledge. Only propose a root if evidence supports a plausible mechanism of THIS learner's difficulty; historic existence does not mean currently active. Model B should receive a concise, realistic teaching recommendation, not mandatory probing. Ask for more context if critical evidence is missing.

Do not infer anything from the private fictional persona or judge scientific correctness automatically. Only cite allowed_observation_ids. Provisional knowledge summaries may refer to evidence omitted from the current packet; do not invent or cite those absent IDs. Return ONLY strict JSON matching the provided schema.`;
export function parseCoherence(raw,allowedIds,priorRecords=[]){
 const x=typeof raw==='string'?JSON.parse(raw):clone(raw);
 if(!x?.current_understanding||!x?.learner_model_delta||!x?.next_teaching)throw Error('FIX1C invalid top-level assessment');
 const u=x.current_understanding,m=x.learner_model_delta;
 if(!Object.hasOwn(u,'learner_intent')||!Object.hasOwn(u,'assessed_task')||Object.hasOwn(u,'presenting_question'))throw Error('FIX1C learner task fields invalid');
 if(!Array.isArray(m.knowledge_actions)||m.knowledge_actions.length>6)throw Error('FIX1C knowledge action list invalid');
 const ids=new Set(allowedIds),records=new Map(priorRecords.map(r=>[r.id,r]));
 const seen=new Set();
 for(const k of m.knowledge_actions){
  if(!['propose','revise','weaken','retire','no_change'].includes(k.action)||!['understanding','strength','strategy','difficulty','progress','interest','teaching_response'].includes(k.kind)||!['low','medium','high'].includes(k.uncertainty)||typeof k.claim!=='string'||k.claim.length>850||typeof k.rationale!=='string'||typeof k.task_conditions!=='string'||!Array.isArray(k.evidence_roles)||k.evidence_roles.length>14||!Array.isArray(k.confounds))throw Error('FIX1C malformed knowledge action');
  const ref=k.existing_id;
  if(k.action==='propose' && ref!==null)throw Error('FIX1C proposal must use null existing_id');
  if(!['propose','no_change'].includes(k.action)&&(!ref||!records.has(ref)||records.get(ref).kind!==k.kind))throw Error('FIX1C knowledge action target missing or wrong kind');
  if(k.action==='no_change' && (k.evidence_roles.length||ref!==null))throw Error('FIX1C no_change requires no cited update');
  if(k.action!=='no_change'&&!k.evidence_roles.length)throw Error('FIX1C knowledge action requires observed evidence');
  if(!k.evidence_roles.every(r=>typeof r.id==='string'&&ids.has(r.id)&&['support','counter','context'].includes(r.role)))throw Error('FIX1C uncitable knowledge observation');
  const citations=k.evidence_roles.map(r=>r.id);if(new Set(citations).size!==citations.length)throw Error('FIX1C duplicated evidence ID');
  if(ref){if(seen.has(ref))throw Error('FIX1C multiple edits to one record in same turn');seen.add(ref)}
 }
 // Reuse existing structural evidence validator by providing the legacy keys, excluding knowledge actions.
 const old=clone(x);old.current_understanding.presenting_question=u.learner_intent??u.assessed_task;
 delete old.current_understanding.learner_intent;delete old.current_understanding.assessed_task;delete old.learner_model_delta.knowledge_actions;
 parseLearnerFirst(old,allowedIds);
 return x;
}
export function toLegacyCoherence(x){
 const old=clone(x);old.current_understanding.presenting_question=x.current_understanding.learner_intent??x.current_understanding.assessed_task;
 delete old.current_understanding.learner_intent;delete old.current_understanding.assessed_task;delete old.learner_model_delta.knowledge_actions;
 return toLegacyAssessment(old);
}
function polarity(roles){const out={support:[],counter:[],context:[]};for(const z of roles)if(!out[z.role].includes(z.id))out[z.role].push(z.id);return out}
export function applyKnowledgeActions(state,parsed,current){
 if(!Array.isArray(state.knowledge_records))throw Error('FIX1C missing knowledge state');
 const commits=[];
 for(const k of parsed.learner_model_delta.knowledge_actions){
  if(k.action==='no_change')continue;
  let record=k.action==='propose'?null:state.knowledge_records.find(r=>r.id===k.existing_id);
  if(k.action!=='propose'&&!record)throw Error('FIX1C unexpected missing record during application');
  if(!record){
   const id=`${state.learner_id}-K-${String(state.knowledge_records.length+1).padStart(3,'0')}`;
   record={id,kind:k.kind,claim:k.claim,status:'provisional',uncertainty:k.uncertainty,support_ids:[],counter_ids:[],context_ids:[],revisions:[],not_scientifically_certified:true};
   state.knowledge_records.push(record);
  }
  const evidence=polarity(k.evidence_roles);
  const revision={version:++state.history_version,action:k.action,previous_claim:record.claim,claim:k.claim,source_event_id:current.id,evidence_polarity:evidence,rationale:k.rationale,task_conditions:k.task_conditions,confounds:clone(k.confounds),uncertainty:k.uncertainty};
  record.revisions.push(revision);
  record.claim=k.claim;record.uncertainty=k.uncertainty;
  record.status=k.action==='retire'?'historical':k.action==='weaken'?'challenged_provisional':'provisional';
  record.updated_at_event_id=current.id;record.last_task_conditions=k.task_conditions;
  for(const [role,field] of [['support','support_ids'],['counter','counter_ids'],['context','context_ids']])for(const id of evidence[role])if(!record[field].includes(id))record[field].push(id);
  commits.push({id:record.id,action:k.action,version:revision.version,kind:record.kind,evidence_polarity:evidence});
 }
 return commits;
}
export function boundedKnowledgeRecords(state,allowedIds,role='A',limit=7){
 const allowed=new Set(allowedIds);const raw=state.knowledge_records??[];
 // The model may know a historical belief exists but cannot cite IDs not in the evidence packet.
 return raw.slice(-limit).map(r=>({id:r.id,kind:r.kind,claim:r.claim.slice(0,450),status:r.status,uncertainty:r.uncertainty,
  citable_support_ids:r.support_ids.filter(id=>allowed.has(id)),citable_counter_ids:r.counter_ids.filter(id=>allowed.has(id)),
  historical_evidence_counts:{support:r.support_ids.length,counter:r.counter_ids.length,context:(r.context_ids??[]).length},
  last_task_conditions:(r.last_task_conditions??'').slice(0,200),not_ground_truth:true}));
}
export {classifyActionConflicts,evidenceBuckets,summarizeLearnerDelta};
