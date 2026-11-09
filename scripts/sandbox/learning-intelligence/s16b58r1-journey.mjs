#!/usr/bin/env node
/** S58-R1 consolidation: calls the EXISTING S58 runner, adds no copied journey loop. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {parseArgs,runStudy,admissionEstimate} from './s16b58-journey.mjs';
import {loadFixture} from './s16b58-fixture.mjs';
import {prepareFixture,choosePair,checkValidity,publicOffer,independentCheck,guardRevision,summarizeRevisions,fixtureFingerprint} from './s16b58r1-core.mjs';
import {MODEL,credentials,callProvider,validatedJson,usageCost,RATE} from './s16b54-models.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const L_SCHEMA={type:'object',additionalProperties:false,properties:{accept:{type:'boolean'},response:{type:'string'},selected_object_id:{type:['string','null']}},required:['accept','response','selected_object_id']};
const R_SCHEMA={type:'object',additionalProperties:false,properties:{root_id:{type:['string','null']},relationship_id:{type:['string','null']},root_stance:{type:'string',enum:['supports','weakens','challenges','insufficient']},relationship_stance:{type:'string',enum:['supports','weakens','challenges','insufficient']},evidence_quote:{type:'string'},interpretation:{type:'string'},alternative_explanation:{type:'string'},next_teaching_move:{type:'string'}},required:['root_id','relationship_id','root_stance','relationship_stance','evidence_quote','interpretation','alternative_explanation','next_teaching_move']};
const B_SCHEMA={type:'object',additionalProperties:false,properties:{reply:{type:'string'}},required:['reply']};
const snapshot=o=>JSON.parse(JSON.stringify(o));
const exact=(o,k)=>o&&typeof o==='object'&&Object.keys(o).sort().join(',')===k.sort().join(',');
const BASE_EXTRA_USD=0.076;
function requestL(offer,privateState,previousTeaching){return {model:MODEL,store:false,max_tokens:280,messages:[{role:'system',content:'Simulate a realistic learner from a PRIVATE synthetic knowledge state. You may decline. Answer the PUBLIC probe without seeing scoring or teacher solution; you may be uncertain, incomplete, or mistaken. If it is a scene selection, choose the ID of ONE visible selectable object; otherwise selected_object_id=null. Never invent a scene render. Do not turn yourself into the tutor.'},{role:'user',content:JSON.stringify({offered_probe:offer,prior_tutor_teaching:previousTeaching??null,private_synthetic_knowledge_state:privateState.knowledge_state,private_character_constraints:privateState.response_generation_constraints})}],response_format:{type:'json_schema',json_schema:{name:'myway_s58r1_probe_learner',strict:true,schema:L_SCHEMA}}};}
function requestA(offer,response,check,roots,relationships,previous){return {model:MODEL,store:false,max_tokens:580,messages:[{role:'system',content:'You are Model A reviewing SYNTHETIC probe evidence. The independent check may be only a lexical screen and is NOT a verified conceptual grade. Consider how an observation bears on an existing learner-specific underlying-cause hypothesis and/or relationship. A presenting question is not necessarily a root cause. Do not infer learning-style preference, benefit from a visual, causal teaching benefit, or mastery from one attempt. A tutor may be factually wrong. Cite an EXACT CONTIGUOUS substring of the probe response as evidence. Only choose listed root/relationship IDs. For weak evidence, choose insufficient. Do not propose an entirely new root; this experiment tests cautious REVISION of existing hypotheses.'},{role:'user',content:JSON.stringify({offered_probe:offer,response:response.response,selected_object_id:response.selected_object_id,independent_screen:check,prior_tutor_reply:previous??null,visible_root_hypotheses:roots.map(x=>({id:x.id,cause:x.root_problem,alternatives:x.alternative_hypotheses,supporting:x.supporting_observation_ids,contradicting:x.contradicting_observation_ids})),visible_learner_relationships:relationships.map(x=>({id:x.id,claim:x.learner_quote,kind:x.kind}))})}],response_format:{type:'json_schema',json_schema:{name:'myway_s58r1_revision',strict:true,schema:R_SCHEMA}}};}
function requestB(offer,response,check,provisional){return {model:MODEL,store:false,max_tokens:280,messages:[{role:'system',content:'You are MyWay Model B. A SYNTHETIC learner has responded to an optional research probe. Provide brief constructive teaching without showing a private answer key. The independent screen is NOT scientific proof of correctness, and a model revision is provisional. If evidence is weak, ask one focused clarification; if learner challenges an invalid probe, admit possible tutor/probe error. Never claim a visual was rendered, a real learner studied, lasting mastery, or a fixed learning style.'},{role:'user',content:JSON.stringify({probe:offer,response:response.response,selected_object_id:response.selected_object_id,screen:check,provisional_evidence_revision:provisional?.accepted?provisional:null})}],response_format:{type:'json_schema',json_schema:{name:'myway_s58r1_tutor_continuation',strict:true,schema:B_SCHEMA}}};}
const offlineAnswers={
 'LEARNER-A':{'CHEM03-P1':'Light supplies energy, and CO2 provides carbon atoms; sunlight does not donate carbon atoms to glucose.','BIO01-P1':'I suspect sunlight supplies part of the carbon in glucose, even though I know CO2 is used.','CHEM02-P1':'In a closed system the gas must be counted too; total mass remains conserved.','CELL01-P2':'The thylakoid lumen should contain the high proton concentration.','BIO06-P2':'Protons move to the matrix through ATP synthase.'},
 'LEARNER-B':{'CHEM03-P1':'Light is energy, not carbon matter; CO2 supplies the carbon atoms and light does not donate carbon.','BIO01-P1':'Glucose carbon originates in CO2, while sunlight provides energy for the reactions.','BIO03-P2':'If the carbon-fixation enzyme is blocked, the incorporation of carbon decreases.','CHEM01-P2':'The carbon comes from the CO2 input.'},
 'LEARNER-C':{'BIO06-P1':'Proton pumps build the gradient using energy, while downhill proton movement through ATP synthase uses the gradient to make ATP.'}
};
function offlineAnswer(id,offer){const p=offer.probe_id,txt=offlineAnswers[id]?.[p]??'I am unsure; I cannot explain my reasoning yet.';
 const selections={'CELL01-P2':'SCN05-O04','BIO06-P2':'SCN05-O00','CHEM01-P2':'SCN01-O00'};
 return {accept:true,response:txt,selected_object_id:selections[p]??null,source:'researcher_authored_synthetic_fixture_not_model_L'};
}
function offlineRevision(curated,probe,response,check,roots,relationships){
 const a=roots.find(r=>curated.learner.learner_id==='LEARNER-A'?r.id==='A-R1'||r.id==='A-R2':r.id===`${curated.learner.learner_id.slice(-1)}-R1`);
 const rel=relationships.find(r=>r.seeded);
 const quote=response.response.slice(0,Math.min(125,response.response.length));
 const isChloroplast=probe.probe_id==='CELL01-P2';const aboutEnergy=probe.probe_id==='CHEM03-P1';
 const targeted=check.scored&&((isChloroplast&&a?.id==='A-R2')||(aboutEnergy&&a?.id==='A-R1'));
 const target=isChloroplast?roots.find(x=>x.id==='A-R2'):targeted?a:null;
 const relationship=(isChloroplast&&check.scored)?rel:null;
 return {root_id:target?.id??null,relationship_id:relationship?.id??null,root_stance:target?'weakens':'insufficient',relationship_stance:relationship?'weakens':'insufficient',evidence_quote:quote||'?',interpretation:'Research fixture: this specific probe provides narrow task evidence, not verified underlying-cause truth or transfer.',alternative_explanation:'Learner may be recalling a recent explanation instead of independently transferring knowledge.',next_teaching_move:'Offer a distinct, unrehearsed prediction and ask for the reasoning.'};
}
export async function runConsolidated(options,{rootCheck=true,send=callProvider,credential=credentials,fixture=null,scenario=null,embeddingsFetch=fetch,learnerGenerator=null,teacher=null}={}){
 const source=fixture??loadFixture(options.learnerId,options.trialId),curated=prepareFixture(source);
 // S58 admission is conservative; account for new probe requests as an additional gate BEFORE any paid calls.
 const baseEstimate=admissionEstimate(options.limit,options.learner),fullEstimate=+(baseEstimate+BASE_EXTRA_USD).toFixed(6);
 if(options.mode==='model'&&fullEstimate>options.budget)throw Error('S58-R1 admission estimate $'+fullEstimate+' exceeds requested budget; NOT an invoice cap');
 const original=await runStudy(options,{rootCheck,fixture:curated,scenario,send,credential,embeddingsFetch,learnerGenerator,teacher});
 const auth=options.mode==='model'?credential():null;
 const overlay={schema:'myway_s16b58r1_evidence_research_v1',source:'synthetic_research_not_human',configuration:{...options},trial_condition:curated.enforced_condition,fixture_fingerprint:fixtureFingerprint(curated),base:original,probe_events:[],provisional_revisions:[],reported_tutor_corrections:[],base_summary:original.summary,limitations:[...original.limitations,'S58-R1 probes are post-conversation experimental follow-ups; they are not integrated into the 12 earlier turns','Only a vetted subset of the 60-probe catalog can be offered and conservatively scored','Lexical answer screens cannot certify conceptual understanding or treatment efficacy','Model A revisions are advisory and may be rejected; no authoritative graph mutation or stable personalization']};
 const extraCost={calls:0,byRole:{A:0,B:0,C:0,L:0},knownEstimatedUsd:0,unknownUsage:0};
 async function invoke(role,req){extraCost.calls++;extraCost.byRole[role]++;let out;
  try{out=await send(req,auth,role);}catch(e){extraCost.unknownUsage++;throw Error('Additional model '+role+' transport error; possible spend unknown: '+String(e?.message??e).slice(0,130));}
  try{extraCost.knownEstimatedUsd=+(extraCost.knownEstimatedUsd+usageCost(out.usage)).toFixed(9);}catch(e){extraCost.unknownUsage++;throw Error('Additional model '+role+' billing unknown; stopped');}
  return out.raw;
 }
 let latestTeaching=original.events.at(-1)?.reply??null;
 for(const {phase,probe,substitution} of choosePair(curated)){
  const event={phase,probe_id:probe?.probe_id??null,substitution,offer:null,offer_status:'not_offered',response:null,response_source:null,check:null,revision_raw:null,revision_guard:null,tutor_reply:null,stop:null};overlay.probe_events.push(event);
  try{
   const check=checkValidity(probe,curated.scenes);
   if(!check.valid){event.offer_status='withheld_invalid_or_unsupported';event.check={status:'invalid_probe_not_learner_evidence',scored:false,reason:check.reason};continue;}
   const offer=publicOffer(probe,curated.scenes);event.offer=offer;event.offer_status='offered_optional';
   let answer;
   if(options.mode==='offline')answer=offlineAnswer(curated.learner.learner_id,offer);
   else {answer=validatedJson(await invoke('L',requestL(offer,curated.privateSimulator,latestTeaching)),L_SCHEMA);answer.source='GPT41MINI_SYNTHETIC_GENERATED';}
   if(!exact(answer,['accept','response','selected_object_id','source'])||typeof answer.accept!=='boolean'||typeof answer.response!=='string'||answer.response.length>1600||!(answer.selected_object_id===null||typeof answer.selected_object_id==='string'))throw Error('Invalid learner probe response');
   event.response={accept:answer.accept,response:answer.response,selected_object_id:answer.selected_object_id};event.response_source=answer.source;
   event.check=independentCheck(probe,curated.scenes,answer);
   if(!answer.accept){event.offer_status='declined_not_failure';continue;}
   event.offer_status='answered';
   let raw;
   if(options.mode==='offline')raw=offlineRevision(curated,probe,answer,event.check,original.state.roots,original.state.relationships);
   else raw=validatedJson(await invoke('A',requestA(offer,answer,event.check,original.state.roots,original.state.relationships,latestTeaching)),R_SCHEMA);
   event.revision_raw=raw;
   event.revision_guard=guardRevision(raw,answer,event.check,original.state);
   if(event.revision_guard.accepted){
    overlay.provisional_revisions.push({probe_id:probe.probe_id,phase,source:'provisional_model_or_fixture_interpretation_not_cause_truth',evidence_quote:raw.evidence_quote,interpretation:raw.interpretation,alternative_explanation:raw.alternative_explanation,root_update:event.revision_guard.root_update,relationship_update:event.revision_guard.relationship_update,proposal_only:true});
   }
   if(phase==='baseline_after_conversation'){
    if(options.mode==='offline')latestTeaching='We have one observation, not a certain explanation of your difficulty. Can you try a new example and explain your reasoning?';
    else {const reply=validatedJson(await invoke('B',requestB(offer,answer,event.check,event.revision_guard)),B_SCHEMA).reply;
     if(typeof reply!=='string'||!reply.trim()||reply.length>4000)throw Error('Invalid tutor continuation');latestTeaching=reply;}
    event.tutor_reply=latestTeaching;
   }
  }catch(err){event.stop=String(err?.message??err).slice(0,250);break;}
 }
 const summary=summarizeRevisions(overlay.probe_events);
 overlay.cost={base:original.cost,additional:extraCost,combined_estimated_usd:+(original.cost.knownEstimatedUsd+extraCost.knownEstimatedUsd).toFixed(9),admission_estimate_usd:fullEstimate,requested_budget_usd:options.budget,not_invoice:true};
 overlay.summary={base_turns:original.summary.processed,base_roots:original.summary.provisional_roots,initial_roots_exposed:curated.learner.provisional_root_hypotheses.length,observations_exposed:curated.learner.prior_sessions.length,probe_offers:overlay.probe_events.filter(x=>x.offer_status==='offered_optional'||x.offer_status==='answered'||x.offer_status==='declined_not_failure').length,probes_answered:overlay.probe_events.filter(x=>x.offer_status==='answered').length,...summary,db_writes:0,authoritative_memory_writes:0,stopped:original.summary.stopped||overlay.probe_events.some(x=>x.stop)};
 // Only record possible revisions as an overlay, preserving the input roots and relationships verbatim.
 overlay.learner_memory_review={roots_before:original.state.roots,relationships_before:original.state.relationships,proposed_revisions:overlay.provisional_revisions,roots_after_authoritative_writes:null,relationship_writes:0,personalization_established:false};
 return overlay;
}
export function saveConsolidated(t){const dir=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16b58r1',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));fs.mkdirSync(dir,{recursive:true});const review={schema:t.schema,configuration:t.configuration,trial_condition:t.trial_condition,summary:t.summary,cost:t.cost,probe_events:t.probe_events,provisional_revisions:t.provisional_revisions,limitations:t.limitations};
 for(const [name,data] of [['S16B58R1_REVIEW.json',review],['S16B58R1_PROBE_EVENTS.json',t.probe_events],['S16B58R1_MEMORY_REVISION_REVIEW.json',t.learner_memory_review],['trace.json',t]])fs.writeFileSync(path.join(dir,name),JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
 const lines=['MYWAY S58-R1 CONSOLIDATED RESEARCH — SYNTHETIC ONLY','Trial: '+JSON.stringify(t.trial_condition),'Summary: '+JSON.stringify(t.summary),'Cost: '+JSON.stringify(t.cost)];
 for(const e of t.probe_events)lines.push('\n'+e.phase+' '+e.probe_id+' | '+e.offer_status,'PROBE: '+(e.offer?.prompt??'(withheld)'), 'SYNTHETIC RESPONSE: '+JSON.stringify(e.response),'INDEPENDENT SCREEN: '+JSON.stringify(e.check),'MODEL A PROVISIONAL REVISION: '+JSON.stringify(e.revision_raw),'GUARD: '+JSON.stringify(e.revision_guard),'MODEL B: '+(e.tutor_reply??'(not offered)'),...(e.stop?['STOP: '+e.stop]:[]));
 fs.writeFileSync(path.join(dir,'S16B58R1_READABLE_TRANSCRIPT.txt'),lines.join('\n')+'\n',{flag:'wx',mode:0o600});return dir;
}
async function main(){const o=parseArgs(process.argv.slice(2));if(o.help){console.log('S58-R1: --mode offline --limit 12 --learner-id LEARNER-A --trial-id T01 --retrieval lexical; paid: --mode model --limit 12 --learner model --retrieval semantic --allow-spend --budget-usd 0.40. Trial T05/T06 enforce withholding root hypotheses.');return;}
 console.log('S58-R1 ADDITIVE CONSOLIDATION | NO DATABASE WRITES | '+JSON.stringify(o));const t=await runConsolidated(o);const dir=saveConsolidated(t);console.log('SUMMARY '+JSON.stringify(t.summary));console.log('COST '+JSON.stringify(t.cost));console.log('REVIEW '+path.join(dir,'S16B58R1_READABLE_TRANSCRIPT.txt'));console.log('TRACE '+path.join(dir,'trace.json'));if(t.summary.stopped)process.exitCode=1;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S58-R1 REFUSAL: '+String(e?.message??e).slice(0,300));process.exitCode=1;});
