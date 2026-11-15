#!/usr/bin/env node
/** FIX1C.2 full-loop sandbox. One typed memory contract, complete turn trace. Zero DB imports. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {fixturePublic} from './s16b60-fixture.mjs';
import {retrievalPacket,localMiniLM} from './s16b60-retrieval.mjs';
import {makeRequest,parseResult} from './s16b59-lean-core.mjs';
import {promptFor} from './s16b60-prompts.mjs';
import {buildBoundedInput,recordBytes} from './s16b61fix1-context.mjs';
import {selectModels,admissionEstimate,estimateCost} from './s16b61fix1-models.mjs';
import {credentials,callProvider} from './s16b54-models.mjs';
import {loadPlans,selectedSchedule,cacheEmbeddingTransport} from './s62a-fix1c-journey.mjs';
import {A_SCHEMA,A_PROMPT,parseAndValidateA,applyActions,memoryCandidates,getMemoryBrief} from './s62a-fix1c2-core.mjs';
import {makeInspector} from './s62a-fix1c2-inspector.mjs';
const require=createRequire(import.meta.url);
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../..');
const clone=x=>structuredClone(x);
const digest=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const short=(s,n=1000)=>String(s??'').slice(0,n);
const DEFAULT={mode:'plan',learner:'ELLI',visits:2,turns:3,retrieval:'lexical',modelA:'gpt-4.1-mini',modelB:'gpt-4.1-mini',modelL:'gpt-4.1-mini',memoryMode:'on',bShadow:'off',explore:'off',auditRetrieval:'off',runId:'pilot1',budget:null,allowSpend:false};
export function parseArgs(args){
 const o={...DEFAULT},keys={'--mode':'mode','--learner':'learner','--visits':'visits','--turns-per-visit':'turns','--retrieval':'retrieval','--model-a':'modelA','--model-b':'modelB','--model-l':'modelL','--memory-mode':'memoryMode','--b-shadow':'bShadow','--explore':'explore','--audit-retrieval':'auditRetrieval','--run-id':'runId','--budget-usd':'budget'};
 for(let i=0;i<args.length;i++){const a=args[i];if(a==='--allow-spend'){o.allowSpend=true;continue}if(!keys[a]||i+1>=args.length)throw Error('FIX1C2 unknown or missing option '+a);const field=keys[a];o[field]=['visits','turns','budget'].includes(field)?Number(args[++i]):args[++i]}
 if(!['plan','offline','model'].includes(o.mode)||!['ELLI','MICA','RUNE','TAVI'].includes(o.learner)||!Number.isInteger(o.visits)||o.visits<1||o.visits>6||!Number.isInteger(o.turns)||o.turns<2||o.turns>6||o.visits*o.turns>36||!['lexical','semantic','mixed'].includes(o.retrieval)||!['on','off'].includes(o.memoryMode)||!['on','off'].includes(o.bShadow)||!['on','off'].includes(o.explore)||!['on','off'].includes(o.auditRetrieval)||!/^[a-zA-Z0-9_-]{1,40}$/.test(o.runId))throw Error('FIX1C2 invalid experiment configuration');
 if(o.mode==='model'&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<=0||o.budget>8))throw Error('FIX1C2 Model requires explicit --allow-spend and --budget-usd <=8');
 if(o.mode!=='model'&&(o.allowSpend||o.budget!==null))throw Error('FIX1C2 non-paid modes reject spend flags');
 if(o.memoryMode==='off'&&o.bShadow==='on')throw Error('B shadow requires main B memory on');
 selectModels(o);return o;
}
function plan(o){
 const f=fixturePublic(),p=loadPlans(),schedule=selectedSchedule(f,p,{learner:o.learner,visits:o.visits});
 const models=selectModels(o);const costs=admissionEstimate(schedule,o.turns,{explore:o.explore,c:'off'},models);
 // Explicit same-current-turn B-memory-off shadow adds up to one B per turn.
 const extraB=o.bShadow==='on'?o.visits*o.turns:0;
 const added=extraB*(16500*0.0000004+650*0.0000016)*(models.B==='gpt-4.1'?5:1);
 const estimated=+(costs.estimated_usd+added).toFixed(6);
 return {stage:'S62A-FIX1C.2',run_id:o.runId,mode:o.mode,learner:o.learner,visits:o.visits,turns_per_visit:o.turns,total_turns:o.visits*o.turns,models:{A:models.A,B:models.B,L:models.L},retrieval:o.retrieval,model_b_memory:o.memoryMode,shadow_b_without_memory:o.bShadow,maximum_modeled_calls:costs.upper_calls+extraB,admission_estimate_usd:estimated,read_only_plan:o.mode==='plan',report_root:'.myway-patch-backups/learning-intelligence-reports/s62a-fix1c2',notes:['Admission estimate is not a billing cap','No DB writes; all learner state is in memory and reports','Fictional learner is NOT ground truth','A/B educational judgments are not automatically graded','A and B shadow share the same current evidence but only the main B steers Model L']};
}
function loadKey(){if(process.env.OPENAI_API_KEY)return;const file=path.join(ROOT,'.env.local');if(!fs.existsSync(file))return;const env=require('dotenv').parse(fs.readFileSync(file));process.env.OPENAI_API_KEY=env.OPENAI_API_KEY||env.MYWAY_OPENAI_API_KEY||'';if(!process.env.OPENAI_BASE_URL&&env.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=env.OPENAI_BASE_URL;}
function initialState(profile,f){return {learner_id:profile.learner_id,obs:[],roots:[],relationships:[],memory_records:[],history_version:0,dialogue:[],explicit_instructions:[],topics:f.topics.map(t=>({id:t.topic_id,title:t.title,cluster:t.cluster})),links:f.links,prior_case_ids:[]};}
function addObs(state,text,{id,topic,origin,probe}){
 if(!text?.trim()||state.obs.some(x=>x.id===id))throw Error('FIX1C2 duplicate/empty observation '+id);
 const row={id,topic_id:topic,text:short(text,1800),source:origin,evidence_type:origin==='model_L_response'?'synthetic_model_L_response':'curator_authored_opening',task_conditions:origin==='model_L_response'?(probe?'after_tutor_probe_unscored':'after_tutor_reply_unscored'):'curator_seed_unscored',probe:probe??null,session_id:'S62A-'+state.learner_id};state.obs.push(row);return row;
}
function evidencePacket(f,state,current,role,o,transport,wide=false){
 const c={latest_observation:current,historical_observations:state.obs.filter(x=>x.id!==current.id),provisional_roots:state.roots,learner_relationships:state.relationships,explicit_instructions:state.explicit_instructions};
 return retrievalPacket(f,c,{method:o.retrieval,role,explore:wide,semanticUrl:'http://127.0.0.1:8001/embed',semanticTransport:transport});
}
function enrichPacketWithMemoryEvidence(packet,state,current,role){
 if(role!=='A'||!state.memory_records.length)return packet;
 // Include source observations that make a visible memory claim auditable, including counterexamples.
 // Select by the same documented candidate-ranking policy; retrieval remains fallible.
 const v=packet.context.observations;
 const candidates=memoryCandidates(state,current,state.obs.map(x=>x.id),8);
 const ids=[];
 for(const c of candidates){
  const r=state.memory_records.find(x=>x.id===c.id);
  for(const id of [...r.evidence.challenges_current,...r.evidence.supports_current,...r.evidence.historical_context]){
   if(!ids.includes(id))ids.push(id);
  }
 }
 const recent=new Set(state.obs.slice(-3).map(x=>x.id));
 for(const id of ids.slice(0,6)){
  const row=state.obs.find(x=>x.id===id);if(!row||v.some(x=>x.id===id))continue;
  if(v.length>=14){const replace=v.findIndex(x=>x.id!==current.id&&!recent.has(x.id));if(replace<0)continue;v.splice(replace,1)}
  v.push(clone(row));
 }
 packet.context.coverage.included_observation_ids=v.map(x=>x.id);
 packet.context.coverage.memory_evidence_selection='candidate-backed evidence included for inspection, not scientific adjudication';
 return packet;
}
function inputFor(state,current,packet,role,priorA,o,memoryOff=false){
 // BuildBoundedInput handles recent chronology and byte budgets. The memory view below is unified.
 const raw=buildBoundedInput({state,current,packet,role,previousAnalysis:null,memoryMode:memoryOff?'off':'on'});
 const input=raw.input;
 input.context.roots=[];input.context.relationships=[]; // no contradictory memory collections in A/B request
 input.memory_candidates=memoryOff?[]:memoryCandidates(state,current,input.allowed_observation_ids,role==='A'?10:5);
 input.valid_memory_targets=input.memory_candidates.map(r=>({id:r.id,record_type:r.record_type}));
 input.memory_contract='All edit targets must match id AND record_type from valid_memory_targets; [] means no changes. Historical evidence is not current persistence.';
 if(role==='B'){
  input.model_a_provisional_advisory=memoryOff?null:priorA?{
   demonstrated:priorA.current_assessment.demonstrated.slice(0,3),
   not_demonstrated:priorA.current_assessment.not_demonstrated.slice(0,3),
   interpretations:priorA.current_assessment.interpretations.slice(0,3),
   next_teaching:priorA.next_teaching,uncertainty:priorA.current_assessment.overall_uncertainty,
   model_judgment_not_ground_truth:true}:null;
  input.learner_memory_brief=memoryOff?[]:getMemoryBrief(input.memory_candidates);
  if(memoryOff){input.explicit_instructions=[];input.context.explicit_instructions=[];}
 }
 // Any additional histories must be cut, never the current learner message or its evidence.
 while(recordBytes(input)>24000){
  if(input.memory_candidates.length){input.memory_candidates.pop();input.valid_memory_targets=input.memory_candidates.map(r=>({id:r.id,record_type:r.record_type}));if(input.learner_memory_brief)input.learner_memory_brief=getMemoryBrief(input.memory_candidates);}
  else if(input.learner_memory_brief?.length)input.learner_memory_brief.pop();
  else throw Error('FIX1C2 context too large even with memory trimmed');
 }
 return {input,diagnostics:raw.diagnostics};
}
function request(role,input,model){
 const payload=makeRequest(role,input);payload.model=model;payload.store=false;
 if(role==='A'){
  payload.messages[0].content=A_PROMPT;
  payload.response_format={type:'json_schema',json_schema:{name:'myway_s62a_fix1c2_a',strict:true,schema:A_SCHEMA}};
  payload.max_tokens=2600;
 }else if(role==='B'){
  payload.messages[0].content=promptFor('B','s59')+'\nFIX1C2: Answer the real learner naturally. A learner memory brief is provisional, not proof. Avoid routine interrogation: ask an optional probe only if it would illuminate real uncertainty. Never treat a question as mastery. Use evidence about task conditions; in memory-off mode you have no hidden learner history.';
 }else if(role==='L'){
  payload.messages[0].content+='\nFIX1C2: Fictional learner. Respond to the actual tutor in concise natural speech, not textbook-perfect prose. You may be correct, mistaken, uncertain, bored, or decline a probe. Do not know Model A memory. Changes in learning should follow the visible conversation, not hidden evaluator goals.';
 }
 if(recordBytes(payload)>33000)throw Error('FIX1C2 serialized request too large');return payload;
}
function mockResult(role,input){
 const usage={prompt_tokens:180,completion_tokens:75,total_tokens:255};
 if(role==='A')return {raw:JSON.stringify({current_assessment:{learner_intent:'Explore an explanation',assessed_task:input.probe_conditions?.question??null,task_conditions:'synthetic mock; not scientifically scored',demonstrated:[],not_demonstrated:['Independent understanding is untested'],interpretations:[],overall_uncertainty:'high'},competing_causes:[],memory_actions:[],next_teaching:{goal:'Clarify the learner request',approach:'Offer one useful example',optional_probe:null,probe_purpose:null,request_more_context:{scope:null,why:null}}}),usage};
 if(role==='B')return {raw:JSON.stringify({reply:'We can explore one example together, then compare what changed.',probe_offer:null,context_request:{scope:null,reason:null}}),usage};
 return {raw:JSON.stringify({learner_message:'I think that helps. Could we try something a bit different?',accept_probe:null,reasoning:'fictional mock'}),usage};
}
const outputDir=o=>path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62a-fix1c2',o.runId);
function storeReport(t,dir){
 fs.mkdirSync(dir,{recursive:true});const w=(n,s)=>fs.writeFileSync(path.join(dir,n),s,{mode:0o600});
 w('TRACE.json',JSON.stringify(t,null,2)+'\n');w('TURN_INSPECTOR.html',makeInspector(t));
 const lines=['# FIX1C.2 full-loop independent review','',`Run ${t.options.runId}; ${t.timeline.length} turns; complete=${t.complete}`,'',
  'Research only. This report contains fictional utterances and ungraded model assessments. Do not treat structural validity as educational correctness.',''];
 for(const e of t.timeline){lines.push(`## ${e.step}. ${e.learner_id} | ${e.topic_id}`,'',`**Learner:** ${e.learner}`,'',`**A validation:** ${e.a_validation.valid?'valid':'INVALID: '+e.a_validation.errors.join(' | ')}`,'',`**Actions:** ${JSON.stringify(e.a_decision?.memory_actions??[])}`,'',`**Memory changes:** ${JSON.stringify(e.memory_changes)}`,'',`**B:** ${e.model_b?.reply??'not run'}`,'',`**Probe:** ${e.model_b?.probe_offer??'none'}`,'');}
 w('READABLE_REVIEW.md',lines.join('\n')+'\n');
}
export async function run(o,{invoke,embeddingTransport,afterStep}={}){
 const cfg={...DEFAULT,...o};const p=plan(cfg);
 if(cfg.mode==='plan')return {plan:p};
 if(cfg.mode==='model'&&p.admission_estimate_usd>cfg.budget)throw Error('FIX1C2 estimated admission exceeds authorized budget; no paid calls');
 const f=fixturePublic(),plans=loadPlans(),schedule=selectedSchedule(f,plans,{learner:cfg.learner,visits:cfg.visits});
 const models=selectModels(cfg),paid=cfg.mode==='model';
 if(paid&&!invoke)loadKey();const auth=paid&&!invoke?credentials():null;
 const dir=outputDir(cfg);
 if(fs.existsSync(dir))throw Error('FIX1C2 run ID already has a report; choose a NEW RunId, do not overwrite');
 const embedding=cacheEmbeddingTransport(embeddingTransport??globalThis.fetch);
 if(['semantic','mixed'].includes(cfg.retrieval)||cfg.auditRetrieval==='on'){
  // Verify local embeddings BEFORE consuming the one-shot paid attempt marker.
  await localMiniLM(['FIX1C2 local embeddings health'],{url:'http://127.0.0.1:8001/embed',transport:embedding.transport});
 }
 let attempt=null;
 if(paid){
  const markerDir=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62a-fix1c2','paid-attempts');fs.mkdirSync(markerDir,{recursive:true});
  const marker=path.join(markerDir,cfg.runId+'.json');
  attempt={runId:cfg.runId,config_sha256:digest({...cfg,allowSpend:true}),started_at:new Date().toISOString(),warning:'Do not repeat this RunId after unknown provider usage; inspect partial report'};
  const fd=fs.openSync(marker,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(attempt,null,2)+'\n')}finally{fs.closeSync(fd)}
 }
 const t={schema:'myway_s62afix1c2_full_loop_v1',stage:'S62A-FIX1C.2',options:{...cfg,allowSpend:paid,models},plan:p,synthetic:true,educational_correctness_scored:false,database_writes:0,authoritative_memory_writes:0,private_persona_exposed_to_A_or_B:false,
  timeline:[],request_log:[],learner_history:null,complete:false,failure:null,cost:{model_calls:0,known_estimated_usd:0,unknown_usage:0,by_role:{A:0,B:0,L:0},not_invoice:true,hard_billing_cap:false},embedding_cache:null};
 const state=initialState(schedule[0].profile,f);
 let stage='preflight',inflight=null;
 const invokeRole=async(role,input,info={})=>{
  stage=role;
  const payload=request(role,input,models[role]);
  const row={step:inflight?.step??null,role,kind:info.kind??role,model:models[role],input_bytes:recordBytes(input),request_sha256:digest(payload),status:'prepared'};t.request_log.push(row);
  if(paid&&t.cost.known_estimated_usd>=cfg.budget)throw Error('FIX1C2 estimated budget threshold reached before next model call');
  let result;
  try{result=invoke?await invoke(role,clone(input),clone(payload),info):paid?await callProvider(payload,auth):mockResult(role,input)}catch(e){row.status='transport_unknown';throw Error('FIX1C2 provider/transport error; no automatic retry: '+String(e.message))}
  row.status='returned';
  if(paid){t.cost.model_calls++;t.cost.by_role[role]++;if(!result?.usage){t.cost.unknown_usage++;throw Error('FIX1C2 unknown returned provider usage; stop without retry')}
   const cost=estimateCost(result.usage,models[role]);t.cost.known_estimated_usd=+(t.cost.known_estimated_usd+cost).toFixed(9);row.cost_usd=cost;
   if(t.cost.known_estimated_usd>cfg.budget)throw Error('FIX1C2 estimated budget exceeded on last completed request; stop');
  }
  const raw=typeof result.raw==='string'?result.raw:JSON.stringify(result.raw??result);
  row.response_sha256=digest(raw);return {raw,payload,usage:result?.usage??null};
 };
 try{
  let step=0;
  for(const {profile,case:c} of schedule){
   state.prior_case_ids.push(c.case_id);
   let learnerText=c.latest_observation.text,origin='curator_authored_opening',previousProbe=null;
   for(let turn=1;turn<=cfg.turns;turn++){
    step++;stage='observation';
    const current=addObs(state,learnerText,{id:`${cfg.learner}-${c.case_id}-T${turn}`,topic:c.focus_topic_id,origin,probe:previousProbe});
    inflight={step,learner:current.text,current_observation_id:current.id,stage};
    const before=clone(state.memory_records);
    stage='retrieval_A';const pktA=enrichPacketWithMemoryEvidence(await evidencePacket(f,state,current,'A',cfg,embedding.transport,cfg.explore==='on'),state,current,'A');
    const aBuilt=inputFor(state,current,pktA,'A',null,cfg,false),aInput=aBuilt.input;
    let retrievalShadow=null;
    if(cfg.auditRetrieval==='on'){
     const method=cfg.retrieval==='semantic'?'lexical':'semantic';
     const shadowPacket=await evidencePacket(f,state,current,'A',{...cfg,retrieval:method},embedding.transport,false);
     retrievalShadow={alternative_method:method,ids:shadowPacket.context.coverage.included_observation_ids,metrics:shadowPacket.metrics,semantic_relevance_not_automatically_scored:true};
    }
    const aResult=await invokeRole('A',aInput);
    let a=null,aErrors=[];
    try{a=parseAndValidateA(aResult.raw,aInput.allowed_observation_ids,aInput.memory_candidates,current.id)}catch(e){aErrors=[String(e.message)]}
    const changes=a?applyActions(state,a,current.id):[];
    // An invalid action never mutates memory and is not silently repaired. B may still converse from the learner's actual observation.
    const after=clone(state.memory_records);
    const packetB=await evidencePacket(f,state,current,'B',cfg,embedding.transport,false);
    const bBuilt=inputFor(state,current,packetB,'B',a,cfg,cfg.memoryMode==='off');
    const bResult=await invokeRole('B',bBuilt.input);
    const b=parseResult(bResult.raw,'B');if(typeof b.reply!=='string'||!b.reply.trim())throw Error('FIX1C2 empty Model B reply');
    let shadow=null;
    if(cfg.bShadow==='on'){
     const offBuilt=inputFor(state,current,packetB,'B',null,cfg,true);
     // The shadow receives the exact current utterance and recent dialogue but no learner memory or A advisory.
     if(offBuilt.input.memory_candidates.length||offBuilt.input.learner_memory_brief.length||offBuilt.input.model_a_provisional_advisory!==null||offBuilt.input.context.roots.length||offBuilt.input.context.relationships.length||offBuilt.input.explicit_instructions.length)throw Error('FIX1C2 memory-off contamination');
     const offResult=await invokeRole('B',offBuilt.input,{kind:'B_MEMORY_OFF_SHADOW'});
     shadow={request:offResult.payload,reply:parseResult(offResult.raw,'B'),raw:offResult.raw,allowed_ids:offBuilt.input.allowed_observation_ids};
    }
    state.dialogue.push({learner_observation_id:current.id,topic_id:current.topic_id,learner:current.text,tutor:b.reply,probe_offered:b.probe_offer??null});
    const entry={step,learner_id:cfg.learner,case_id:c.case_id,topic_id:c.focus_topic_id,visit:c.visit_index,turn,
     learner:current.text,learner_source:origin,task_conditions:current.task_conditions,probe_conditions:current.probe,
     state_before:before,retrieval_A:{...pktA.metrics,allowed_ids:aInput.allowed_observation_ids},retrieval_shadow:retrievalShadow,
     a_request:aResult.payload,a_input_diagnostics:aBuilt.diagnostics,a_raw:aResult.raw,a_decision:a,a_validation:{valid:!!a,errors:aErrors,structural_only:true,not_scientifically_scored:true},
     memory_changes:changes,state_after:after,
     b_request:bResult.payload,b_raw:bResult.raw,model_b:b,b_shadow:shadow,
     model_l:null,scientific_judgment:'NOT_SCORED'};
    t.timeline.push(entry);inflight=null;storeReport(t,dir);
    if(turn<cfg.turns){
     const latest=state.dialogue.at(-1);
     const lInput={research_only:true,current_topic:{id:c.focus_topic_id,title:latest.topic_id},latest_tutor_reply:b.reply,actual_tutor_probe:b.probe_offer??null,visit_number:c.visit_index,turn_in_visit:turn,
      visible_recent_dialogue:state.dialogue.slice(-5).map(x=>({learner:x.learner,tutor:x.tutor,probe_offered:x.probe_offered})),
      private_fictional_state_not_truth:profile.private_fictional_state_not_truth,private_lifetime_note:'Fallible fictional profile; learner reacts only to actual conversation; not a correct answer key.',task_status:b.probe_offer?'optional_probe':'reply_to_tutor',no_reference_answer:true};
     const lResult=await invokeRole('L',lInput);const l=parseResult(lResult.raw,'L');if(!l.learner_message?.trim())throw Error('FIX1C2 empty fictional learner response');
     entry.model_l=l;storeReport(t,dir);
     learnerText=l.learner_message;origin='model_L_response';previousProbe=b.probe_offer?{question:b.probe_offer,validity:'NOT_SCIENTIFICALLY_VALIDATED',accepted:l.accept_probe,reasoning:l.reasoning}:null;
    }
    afterStep?.(clone(entry),clone(state));
   }
  }
  t.complete=true;
 }catch(e){t.failure={stage,message:String(e?.message??e).slice(0,500),completed_turns:t.timeline.length,partial:true,inflight};}
 t.embedding_cache=embedding.stats;
 t.learner_history={learner_id:state.learner_id,observations:state.obs,records:state.memory_records,dialogue:state.dialogue,history_version:state.history_version};
 t.summary={completed_turns:t.timeline.length,planned_turns:p.total_turns,model_calls:t.cost.model_calls,estimated_cost_usd:t.cost.known_estimated_usd,
  accepted_memory_changes:t.timeline.reduce((n,e)=>n+e.memory_changes.length,0),invalid_a_outputs:t.timeline.filter(e=>!e.a_validation.valid).length,model_b_shadow_calls:t.timeline.filter(e=>e.b_shadow).length,
  root_records:state.memory_records.filter(r=>r.record_type==='root').length,knowledge_records:state.memory_records.filter(r=>!['root','relationship'].includes(r.record_type)).length,
  no_database_writes:true,scientific_correctness_automatically_scored:false,complete:t.complete};
 storeReport(t,dir);return {plan:p,trace:t,dir};
}
async function main(){const o=parseArgs(process.argv.slice(2));if(o.mode==='plan'){console.log('S62A-FIX1C2 PLAN (NO MODEL/EMBEDDING/DB CALLS)\n'+JSON.stringify(plan(o),null,2));console.log('S62A-FIX1C2 PLAN PASS');return}
 const result=await run(o);console.log('S62A-FIX1C2 REPORT '+result.dir);console.log('S62A-FIX1C2 SUMMARY '+JSON.stringify(result.trace.summary));
 if(!result.trace.complete){console.error('S62A-FIX1C2 PARTIAL STOP '+JSON.stringify(result.trace.failure));process.exitCode=1}else console.log('S62A-FIX1C2 JOURNEY PASS | scientific quality unscored; no DB writes');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S62A-FIX1C2 STOP: '+String(e?.message??e));process.exitCode=1});
