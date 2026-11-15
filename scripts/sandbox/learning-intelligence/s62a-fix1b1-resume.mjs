/** S62A-FIX1B.1: immutable prior-run inspection, bounded-context citations and forensic rejection capture.
 * Research-only: never imports DB modules, makes model calls or reads environment secrets.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

export const EXPECTED_INITIAL_TRACE_SHA='751bd49d2a9140def7703910f0ccbc292222e19048a0606435f2907eb225bba8';
const hash=buf=>crypto.createHash('sha256').update(buf).digest('hex');
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

export function inspectResumeFile(file){
 if(typeof file!=='string'||!file.endsWith('.json'))throw Error('FIX1B.1 needs a real trace.json path');
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>12000000)throw Error('Invalid or oversized resume trace');
 const bytes=fs.readFileSync(file),sha256=hash(bytes);
 // First continuation is pinned to the user's exact archived partial run, not any similarly named trace.
 if(sha256!==EXPECTED_INITIAL_TRACE_SHA)throw Error('FIX1B.1 exact original trace SHA256 mismatch; do not restart or edit the archive');
 return {trace:JSON.parse(bytes.toString('utf8')),sha256};
}

export function assertResumeTrace(trace,o,schedule){
 if(!isObj(trace)||trace.schema!=='myway_s62afix1b_learner_first_v1'||trace.run_type!=='model'||trace.database_writes!==0||trace.failure?.partial_results!==true)
  throw Error('FIX1B.1 source must be an incomplete, research-only FIX1B model trace');
 const total=schedule.length*o.turnsPerVisit;
 const timeline=trace.timeline;
 if(!Array.isArray(timeline)||timeline.length!==20||trace.failure.completed_steps!==timeline.length||total!==36||trace.cost?.calls!==58||trace.cost?.by_role?.A!==21||trace.cost?.by_role?.B!==20||trace.cost?.by_role?.L!==17||trace.cost?.known_estimated_usd!==0.0940608)
  throw Error('FIX1B.1 original RUNE checkpoint shape or costs changed');
 const old=trace.options;
 for(const field of ['learner','visits','turnsPerVisit','retrieval','prompt','explore','c','seedHistory','memoryMode','aVariant','auditRetrieval','modelA','modelB','modelC','modelL'])
  if(old?.[field]!==o[field])throw Error('FIX1B.1 option mismatch '+field+'; no cross-configuration continuation');
 if(old.learner!=='RUNE'||old.visits!==6||old.turnsPerVisit!==6||old.retrieval!=='semantic'||old.c!=='off')throw Error('FIX1B.1 unexpected archived experiment');
 if(JSON.stringify(trace.scheduled_case_ids)!==JSON.stringify(schedule.map(x=>x.case.case_id)))throw Error('FIX1B.1 visit schedule mismatch');
 const seen=new Set();
 for(let i=0;i<timeline.length;i++){
  const x=timeline[i],expected=schedule[Math.floor(i/o.turnsPerVisit)];
  if(x.step!==i+1||x.case_id!==expected.case.case_id||x.learner_id!==expected.profile.learner_id||x.visit_turn!==(i%o.turnsPerVisit)+1||!x.learner_observation_id||seen.has(x.learner_observation_id))throw Error('FIX1B.1 historical timeline not contiguous');
  if((i%o.turnsPerVisit)<o.turnsPerVisit-1&&!x.model_l?.learner_message)throw Error('FIX1B.1 missing learner reply for continuation');
  seen.add(x.learner_observation_id);
 }
 if(trace.failure?.last_request?.step!==21||trace.failure?.last_request?.role!=='A')throw Error('FIX1B.1 unexpected last failed step');
 const h=trace.learner_histories?.RUNE;
 if(!h||!Array.isArray(h.observations)||h.observations.length!==21||!Array.isArray(h.learner_model_events)||h.learner_model_events.length!==20||!Array.isArray(h.memory_events)||h.memory_events.length!==20)throw Error('FIX1B.1 missing RUNE model history');
 return {completed_steps:timeline.length,next_step:timeline.length+1,remaining_steps:total-timeline.length,uncommitted_observation_ids:h.observations.filter(x=>!seen.has(x.id)).map(x=>x.id)};
}

export function rehydratePriorState(history,events){
 if(!history||!Array.isArray(events)||!events.length)throw Error('FIX1B.1 cannot reconstruct missing prior state');
 const valid=new Set(events.map(x=>x.learner_observation_id)),obs=history.observations.filter(x=>valid.has(x.id));
 if(obs.length!==events.length)throw Error('FIX1B.1 retained history differs from completed dialogue');
 const discarded=history.observations.filter(x=>!valid.has(x.id));
 if(discarded.length!==1||discarded[0].id!=='RUNE-S62-RUNE-V4-T3'||discarded[0].text!==events.at(-1).model_l?.learner_message)throw Error('FIX1B.1 expected exactly one uncommitted step-21 observation');
 const dialogue=events.map(x=>({step:x.step,learner_id:x.learner_id,case_id:x.case_id,topic_id:x.topic_id,topic_title:x.topic_title,visit_turn:x.visit_turn,learner_observation_id:x.learner_observation_id,learner:x.learner,learner_source:x.learner_source,tutor:x.tutor,probe_offered:x.probe_offered??x.probe?.question??null}));
 const versionNumbers=[0,...(history.roots??[]).flatMap(x=>(x.revisions??[]).map(y=>y.version)),...(history.relationships??[]).flatMap(x=>(x.revisions??[]).map(y=>y.version))].filter(Number.isFinite);
 return {obs:structuredClone(obs),roots:structuredClone(history.roots),relationships:structuredClone(history.relationships),learner_model_events:structuredClone(history.learner_model_events),explicit_instructions:structuredClone(history.explicit_instructions),teaching_effects:structuredClone(history.teaching_effects),memory_events:structuredClone(history.memory_events),prior_case_ids:structuredClone(history.topic_visits),dialogue,history_version:Math.max(...versionNumbers)};
}

export function summarySafeForCitation(summaries,allowedIds){
 const allowed=new Set(allowedIds??[]);
 return summaries.map(s=>({
  // Summary sources not in the bounded packet are never exposed as fresh citable IDs.
  source_observation_id:allowed.has(s.source_observation_id)?s.source_observation_id:null,
  demonstrated:(s.demonstrated??[]).map(d=>({claim:d.claim,observation_ids:(d.observation_ids??[]).filter(id=>allowed.has(id))})),
  not_yet_demonstrated:s.not_yet_demonstrated,
  conditions:s.conditions,
  observations:(s.observations??[]).map(d=>({kind:d.kind,claim:d.claim,observation_ids:(d.observation_ids??[]).filter(id=>allowed.has(id))})),
  uncertainty:s.uncertainty,provisional_summary_only:true
 }));
}

function collectIds(raw){
 const collected=[];
 const walk=(v,key)=>{
  if(Array.isArray(v)){if(['observation_ids','support_ids','counter_ids'].includes(key))for(const id of v){if(typeof id==='string')collected.push(id)}
    else if(key==='evidence_roles')for(const x of v){if(typeof x?.id==='string')collected.push(x.id)}
    else for(const x of v)walk(x,key);}
  else if(isObj(v))for(const [k,x] of Object.entries(v))walk(x,k);
 };walk(raw,'');return [...new Set(collected)];
}
export function rejectionDetails({step,attempt,error,raw,allowed,input}){
 let parsed=null;try{parsed=JSON.parse(raw)}catch{}
 const cited=parsed?collectIds(parsed):[],allowedSet=new Set(allowed??[]);
 return {step,attempt,message:String(error?.message??error).slice(0,450),allowed_observation_ids:[...(allowed??[])],cited_observation_ids:cited,disallowed_observation_ids:cited.filter(x=>!allowedSet.has(x)),response_sha256:hash(Buffer.from(String(raw))),raw_model_response:String(raw).slice(0,50000),model_input_sha256:hash(Buffer.from(JSON.stringify(input))),raw_response_retained_for_diagnosis:true,automated_scientific_correctness:false};
}
