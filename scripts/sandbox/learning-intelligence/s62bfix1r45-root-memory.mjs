/** R4.5 root-memory source extraction, validation, semantic candidate ranking and backfill application.
 * Root mechanisms are MODEL HYPOTHESES, not diagnoses or independently established deficits.
 * No raw model requests, credentials or provider execution in this module.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {indexTexts} from './s62bfix1r3-retrieval.mjs';
import {cosine} from './s62b-retrieval.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
export const ROOT=path.resolve(HERE,'../../..');
export const OUTPUT=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
export const SESS_ID=/^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
export const sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
export const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{mode:0o600});
export const clone=x=>structuredClone(x);
export function assert(ok,msg){if(!ok)throw Error('R45: '+msg);}
export function sessionPath(id){assert(typeof id==='string'&&SESS_ID.test(id),'invalid session ID');return path.join(OUTPUT,id);}
export function loadState(session){const dir=sessionPath(session),file=path.join(dir,'state.json');assert(fs.existsSync(file),'session has no completed turns');const state=read(file);assert(state.schema==='myway_goldloop_human_v1'&&state.learner===session&&Array.isArray(state.topics)&&Array.isArray(state.turns)&&Array.isArray(state.observations)&&Array.isArray(state.records)&&Number.isInteger(state.version),'unsupported learner state');return {dir,file,state};}
export function pendingExists(dir){for(const name of ['turns','retries','root-backfill']){const p=path.join(dir,name);if(fs.existsSync(p)&&fs.readdirSync(p).some(x=>x.endsWith('.pending.json')))return true;}return false;}
const str={type:'string'},arr=items=>({type:'array',items}),obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const hypothesis=obj({topic_id:str,claim:str,why_underlying:str,uncertainty:{type:'string',enum:['low','medium','high']},support_ids:arr(str),counter_ids:arr(str),alternatives:arr(str),testable_next:str});
const shared=obj({claim:str,root_indices:arr({type:'integer'}),evidence_ids:arr(str),uncertainty:{type:'string',enum:['low','medium','high']},alternative:str,next_test:str});
export const BACKFILL_SCHEMA=obj({overview:str,roots:arr(hypothesis),shared_root_candidates:arr(shared),limitations:arr(str)});
export const BACKFILL_PROMPT=`You are MyWay Model A performing ONE retrospective evidence audit, not teaching, grading or diagnosing a learner. Read the provided ORIGINAL human observations and the ORIGINAL prior Model A hypotheses as fallible historical proposals, not as facts. Propose 0..6 learner-specific ROOT CAUSE hypotheses only when a specific underlying explanatory mechanism is plausible from actual evidence. A topic name, immediate question, missing information, boredom by itself, or correct understanding alone is NOT a root cause. Preserve alternate explanations and uncertainty; cite exact observation IDs and relevant contradictory IDs. Claims about mastery require independent task evidence, not learner self-report. Do NOT infer generalized cognitive abilities, traits, clinical conditions, stable learning styles, or physical mechanisms from a few utterances. If no root is sufficiently plausible, return roots:[]. A shared_root_candidate is permitted ONLY if two distinct supported roots across two topics genuinely suggest a shared learner-specific mechanism based on DIRECT learner observations in both topics, not just analogical wording or MiniLM similarity. Never force cross-topic shared roots. root_indices reference the zero-based indices in your own roots array. Historical A-generated hypotheses are hypotheses, not evidence; ground each claim in cited original learner observations. Your JSON output must strictly match the provided schema. Do not ask follow-up questions or conduct provider calls.`;
function cut(s,n){return String(s??'').slice(0,n);}
export function backfillSources(state,turnDir,{maxTurns=24,maxObservations=90}={}){
 const recent=state.turns.slice(-maxTurns);
 const relevant=new Set(recent.map(t=>t.turn_id));
 const obs=state.observations.filter(x=>x?.id&&(/^(t\d{3,}-IN)$/.test(x.id)||x.kind==='human_teaching_experience_feedback')&&(relevant.has(String(x.id).split('-')[0])||x.kind==='human_teaching_experience_feedback')).slice(-maxObservations).map(x=>({id:x.id,topic_id:x.topic_id,kind:x.kind,actual_learner_text:cut(x.text,1400),conditions:clone(x.conditions??{}),not_independent_mastery:x.kind==='human_teaching_experience_feedback'||x.conditions?.status==='self_report_or_question_not_independently_scored'}));
 const prior=[];
 for(const t of recent){const file=path.join(turnDir,t.turn_id+'.json');if(!fs.existsSync(file))continue;const tr=read(file);if(tr.status!=='complete'||tr.session_id!==state.learner)continue;
  prior.push({turn_id:t.turn_id,topic_id:t.topic_id,original_A_hypotheses:(tr.A?.output?.interpretation?.hypotheses??[]).slice(0,8).map(s=>cut(s,850)),original_A_uncertainty:tr.A?.output?.interpretation?.uncertainty??null,original_A_observed:tr.A?.output?.observed??null,model_output_is_not_verification:true});}
 return {session:state.learner,topics:state.topics.map(x=>({id:x.id,title:x.title})),observations:obs,previous_A_interpretations:prior,already_stored_roots:state.records.filter(r=>['root','shared_root'].includes(r.type)).map(r=>({id:r.id,claim:r.claim,topics:r.topics,status:r.status})),limit_notice:'Raw saved observations and original A interpretations; no independent scored probes are assumed. Historical A prose is not learner evidence.'};
}
export function backfillPreview(state,turnDir){const sources=backfillSources(state,turnDir);return {status:'preview_only_no_writes',session:state.learner,topics:sources.topics,observation_count:sources.observations.length,available_prior_A_assessments:sources.previous_A_interpretations.length,original_hypotheses:sources.previous_A_interpretations.map(x=>({turn_id:x.turn_id,topic_id:x.topic_id,hypotheses:x.original_A_hypotheses})),existing_roots:sources.already_stored_roots,backfill_already_applied:state.records.some(r=>r.provenance?.backfill_version==='r45'),warning:'Original hypotheses are NOT automatically durable roots. A paid Model A backfill is optional and needs explicit consent.'};}
function unique(arr){return [...new Set(arr)];}
export function validateBackfill(raw,sources){
 assert(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Array.isArray(raw.roots)&&Array.isArray(raw.shared_root_candidates),'invalid backfill output');assert(raw.roots.length<=6&&raw.shared_root_candidates.length<=3,'too many root proposals');
 const topics=new Set(sources.topics.map(t=>t.id)),evidence=new Map(sources.observations.map(x=>[x.id,x]));const accepted=[],rejected=[],indexes=new Map();
 for(let i=0;i<raw.roots.length;i++){
  const r=raw.roots[i];try{
   assert(r&&topics.has(r.topic_id),'root topic not found');assert(typeof r.claim==='string'&&r.claim.trim().length>=20&&r.claim.length<=800,'root claim must be specific');assert(typeof r.why_underlying==='string'&&r.why_underlying.trim().length>=12&&r.why_underlying.length<=1500,'root mechanism missing');assert(['low','medium','high'].includes(r.uncertainty),'invalid uncertainty');
   assert(Array.isArray(r.support_ids)&&r.support_ids.length>=1&&r.support_ids.length<=12&&new Set(r.support_ids).size===r.support_ids.length,'missing/duplicate supporting evidence');assert(r.support_ids.every(id=>evidence.has(id)&&evidence.get(id).topic_id===r.topic_id),'supporting evidence must be from claim topic');
   assert(Array.isArray(r.counter_ids)&&r.counter_ids.length<=12&&r.counter_ids.every(id=>evidence.has(id)),'invalid counter evidence');
   assert(Array.isArray(r.alternatives)&&r.alternatives.length<=6&&r.alternatives.every(a=>typeof a==='string'&&a.length<=500),'invalid alternatives');
   assert(typeof r.testable_next==='string'&&r.testable_next.length<=800,'invalid future check');
   assert(!accepted.some(a=>a.topic_id===r.topic_id&&a.claim.trim().toLowerCase()===r.claim.trim().toLowerCase()),'duplicate hypothesis');
   indexes.set(i,accepted.length);accepted.push(clone(r));
  }catch(e){rejected.push({original_index:i,reason:String(e.message)});}
 }
 const sharedAccepted=[];
 for(let i=0;i<raw.shared_root_candidates.length;i++){const c=raw.shared_root_candidates[i];try{
  assert(c&&typeof c.claim==='string'&&c.claim.trim().length>=20&&c.claim.length<=800,'invalid shared claim');assert(Array.isArray(c.root_indices)&&c.root_indices.length>=2&&c.root_indices.length<=6&&new Set(c.root_indices).size===c.root_indices.length&&c.root_indices.every(x=>Number.isInteger(x)&&indexes.has(x)),'shared roots need two valid root instances');
  const topicIDs=unique(c.root_indices.map(i=>accepted[indexes.get(i)].topic_id));assert(topicIDs.length>=2,'shared roots must cross topics');
  assert(Array.isArray(c.evidence_ids)&&c.evidence_ids.length>=2&&c.evidence_ids.length<=20&&c.evidence_ids.every(id=>evidence.has(id)),'invalid shared evidence IDs');assert(topicIDs.every(t=>c.evidence_ids.some(id=>evidence.get(id).topic_id===t)),'shared root requires directly cited observations on each topic');
  assert(['low','medium','high'].includes(c.uncertainty)&&typeof c.alternative==='string'&&typeof c.next_test==='string','invalid shared fields');
  sharedAccepted.push({...clone(c),accepted_indices:c.root_indices.map(j=>indexes.get(j)),topic_ids:topicIDs});
 }catch(e){rejected.push({shared_index:i,reason:String(e.message)});}}
 return {roots:accepted,shared:sharedAccepted,rejected,model_overview:cut(raw.overview,2000),limitations:Array.isArray(raw.limitations)?raw.limitations.slice(0,8).map(x=>cut(x,500)):[]};
}
export function applyBackfill(state,validated,{date=new Date().toISOString(),traceId='bf0001'}={}){
 assert(!state.records.some(r=>r.provenance?.backfill_version==='r45'),'r45 backfill already committed; refuse duplicate import');
 const next=clone(state),occupied=new Set(next.records.map(r=>r.id));const applied=[];
 function idFor(type){const prefix=type==='shared_root'?'S':'R';for(let i=1;i<10000;i++){const id=`${state.learner}-${prefix}-${String(i).padStart(3,'0')}`;if(!occupied.has(id)){occupied.add(id);return id;}}throw Error('R45: memory ID space exhausted');}
 function add(type,claim,topics,evidence,uncertainty,metadata,instances=[]){const id=idFor(type),version=++next.version;const entry={id,type,claim,topics,possible_instances:instances,status:'provisional',uncertainty,evidence:{supports_current:unique(evidence.support_ids??[]),challenges_current:unique(evidence.counter_ids??[]),historical_context:[],context:[]},revisions:[{version,source_id:traceId,action:'create',before:null,after:{claim,status:'provisional',uncertainty,topics,possible_instances:instances},evidence:[...(evidence.support_ids??[]).map(id=>({id,role:'supports_current'})),...(evidence.counter_ids??[]).map(id=>({id,role:'challenges_current'}))],reason:'Retrospective Model A proposed hypothesis from historical learner observations; not ground truth'}],not_ground_truth:true,provenance:{backfill_version:'r45',trace_id:traceId,model_a_interpretation:true,created_at:date,...metadata}};next.records.push(entry);applied.push({id,type,topics,claim,uncertainty});return entry;}
 const ids=[];for(const root of validated.roots){const r=add('root',root.claim,[root.topic_id],{support_ids:root.support_ids,counter_ids:root.counter_ids},root.uncertainty,{mechanism:root.why_underlying,alternatives:root.alternatives,next_test:root.testable_next});ids.push(r.id);}
 for(const sh of validated.shared){add('shared_root',sh.claim,sh.topic_ids,{support_ids:sh.evidence_ids,counter_ids:[]},sh.uncertainty,{alternative:sh.alternative,next_test:sh.next_test,explicitly_tentative:true},sh.accepted_indices.map(i=>ids[i]));}
 // Marker also guards against accidentally requesting the same paid import again when no root was justified.
 next.root_backfill_history=[...(next.root_backfill_history??[]),{version:'r45',trace_id:traceId,at:date,records_created:applied.length,original_model_decision_is_not_fact:true}];
 return {state:next,applied};
}
export function rootSummary(state){return {records:state.records.filter(r=>['root','shared_root'].includes(r.type)).map(r=>({id:r.id,type:r.type,claim:r.claim,topics:r.topics,status:r.status,uncertainty:r.uncertainty,possible_instances:r.possible_instances,backfill_provenance:r.provenance??null,evidence:clone(r.evidence),revisions:clone(r.revisions),not_ground_truth:true})),backfill_history:clone(state.root_backfill_history??[]),provisional_record_count:state.records.filter(r=>['root','shared_root'].includes(r.type)&&r.status!=='historical').length};}
export async function rankCandidateRoots(state,current,{max=8,embedFn=null}={}){
 const roots=state.records.filter(r=>['root','shared_root'].includes(r.type)&&r.status!=='historical').slice(-60);
 if(!roots.length)return {method:'real_local_minilm',candidates:[],cross_topic_root_pairs:[],not_proven_relationship:true};
 const query=String(current.text??current.compact_index_text??'').slice(0,3000);const strings=[query,...roots.map(r=>r.claim)];const cache=await indexTexts(state,strings,{embedFn});const q=cache.byText(query);
 const candidates=roots.map(r=>({id:r.id,topics:r.topics,claim:r.claim,source:'stored_provisional_root',cosine_score:+cosine(q,cache.byText(r.claim)).toFixed(5),cross_topic:!r.topics.includes(current.topic_id),status:r.status,uncertainty:r.uncertainty})).sort((a,b)=>b.cosine_score-a.cosine_score).slice(0,max);
 const pairs=[];for(let i=0;i<roots.length;i++)for(let j=i+1;j<roots.length;j++){const a=roots[i],b=roots[j];if(a.topics.some(t=>b.topics.includes(t)))continue;pairs.push({root_a_id:a.id,root_b_id:b.id,root_a_topic_ids:a.topics,root_b_topic_ids:b.topics,cosine_score:+cosine(cache.byText(a.claim),cache.byText(b.claim)).toFixed(5),verified_shared_root:false});}pairs.sort((a,b)=>b.cosine_score-a.cosine_score);return {method:embedFn?'injected_test_only':'real_local_minilm',candidates,cross_topic_root_pairs:pairs.slice(0,6),cache:cache.stats,not_proven_relationship:true,warning:'Similarity is candidate discovery, never proof of a shared underlying cause; Model A must compare the direct observations and alternatives.'};
}
