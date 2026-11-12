#!/usr/bin/env node
/** S61-FIX2 reviewer: evidence-complete bounded packets, independent claim dimensions, recoverable runs. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost,PRICING} from './s16b61fix1-models.mjs';
import {buildScorecard,scorecardMarkdown} from './s16b61fix1-scorecard.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const REPORT='INDEPENDENT_MODEL_REVIEW_FIX2.json';
const SCORE_JSON='SIX_CAPABILITY_SCORECARD_FIX2.json';
const SCORE_MD='SIX_CAPABILITY_SCORECARD_FIX2.md';
const HUMAN_MD='INDEPENDENT_MODEL_REVIEW_FIX2_READABLE.md';
const outName=(name,redo)=>redo?name.replace(/\.(json|md)$/,'_ALL.$1'):name;
const MODEL_INPUT_BYTES=17500;
const enums=(items)=>({type:'string',enum:items});
export const SCHEMA={type:'object',additionalProperties:false,properties:{
 assessment:enums(['supported','mixed','unsupported','uncertain','not_tested']),
 scientific_accuracy:enums(['appears_correct','possible_error','clear_error','unassessed']),
 learner_current_understanding:enums(['demonstrated_correct','partly_correct','incorrect','mixed','insufficient_evidence']),
 root_inference:enums(['supported','overinterpreted','contradicted','appropriate_abstention','uncertain','not_applicable']),
 relationship_inference:enums(['supported','overinterpreted','contradicted','appropriate_abstention','uncertain','not_applicable']),
 teaching_quality:enums(['responsive','mixed','unresponsive','unassessed']),
 probe_independence:enums(['independent','primed_by_teaching','unclear','not_applicable']),
 strength:{type:'string'},concern:{type:'string'},support_rationale:{type:'string'},counter_rationale:{type:'string'},
 alternative_explanation:{type:'string'},limitations:{type:'string'},evidence_ids:{type:'array',items:{type:'string'}},
 next_independent_check:{type:'string'}
},required:['assessment','scientific_accuracy','learner_current_understanding','root_inference','relationship_inference','teaching_quality','probe_independence','strength','concern','support_rationale','counter_rationale','alternative_explanation','limitations','evidence_ids','next_independent_check']};
const SYSTEM=`You are an independent research reviewer of a synthetic tutoring journey. You are fallible, and your judgment does not update learner memory. Evaluate the CURRENT learner response independently from Model A's learner-specific ROOT inference and the tutor's factual correctness. Do not default to agreeing with Model A. Historical confusion can coexist with CURRENT correct performance; a correct response does not provide fresh support for ongoing confusion. A request for a test is not proof of misunderstanding. Distinguish an independent answer from one taught or hinted immediately beforehand. If a tutor task has an ambiguous or invalid scientific premise, do not attribute its flaw to the learner. A relationship proposal is not required; appropriate abstention can be a strength. Reference ONLY IDs in evidence[]. Cite support AND contradiction where relevant, explain alternatives, and choose uncertain/not_applicable when evidence is too weak. No private fictional learner profile, inferred hidden truth, or invented evidence. Return valid schema JSON only.`;
const within= (v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
export function parse(argv){const o={mode:'offline',trace:null,model:'gpt-4.1-mini',limit:12,allowSpend:false,budget:0,redoLegacy:false};
 for(let i=0;i<argv.length;i++){const v=argv[i];if(v==='--allow-spend'){o.allowSpend=true;continue;}if(v==='--redo-legacy'){o.redoLegacy=true;continue;}
  const fields={'--mode':'mode','--trace':'trace','--model':'model','--limit':'limit','--budget-usd':'budget'};if(!fields[v]||!argv[i+1])throw Error('Unknown or missing reviewer argument: '+v);o[fields[v]]=argv[++i];}
 o.limit=Number(o.limit);o.budget=Number(o.budget);
 if(!['offline','model'].includes(o.mode)||!within(o.limit,1,40)||!o.trace||!Object.hasOwn(PRICING,o.model))throw Error('Invalid FIX2 options');
 if(o.mode==='model'&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<=0||o.budget>5))throw Error('Model review requires explicit approved budget (0–5 USD)');
 if(o.mode==='offline'&&(o.allowSpend||o.budget))throw Error('Offline cannot authorize spending');return o;}
function distinct(xs){return [...new Set(xs.filter(x=>typeof x==='string'&&x.trim()))];}
function idsFromA(a){const found=[];
 for(const p of a?.observed_understanding??[])found.push(...(p.observation_ids??[]));
 for(const p of a?.possible_underlying_causes??[])found.push(...(p.support_ids??[]),...(p.counter_ids??[]));
 for(const field of ['root_actions','relationship_actions','teaching_effect_hypotheses'])for(const p of a?.[field]??[])found.push(...(p.observation_ids??[]),...(p.observations??[]));
 return distinct(found);
}
/** Public evidence only, as of this step; include all cited observations before optional retrieval context. */
export function makePacket(trace,step,cap=MODEL_INPUT_BYTES){
 const learner=step.learner_id;const history=trace.learner_histories?.[learner]?.observations??[];
 const timeline=trace.timeline??[];const elapsed=new Set(timeline.filter(s=>s.learner_id===learner&&s.step<=step.step).map(s=>s.learner_observation_id));
 const eligible=history.filter(x=>x.source==='synthetic_curator_authored'||elapsed.has(x.id));
 const byId=new Map(eligible.map(x=>[x.id,x]));
 const cited=idsFromA(step.model_a);const selected=distinct([step.learner_observation_id,...cited]);
 const additional=distinct([...(step.retrieval?.A?.included_ids??[])]).filter(id=>!selected.includes(id)&&byId.has(id));
 const compact=x=>({id:x.id,text:x.text,topic_id:x.topic_id,source:x.source,task_conditions:x.task_conditions??null,evidence_type:x.evidence_type??null});
 const evidence=selected.filter(x=>byId.has(x)).map(id=>compact(byId.get(id)));
 const missing=selected.filter(x=>!byId.has(x));
 const prior=timeline.filter(s=>s.learner_id===learner&&s.step<step.step).slice(-1).map(s=>({step:s.step,learner_observation_id:s.learner_observation_id,learner:s.learner,tutor:s.tutor}));
 const packet={step:step.step,learner_id:learner,topic_id:step.topic_id,topic_title:step.topic_title,
 current:{observation_id:step.learner_observation_id,learner_response:step.learner,tutor_reply:step.tutor,
 probe_offered:step.probe_offered??null,probe_status:step.probe?.status??null},
 previous_dialogue:prior,
 model_a:{observed_understanding:step.model_a?.observed_understanding??[],presenting_difficulty:step.model_a?.presenting_difficulty??null,
 possible_underlying_causes:step.model_a?.possible_underlying_causes??[],root_actions:step.model_a?.root_actions??[],
 relationship_actions:step.model_a?.relationship_actions??[],teaching_effect_hypotheses:step.model_a?.teaching_effect_hypotheses??[]},
 evidence,coverage:{model_a_cited_ids:cited,missing_cited_or_current_ids:missing,model_a_retrieval_ids:step.retrieval?.A?.included_ids??[],
 cited_not_in_model_a_retrieval:cited.filter(id=>!step.retrieval?.A?.included_ids?.includes(id)),extra_retrieval_ids_omitted:[]},
 instruction:'Evaluate current demonstration, historical hypothesis support, scientific validity, tutor feedback and priming separately. Historical observations are not necessarily proof of present confusion.'};
 const size=()=>Buffer.byteLength(JSON.stringify(packet),'utf8');
 if(size()>cap)throw Error(`mandatory_evidence_exceeds_budget:${size()}/${cap}`);
 for(const id of additional){packet.evidence.push(compact(byId.get(id)));if(size()>cap){packet.evidence.pop();packet.coverage.extra_retrieval_ids_omitted.push(id);}}
 return {packet,allowed_ids:packet.evidence.map(x=>x.id),input_bytes:size()};
}
function validate(value,allowed){const errors=[];
 if(!value||typeof value!=='object'||Array.isArray(value))return ['not_json_object'];
 for(const [k,s] of Object.entries(SCHEMA.properties)){
  if(!(k in value)){errors.push('missing_field:'+k);continue;}
  if(s.enum&&!s.enum.includes(value[k]))errors.push('invalid_enum:'+k);
  if(s.type==='string'&&typeof value[k]!=='string')errors.push('invalid_type:'+k);
  if(s.type==='array'&&(!Array.isArray(value[k])||value[k].some(x=>typeof x!=='string')))errors.push('invalid_type:'+k);
 }
 const allowedSet=new Set(allowed);for(const id of value.evidence_ids??[])if(!allowedSet.has(id))errors.push('invalid_evidence_id:'+id);
 return errors;
}
function writeAtomic(file,obj){const tmp=file+'.tmp-'+process.pid+'-'+crypto.randomBytes(4).toString('hex');fs.writeFileSync(tmp,JSON.stringify(obj,null,2)+'\n',{flag:'wx'});fs.renameSync(tmp,file);}
function initial(trace,opts,prior){const legacy=[];
 if(!opts.redoLegacy&&prior?.reviews){for(const r of prior.reviews){if(r.validation==='passed'&&trace.timeline.some(s=>s.step===r.step))legacy.push({step:r.step,validation:'legacy_unverified',legacy:true,old_assessment:r.assessment,old_evidence_ids:r.evidence_ids??[],note:'Imported previous FIX1 review; not counted as new FIX2 quality validation.'});}}
 return {schema:'myway_s61fix2_review_v1',warning:'MODEL-ASSISTED JUDGMENTS ARE FALLIBLE, NOT EXPERT GROUND TRUTH',options:{mode:opts.mode,model:opts.model,limit:opts.limit,redo_legacy:opts.redoLegacy},
 source_trace:trace,source_trace_sha256:sha(JSON.stringify(trace)),target_steps:trace.timeline.slice(0,opts.limit).map(s=>s.step),
 reviews:legacy,ledger:{calls:0,estimated_usd:0,unknown_usage:0},runs:[],complete:false};}
function publicReport(r){const {source_trace,...rest}=r;return rest;}
function persist(r,dir){const clean=publicReport(r),redo=Boolean(r.options?.redo_legacy);writeAtomic(path.join(dir,outName(REPORT,redo)),clean);
 const accepted=clean.reviews.filter(x=>x.validation==='passed'&&!x.legacy);const legacy=clean.reviews.filter(x=>x.validation==='legacy_unverified');
 const missing=r.target_steps.filter(step=>!accepted.some(x=>x.step===step)&&!legacy.some(x=>x.step===step));
 const card=buildScorecard(r.source_trace,accepted),length=r.target_steps.length;
 card.schema='myway_s61fix2_coverage_scorecard_v1';card.evaluation_coverage={target_steps:length,fix2_reviewed:accepted.length,
  legacy_reviewed_not_recalibrated:legacy.length,failed_or_unreviewed:missing.length,failed_step_ids:missing,full_fix2_coverage:accepted.length===length};
 if(accepted.length){card.model_review={reviewed_steps:accepted.length,findings:accepted.map(x=>({step:x.step,assessment:x.assessment,root_inference:x.root_inference,scientific_accuracy:x.scientific_accuracy,evidence_ids:x.evidence_ids,concern:x.concern}))};}
 for(const c of card.capabilities)if(c.key!=='reliability'&&c.key!=='learning_outcomes'){
  c.status=accepted.length===0?'fix2_not_reviewed':accepted.length<length?'partial_fix2_model_review':'fix2_model_review_human_calibration_required';
  c.notes=`FIX2 model review ${accepted.length}/${length}; ${legacy.length} imported FIX1 verdicts are uncalibrated. No automatic science validation.`;}
 writeAtomic(path.join(dir,outName(SCORE_JSON,redo)),card);
 fs.writeFileSync(path.join(dir,outName(SCORE_MD,redo)),scorecardMarkdown(card)+`\n## FIX2 review coverage\n- New FIX2 reviews: ${accepted.length}/${length}\n- Legacy uncalibrated FIX1 reviews: ${legacy.length}\n- Unreviewed or failed: ${missing.length} (${missing.join(', ')||'none'})\n- Full FIX2 coverage: ${accepted.length===length?'yes':'no'}\n- No scientific grading or human learning outcomes automatically established.\n`);
 const md=['# MyWay S61-FIX2 — Independent Review (Model-Assisted)','',
  '**Research-only. Reviewer judgments are fallible, not scientific ground truth.**',
  `**Coverage:** ${accepted.length} new FIX2 / ${legacy.length} uncalibrated FIX1 / ${missing.length} unfinished or failed (${length} total).`,
  '', 'The FIX1 legacy labels are preserved for cost/provenance only; they are NOT endorsements of Model A.',''];
 for(const step of r.target_steps){const item=r.reviews.find(x=>x.step===step);
  md.push(`## Interaction ${step}`);
  if(!item){md.push('Unreviewed.','');continue;}
  if(item.validation==='legacy_unverified'){md.push(`**Legacy FIX1 — uncalibrated**; earlier label: ${item.old_assessment??'unknown'}.`, '');continue;}
  if(item.validation==='failed'){md.push(`**Review failed** (${item.error}); details: ${(item.errors??[]).join(', ')||'see JSON'}.`, '');continue;}
  if(item.validation!=='passed'){md.push('Not yet evaluated in model mode.','');continue;}
  md.push(`**Overall:** ${item.assessment}; **scientific accuracy:** ${item.scientific_accuracy}; **current understanding:** ${item.learner_current_understanding}.`,
    `**Root inference:** ${item.root_inference}; **relationship inference:** ${item.relationship_inference}; **teaching:** ${item.teaching_quality}; **probe independence:** ${item.probe_independence}.`,
    `**Evidence IDs:** ${(item.evidence_ids??[]).join(', ')||'none cited'}.`,
    `**Strength:** ${item.strength}`,
    `**Concern:** ${item.concern}`,
    `**Supporting reasoning:** ${item.support_rationale}`,
    `**Contradictory evidence:** ${item.counter_rationale}`,
    `**Alternative:** ${item.alternative_explanation}`,
    `**Limitations:** ${item.limitations}`,
    `**Next check:** ${item.next_independent_check}`, '');
 }
 fs.writeFileSync(path.join(dir,outName(HUMAN_MD,redo)),md.join('\n')+'\n');

}
/** Independent reviewer evaluation; report persisted after every attempted step; resumes missing/failed only. */
export async function runReview(trace,opts,{invoke,initialPrevious,reportPath}={}){
 const dir=reportPath??null;const traceHash=sha(JSON.stringify(trace));
 const legacySource=initialPrevious??null;
 let report;
 if(dir&&fs.existsSync(path.join(dir,outName(REPORT,opts.redoLegacy)))){report=JSON.parse(fs.readFileSync(path.join(dir,outName(REPORT,opts.redoLegacy)),'utf8'));
  if(report.schema!=='myway_s61fix2_review_v1'||report.source_trace_sha256!==traceHash||report.options.model!==opts.model||report.options.limit!==opts.limit||report.options.redo_legacy!==opts.redoLegacy||report.options.mode!==opts.mode)throw Error('Existing FIX2 report cannot be resumed with different trace or options');
  report.source_trace=trace;
 }else report=initial(trace,opts,legacySource);
 const runEntry={started_at:new Date().toISOString(),attempted:[],model_calls:0,estimated_cost_usd:0,stopped_reason:null};report.runs.push(runEntry);
 const cases=trace.timeline.slice(0,opts.limit);
 const needed=cases.filter(s=>!report.reviews.some(r=>r.step===s.step&&(r.validation==='passed'||r.validation==='legacy_unverified')));
 if(opts.mode==='model'&&needed.length){const rate=PRICING[opts.model];const admission=needed.length*(17000*rate.input+1200*rate.output)/1e6;
  if(admission>opts.budget)throw Error(`FIX2 admission estimate $${admission.toFixed(4)} exceeds approved budget; no calls made`);}
 for(const step of needed){let packetInfo,answer=null,raw=null,usage=null,callMade=false,estimated=0,errors=[];
  try{packetInfo=makePacket(trace,step);
   if(opts.mode==='offline'){report.reviews=report.reviews.filter(r=>r.step!==step.step);report.reviews.push({step:step.step,validation:'not_run',evidence_ids:[],note:'Offline packet verification only',packet_evidence_ids:packetInfo.allowed_ids});continue;}
   const request={model:opts.model,store:false,max_tokens:1200,messages:[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify(packetInfo.packet)}],response_format:{type:'json_schema',json_schema:{name:'s61fix2_review',strict:true,schema:SCHEMA}}};
   if(Buffer.byteLength(JSON.stringify(request))>25000)throw Error('serialized_review_request_exceeds_25000_bytes');
   const response=invoke?await invoke(request,step):await callProvider(request,credentials());callMade=true;report.ledger.calls++;runEntry.model_calls++;
   usage=response?.usage;raw=response?.raw??response;
   if(!usage){report.ledger.unknown_usage++;throw Error('reviewer_usage_unknown');}
   estimated=estimateCost(usage,opts.model);report.ledger.estimated_usd=+(report.ledger.estimated_usd+estimated).toFixed(9);runEntry.estimated_cost_usd=+(runEntry.estimated_cost_usd+estimated).toFixed(9);
   if(runEntry.estimated_cost_usd>opts.budget)throw Error('reviewer_estimated_budget_exceeded');
   answer=typeof raw==='string'?JSON.parse(raw):raw;
   errors=validate(answer,packetInfo.allowed_ids);if(errors.length)throw Error('review_validation_failed');
   report.reviews=report.reviews.filter(r=>r.step!==step.step);
   report.reviews.push({step:step.step,validation:'passed',legacy:false,...answer,packet_evidence_ids:packetInfo.allowed_ids,
    packet_bytes:packetInfo.input_bytes,review_packet:packetInfo.packet,missing_cited_ids:packetInfo.packet.coverage.missing_cited_or_current_ids,
    omitted_extra_ids:packetInfo.packet.coverage.extra_retrieval_ids_omitted});
  }catch(e){const diagnostic={error:String(e.message).slice(0,250),errors,call_made:callMade,packet_evidence_ids:packetInfo?.allowed_ids??[],
   packet_bytes:packetInfo?.input_bytes??null,review_packet:packetInfo?.packet??null,response_sha256:raw===null?null:sha(typeof raw==='string'?raw:JSON.stringify(raw)),
   rejected_response_excerpt:raw===null?null:String(typeof raw==='string'?raw:JSON.stringify(raw)).slice(0,1200)};
   report.reviews=report.reviews.filter(r=>r.step!==step.step);
   report.reviews.push({step:step.step,validation:'failed',...diagnostic});
   // Preserve financial integrity: no subsequent paid calls if provider/cost problem is systemic.
   if(!callMade||/budget|usage_unknown/.test(String(e.message))){runEntry.stopped_reason=String(e.message);if(dir)persist(report,dir);break;}
  }finally{runEntry.attempted.push(step.step);if(dir)persist(report,dir);}
 }
 const fresh=report.reviews.filter(r=>r.validation==='passed'&&!r.legacy).length;
 const legacy=report.reviews.filter(r=>r.validation==='legacy_unverified').length;
 report.complete=report.target_steps.every(i=>report.reviews.some(r=>r.step===i&&(r.validation==='passed'||r.validation==='legacy_unverified'||opts.mode==='offline'&&r.validation==='not_run')));
 report.full_fix2_coverage=fresh===report.target_steps.length;
 runEntry.finished_at=new Date().toISOString();if(dir)persist(report,dir);
 return publicReport(report);
}
async function main(){const opts=parse(process.argv.slice(2));const file=path.resolve(opts.trace);
 const base=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16b61');
 if(!file.startsWith(base+path.sep)||path.basename(file)!=='trace.json'||!fs.statSync(file).isFile())throw Error('FIX2 only reviews an existing S61 trace.json in ignored report folder');
 const trace=JSON.parse(fs.readFileSync(file,'utf8'));if(trace.schema!=='myway_s16b61_longitudinal_v1')throw Error('Wrong trace schema');
 const dir=path.dirname(file),old=path.join(dir,'INDEPENDENT_MODEL_REVIEW.json');const previous=fs.existsSync(old)?JSON.parse(fs.readFileSync(old,'utf8')):null;
 const out=await runReview(trace,opts,{initialPrevious:previous,reportPath:dir});
 const counts={fix2_passed:out.reviews.filter(x=>x.validation==='passed').length,legacy_uncalibrated:out.reviews.filter(x=>x.validation==='legacy_unverified').length,
 failed:out.reviews.filter(x=>x.validation==='failed').length,complete_with_legacy:out.complete,full_fix2_coverage:out.full_fix2_coverage,
 calls:out.ledger.calls,estimated_usd:out.ledger.estimated_usd};
 console.log('S61-FIX2 INDEPENDENT REVIEW '+path.join(dir,outName(REPORT,opts.redoLegacy)));console.log('S61-FIX2 REVIEW STATUS '+JSON.stringify(counts));
 if(!out.complete)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S61-FIX2 REVIEW STOP '+String(e.message).slice(0,400));process.exitCode=1;});
