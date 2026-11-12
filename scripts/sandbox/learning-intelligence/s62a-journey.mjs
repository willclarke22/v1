#!/usr/bin/env node
/** S62A six-visit longitudinal research harness. Reuses the S59-S61 contracts and the real S60 local MiniLM adapter. Research-only; no DB imports. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fixturePublic} from './s16b60-fixture.mjs';
import {retrievalPacket,localMiniLM} from './s16b60-retrieval.mjs';
import {promptFor} from './s16b60-prompts.mjs';
import {makeRequest,parseResult,scriptedMock,validateA,validateC} from './s16b59-lean-core.mjs';
import {credentials,callProvider} from './s16b54-models.mjs';
import {buildBoundedInput,compactCInput,recordBytes} from './s16b61fix1-context.mjs';
import {selectModels,admissionEstimate,estimateCost} from './s16b61fix1-models.mjs';
import {buildScorecard,scorecardMarkdown} from './s16b61fix1-scorecard.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../..');
const clone=x=>structuredClone(x);
const short=(s,n=1500)=>String(s??'').slice(0,n);
const privateFile=path.join(HERE,'s62a-profiles_PRIVATE.json');
const publicFile=path.join(HERE,'s62a-visits_PUBLIC.json');
const OPTIONS={mode:'offline',learner:'ELLI',visits:2,turnsPerVisit:3,retrieval:'lexical',prompt:'s60',explore:'on',c:'off',seedHistory:'off',semanticUrl:'http://127.0.0.1:8001/embed',budget:null,allowSpend:false,help:false,modelA:'gpt-4.1-mini',modelB:'gpt-4.1-mini',modelC:'gpt-4.1-mini',modelL:'gpt-4.1-mini',memoryMode:'on',aVariant:'baseline',auditRetrieval:'off'};
export function parseArgs(argv){
 const o={...OPTIONS};const keys={'--mode':'mode','--learner':'learner','--visits':'visits','--turns-per-visit':'turnsPerVisit','--retrieval':'retrieval','--prompt':'prompt','--explore':'explore','--c':'c','--seed-history':'seedHistory','--semantic-url':'semanticUrl','--budget-usd':'budget','--model-a':'modelA','--model-b':'modelB','--model-c':'modelC','--model-l':'modelL','--memory-mode':'memoryMode','--a-variant':'aVariant','--audit-retrieval':'auditRetrieval'};
 for(let i=0;i<argv.length;i++){
  const k=argv[i];if(k==='--help'){o.help=true;continue;}if(k==='--allow-spend'){o.allowSpend=true;continue;}
  if(!keys[k]||i+1>=argv.length)throw Error('Unknown or missing S61 argument '+k);
  const v=argv[++i],field=keys[k];o[field]=['visits','turnsPerVisit','budget'].includes(field)?Number(v):v;
 }
 if(!['offline','model'].includes(o.mode)||!['lexical','semantic','mixed'].includes(o.retrieval)||!['s59','s60'].includes(o.prompt)||!['on','off'].includes(o.explore)||!['auto','off'].includes(o.c)||!['on','off'].includes(o.seedHistory)||!Number.isInteger(o.visits)||o.visits<1||o.visits>24||!Number.isInteger(o.turnsPerVisit)||o.turnsPerVisit<2||o.turnsPerVisit>7||!/^([A-Z]{3,6}|ALL)$/.test(o.learner)||!['on','off'].includes(o.memoryMode)||!['baseline','no-update'].includes(o.aVariant)||!['on','off'].includes(o.auditRetrieval))throw Error('Invalid S62A experiment arguments');
 if(o.mode==='offline'&&(o.allowSpend||o.budget!==null))throw Error('S62A offline mode cannot accept spend flags');
 if(o.mode==='model'&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<=0||o.budget>30))throw Error('S62A model mode requires --allow-spend and explicit --budget-usd (0-10)');
 selectModels(o);return o;
}
export function loadPlans(){
 const data=JSON.parse(fs.readFileSync(privateFile,'utf8'));
 const publicData=JSON.parse(fs.readFileSync(publicFile,'utf8'));
 const f=fixturePublic(),topics=new Set(f.topics.map(x=>x.topic_id));
 if(data.schema!=='myway_s62a_private_personas_v1'||publicData.schema!=='myway_s62a_public_visits_v1'||data.profiles.length!==4||publicData.visits.length!==24)throw Error('S62A fixture structure invalid');
 const idSet=new Set(),caseSet=new Set();
 for(const p of data.profiles){if(idSet.has(p.learner_id)||!p.private_fictional_state_not_truth||p.visit_ids.length!==6)throw Error('S62A duplicate/invalid persona');idSet.add(p.learner_id);}
 for(const c of publicData.visits){if(caseSet.has(c.case_id)||!topics.has(c.focus_topic_id)||!idSet.has(c.learner_id)||!c.latest_observation?.text||!c.no_assumed_mastery)throw Error('S62A invalid public visit');caseSet.add(c.case_id);}
 for(const p of data.profiles)for(const id of p.visit_ids)if(!caseSet.has(id)||publicData.visits.find(x=>x.case_id===id).learner_id!==p.learner_id)throw Error('S62A learner schedule mismatch');
 return clone({...data,public_visits:publicData.visits});
}
export function selectedSchedule(f,plans,o){
 if(o.learner!=='ALL'&&!plans.profiles.some(x=>x.learner_id===o.learner))throw Error('Unknown S62A fictional learner '+o.learner);
 const profiles=o.learner==='ALL'?plans.profiles:plans.profiles.filter(x=>x.learner_id===o.learner);
 // Visits are intentionally grouped by learner; ALL runs 24 independent learner visit streams.
 const entries=profiles.flatMap(p=>p.visit_ids.map(id=>({profile:p,case:plans.public_visits.find(c=>c.case_id===id)})));
 const selected=entries.slice(0,o.visits);
 if(!selected.length)throw Error('Empty S62A journey');
 return selected;
}
function stateFor(profile,firstCase,f,seedHistory){
 const obs=seedHistory==='on'?firstCase.historical_observations.map(o=>({...clone(o),provenance:'S60 curator-authored snapshot; not actual user activity'})):[];
 return {learner_id:profile.learner_id,obs,roots:[],relationships:[],explicit_instructions:[],teaching_effects:[],dialogue:[],history_version:0,memory_events:[],topics:f.topics.map(t=>({id:t.topic_id,title:t.title,cluster:t.cluster})),links:f.links,prior_case_ids:[]};
}
function observation(state,message,{id,topic_id,source,evidence_type='raw_utterance',task_conditions='independent_unscored',probe=null,context={}}){
 if(!message?.trim()||state.obs.some(o=>o.id===id))throw Error('Invalid or duplicate learner observation '+id);
 const o={id,topic_id,text:short(message,1800),source,evidence_type,task_conditions,probe,context,session_id:'S62A-'+state.learner_id};state.obs.push(o);return o;
}
function makeCaseFromState(state,c,current){return {latest_observation:current,historical_observations:state.obs.filter(x=>x.id!==current.id),provisional_roots:state.roots.map(x=>({...clone(x)})),learner_relationships:state.relationships.map(x=>({...clone(x)})),explicit_instructions:state.explicit_instructions.slice(-5)};}
async function packetFor(f,state,c,current,role,o,{wide=false,semanticTransport}={}){
 const syntheticCase=makeCaseFromState(state,c,current);
 let packet=await retrievalPacket(f,syntheticCase,{role,method:o.retrieval,explore:wide,semanticUrl:o.semanticUrl,semanticTransport});
 // Preserve the latest chronological dialogue evidence, even if semantic/lexical retrieval misses it.
 const recent=state.obs.slice(-Math.min(role==='A'?4:3,Math.max(2,state.obs.length)));
 const observed=packet.context.observations;
 const keep=role==='A'?14:10;
 for(const r of recent){if(observed.some(x=>x.id===r.id))continue;if(observed.length>=keep){const drop=observed.findIndex(x=>!recent.some(y=>y.id===x.id)&&x.id!==current.id);if(drop>=0)observed.splice(drop,1);else continue;}observed.push(clone(r));}
 packet.context.observations=observed;
 packet.context.coverage.included_observation_ids=observed.map(x=>x.id);
 // Memory is selected as provisional, with evidence and version history. Never promote to authoritative truth.
 const maxR=role==='A'?6:3,maxL=role==='A'?5:2;
 packet.context.roots=clone(state.roots.slice(-maxR));packet.context.relationships=clone(state.relationships.slice(-maxL));
 packet.context.explicit_instructions=clone(state.explicit_instructions.slice(-3));
 packet.metrics.context_bytes=Buffer.byteLength(JSON.stringify(packet.context));
 return packet;
}
function roleInput(state,current,packet,role,previousAnalysis,options) {
 return buildBoundedInput({state,current,packet,role,previousAnalysis,memoryMode:options.memoryMode});
}
const privateLeakMarkers=['private_fictional_state_not_truth','researcher_hypothesis_not_ground_truth','suggested_relationship_stance','curator_review_focus','manual_review_questions','case_ids_in_visit_order','hidden_answer_key'];
export function assertPublicInput(data){const s=JSON.stringify(data);if(privateLeakMarkers.some(x=>s.includes(x)))throw Error('Private synthetic knowledge or evaluator rubric leaked to A/B/C');}
function offerStatus(b){return b.probe_offer?.trim()?{question:b.probe_offer.trim(),validity:'NOT_SCIENTIFICALLY_VALIDATED',rubric:'not_supplied',status:'offered_optional'}:null;}
function mergeMemory(state,a,checked,current){
 const accepted=[];for(const x of checked.proposals){
  if(x.type==='teaching_effect'){const item={...clone(x),source_event_id:current.id,version:++state.history_version,provisional:true,confounds:x.confounds};state.teaching_effects.push(item);accepted.push({type:x.type,version:item.version});continue;}
  const collection=x.type==='root'?state.roots:state.relationships;
  let target=x.existing_id?collection.find(v=>v.id===x.existing_id):null;
  // validateA's structural check is necessary but not scientific certification.
  if(!target&&x.existing_id){continue;}
  if(!target){const prefix=x.type==='root'?'R':'LR';const id=`${state.learner_id}-${prefix}-${String(collection.length+1).padStart(3,'0')}`;target={id,claim:x.type==='root'?(a.possible_underlying_causes.find(h=>h.support_ids.some(id=>x.observation_ids.includes(id)))?.claim??x.reason):x.learner_pattern,contexts:x.contexts??[],status:'provisional',revisions:[],support_ids:[],counter_ids:[],not_scientifically_certified:true};collection.push(target);}
  const causal=a.possible_underlying_causes.map(h=>({h,overlap:h.support_ids.filter(id=>x.observation_ids.includes(id)).length+h.counter_ids.filter(id=>x.observation_ids.includes(id)).length})).sort((a,b)=>b.overlap-a.overlap)[0];
  const cause=causal?.overlap?causal.h:null;
  const revision={version:++state.history_version,action:x.action,source_event_id:current.id,reason:x.reason??x.learner_pattern,observation_ids:clone(x.observation_ids),counter_ids:clone(cause?.counter_ids??[]),alternatives:clone(x.alternatives??cause?.alternatives??[]),status:'provisional_model_proposal'};
  target.revisions.push(revision);target.updated_at_event_id=current.id;target.status=['weaken','challenge'].includes(x.action)?'challenged_provisional':x.action==='refine'?'refined_provisional':'provisional';
  for(const id of revision.counter_ids)if(!target.counter_ids.includes(id))target.counter_ids.push(id);
  if(x.type==='relationship'&&x.learner_pattern)target.claim=x.learner_pattern;
  if(x.type==='root'&&x.action==='refine'&&cause?.claim)target.claim=cause.claim;
  for(const id of x.observation_ids){
    const bucket=['weaken','challenge'].includes(x.action)?target.counter_ids:target.support_ids;
    if(!bucket.includes(id))bucket.push(id);
  }
  accepted.push({type:x.type,id:target.id,version:revision.version,action:x.action});
 }
 for(const instruction of checked.explicit_instructions){state.explicit_instructions.push({...instruction,recorded_event_id:current.id});}
 const row={source_event_id:current.id,observed_at_step:state.dialogue.length+1,accepted,validation_checks:checked.checks,observed_understanding:a.observed_understanding,possible_underlying_causes:a.possible_underlying_causes,presenting_difficulty:a.presenting_difficulty,uncertainty:a.overall_uncertainty};state.memory_events.push(row);return row;
}
function offlineLearner(data){
 // A visible scripted continuity *plumbing* reply, NOT a reasoned learner or grading oracle.
 const msg=data.actual_tutor_probe?`I want to try the question you just asked. My first thought is that I should examine what changes, but I cannot justify it yet. Can you ask for my reasoning?`:`I'm not fully sure yet. I think I should compare the quantities carefully and try an example before deciding.`;
 return {learner_message:msg,accept_probe:data.actual_tutor_probe?true:null,reasoning:'OFFLINE_SYNTHETIC_PLACEHOLDER_NOT_A_PERFORMANCE_SAMPLE'};
}
function defaultLedger(admission) {return {calls:0,known_estimated_usd:0,unknown_usage:0,by_role:{A:0,B:0,C:0,L:0},by_model:{},estimated_admission_usd:admission.estimated_usd,max_projected_calls:admission.upper_calls,hard_billing_cap:false,not_invoice:true};}
/** Cache identical local embeddings inside one experiment. No persistent vector writes. */
export function cacheEmbeddingTransport(transport=globalThis.fetch){
 const cache=new Map(),stats={requests:0,upstream_requests:0,embedded_texts:0,cache_hits:0};
 const fn=async(url,init)=>{
  stats.requests++;const data=JSON.parse(init.body),texts=data.texts;
  if(!Array.isArray(texts)||texts.some(t=>typeof t!=='string'))throw Error('S62A invalid embedding request');
  const keys=texts.map(t=>crypto.createHash('sha256').update(url+'\0'+t).digest('hex'));
  const missing=[],missingKeys=[];
  for(let i=0;i<keys.length;i++)if(cache.has(keys[i]))stats.cache_hits++;else if(!missingKeys.includes(keys[i])){missing.push(texts[i]);missingKeys.push(keys[i]);}
  if(missing.length){
   stats.upstream_requests++;const response=await transport(url,{...init,body:JSON.stringify({texts:missing})});
   if(!response.ok)return response;
   const payload=await response.json();
   if(!Array.isArray(payload?.vectors)||payload.vectors.length!==missing.length)throw Error('S62A embedding service returned wrong batch length');
   payload.vectors.forEach((v,i)=>{if(!Array.isArray(v)||v.length<30||v.some(x=>!Number.isFinite(x)))throw Error('S62A invalid vector');cache.set(missingKeys[i],v);});
   stats.embedded_texts+=missing.length;
  }
  return {ok:true,status:200,json:async()=>({vectors:keys.map(k=>cache.get(k))})};
 };
 return {transport:fn,stats};
}
const NO_UPDATE_EXPERIMENT='S62A EXPERIMENTAL ABSTENTION INSTRUCTION: Do not generate a memory action merely because another turn has occurred. A request for practice or a correct response may warrant no change. If the current evidence does not materially change an existing hypothesis or justify a new one, return empty root_actions/relationship_actions arrays. Distinguish an older difficulty from current demonstrated understanding; cite only observed evidence. This is a prompt variant, not a requirement to abstain.';
export async function runJourney(o,{invoke,semanticTransport,afterStep}={}){
 const f=fixturePublic(),plans=loadPlans(),schedule=selectedSchedule(f,plans,o),models=selectModels(o),admission=admissionEstimate(schedule,o.turnsPerVisit,o,models);
 const embeddings=cacheEmbeddingTransport(semanticTransport??globalThis.fetch);
 const transport=embeddings.transport;
 if(['semantic','mixed'].includes(o.retrieval)||o.auditRetrieval==='on')await localMiniLM(['S62A local embedding service preflight'],{url:o.semanticUrl,transport});
 if(o.mode==='model'&&admission.estimated_usd>o.budget)throw Error(`S61 admission estimate $${admission.estimated_usd} exceeds $${o.budget}; reduce visits/turns or use larger approved budget`);
 const auth=o.mode==='model'&&!invoke?credentials():null;
 const ledger=defaultLedger(admission),trace={schema:'myway_s62a_longitudinal_v1',run_type:o.mode,synthetic:true,report_assessment:'UNSCORED_REQUIRES_INDEPENDENT_HUMAN_REVIEW',private_truth_in_A_B_C:false,authoritative_memory_writes:0,database_writes:0,options:{...o,allowSpend:o.allowSpend,models,pricing_source:'S61FIX1 per-model standard rates in s16b61fix1-models.mjs; estimates not invoices'},request_log:[],topics_available:f.topics.length,scheduled_case_ids:schedule.map(x=>x.case.case_id),learner_histories:{},timeline:[],cost:ledger,limitations:['S62A visit openers are curator-authored stimuli; not autonomous learner topic selection','Private simulated knowledge states are fallible research hypotheses, not scientific ground truth','L outputs are synthetic and may reflect model prior knowledge despite instruction','Open-text probe correctness and scientific validity are NOT automatically scored','Structural evidence-ID validation does not certify causal, semantic or teaching judgments','Provisional memory is isolated in this run only; no app/DB writes','A live local embedding preflight confirms connectivity and vectors, not retrieval quality','A and B share one provisional memory loop; prompts and retrieval change behavior; conditions are not automatically matched' ,'Reported estimated cost is not an invoice or a hard billing cap'],summary:null};
 const profilesById=new Map(plans.profiles.map(x=>[x.learner_id,x]));
 const states=new Map();let stepIndex=0;
 const perform=async(role,data)=>{
  if(role!=='L')assertPublicInput(data);
  const size=recordBytes(data);const log={step:stepIndex,role,input_bytes:size,model:models[role],status:'prepared'};
  trace.request_log.push(log);
  if(o.mode==='offline'){log.status='offline_mock';return clone(role==='L'?offlineLearner(data):scriptedMock(role,data));}
  const payload=makeRequest(role,data);
  payload.model=models[role];
  if(role==='A'||role==='B')payload.messages[0].content=promptFor(role,o.prompt)+(role==='A'&&o.aVariant==='no-update'?'\n'+NO_UPDATE_EXPERIMENT:'');
  if(role==='L')payload.messages[0].content+=`\nS62A REALISTIC LEARNER RULE: Follow your private fictional personality, imperfect knowledge, and actual prior replies within this session. Prefer short ordinary speech with varying phrasing. Respond to the actual tutor and optional probe in everyday learner language, not a polished textbook explanation. You may be correct, mistaken, uncertain, bored, or decline naturally; do not manufacture a fixed quota of errors or improvements. Do NOT manufacture wrong answers, improvements, or relationships for evaluator benefit. Avoid copying private profile or answering from a hidden key. Recognize tutor errors when your fictional knowledge supports it.`;
  log.serialized_request_bytes=recordBytes(payload);
  // Fixed system/schema overhead is measured as well as the context view.
  if(log.serialized_request_bytes>33000)throw Error('S61-FIX1 full serialized request too large; fail closed');
  const res=invoke?await invoke(role,clone(data),clone(payload)):await callProvider(payload,auth);
  log.status='provider_returned';ledger.calls++;ledger.by_role[role]++;ledger.by_model[models[role]]=(ledger.by_model[models[role]]??0)+1;
  if(!res?.usage){ledger.unknown_usage++;throw Error('S61 model usage not returned; stop before further calls');}
  ledger.known_estimated_usd=+(ledger.known_estimated_usd+estimateCost(res.usage,models[role])).toFixed(9);
  log.estimated_total_cost_usd=ledger.known_estimated_usd;
  if(ledger.known_estimated_usd>o.budget)throw Error('S61 estimated budget reached; stop (not hard billing cap)');
  return typeof res?.raw==='string'?parseResult(res.raw,role):clone(res);
 };
 try{
  for(const {profile,case:c} of schedule){
   let state=states.get(profile.learner_id);
   if(!state){state=stateFor(profile,c,f,o.seedHistory);states.set(profile.learner_id,state);}
   state.prior_case_ids.push(c.case_id);
   let learnerText=c.latest_observation.text,previousProbe=null,origin='S62A_AUTHOR_SEEDED_OPENING_NOT_MODEL_L';
   for(let turn=1;turn<=o.turnsPerVisit;turn++){
    ++stepIndex;
    const current=observation(state,learnerText,{id:`${profile.learner_id}-${c.case_id}-T${turn}`,topic_id:c.focus_topic_id,source:origin,evidence_type:origin.startsWith('MODEL_L')?'synthetic_model_L_response':'curator_authored_opening',task_conditions:previousProbe?'after_actual_tutor_probe_unscored':'independent_opening_unscored',probe:previousProbe});
    let aPacket=await packetFor(f,state,c,current,'A',o,{semanticTransport:transport}),aBuilt=roleInput(state,current,aPacket,'A',null,o),aInput=aBuilt.input,a=await perform('A',aInput),aExpansion=null;
    if(o.explore==='on'&&a.request_more_context?.scope&&a.request_more_context?.why){
     const wider=await packetFor(f,state,c,current,'A',o,{wide:true,semanticTransport:transport});
     if(wider.context.coverage.included_observation_ids.join('|')!==aPacket.context.coverage.included_observation_ids.join('|')){
      aExpansion={first_pass:a,scope:a.request_more_context.scope,why:a.request_more_context.why,initial_ids:aPacket.context.coverage.included_observation_ids};
      aPacket=wider;aBuilt=roleInput(state,current,aPacket,'A',null,o);aInput=aBuilt.input;aInput.expansion_requested=aExpansion.scope;a=await perform('A',aInput);
     }
    }
    const verified=validateA(a,state,new Set(aInput.allowed_observation_ids));
    const shadow=o.auditRetrieval==='on'?await packetFor(f,state,c,current,'A',{...o,retrieval:o.retrieval==='semantic'?'lexical':'semantic'},{semanticTransport:transport}):null;
    const memory=mergeMemory(state,a,verified,current);
    let cReview=null;
    const newRoots=verified.proposals.filter(x=>x.type==='root'&&x.action==='propose');
    if(o.c==='auto'&&newRoots.length&&state.roots.length>1){
     const newest=memory.accepted.find(x=>x.type==='root'&&x.action==='propose')?.id;
     const candidates=state.roots.filter(x=>x.id!==newest).slice(-5);
     if(candidates.length){
      const cData=compactCInput({new_hypothesis:newRoots[0],historical_candidates:candidates,evidence:aInput.context.observations,allowed_observation_ids:aInput.allowed_observation_ids});
      cReview=await perform('C',cData);
      try{cReview=validateC(cReview,candidates,cData.evidence);}catch(err){cReview={decision:'uncertain',error:String(err.message),structural_failure:true};}
      // C is advisory only: a duplicate/merge recommendation never silently mutates memory.
     }
    }
    let bPacket=await packetFor(f,state,c,current,'B',o,{semanticTransport:transport}),bBuilt=roleInput(state,current,bPacket,'B',a,o),bInput=bBuilt.input,b=await perform('B',bInput),bExpansion=null;
    if(o.explore==='on'&&b.context_request?.scope&&b.context_request?.reason){
     const wider=await packetFor(f,state,c,current,'B',o,{wide:true,semanticTransport:transport});
     if(wider.context.coverage.included_observation_ids.join('|')!==bPacket.context.coverage.included_observation_ids.join('|')){
      bExpansion={scope:b.context_request.scope,reason:b.context_request.reason,initial_ids:bPacket.context.coverage.included_observation_ids,first_pass:b};
      bPacket=wider;bBuilt=roleInput(state,current,bPacket,'B',a,o);bInput=bBuilt.input;bInput.expansion_requested=bExpansion.scope;b=await perform('B',bInput);
     }
    }
    if(typeof b.reply!=='string'||!b.reply.trim())throw Error('S61 Model B empty reply');
    const offered=offerStatus(b);
    const chat={step:stepIndex,learner_id:profile.learner_id,case_id:c.case_id,topic_id:c.focus_topic_id,topic_title:f.topics.find(t=>t.topic_id===c.focus_topic_id)?.title,visit_turn:turn,learner_observation_id:current.id,learner:current.text,learner_source:origin,tutor:b.reply,probe_offered:offered?.question??null};state.dialogue.push(chat);
    const event={...chat,probe:offered,model_a:a,model_b:b,optional_c:cReview,model_l:null,observed_evidence_id:current.id,retrieval:{A:{included_ids:aInput.allowed_observation_ids,expanded:aExpansion,mode:o.retrieval},B:{included_ids:bInput.allowed_observation_ids,expanded:bExpansion,mode:o.retrieval}},request_diagnostics:{A:{bytes:recordBytes(aInput),...aBuilt.diagnostics},B:{bytes:recordBytes(bInput),...bBuilt.diagnostics}},model_inputs:{A:clone(aInput),B:clone(bInput)},retrieval_audit:shadow?{served_method:o.retrieval,shadow_method:o.retrieval==='semantic'?'lexical':'semantic',served_ids:aInput.allowed_observation_ids,shadow_ids:shadow.context.coverage.included_observation_ids,shadow_metrics:shadow.metrics,scientific_relevance_not_scored:true}:null,validation:verified.checks,memory_changes:memory.accepted,science_grading:'NOT_PERFORMED',retained_observation_count:state.obs.length};
    trace.timeline.push(event);
    if(turn<o.turnsPerVisit){
     const lData={research_only:true,current_topic:{id:c.focus_topic_id,title:chat.topic_title},latest_tutor_reply:b.reply,actual_tutor_probe:offered?.question??null,visit_number:c.visit_index,turn_in_visit:turn,learner_visible_longitudinal_recollection:state.dialogue.slice(-10).map(x=>({topic_id:x.topic_id,learner:x.learner.slice(0,300),tutor:x.tutor.slice(0,300)})),visible_recent_dialogue:state.dialogue.slice(-3).map(x=>({learner:x.learner.slice(0,800),tutor:x.tutor.slice(0,1000),probe_offered:x.probe_offered?.slice(0,400)??null})),private_fictional_state_not_truth:profile.private_fictional_state_not_truth,private_lifetime_note:'Fictional learner. Maintain continuity using your own visible statements and actual tutor feedback; do not know Model A hypotheses. Change understanding only when real dialogue warrants it. The profile is a behavioral hypothesis, not an answer key.',task_status:offered?'may_accept_decline_or_challenge_unverified_probe':'respond_to_actual_tutor_reply',no_reference_answer:true};
     const l=await perform('L',lData);
     if(typeof l.learner_message!=='string'||!l.learner_message.trim())throw Error('S61 simulated learner returned empty reply');
     event.model_l=l;
     learnerText=l.learner_message;previousProbe=offered?{question:offered.question,validity:offered.validity,accepted:l.accept_probe,reasoning:l.reasoning,source:'actual_B_offer_not_independently_certified'}:null;
     origin='MODEL_L_REACTED_TO_ACTUAL_TUTOR';
    }
    afterStep?.(clone(event));
   }
  }
 }catch(e){trace.failure={message:String(e?.message??e).slice(0,350),completed_steps:trace.timeline.length,partial_results:true,last_request:trace.request_log.at(-1)??null};}
 trace.embedding_cache={...embeddings.stats,local_service_required:['semantic','mixed'].includes(o.retrieval)||o.auditRetrieval==='on',semantic_mode_explicitly_selected:o.retrieval!=="lexical",vectors_not_persisted:true};
 trace.summary={learners:states.size,topic_visits:schedule.length,topic_visits_started:new Set(trace.timeline.map(x=>x.case_id)).size,steps:trace.timeline.length,model_L_reactions:trace.timeline.filter(x=>x.model_l).length,retrieval_shadow_comparisons:trace.timeline.filter(x=>x.retrieval_audit).length,root_no_update_turns:trace.timeline.filter(x=>!x.model_a.root_actions?.some(a=>a.action!=='no_change')).length,root_action_turns:trace.timeline.filter(x=>x.model_a.root_actions?.some(a=>a.action!=='no_change')).length,probes_offered:trace.timeline.filter(x=>x.probe).length,root_records:[...states.values()].reduce((n,x)=>n+x.roots.length,0),learner_relationship_records:[...states.values()].reduce((n,x)=>n+x.relationships.length,0),memory_revision_events:[...states.values()].reduce((n,x)=>n+x.memory_events.reduce((m,e)=>m+e.accepted.length,0),0),invalid_reference_checks:trace.timeline.flatMap(x=>x.validation).filter(x=>x.accepted===false).length,model_calls:ledger.calls,estimated_cost_usd:ledger.known_estimated_usd,max_request_bytes:Math.max(0,...trace.request_log.map(x=>x.input_bytes)),database_writes:0,scientific_correctness_automatically_scored:false,run_complete:!trace.failure};
 for(const [id,s] of states)trace.learner_histories[id]={topic_visits:s.prior_case_ids,observations:s.obs,roots:s.roots,relationships:s.relationships,explicit_instructions:s.explicit_instructions,teaching_effects:s.teaching_effects,memory_events:s.memory_events};
 return trace;
}
export function saveReport(t){
 const base=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62a');fs.mkdirSync(base,{recursive:true});
 const dir=path.join(base,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));fs.mkdirSync(dir);
 const write=(name,content)=>fs.writeFileSync(path.join(dir,name),content,{flag:'wx',mode:0o600});
 write('trace.json',JSON.stringify(t,null,2)+'\n');
 const card=buildScorecard(t);write('SIX_CAPABILITY_SCORECARD.md',scorecardMarkdown(card)+'\n');write('SIX_CAPABILITY_SCORECARD.json',JSON.stringify(card,null,2)+'\n');
 write('CONTEXT_DIAGNOSTICS.json',JSON.stringify({requests:t.request_log,steps:t.timeline.map(e=>({step:e.step,request_diagnostics:e.request_diagnostics}))},null,2)+'\n');
 const transcript=['# S62A longitudinal learner simulation transcript','','Fictional scenario. Curated opening turns and Model L simulated reactions; no actual learner.',''];
 for(const x of t.timeline){transcript.push(`## Step ${x.step} — ${x.learner_id} / ${x.topic_id} (${x.topic_title})`,`**Learner (${x.learner_source}, ${x.learner_observation_id}):** ${x.learner}`,'',`**Tutor B:** ${x.tutor}`,'',x.probe?`**Optional probe (unvalidated):** ${x.probe.question}`:'**Probe:** none','',`**Model L follow-up:** ${x.model_l?.learner_message??'None (end of visit)'}`,'');}
 write('CONVERSATION.md',transcript.join('\n')+'\n');
 const lines=['S62A LONGITUDINAL LEARNER TRUST | SYNTHETIC RESEARCH-ONLY','SUMMARY '+JSON.stringify(t.summary),'COST '+JSON.stringify(t.cost),'OPTIONS '+JSON.stringify(t.options),t.failure?'FAILURE '+JSON.stringify(t.failure):'RUN FINISHED','IMPORTANT: no automated scientific correctness grading or causal validation','Curator seed turns and private fictional learner states are fallible, NOT gold labels','Private profile not supplied to A/B/C, only to model L','No database / authoritative memory writes'];
 for(const x of t.timeline){lines.push('',`STEP ${x.step} ${x.learner_id} ${x.case_id} ${x.topic_id}`,`LEARNER ${x.learner_observation_id} (${x.learner_source}): ${x.learner}`,`MODEL A DIFFICULTY ${JSON.stringify(x.model_a.presenting_difficulty)} CAUSES ${JSON.stringify(x.model_a.possible_underlying_causes)}`,`MODEL A ROOT ACTIONS ${JSON.stringify(x.model_a.root_actions)} RELATIONSHIPS ${JSON.stringify(x.model_a.relationship_actions)}`,`EVIDENCE A ${JSON.stringify(x.retrieval.A.included_ids)} B ${JSON.stringify(x.retrieval.B.included_ids)}`,`VALIDATION ${JSON.stringify(x.validation)} MEMORY ${JSON.stringify(x.memory_changes)}`,`MODEL B: ${x.tutor}`,`PROBE (${x.probe?.validity??'none'}): ${x.probe?.question??'none'}`,`MODEL L: ${x.model_l?.learner_message??'(end visit)'}`,`OPTIONAL C: ${JSON.stringify(x.optional_c)}`);}
 write('READABLE_REVIEW.txt',lines.join('\n')+'\n');
 const audit=['# S62A longitudinal independent evidence review','','This is an evaluation framework, not an automatically produced verdict. The private fictional profile and rubric can be mistaken.','','1. Did A distinguish presenting difficulty from a learner-specific underlying mechanism? Which exact observations support/contradict it?','2. Were observation IDs real and supplied? Were important counterexamples omitted from retrieval?','3. Did B address the actual learner request, select informative answer-free probes, and respond to the last observed answer?','4. Were any probes scientifically invalid, ambiguous, or over-primed? Did the learner appropriately challenge one?','5. Did memory revisions cite new evidence and allow weakening/supersession, not merely accumulate support?','6. Was each cross-topic relationship a claim about THIS learner, not generic curriculum overlap? Was non-discovery correct on negative controls?','7. Are teaching-method effects confounded by practice, repeated explanation or previous knowledge?','8. Are Model L responses credible given the fictional state and visible interaction, or does model knowledge leak in?','9. Did contextual retrieval miss meaningful evidence? Did expanded retrieval help?','10. What should be changed in the existing lean workflow, if anything, before product integration?','','All semantic judgments require independent reading of the transcript + trace.'];
 write('INDEPENDENT_REVIEW_GUIDE.md',audit.join('\n')+'\n');
 const plans=loadPlans(),used=[...new Set(t.timeline.map(x=>x.learner_id))];
 // This private research appendix is never passed to A/B/C, and should be used only for *fallible* independent review.
 const privateAppendix={warning:'RESEARCHER-AUTHORED FALLIBLE PRIVATE PERSONAS. NOT PROVIDED TO A/B/C; NOT A GOLD ANSWER KEY.',profiles:plans.profiles.filter(x=>used.includes(x.learner_id))};
 write('PRIVATE_EVALUATOR_ONLY.json',JSON.stringify(privateAppendix,null,2)+'\n');
 write('S62A_RETRIEVAL_AUDIT.json',JSON.stringify({embedding_cache:t.embedding_cache,per_step:t.timeline.map(x=>({step:x.step,learner_id:x.learner_id,observed_evidence_id:x.observed_evidence_id,retrieval:x.retrieval,retrieval_audit:x.retrieval_audit,request_diagnostics:x.request_diagnostics}))},null,2)+'\n');
 const metrics={status:'UNSCORED_RESEARCH_DIAGNOSTICS',not_independent_semantic_grading:true,summary:t.summary,learner_metrics:Object.fromEntries(Object.entries(t.learner_histories).map(([id,h])=>[id,{observations:h.observations.length,provisional_roots:h.roots.length,provisional_relationships:h.relationships.length,revision_events:h.memory_events.length,root_no_change_steps:t.timeline.filter(x=>x.learner_id===id&&!x.model_a.root_actions?.some(z=>z.action!=='no_change')).length}])),open_questions:['Are root causes learner-specific and supported by observed evidence?','Do new correct responses weaken stale roots rather than reinforce them?','Are cross-topic relationships grounded in this learner?','Does retrieval surface useful older contradictory evidence without overlinking?','Are learner responses credible or too polished?','Do probes test independently rather than reveal answers?']};
 write('S62A_TRUST_DIAGNOSTICS.json',JSON.stringify(metrics,null,2)+'\n');
 return dir;
}
async function main(){const o=parseArgs(process.argv.slice(2));if(o.help){console.log('S62A offline pilot: --mode offline --learner ELLI --visits 2 --turns-per-visit 3 --retrieval lexical');console.log('S62A semantic service probe: --mode offline --learner ELLI --visits 2 --turns-per-visit 3 --retrieval semantic --audit-retrieval on');console.log('S62A paid: --mode model --learner ELLI --visits 2 --turns-per-visit 3 --retrieval semantic --a-variant baseline|no-update --allow-spend --budget-usd 1.00');console.log('S62A full: --learner ALL --visits 24 --turns-per-visit 6 (explicit budget required for model mode)');return;}
 const t=await runJourney(o),dir=saveReport(t);
 console.log('S62A JOURNEY REPORT '+dir);console.log('SUMMARY '+JSON.stringify(t.summary));console.log('COST '+JSON.stringify(t.cost));
 if(t.failure){console.error('S62A PARTIAL STOP: '+t.failure.message);process.exitCode=1;}else console.log('S62A COMPLETE | NO DATABASE WRITES');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S62A STOP: '+String(e?.message??e).slice(0,450));process.exitCode=1;});
