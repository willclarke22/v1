#!/usr/bin/env node
/** FIX6A: inspect prior FIX4 frozen research and prepare context counterfactuals.
 * Offline only. Does not call model APIs, embedding services or databases. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {STAGE,sha,buildAssessmentVariants,buildHandoffVariants} from './s62bfix1r42fix6a-context.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const safeID=v=>/^[a-zA-Z0-9_-]{1,60}$/.test(v??'');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const save=(p,obj)=>fs.writeFileSync(p,JSON.stringify(obj,null,2)+'\n',{flag:'wx'});
function parse(argv){
 const arg={'--root':'root','--mode':'mode','--run-id':'runId','--source-audit':'auditDir','--source-state':'stateFile','--reports-dir':'reportsDir','--case-ids':'caseIds','--target-bytes':'targetBytes'};
 const o={root:path.resolve(HERE,'../../..'),mode:'plan',runId:'fix6a_context_01',auditDir:'',stateFile:'',reportsDir:'',caseIds:'all',targetBytes:110000};
 for(let i=0;i<argv.length;i++){
  if(!arg[argv[i]]||i+1>=argv.length)throw Error('Invalid FIX6A argument '+argv[i]);o[arg[argv[i]]]=argv[++i];
 }
 if(!['plan','prepare'].includes(o.mode)||!safeID(o.runId)||!(o.caseIds==='all'||o.caseIds.split(',').every(x=>/^R\d\d_b(?:only|plusx)$/.test(x))))throw Error('Invalid mode, RunId or case IDs');
 o.targetBytes=Number(o.targetBytes);
 if(!Number.isInteger(o.targetBytes)||o.targetBytes<40000||o.targetBytes>500000)throw Error('Target bytes must be 40000..500000');
 o.root=path.resolve(o.root);
 o.auditDir=o.auditDir?path.resolve(o.auditDir):path.join(o.root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix4','audits','fix4_model_a_audit_01');
 o.stateFile=o.stateFile?path.resolve(o.stateFile):path.join(o.root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix2','paireds','fix3_paid_complete20_01','STATE.json');
 o.reportsDir=o.reportsDir?path.resolve(o.reportsDir):path.join(o.root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix2','paireds');
 o.out=path.join(o.root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix6a','context-audits',o.runId);
 return o;
}
function source(o){
 const summary=read(path.join(o.auditDir,'AUDIT.json'));
 if(summary.stage!=='S62B-FIX1R42FIX4'||summary.paired_rounds!==20||summary.learning_visits!==40||summary.provider_calls!==0)throw Error('Wrong FIX4 audit: require original 20-round paired study');
 const snap=read(o.stateFile);
 if(snap.schema!=='myway_r42fix2_paired_state_v1'||snap.completed_rounds!==20||snap.state_sha256!==sha(snap.state))throw Error('Final state hash / schema / round mismatch');
 const all=summary.review_case_ids;
 if(!Array.isArray(all)||!all.length)throw Error('FIX4 audit has no saved cases');
 const chosen=o.caseIds==='all'?all:o.caseIds.split(',');
 for(const id of chosen)if(!all.includes(id))throw Error('FIX4 did not audit case: '+id);
 const cases=chosen.map(id=>{const c=read(path.join(o.auditDir,'cases',id+'.json'));if(c.case_id!==id||!c.pre_a?.valid||!c.post_a?.valid)throw Error('Invalid FIX4 case '+id);return c;});
 return {summary,snap,cases,source_hashes:{audit_json:sha(fs.readFileSync(path.join(o.auditDir,'AUDIT.json'),'utf8')),state_json:sha(fs.readFileSync(o.stateFile,'utf8')),state_object:snap.state_sha256}};
}
function sourceBRequest(o,c){
 const next=c.subsequent_same_topic_visit;
 if(!next)return {error:'No later same-topic visit; no B follow-up context comparison possible'};
 const runs=['fix2_paid_pilot_1','fix2_paid_rounds2to5','fix2_paid_rounds6to10','fix2_paid_rounds11to15','fix2_paid_rounds16to20_retry01','fix3_paid_complete20_01'];
 for(const name of runs){const file=path.join(o.reportsDir,name,'TRACE.json');if(!fs.existsSync(file))continue;
  const trace=read(file), hits=(trace.requests??[]).filter(r=>r.round===next.round&&r.arm===c.arm&&['B','B_ONE'].includes(r.role)&&r.request?.messages?.[1]?.role==='user');
  for(const hit of hits){let input;try{input=JSON.parse(hit.request.messages[1].content)}catch{continue;}
   if(input.learner_request!==next.learner_opening?.learner_utterance)continue;
   return {request:hit.request,nextRound:next.round,trace_run:name};
  }
 }
 return {error:'Exact original subsequent B request missing or learner opening mismatch; no synthetic request was substituted'};
}
function runPlan(o,src){const base={stage:STAGE,mode:o.mode,run_id:o.runId,research_only:true,model_calls:0,database_writes:0,embedding_calls:0,
  source_audit:o.auditDir,source_state:o.stateFile,source_hashes:src.source_hashes,case_ids:src.cases.map(x=>x.case_id),planned_A_assessments:src.cases.length*2,
  target_bytes:o.targetBytes,comparison_variants:['original','expanded','evidence_aware'],no_model_inference:true};
 return base;
}
function reportText(plan,summaries,errors){
 const rows=summaries.flatMap(x=>x.a.map(a=>`| ${x.id} | ${a.stage} | ${a.retrieved_not_delivered} | ${a.stored_not_retrieved} | ${a.stored_source_projection} | ${a.original_bytes} | ${a.expanded_bytes} | ${a.aware_bytes} | ${a.aware_added} |`)).join('\n');
 const b=summaries.filter(x=>x.b?.prepared);
 return `# FIX6A: context integrity and memory continuity — research-only review\n\n`+
 `**Source:** Frozen FIX4 audit + hash-verified 20-round paired final state. No new model/provider/DB/embedding calls. Model prompts are byte-for-byte unchanged.\n\n`+
 `**Prepared:** ${summaries.length} cases; ${summaries.length*2} A assessments; ${b.length} subsequent B handoff packets. Target evidence-aware context ${plan.target_bytes} UTF-8 JSON bytes. Token estimates are rough bytes/4 proxies, NOT tokenizer measurements.\n\n`+
 `## Context audit (candidate observations are not automatically material)\n\n`+
 `| Case | Stage | Retrieved not delivered | Stored not retrieved | Delivered text shorter than stored | Original bytes | Expanded bytes | Evidence-aware bytes | New included |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n${rows}\n\n`+
 `## Interpretation\n\n`+
 `- **Original**: exactly the previously recorded Model A request payload and system prompt. The current observation may also appear in the original observations array; it is not historical evidence.\n`+
 `- **Expanded**: all original observations plus eligible earlier saved historical observations. No later-visit observations enter; this is a counterfactual, not what the old model actually saw.\n`+
 `- **Evidence-aware**: retains original inputs, adds whole saved historical observations prioritized by evidence references, same topic, retrieval selection and recency. Skipped originals are listed individually if the context target is reached. No mid-sentence clipping.\n`+
 `- **B follow-up**: retains the original B call; explicitly adds the *full* recorded A claim or a counterfactual evidence-linked memory. A's competence interpretation is NOT independently verified.\n`+
 `- **Key limitation**: R4.2 initially saved some text as a short observation projection (e.g. 2,300 chars); FIX6A can retrieve the full *saved* observation and audit associated source traces, but cannot recover content never persisted.\n`+
 `- **New upper bound**: the 34 KB guard belongs to the existing R4.2 runner. FIX6A only prepares and compares JSON; it does NOT alter production/runners, nor assert that expanded packets can be fed to the old runner unchanged.\n\n`+
 `## Reviewer questions\n\n`+
 `1. Did the added evidence materially change the learner's status or root hypotheses, or was it redundant?\n`+
 `2. Were earlier demonstrations coached, independently checked, contradicted, or only claimed by Model A?\n`+
 `3. Would Model B adapt better to the additional context, not merely write a longer answer?\n`+
 `4. Should a knowledge record exist, or would source observation retrieval plus a clear brief suffice?\n`+
 `5. Which relevant events were unavailable even before retrieval because capture-time projection had already lost detail?\n\n`+
 `## Source or packet limitations\n\n${errors.length?errors.map(e=>'- '+e).join('\n'):'- No source/packet exceptions encountered.'}\n\n`+
 `## Output\n\nA_PACKETS/*.json contains the exact original and two counterfactual full input/request variants. B_PACKETS/*.json contains original next-visit B requests and two explicit context alternatives where available. SUMMARY.json has delivered IDs and audit summaries.\n`;
}
async function main(){
 const o=parse(process.argv.slice(2)),src=source(o),plan=runPlan(o,src);
 if(o.mode==='plan'){console.log('FIX6A PLAN (0 provider/DB/embedding calls)\n'+JSON.stringify(plan,null,2));return;}
 if(fs.existsSync(o.out))throw Error('Output RunId already exists; use a fresh one: '+o.out);
 // Fully prepare in memory first, then create output directory after all A checks pass.
 const generated=[],bPackets=[],errors=[];
 for(const c of src.cases){
  const branch=src.snap.state.branches[c.arm];
  const a=['pre','post'].map(stage=>buildAssessmentVariants(c,stage,branch,{targetBytes:o.targetBytes}));
  generated.push({c,a});
  const original=sourceBRequest(o,c);
  if(original.request){
   const fullStored=branch.observations.find(x=>x.id===c.post_a.current_id)??null;
   const b=buildHandoffVariants(c,original.request,{nextRound:original.nextRound,fullStoredObservation:fullStored});
   bPackets.push({case_id:c.case_id,source_run:original.trace_run,payload:b});
  }else errors.push(`${c.case_id}: B follow-up unavailable: ${original.error}`);
 }
 const summaries=generated.map(({c,a})=>{
  const b=bPackets.find(x=>x.case_id===c.case_id);
  return {id:c.case_id,round:c.round,arm:c.arm,topic_id:c.topic_id,b:b?{prepared:true,source_run:b.source_run,next_round:b.payload.next_round}: {prepared:false},
   a:a.map(x=>({stage:x.stage,original_bytes:x.variants[0].input_bytes,expanded_bytes:x.variants[1].input_bytes,aware_bytes:x.variants[2].input_bytes,
    retrieved_not_delivered:x.retrieved_but_not_delivered.length,stored_not_retrieved:x.stored_but_not_retrieved.length,stored_source_projection:x.original_delivery_text_projection_detected.length,
    aware_added:x.evidence_aware_added.length,aware_skipped_budget:x.evidence_aware_omitted_for_budget.length,
    omitted_ids:x.reported_omissions,source_eligible_ids:x.source_eligible_ids,
    historical_delivered_ids:x.variants.map(v=>({name:v.name,ids:v.delivered_historical_ids,sha256:v.input_sha256}))}))};
 });
 fs.mkdirSync(path.join(o.out,'A_PACKETS'),{recursive:true});fs.mkdirSync(path.join(o.out,'B_PACKETS'),{recursive:true});
 save(path.join(o.out,'PLAN.json'),plan);
 for(const {c,a} of generated)for(const packet of a)save(path.join(o.out,'A_PACKETS',`${c.case_id}_${packet.stage}.json`),packet);
 for(const b of bPackets)save(path.join(o.out,'B_PACKETS',`${b.case_id}.json`),b);
 const summary={...plan,mode:'prepare',completed:true,prepared_A_assessments:generated.length*2,prepared_A_variants:generated.length*2*3,prepared_B_handoffs:bPackets.length,prepared_B_variants:bPackets.length*3,
  source_limitations:errors,source_hashes:src.source_hashes,cases:summaries,provider_calls:0,database_writes:0,embedding_calls:0};
 save(path.join(o.out,'SUMMARY.json'),summary);
 fs.writeFileSync(path.join(o.out,'REPORT.md'),reportText(plan,summaries,errors),{flag:'wx'});
 save(path.join(o.out,'TRACE.json'),{stage:STAGE,mode:'prepare',run_id:o.runId,completed:true,model_calls:0,provider_calls:0,embedding_calls:0,db_writes:0,
  source_hashes:src.source_hashes,packets_sha256:sha(summaries),prompts_unchanged:true,historical_relevance_not_ground_truth:true});
 console.log('FIX6A PREPARE PASS '+JSON.stringify({run_id:o.runId,output:o.out,cases:summaries.length,assessments:generated.length*2,b_handoffs:bPackets.length,model_calls:0,db_writes:0}));
}
main().catch(e=>{console.error('FIX6A STOP: '+String(e.stack??e));process.exitCode=1;});
