/** S62A-FIX1C.2: typed evidence -> provisional learner belief contract. Research only. */
const obj=p=>({type:'object',additionalProperties:false,properties:p,required:Object.keys(p)});
const arr=i=>({type:'array',items:i});
const str={type:'string'},nullable={type:['string','null']};
const en=x=>({type:'string',enum:x});
export const RECORD_TYPES=['understanding','strength','strategy','difficulty','root','relationship','interest','teaching_response'];
export const MEMORY_ACTIONS=['create','revise','weaken','retire'];
export const EVIDENCE_ROLES=['supports_current','challenges_current','historical_context','context'];
const cited=obj({claim:str,evidence_ids:arr(str),conditions:str});
export const A_SCHEMA=obj({
 current_assessment:obj({
  learner_intent:nullable,assessed_task:nullable,task_conditions:str,
  demonstrated:arr(cited),not_demonstrated:arr(str),
  interpretations:arr(obj({claim:str,evidence_ids:arr(str),uncertainty:en(['low','medium','high'])})),
  overall_uncertainty:en(['low','medium','high'])
 }),
 competing_causes:arr(obj({mechanism:str,evidence_for:arr(str),evidence_against:arr(str),alternatives:arr(str),uncertainty:en(['low','medium','high'])})),
 memory_actions:arr(obj({action:en(MEMORY_ACTIONS),record_type:en(RECORD_TYPES),target_id:nullable,claim:str,reason:str,task_conditions:str,uncertainty:en(['low','medium','high']),evidence_roles:arr(obj({id:str,role:en(EVIDENCE_ROLES)}))})),
 next_teaching:obj({goal:str,approach:str,optional_probe:nullable,probe_purpose:nullable,request_more_context:obj({scope:nullable,why:nullable})})
});
export const A_PROMPT=`You are MyWay Model A: an evidence-sensitive investigator of one learner, not a misconception classifier. You do not speak to the learner. You maintain a provisional, revisable learner model.

Decide in order: (1) What did the learner ACTUALLY SAY or DO, and under what conditions? (2) What may it imply, versus what remains untested? (3) Does that evidence genuinely change any current learner belief? (4) What would help Model B respond or test a meaningful uncertainty?

Separate learner intent, assigned tutor task, observed performance, interpretations, and optional underlying CAUSE hypotheses. A learner asking a question, requesting practice, or agreeing to a probe does NOT demonstrate the answer. A coached or repeated answer is not independent transfer. Correct responses do not automatically disprove a historical difficulty, but they also do not support its continued presence merely because it existed before.

Only hypothesize an underlying cause when a real learner-specific difficulty requires explanation. Never use cause hypotheses to paraphrase strengths or curiosity. Preserve plausible alternatives and uncertainty; do not force roots, relationships or learning progress into existence.

MEMORY CONTRACT: You receive memory_candidates with record_type, ID, current claim, history status, and citable evidence. These are the ONLY valid edit targets. All categories (including roots and relationships) use the ONE memory_actions list. 'create' uses null target_id. 'revise', 'weaken', and 'retire' require the exact candidate ID and matching record_type. Leave memory_actions [] if nothing meaningfully changes. Historical context establishes what was believed before, not that it remains true now. Each cited evidence role describes its effect on the record's CURRENT claim; historical_context records former evidence without endorsing current persistence. Never invent a record ID or cite evidence outside allowed_observation_ids. Validation checks references but does not judge educational correctness.

Give Model B concrete relevant insights and a natural next step. Do not require a question on every turn. All memory beliefs are provisional, not diagnoses or scientific conclusions. Do not infer from a fictional learner profile; return only strict JSON.`;
const clone=x=>structuredClone(x);
const fail=(tag,detail)=>{throw Error(`FIX1C2 ${tag}${detail?' | '+detail:''}`)};
function evidence(ids,allowed,label){
 if(!Array.isArray(ids)||ids.length>14||ids.some(x=>typeof x!=='string'||!allowed.has(x))||new Set(ids).size!==ids.length)fail('invalid evidence',label);
}
export function parseAndValidateA(raw,visibleIds,candidates,currentId){
 let a;try{a=typeof raw==='string'?JSON.parse(raw):clone(raw)}catch(e){fail('invalid JSON',String(e.message))}
 if(!a||!a.current_assessment||!Array.isArray(a.competing_causes)||!Array.isArray(a.memory_actions)||!a.next_teaching)fail('missing assessment fields');
 const visible=new Set(visibleIds),targets=new Map(candidates.map(r=>[r.id,r]));
 if(!visible.has(currentId))fail('current learner observation missing from evidence');
 if(a.current_assessment.demonstrated?.length>12||a.current_assessment.interpretations?.length>12||a.competing_causes.length>8||a.memory_actions.length>5)fail('too many entries');
 for(const c of a.current_assessment.demonstrated??[])evidence(c.evidence_ids,visible,'demonstrated');
 for(const c of a.current_assessment.interpretations??[])evidence(c.evidence_ids,visible,'interpretation');
 for(const c of a.competing_causes){evidence(c.evidence_for,visible,'cause support');evidence(c.evidence_against,visible,'cause counter')}
 const used=new Set();
 for(const [idx,m] of a.memory_actions.entries()){
  if(!MEMORY_ACTIONS.includes(m.action)||!RECORD_TYPES.includes(m.record_type)||!['low','medium','high'].includes(m.uncertainty)||typeof m.claim!=='string'||m.claim.length>850||!m.claim.trim()||typeof m.reason!=='string'||!m.reason.trim()||typeof m.task_conditions!=='string')fail('malformed memory action',String(idx));
  if(!Array.isArray(m.evidence_roles)||!m.evidence_roles.length||m.evidence_roles.length>14)fail('memory action lacks evidence',String(idx));
  const ids=m.evidence_roles.map(e=>e.id); evidence(ids,visible,'memory action '+idx);
  if(ids.indexOf(currentId)<0)fail('memory action missing current-turn evidence',String(idx));
  if(m.evidence_roles.some(e=>!EVIDENCE_ROLES.includes(e.role)))fail('invalid polarity',String(idx));
  if(m.action==='create'){
   if(m.target_id!==null)fail('create requires null target',String(idx));
  }else{
   const target=targets.get(m.target_id);
   if(!target||target.record_type!==m.record_type)fail('missing or wrong-type target',`${idx}: ${m.target_id} as ${m.record_type}`);
   if(used.has(m.target_id))fail('duplicate target action',m.target_id);
   used.add(m.target_id);
  }
 }
 return a;
}
const prefix={root:'R',relationship:'LR'};
export function applyActions(state,a,currentId){
 if(!Array.isArray(state.memory_records))fail('missing unified memory state');
 // Validate first, then apply to a clone and commit atomically. No semantic adjudication.
 const original=clone(state.memory_records),next=clone(original),events=[];
 for(const m of a.memory_actions){
  let r=m.action==='create'?null:next.find(v=>v.id===m.target_id);
  if(m.action!=='create'&&!r)fail('missing record during application',m.target_id);
  if(!r){
   const p=prefix[m.record_type]??'K';
   let n=1,id;do{id=`${state.learner_id}-${p}-${String(n++).padStart(3,'0')}`}while(next.some(x=>x.id===id));
   r={id,record_type:m.record_type,claim:m.claim,status:'provisional',uncertainty:m.uncertainty,evidence:{supports_current:[],challenges_current:[],historical_context:[],context:[]},revisions:[],not_ground_truth:true};next.push(r);
  }
  const before={claim:r.claim,status:r.status,uncertainty:r.uncertainty};
  const revision={version:(state.history_version??0)+events.length+1,action:m.action,current_observation_id:currentId,previous:before,next_claim:m.claim,reason:m.reason,task_conditions:m.task_conditions,uncertainty:m.uncertainty,evidence_roles:clone(m.evidence_roles)};
  r.revisions.push(revision);r.claim=m.claim;r.uncertainty=m.uncertainty;r.status=m.action==='retire'?'historical':m.action==='weaken'?'challenged':'provisional';
  for(const {id,role} of m.evidence_roles)if(!r.evidence[role].includes(id))r.evidence[role].push(id);
  events.push({record_id:r.id,record_type:r.record_type,action:m.action,previous:before,next:{claim:r.claim,status:r.status,uncertainty:r.uncertainty},evidence_roles:clone(m.evidence_roles),version:revision.version});
 }
 state.memory_records=next;state.history_version=(state.history_version??0)+events.length;
 // Projections are solely for legacy retrieval. A/B receive unified typed memory candidates.
 state.roots=next.filter(x=>x.record_type==='root').map(x=>({id:x.id,claim:x.claim,status:x.status,contexts:[],support_ids:x.evidence.supports_current,counter_ids:x.evidence.challenges_current,revisions:x.revisions.map(e=>({version:e.version,action:e.action,source_event_id:e.current_observation_id,reason:e.reason,observation_ids:e.evidence_roles.map(z=>z.id)}))}));
 state.relationships=next.filter(x=>x.record_type==='relationship').map(x=>({id:x.id,claim:x.claim,status:x.status,contexts:[],support_ids:x.evidence.supports_current,counter_ids:x.evidence.challenges_current,revisions:x.revisions.map(e=>({version:e.version,action:e.action,source_event_id:e.current_observation_id,reason:e.reason,observation_ids:e.evidence_roles.map(z=>z.id)}))}));
 return events;
}
const words=s=>new Set(String(s??'').toLowerCase().match(/[a-z]{3,}/g)??[]);
function overlap(a,b){let n=0;for(const w of words(a))if(words(b).has(w))n++;return n}
export function memoryCandidates(state,latest,allowedIds,limit=10){
 const allowed=new Set(allowedIds),query=latest?.text??'';
 const ordered=[...(state.memory_records??[])].map((r,i)=>({r,rank:overlap(query,r.claim)*10 + i/100+ (r.status==='challenged'?1:0)})).sort((a,b)=>b.rank-a.rank).slice(0,limit);
 return ordered.map(({r})=>({id:r.id,record_type:r.record_type,current_claim:r.claim.slice(0,500),status:r.status,uncertainty:r.uncertainty,
  citable_support_ids:r.evidence.supports_current.filter(id=>allowed.has(id)),citable_counter_ids:r.evidence.challenges_current.filter(id=>allowed.has(id)),historical_counts:Object.fromEntries(Object.entries(r.evidence).map(([k,v])=>[k,v.length])),revision_count:r.revisions.length,provisional:true}));
}
export function getMemoryBrief(candidates,limit=5){return candidates.slice(0,limit).map(c=>({id:c.id,record_type:c.record_type,claim:c.current_claim,status:c.status,uncertainty:c.uncertainty,provisional:true}));}
