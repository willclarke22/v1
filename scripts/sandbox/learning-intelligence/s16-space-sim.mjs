#!/usr/bin/env node
/** S1.6A: isolated, synthetic, stateful Learning Space evaluation. No DB adapters or learner writes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createRequire} from 'node:module';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../../');
const BASE='http://127.0.0.1:3001';
const SHADOW=BASE+'/api/sandbox/probe-lab/local-assessment/myway-shadow-s15';
const ASS=BASE+'/api/sandbox/probe-lab/local-assessment/openai';
const SOURCE='s16-seed.json';
const rootReport=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16');
const stableUUID=s=>{const h=crypto.createHash('sha256').update('myway-s16:'+s).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const scalar=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const words=x=>new Set(String(x||'').toLowerCase().match(/[a-z]{3,}/g)?.filter(t=>!new Set(['that','with','have','does','what','when','this','into','they','their','them','from','only','some','more','about','were','understand','confused','because','which','thing','know','mechanism','during','while','just','then']).has(t))??[]);
const overlap=(a,b)=>{const A=words(a),B=words(b);if(!A.size||!B.size)return 0;let intersection=0;for(const x of A)if(B.has(x))intersection++;return +(intersection/Math.sqrt(A.size*B.size)).toFixed(4);};
const clone=x=>structuredClone(x);
const safeText=x=>String(x??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').slice(0,2000);
function flags(argv){
 const f={mode:'offline',limit:null,model:'gpt-4.1-mini',allowSpend:false,budget:null,help:false,injectFault:false};
 const pairs={'--mode':'mode','--limit':'limit','--model':'model','--budget-usd':'budget'};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];if(x==='--help'){f.help=true;continue;}if(x==='--allow-spend'){f.allowSpend=true;continue;}if(x==='--inject-fault'){f.injectFault=true;continue;}
  if(!pairs[x]||i===argv.length-1)throw Error('Unknown or incomplete option: '+x);f[pairs[x]]=argv[++i];
 }
 if(!['offline','model'].includes(f.mode)||!['gpt-4.1-mini','gpt-4o-mini'].includes(f.model))throw Error('Unsupported mode/model');
 if(f.limit!==null&&(!/^[1-9]\d*$/.test(f.limit)||Number(f.limit)>50))throw Error('Invalid --limit');
 f.limit=f.limit===null?(f.mode==='model'?2:18):Number(f.limit);
 if(f.mode==='model'){
  if(f.injectFault)throw Error('Fault injection is permitted only in offline simulation');
  if(!f.allowSpend||f.budget===null||!/^(?:\d+)(?:\.\d{1,6})?$/.test(f.budget)||Number(f.budget)<0.03||Number(f.budget)>0.5||f.limit>6)throw Error('MODEL REFUSED: --allow-spend, --budget-usd 0.03..0.50, and --limit <= 6 required');
  f.budget=Number(f.budget);
 }else if(f.allowSpend||f.budget!==null)throw Error('Offline mode forbids spending flags');
 return f;
}
export {flags};
function readSeed(){const s=JSON.parse(fs.readFileSync(path.join(HERE,SOURCE),'utf8'));
 if(s.schema!=='myway-s16-synthetic-space-v1'||s.topics?.length<8||s.turns?.length<12)throw Error('Invalid S1.6 synthetic seed');
 for(const t of s.topics){if(!/^sim-[a-z]+$/.test(t.topic_id)||!Array.isArray(t.events)||t.events.length<2)throw Error('Invalid seeded topic');}
 if(new Set(s.topics.map(t=>t.topic_id)).size!==s.topics.length)throw Error('Duplicate topic ID');
 return s;
}
function stateFromSeed(s){return {schema:'myway-s16-isolated-state-v1',topics:clone(s.topics),links:[],correctionProposals:[],audit:[],sequence:0};}
function audit(state,kind,change,reason){state.audit.push({seq:++state.sequence,kind,change,reason});}
function countEvents(state){return state.topics.reduce((n,t)=>n+t.events.length,0);}
function topicFromAssessment(state,assessment){return state.topics.find(t=>t.topic_label.toLowerCase()===String(assessment.topic_name).toLowerCase())||null;}
function offlineAssess(turn){const s=turn.scripted_assessment;return {topic_name:s.topic_name,root_problem:s.root_problem,evidence_quote:turn.message,root_problem_confidence:0.9,next_action:'proceed',clarifying_question:'',confusion:6,insight:1,source:'SCRIPTED_OFFLINE_ASSESSMENT_NOT_MODEL'};}
function teacherOffline(a){return {teaching_strategy:`[OFFLINE STUB — NOT MODEL B] A teacher would explain the mechanism behind: ${a.root_problem}.`,next_step:'Run paid model mode to evaluate naturalness and factual quality.',visual_intent:'none',source:'OFFLINE_STUB_NOT_TEACHING_EVIDENCE'};}
function offlineRetrieve(state,a){const preferred=topicFromAssessment(state,a);const rankings=state.topics.map(t=>{
  const fit=overlap(a.topic_name,t.topic_label+' '+t.domain+' '+(t.aliases||[]).join(' '));
  const roots=t.events.map(e=>({event_id:e.event_id,root_problem:e.root_problem,topic_id:t.topic_id,difficulty_id:e.difficulty_id,similarity:overlap(a.root_problem,e.root_problem)})).sort((x,y)=>y.similarity-x.similarity);
  return {topicId:t.topic_id,topicLabel:t.topic_label,topicFit:fit,roots,best:roots[0]?.similarity??0};
 }).sort((x,y)=>y.best-x.best||y.topicFit-x.topicFit);
 // Offline routing uses a scripted topic to isolate state-machine behavior. Never count it as retrieval accuracy.
 const chosen=rankings.find(x=>x.topicId===preferred?.topic_id)??rankings[0];
 return {retrievalStatus:'offline_oracle_topic_and_lexical_root',topicId:chosen?.topicId??null,topicLabel:chosen?.topicLabel??null,topicCandidates:rankings.map(x=>({topicId:x.topicId,topicLabel:x.topicLabel,bestEventSimilarity:x.best,topicSimilarity:x.topicFit})),events:chosen?.roots??[],diagnostics:{warning:'Topic sourced from scripted fixture; NOT evidence of autonomous routing',rivals:rankings.slice(0,3).map(x=>({topicId:x.topicId,score:x.best}))}};
}
function offlineMemory(found,turn){const top=found.events[0];
 // Selected scenario transitions exercise memory CREATE/REFINE code paths only.
 // They are NEVER sent to models and are excluded from any accuracy claim.
 const planned=turn.scripted_simulation_transition;
 if(planned?.identity==='distinct')return {identity:'distinct',interpretation:'not_applicable',anchor_event_id:'',identity_rationale:'EXPLICIT SCRIPTED OFFLINE TRANSITION to exercise distinct-creation mechanics; NOT a model outcome',evidence_basis:'',missing_evidence:'',source:'SCRIPTED_SCENARIO_OUTCOME'};
 if(planned?.identity==='same'&&planned.interpretation==='refine'&&top){return {identity:'same',interpretation:'refine',anchor_event_id:top.event_id,identity_rationale:'EXPLICIT SCRIPTED OFFLINE TRANSITION to exercise refinement mechanics; NOT a model outcome',evidence_basis:top.root_problem,proposed_hypothesis:turn.scripted_assessment.root_problem,missing_evidence:'',source:'SCRIPTED_SCENARIO_OUTCOME'};}
if(!top)return {identity:'uncertain',interpretation:'not_applicable',anchor_event_id:'',identity_rationale:'No eligible historical event',missing_evidence:'Need a validated topic and a historical candidate before resolving identity'};
 const second=found.events[1];const close=second&&top.similarity-second.similarity<.06;
 if(top.similarity>=.55&&!close)return {identity:'same',interpretation:'retain',anchor_event_id:top.event_id,identity_rationale:'Offline lexical-overlap heuristic only, not a semantic judgment',evidence_basis:top.root_problem,missing_evidence:''};
 if(top.similarity<.18)return {identity:'distinct',interpretation:'not_applicable',anchor_event_id:'',identity_rationale:'Offline weak-token-overlap heuristic only, not expert validation',missing_evidence:''};
 return {identity:'uncertain',interpretation:'not_applicable',anchor_event_id:'',identity_rationale:'Offline lexical heuristic cannot justify a safe identity decision',missing_evidence:'More distinguishing learner evidence and a semantic model judgment are needed'};
}
async function post(url,payload,timeout=45000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
 try{const r=await fetch(url,{method:'POST',redirect:'error',cache:'no-store',signal:controller.signal,headers:{Origin:BASE,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const body=await r.json().catch(()=>({}));if(!r.ok){const e=Error(`HTTP ${r.status}: ${safeText(body.error)}`);e.usage=body.usage;throw e;}return body;
 }finally{clearTimeout(timer);}
}
async function initModels(budget){
 const [{loadRuntime},{loadS13},{CostLedger,parseUsage},{rankFixtureEvidence,evidenceIntegrity},{scoreEvents,chooseHistory},{shadowAssessmentGate}]=await Promise.all([
  import('./runtime-loader.mjs'),import('./s13-evaluator.mjs'),import('./ledger.mjs'),import('./s151-retrieval.mjs'),import('./s14-flow.mjs'),import('./s15-flow.mjs')]);
 const require=createRequire(import.meta.url);const ts=require(path.join(ROOT,'node_modules/typescript/lib/typescript.js'));
 const p=path.join(ROOT,'sandbox/probe-lab/learning-space/myway-shadow-voice-s15.ts');const compiled=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});const exports={};new Function('exports',compiled.outputText)(exports);
 return {runtime:loadRuntime(ROOT),s13:loadS13(ROOT),ledger:null,CostLedger,parseUsage,rankFixtureEvidence,evidenceIntegrity,scoreEvents,chooseHistory,shadowAssessmentGate,voice:exports,budget};
}
async function paid(deps,stage,url,payload,model,turnId){deps.ledger.reserve(stage,model);let data=null,error=null;const began=performance.now();
 try{data=await post(url,payload);}catch(e){error=e;}
 const row=deps.ledger.record({caseId:turnId,stage,model:data?.model??model,usage:deps.parseUsage(data??(error?.usage?{usage:error.usage}:null)),elapsedMs:performance.now()-began,status:error?'failed':'ok'});
 if(error)throw Error(`${stage}: ${error.message}; provider usage may be unknown, STOP`);
 if(!deps.ledger.summary().complete)throw Error(`${stage}: unknown token billing, STOP`);
 return {data,cost:row.estimatedUsd};
}
async function liveAssess(deps,turn,model){const r=deps.runtime;
 const {data,cost}=await paid(deps,'model_a_'+turn.turn_id,ASS,{userPrompt:r.assessment.buildUserPrompt(turn.message,null),systemPrompt:r.assessment.ASSESSMENT_SYSTEM_PROMPT+deps.voice.S15_ASSESSMENT_ADDENDUM,responseSchema:r.assessment.ASSESSMENT_SCHEMA,model},model,turn.turn_id);
 const checked=r.assessment.validateAssessment(data.raw,turn.message);if(!checked.assessment)throw Error('Model A validation: '+checked.error);
 const a=checked.assessment,route=r.assessment.resolveAssessmentRoute(a,null,.65);
 const gate=deps.shadowAssessmentGate(a,'myway',turn.message,null,route);
 return {assessment:a,gate,cost};
}
async function liveTeacher(deps,turn,a,model){const context={topic:String(a.topic_name).slice(0,110),root_problem:String(a.root_problem).slice(0,500),evidence_quote:String(a.evidence_quote).slice(0,450),original_statement:turn.message.slice(0,2500),clarification_answer:''};
 const {data,cost}=await paid(deps,'model_b_'+turn.turn_id,SHADOW,{format:'myway_s15_shadow_model_v1',stage:'teaching',context,model},model,turn.turn_id);
 let t;try{t=JSON.parse(data.raw);}catch{throw Error('Model B returned invalid JSON');}
 if(!t||Object.keys(t).sort().join('|')!=='next_step|teaching_strategy|visual_intent'||['next_step','teaching_strategy','visual_intent'].some(k=>typeof t[k]!=='string'||!t[k].trim()||t[k].length>620))throw Error('Model B invalid teaching schema');
 return {teaching:t,cost};
}
async function liveRetrieve(deps,state,a){const b=state.topics.map(t=>({topic_id:t.topic_id,topic_label:t.topic_label,domain:t.domain,events:t.events.map(e=>({event_id:e.event_id,root_problem:e.root_problem,difficulty_id:e.difficulty_id}))}));
 const found=await deps.rankFixtureEvidence(a,{bank:b});const scored=await deps.scoreEvents(a.root_problem,found.events);const chosen=deps.chooseHistory(scored,found.topicId,5);const integrity=deps.evidenceIntegrity(found,chosen);return {found,chosen,integrity};
}
async function liveMemory(deps,turn,a,found,chosen,model){if(!chosen.length)return {decision:null,why:'no_history'};
 const input=deps.s13.s13Input({topic_label:found.topicLabel,learner_statement:turn.message.slice(0,600),proposed_root_problem:a.root_problem,historical_observations:chosen.map(e=>({event_id:e.event_id,root_problem:e.root_problem})),max_similarity:Math.max(...chosen.map(e=>e.similarity))});
 if(!deps.s13.validS13Input(input))throw Error('Invalid Model C historical evidence payload');
 const {data,cost}=await paid(deps,'model_c_'+turn.turn_id,SHADOW,{format:'myway_s15_shadow_model_v1',stage:'memory',context:input,model},model,turn.turn_id);
 const p=deps.s13.parseS13(data.raw,input);if(!p.decision)throw Error('Model C validation: '+p.error);
 return {decision:p.decision,cost};
}
const topicForEvent=(state,id)=>state.topics.find(t=>t.events.some(e=>e.event_id===id))??null;
function evolve(state,turn,a,found,d){const topic=state.topics.find(t=>t.topic_id===found.topicId);if(!topic)return {kind:'hold',reason:'Topic unconfirmed'};
 if(!d||d.identity==='uncertain')return {kind:'hold',reason:d?.missing_evidence??'No confident identity verdict'};
 if(d.identity==='same'){
  const origin=topic.events.find(e=>e.event_id===d.anchor_event_id);
  if(!origin)return {kind:'hold',reason:'Historical anchor is not in selected topic; possible cross-topic mismatch'};
  const event={event_id:stableUUID('turn:'+turn.turn_id),difficulty_id:origin.difficulty_id,root_problem:a.root_problem,origin:'synthetic_simulated_turn',turn_id:turn.turn_id,learner_statement:turn.message};
  if(topic.events.some(e=>e.event_id===event.event_id))throw Error('Duplicate generated event');
  topic.events.push(event);
  if(d.interpretation==='refine'&&String(d.proposed_hypothesis||'').trim()){
   const old=origin.root_problem;event.root_problem=d.proposed_hypothesis;event.previous_hypothesis=old;
   audit(state,'refined_same_difficulty',{topic_id:topic.topic_id,difficulty_id:origin.difficulty_id,from:old,to:event.root_problem,turn_id:turn.turn_id},'Model C proposed refinement; history preserved');
   return {kind:'refine',difficultyId:origin.difficulty_id,newEventId:event.event_id};
  }
  audit(state,'reused_difficulty',{topic_id:topic.topic_id,difficulty_id:origin.difficulty_id,turn_id:turn.turn_id},d.identity_rationale);
  return {kind:'reuse',difficultyId:origin.difficulty_id,newEventId:event.event_id};
 }
 // Distinct verdict is only permitted after a historical comparison; simulation writes isolated JSON only.
 const difficulty=stableUUID('new-difficulty:'+turn.turn_id),eventId=stableUUID('turn:'+turn.turn_id);
 topic.events.push({event_id:eventId,difficulty_id:difficulty,root_problem:a.root_problem,learner_statement:turn.message,turn_id:turn.turn_id,origin:'synthetic_simulated_turn'});
 audit(state,'created_difficulty',{topic_id:topic.topic_id,difficulty_id:difficulty,event_id:eventId,turn_id:turn.turn_id},d.identity_rationale);
 return {kind:'create_distinct',difficultyId:difficulty,newEventId:eventId};
}
function directTopicMentions(state,message){const lower=message.toLowerCase();return state.topics.filter(t=>[
  t.topic_label,...(t.aliases||[])].some(n=>{const v=n.toLowerCase();return v.length>=4&&lower.includes(v);}));}
function relationProposals(state,turn){const m=turn.message.toLowerCase();
 // Mere co-mention of two domains is not evidence of a relationship.
 if(!/\b(analogy|compared?|comparison|similar|different|differ|related|both|versus|unlike|like|share a name|depends on|requires|prerequisite)\b/.test(m))return [];
 const involved=directTopicMentions(state,turn.message);if(involved.length<2)return [];
 const result=[];let kind='untyped_relationship_candidate';
 if(/\b(like|analogy|similar|comparison)\b/.test(m))kind='analogy';
 if(/\b(differ|difference|unlike|not the same)\b/.test(m))kind=kind==='analogy'?'analogy_with_limits':'contrast';
 if(/\b(depends on|requires|prerequisite)\b/.test(m))kind='prerequisite_hypothesis';
 for(let i=0;i<involved.length;i++)for(let j=i+1;j<involved.length;j++){
  const [a,b]=[involved[i],involved[j]];const key=[a.topic_id,b.topic_id].sort().join('|')+'|'+kind;
  let rel=state.links.find(x=>x.key===key);if(!rel){rel={key,from:a.topic_id,to:b.topic_id,type_candidate:kind,status:'unverified_proposal',evidence_turn_ids:[],evidence_quotes:[],direction:'unknown',novel_type_candidate:!['analogy','prerequisite_hypothesis'].includes(kind)};state.links.push(rel);}
  if(!rel.evidence_turn_ids.includes(turn.turn_id)){rel.evidence_turn_ids.push(turn.turn_id);rel.evidence_quotes.push(turn.message);}
  audit(state,'relationship_hypothesis',{key,type_candidate:kind,turn_id:turn.turn_id},'Explicit cross-topic learner wording; no autonomous relationship verification');
  result.push(clone(rel));
 }
 return result;
}
function correctionEvidence(state,turn){const message=turn.message.toLowerCase();
 if(!/\b(not confused|never (had trouble|confused)|wasn.t confused|specifically|not .{0,50} but)\b/.test(message))return [];
 const candidates=[];
 for(const t of state.topics)for(const e of t.events){
  if(e.origin!=='synthetic_simulated_turn'||e.turn_id===turn.turn_id)continue;
  const reasonTerms=[...words(e.root_problem)].filter(w=>w.length>4&&message.includes(w));
  if(reasonTerms.length===0)continue;
  const key='repair-'+e.event_id+'-'+turn.turn_id;
  if(state.correctionProposals.some(x=>x.id===key))continue;
  const p={id:key,prior_event_id:e.event_id,prior_turn_id:e.turn_id,topic_id:t.topic_id,current_turn_id:turn.turn_id,status:'NEEDS_INDEPENDENT_REVIEW',evidence_quote:turn.message,overlapping_terms:reasonTerms,proposed_action:'reassess_previous_difficulty_link',automatic_repair_applied:false};
  state.correctionProposals.push(p);candidates.push(p);
  audit(state,'repair_candidate_detected',{prior_event_id:e.event_id,current_turn_id:turn.turn_id},'Contrasting learner statement; re-evaluation needed before repair');
 }
 return candidates;
}
function teacherHeuristics(t){if(!t||String(t.source||'').includes('STUB'))return {evaluated:false,reason:'No actual Model B response'};
 const s=t.teaching_strategy||'';return {evaluated:true,possible_canned_praise:/^(great question|good question|excellent question|absolutely|of course)[!,. ]/i.test(s),possible_unwarranted_mastery:/\b(you (clearly|already|fully) understand|you have mastered)\b/i.test(s),rough_sentence_count:(s.match(/[.!?](?:\s|$)/g)||[]).length,note:'Style flags only; not an educational accuracy or naturalness score'};}
function formatReport(r){const lines=[];const push=(...s)=>lines.push(...s);
 push('MYWAY S1.6A — SYNTHETIC LEARNING SPACE EVOLUTION','='.repeat(79),`Mode: ${r.mode} | Generated: ${r.generatedAt}`,'LOCAL SIMULATION ONLY: never wrote to Supabase, cloud, original v1 or actual learner memory.',r.mode==='offline'?'OFFLINE: assessment, teaching and identity are scripted/lexical stubs. These are NOT model tests.':'MODEL: GPT-4.1 mini or selected allowed model; teacher output is real provider output.','',`Starting topics: ${r.before.topicCount} | Initial historical events: ${r.before.eventCount}`,`End topics: ${r.after.topicCount} | End historical events: ${r.after.eventCount}`,`Turn count processed: ${r.turns.length} | Memory audit events: ${r.audit.length} | Relationship hypotheses: ${r.relationships.length} | Correction candidates: ${r.corrections.length}`,'', '===== PER-TURN TRACE =====');
 for(const t of r.turns){push('',`TURN ${t.turnId}`, '-'.repeat(79),`LEARNER: ${t.message}`,`MODEL A / ASSESSMENT [${t.assessmentOrigin}]`, `  Topic: ${t.assessment?.topic_name??'-'}`,`  Root: ${t.assessment?.root_problem??'-'}`,`  Gate: ${t.gate?.route??'-'} ${t.gate?.reason??''}`, 'MODEL B / TEACHER',`  ${t.teaching?.teaching_strategy??'(not run)'}`,`  Next step: ${t.teaching?.next_step??'-'}`,`  Visual intent: ${t.teaching?.visual_intent??'-'}`,`  Style flags: ${JSON.stringify(t.teacherStyle??{})}`,'RETRIEVAL',`  Selected topic: ${t.retrieval?.topicLabel??'-'}`,`  Status: ${t.retrieval?.retrievalStatus??'-'}`,`  Top rivals: ${JSON.stringify(t.retrieval?.topicCandidates?.slice(0,3)??[])}`,`  Integrity: ${JSON.stringify(t.integrity??{})}`,'MODEL C / MEMORY',`  Identity: ${t.modelC?.identity??'not called'}`,`  Interpretation: ${t.modelC?.interpretation??'-'}`,`  Anchor: ${t.modelC?.anchor_event_id??'-'}`,`  Evidence: ${t.modelC?.evidence_basis??t.modelC?.identity_rationale??'-'}`,`  Memory action: ${JSON.stringify(t.action)}`,`  Relationships: ${JSON.stringify(t.relations)}`,`  Correction candidates: ${JSON.stringify(t.corrections)}`);
  if(t.faultInjection)push(`  INJECTED FAULT (SYNTHETIC TEST ONLY): ${JSON.stringify(t.faultInjection)}`);
  if(t.error)push(`  ERROR: ${t.error}`);
 }
 push('','===== FINAL TOPIC / DIFFICULTY STATE =====');
 for(const topic of r.finalState.topics){const ids=new Map();for(const e of topic.events){if(!ids.has(e.difficulty_id))ids.set(e.difficulty_id,[]);ids.get(e.difficulty_id).push(e);}push(`\n${topic.topic_label} [${topic.topic_id}] | ${ids.size} difficulty identities | ${topic.events.length} observations`);for(const [id,events] of ids)push(`  ${id}: ${events.at(-1).root_problem} (${events.length} evidence records)`);}
 push('','===== RELATIONSHIP HYPOTHESES (NOT VERIFIED) =====',...r.relationships.map(x=>JSON.stringify(x)),'','===== CORRECTION CANDIDATES (NO AUTOMATIC REPAIRS) =====',...r.corrections.map(x=>JSON.stringify(x)),'','===== AUDIT TRAIL =====',...r.audit.map(x=>JSON.stringify(x)),'','===== ESTIMATED MODEL COST =====',JSON.stringify(r.cost,null,2),'','===== IMPORTANT LIMITATIONS =====','Offline assessment, teacher, topic choice, and selected state transitions are scripted; not evidence of model quality.','Real model runs use synthetic ownerless fixture memory, not Supabase or RLS.','Relationships require independent semantic verification; untyped or novel links are only hypotheses.','Correction candidates are not evidence of successful autonomous repair.','Educational quality and MyWay tone require human review, not only mechanical style flags.','Cost is estimated from usage records and admission budgeting is not a provider billing cap.');
 return lines.join('\n')+'\n';
}
export async function runSimulation(f,{seed=readSeed(),silent=false,modelAdapter=null}={}){
 const state=stateFromSeed(seed),before={topicCount:state.topics.length,eventCount:countEvents(state)};
 const result={schema:'myway-s16a-stateful-simulation-v1',mode:f.mode,generatedAt:new Date().toISOString(),before,after:null,turns:[],relationships:null,corrections:null,audit:null,finalState:null,cost:null,errors:[],safeguards:{databaseWrites:0,cloudWrites:0,project:'experiment_only',referenceExpectedNotPassedToModels:true}};
 let deps=null;
 if(f.mode==='model'){deps=modelAdapter??await initModels(f.budget);deps.ledger??=new deps.CostLedger(deps.runtime.cost,f.budget);}
 for(const turn of seed.turns.slice(0,f.limit)){
  const tr={turnId:turn.turn_id,message:turn.message,assessmentOrigin:f.mode==='model'?'LIVE_MODEL_A':'OFFLINE_SCRIPTED',assessment:null,gate:null,teaching:null,teacherStyle:null,retrieval:null,integrity:null,modelC:null,action:{kind:'not_started'},relations:[],corrections:[],error:null,referenceForEvaluationOnly:turn.expected};
  try{
   let a;
   if(f.mode==='model'){
    const x=await liveAssess(deps,turn,f.model);a=x.assessment;tr.gate=x.gate;
   }else{a=offlineAssess(turn);tr.gate={route:'proceed',reason:'Scripted offline gate; no Model A validation'};}
   tr.assessment=a;
   if(tr.gate.route!=='proceed'){
    tr.action={kind:'hold_for_clarification',reason:tr.gate.question??'Assessment requires clarification'};
    result.turns.push(tr);continue;
   }
   tr.teaching=f.mode==='model'?(await liveTeacher(deps,turn,a,f.model)).teaching:teacherOffline(a);
   tr.teacherStyle=teacherHeuristics(tr.teaching);
   let found,chosen,integrity;
   if(f.mode==='model'){
    const out=await liveRetrieve(deps,state,a);({found,chosen,integrity}=out);
   }else{found=offlineRetrieve(state,a);chosen=found.events.slice(0,5);integrity={status:'offline_only',reason:'No real model or embedding evidence'};}
   tr.retrieval={retrievalStatus:found.retrievalStatus,topicId:found.topicId,topicLabel:found.topicLabel,topicCandidates:found.topicCandidates,selectedEvents:chosen.slice(0,5)};
   tr.integrity=integrity;
   if(f.mode==='model'){
    if(integrity.status!=='candidate_ready'){tr.action={kind:'memory_hold',reason:integrity.reason};}
    else{
     const c=await liveMemory(deps,turn,a,found,chosen,f.model);tr.modelC=c.decision;
     tr.action=evolve(state,turn,a,found,c.decision);
    }
   }else{tr.modelC=offlineMemory(found,turn);tr.action=evolve(state,turn,a,found,tr.modelC);}
   if(f.injectFault&&f.mode==='offline'&&turn.turn_id==='T07'&&tr.action.newEventId){
    const ph=state.topics.find(t=>t.topic_id==='sim-photosynthesis');
    const altered=ph?.events.find(e=>e.event_id===tr.action.newEventId);
    const wrong=ph?.events.find(e=>e.root_problem.includes('ATP and NADPH')&&e.origin==='synthetic_seed');
    if(altered&&wrong){const originally=altered.difficulty_id;altered.difficulty_id=wrong.difficulty_id;
     tr.faultInjection={kind:'deliberate_false_merge',turn_id:turn.turn_id,original_difficulty_id:originally,wrong_difficulty_id:wrong.difficulty_id};
     audit(state,'EXPLICIT_SYNTHETIC_FAULT_INJECTION',tr.faultInjection,'For evaluation only: deliberately wrong local identity link, not an algorithm decision');}
   }
   tr.relations=relationProposals(state,turn);
   tr.corrections=correctionEvidence(state,turn);
  }catch(e){tr.error=safeText(e?.message??e);tr.action={kind:'stopped_on_error'};result.errors.push({turnId:turn.turn_id,error:tr.error});result.turns.push(tr);break;}
  result.turns.push(tr);
  if(!silent)console.log(`TURN ${turn.turn_id} | topic=${tr.assessment?.topic_name??'-'} | teacher=${tr.teaching?'yes':'no'} | memory=${tr.action.kind} | relation_hypotheses=${tr.relations.length} | corrections=${tr.corrections.length}`);
 }
 result.after={topicCount:state.topics.length,eventCount:countEvents(state)};
 result.relationships=state.links;result.corrections=state.correctionProposals;result.audit=state.audit;result.finalState=state;
 result.cost=deps?.ledger?.summary()??{attemptedCalls:0,knownEstimatedUsd:0,complete:true,notInvoice:true};
 result.costRows=deps?.ledger?.rows??[];
 return result;
}
function reportPath(){return path.join(rootReport,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));}
export function writeReport(r,directory=reportPath()){
 const dir=path.resolve(directory);if(!dir.startsWith(rootReport+path.sep))throw Error('Report directory must remain under ignored S1.6 report root');
 if(fs.existsSync(dir))throw Error('Refusing to overwrite existing report');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(dir,'LEARNING_SPACE_SIMULATION.txt'),formatReport(r),{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(dir,'trace.json'),JSON.stringify(r,null,2)+'\n',{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(dir,'final-state.json'),JSON.stringify(r.finalState,null,2)+'\n',{flag:'wx',mode:0o600});
 return dir;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const f=flags(process.argv.slice(2));if(f.help){console.log('S1.6A: node scripts/sandbox/learning-intelligence/s16-space-sim.mjs [--mode offline|model] [--limit N] [--allow-spend --budget-usd 0.03..0.50] [--model gpt-4.1-mini|gpt-4o-mini] [--inject-fault (offline only)]. Offline: scripted A/B and lexical C. Model: real A/B/C, MiniLM, no Supabase writes.');}
 else{
  const current=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/sandbox/current-local-release.json'),'utf8'));
  if(current.release!=='v37d2c7a3s12'||!fs.existsSync(path.join(ROOT,'scripts/sandbox/v37d2c7a3s151/installation.json')))throw Error('Wrong release or missing S1.5.1 overlay');
  console.log(`S1.6A synthetic Learning Space | ${f.mode} | turns=${f.limit} | LIVE DATABASE WRITES=0`);
  if(f.mode==='model')console.log(`PAID opt-in, model=${f.model}, admission USD ${f.budget}, up to ${f.limit*3} intended model calls; not a hard provider billing cap`);
  const r=await runSimulation(f);const dir=writeReport(r);
  console.log(`REPORT (open in Notepad): ${path.join(dir,'LEARNING_SPACE_SIMULATION.txt')}`);
  console.log(`JSON trace: ${path.join(dir,'trace.json')}`);
  console.log(`COST: ${JSON.stringify(r.cost)}`);
  if(r.errors.length)process.exitCode=2;
 }
 }catch(e){console.error('S1.6A REFUSED: '+safeText(e?.message??e));process.exitCode=1;}
}
