#!/usr/bin/env node
/**
 * FIX5: immutable evidence replay and matched model tests; no model/prompt changes.
 * Offline prepare/plan/embedding-test; paid model only with explicit authorization.
 * Model L is fictional; human judgment is required for educational conclusions.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const sha=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const clone=v=>structuredClone(v);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const write=(p,o)=>fs.writeFileSync(p,JSON.stringify(o,null,2)+'\n');
const size=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
const safeId=s=>/^[A-Za-z0-9_-]{1,48}$/.test(s||'');
const rootDefault=path.resolve(HERE,'../../..');
const argmap={'--root':'root','--run-id':'runId','--mode':'mode','--lab':'lab','--case-ids':'caseIds','--source-audit':'sourceAudit','--source-state':'sourceState','--reports-dir':'reportsDir','--budget-usd':'budget'};
function parse(argv){const a={root:rootDefault,runId:'fix5a_plan',mode:'plan',lab:'assessment',caseIds:'R14_bonly,R15_bonly',sourceAudit:'',sourceState:'',reportsDir:'',budget:null,allowSpend:false};
 for(let i=0;i<argv.length;i++){let v=argv[i];if(v==='--allow-spend'){a.allowSpend=true;continue;}if(!argmap[v]||i+1>=argv.length)throw Error('Unknown/missing argument '+v);a[argmap[v]]=argv[++i];}
 if(!['plan','prepare','model','embedding-test'].includes(a.mode)||!['assessment','handoff'].includes(a.lab)||!safeId(a.runId))throw Error('Invalid FIX5A mode/lab/RunId');
 a.root=path.resolve(a.root);a.sourceAudit=a.sourceAudit?path.resolve(a.sourceAudit):path.join(a.root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix4','audits','fix4_model_a_audit_01');
 a.sourceState=a.sourceState?path.resolve(a.sourceState):path.join(a.root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix2','paireds','fix3_paid_complete20_01','STATE.json');
 a.reportsDir=a.reportsDir?path.resolve(a.reportsDir):path.join(a.root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix2','paireds');
 a.caseIds=a.caseIds.split(',').map(x=>x.trim()).filter(Boolean);if(!a.caseIds.length||a.caseIds.length>12||a.caseIds.some(x=>!/^R\d\d_b(?:only|plusx)$/.test(x))||new Set(a.caseIds).size!==a.caseIds.length)throw Error('Invalid case IDs (1–12 unique)');
 a.budget=a.budget===null?null:Number(a.budget);if(a.budget!==null&&(!Number.isFinite(a.budget)||a.budget<=0||a.budget>20))throw Error('Invalid budget ($0–$20)');
 if(a.mode==='model'&&(!a.allowSpend||a.budget===null))throw Error('Paid mode requires --allow-spend and --budget-usd');
 a.out=path.join(a.root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix5a',a.lab+'s',a.runId);
 return a;}
function source(a){const dir=a.sourceAudit,base=read(path.join(dir,'AUDIT.json'));
 if(base.stage!=='S62B-FIX1R42FIX4'||base.paired_rounds!==20||base.learning_visits!==40||base.review_cases!==12||base.provider_calls!==0)throw Error('FIX4 provenance missing or unexpected');
 const aud=fs.readFileSync(path.join(dir,'AUDIT.json'));const snap=read(a.sourceState);
 if(snap.completed_rounds!==20||snap.schema!=='myway_r42fix2_paired_state_v1'||snap.state_sha256!==sha(snap.state))throw Error('Final research state integrity mismatch');
 if(!snap.state?.branches?.['b-only']||!snap.state?.branches?.['b+x'])throw Error('Missing independent learner branches');
 const cases=a.caseIds.map(id=>{const v=read(path.join(dir,'cases',id+'.json'));if(v.case_id!==id||!v.pre_a?.valid||!v.post_a?.valid||v.round>20)throw Error('Invalid FIX4 case '+id);return v;});
 return {audit:base,auditSha:sha(aud.toString('utf8')),state:snap.state,cases};}
function sourceObs(c,state){const key=c.arm==='b-only'?'b-only':'b+x';const arr=state.branches[key].observations;
 return new Map(arr.filter(o=>o.id&&/ATLAS-\d\d\d-(?:IN|OUT)$/.test(o.id)).map(o=>[o.id,o]));}
function reqForA(c){const rec=c.post_a.all_model_A_calls.filter(r=>r.status==='returned'&&r.request?.messages?.length===2).at(-1);
 if(!rec)throw Error('No exact returned post-A request '+c.case_id);
 const request=clone(rec.request),original=JSON.parse(request.messages[1].content);
 if(request.messages[0].role!=='system'||request.messages[1].role!=='user'||original.current?.id!==c.post_a.current_id)throw Error('Original A request mismatch '+c.case_id);
 if(sha(original)!==sha(c.post_a.delivered_input))throw Error('FIX4 request input differs from inspector '+c.case_id);
 return {request,input:original,record:rec};}
function evidenceVariants(c,state){const {request,input}=reqForA(c);const originalIds=new Set(input.observations.map(e=>e.id));
 const allow=new Set(c.post_a.context_packing?.original_evidence_ids??[]);const omitted=(c.post_a.reported_omissions??[]).filter(id=>allow.has(id)&&!originalIds.has(id));
 const byId=sourceObs(c,state);const currentNum=c.round;let candidates=[];
 for(const id of omitted){const o=byId.get(id);if(!o)continue;const r=Number(id.match(/ATLAS-(\d+)/)?.[1]);if(!Number.isFinite(r)||r>currentNum)throw Error('Future evidence cannot enter '+c.case_id+': '+id);
  const text=String(o.text??'');const compact=String(o.compact_index_text??text).slice(0,1500);
  candidates.push({id:o.id,topic_id:o.topic_id,kind:o.kind,text:compact,compact_index_text:compact});}
 // Replay evidence selection, not an oracle: prefer same-topic omissions then retrieval preview rank.
 const ranks=new Map((c.post_a.original_retrieval.ranked_preview??[]).map((r,i)=>[r.id,i]));
 candidates.sort((x,y)=>Number(y.topic_id===c.topic_id)-Number(x.topic_id===c.topic_id)||(ranks.get(x.id)??1e6)-(ranks.get(y.id)??1e6));
 const output=clone(input);let changes=[],removed=[];
 // Equal-size counterfactual swap: remove at most two lowest-ranked HISTORICAL entries. No current/cited memory IDs can be replaced.
 const protectedIds=new Set([input.current.id,...(input.memory_candidates??[]).flatMap(m=>[...(m.evidence_ids??[]),...(m.supporting_evidence_ids??[]),...(m.contradicting_evidence_ids??[])])]);
 for(const add of candidates.filter(x=>x.topic_id===c.topic_id).slice(0,2)){
  const removable=[...output.observations].filter(x=>!protectedIds.has(x.id)&&x.id!==add.id&&x.topic_id!==c.topic_id&&!changes.some(y=>y.added_id===x.id))
   .sort((x,y)=>(ranks.get(y.id)??1e6)-(ranks.get(x.id)??1e6));
  if(!removable.length)continue;const drop=removable[0];const pos=output.observations.findIndex(x=>x.id===drop.id);
  output.observations.splice(pos,1,add);
  const ids=new Set(output.observations.map(x=>x.id));
  output.allowed_evidence_ids=[...new Set([input.current.id,...output.observations.map(x=>x.id)])];
  if(output.coverage?.context_packing){const p=output.coverage.context_packing;p.retained_evidence_ids=[...ids];p.omitted_evidence_ids=(p.original_evidence_ids??[]).filter(id=>!ids.has(id)&&id!==input.current.id);p.note='FIX5A counterfactual rebalanced historical evidence; original source input unchanged. Equal-count swap, no new/future observation and no ground-truth relevance claim.';p.after_bytes=size(output);}
  if(size(output)>34000){output.observations.splice(pos,1,drop);output.allowed_evidence_ids=clone(input.allowed_evidence_ids);output.coverage=clone(input.coverage);continue;}
  changes.push({added_id:add.id,removed_id:drop.id,source:'previously_selected_but_omitted_reconstructed_from_final_frozen_observations',same_topic:add.topic_id===c.topic_id});removed.push(drop.id);
 }
 const original={input,request,sha:sha(input)};const enriched={input:output,request:{...clone(request),messages:[request.messages[0],{role:'user',content:JSON.stringify(output)}]},sha:sha(output)};
 if(sha(input.current)!==sha(output.current)||sha(input.activity_actual_evidence)!==sha(output.activity_actual_evidence)||sha(input.memory_candidates)!==sha(output.memory_candidates))throw Error('Current evidence or memory changed');
 for(const row of output.observations){const n=Number(row.id.match(/ATLAS-(\d+)/)?.[1]);if(n>c.round)throw Error('Evidence from future visit');}
 if(size(output)>34000)throw Error('Counterfactual too large');
 return {original,enriched,changes,omitted_missing_text:omitted.filter(x=>!byId.has(x)),omitted_ids:omitted,review_note:changes.length?'Historical evidence was swapped by transparent retrieval heuristic, NOT independently adjudicated as more relevant.':'No admissible equal-size historical swap available; comparison arms have identical input.'};}
function sourceBRequest(a,caseId,round,arm){const names=['fix2_paid_pilot_1','fix2_paid_rounds2to5','fix2_paid_rounds6to10','fix2_paid_rounds11to15','fix2_paid_rounds16to20_retry01','fix3_paid_complete20_01'];
 for(const name of names){const file=path.join(a.reportsDir,name,'TRACE.json');if(!fs.existsSync(file))continue;const trace=read(file);
  const hit=(trace.requests??[]).find(r=>r.round===round&&r.arm===arm&&['B','B_ONE'].includes(r.role)&&r.request?.messages?.[1]);
  if(hit)return {request:clone(hit.request),source_run:name};}
 throw Error('Cannot reconstruct exact subsequent B request: '+caseId);}
function handoffPackets(a,c){const next=c.subsequent_same_topic_visit;if(!next)throw Error('No subsequent same-topic visit for '+c.case_id);
 const {request,source_run}=sourceBRequest(a,c.case_id,next.round,c.arm);const orig=JSON.parse(request.messages[1].content);
 if(typeof orig.learner_request!=='string'||orig.learner_request!==next.learner_opening.learner_utterance)throw Error('B source learner request does not match next visible opening');
 const summary=String(c.post_a.structured_output?.observed?.demonstrated??'').slice(0,450);
 if(!summary)throw Error('No model A observed demonstration to test, choose another case');
 const conditions=c.post_a.current_observation?.task_conditions??{};
 const statement=`Earlier learner attempt ${c.post_a.current_id}: ${summary}. Conditions: prior teaching=${Boolean(conditions.teacher_explanation_presented_before_attempt)}, objective outcome verified=${Boolean(conditions.objective_outcome_verified)}; provisional, not independent mastery. This is previously observed and not a new test result.`;
 const baseline=clone(orig),brief=clone(orig),record=clone(orig);
 if(!brief.learner_brief||!record.learner_brief)throw Error('Missing original B learner brief');
 brief.learner_brief.assessment={...brief.learner_brief.assessment,relevant_history:(brief.learner_brief.assessment.relevant_history??'')+' Prior evidence: '+statement};
 record.learner_brief.prior_knowledge=[...(record.learner_brief.prior_knowledge??[]),{kind:'counterfactual_provisional_competence',source_evidence_id:c.post_a.current_id,description:statement,confidence:'limited_to_observed_conditions'}];
 const packets=[['original',baseline],['explicit_brief',brief],['provisional_record',record]];
 return {source_run,source_round:next.round,source_evidence_id:c.post_a.current_id,claim_source:'recorded Model A demonstrated field (not an independent correctness judgment)',statement,variants:packets.map(([name,input])=>({name,input,request:{...clone(request),messages:[request.messages[0],{role:'user',content:JSON.stringify(input)}]},sha:sha(input)}))};}
function makePackets(a,s){return s.cases.map(c=>{
 if(a.lab==='assessment'){const e=evidenceVariants(c,s.state);return {case_id:c.case_id,round:c.round,arm:c.arm,topic:c.topic_title,original_recorded_output:c.post_a.structured_output,original_recorded_response:c.post_a.raw_model_output,source_run:c.source_run,source_evidence_id:c.post_a.current_id,reported_omissions:c.post_a.reported_omissions,corrected_selected_but_not_delivered:c.post_a.reported_omissions,variants:[{name:'original',...e.original},{name:'rebalanced',...e.enriched}],change_log:e.changes,review_note:e.review_note,original_input_sha:e.original.sha};}
 const h=handoffPackets(a,c);return {case_id:c.case_id,round:c.round,arm:c.arm,topic:c.topic_title,source_run:c.source_run,source_evidence_id:h.source_evidence_id,original_teacher_output:c.subsequent_same_topic_visit?.teacher_response,change_log:[{statement:h.statement,source:h.claim_source}],variants:h.variants,source_round:h.source_round};});}
function modelMatrix(a,packets){const jobs=[];for(const c of packets){const models=a.lab==='assessment'?['gpt-4.1-mini','gpt-4.1']:['gpt-4.1-mini'];for(const model of models){const seen=new Set();for(const v of c.variants){if(seen.has(v.sha))continue;seen.add(v.sha);jobs.push({case_id:c.case_id,model,variant:v.name,request:{...clone(v.request),model,store:false},input_sha256:v.sha});}}}return jobs;}
function validateResponse(job,raw){let parsed;try{parsed=JSON.parse(raw);}catch{return {valid_json:false,valid_structure:false,current_citation:null,reason:'not-json'};}
 if(job.request.messages[0].content.includes('learner-understanding investigator')){const input=JSON.parse(job.request.messages[1].content);const obs=parsed?.observed;const cited=obs?.evidence_ids;
  const allowed=new Set([input.current?.id,...(input.allowed_evidence_ids??[])]);return {valid_json:true,valid_structure:!!(obs&&parsed?.interpretation&&Array.isArray(parsed?.memory_decisions)&&parsed?.learner_brief_for_B),current_citation:Array.isArray(cited)?cited.includes(input.current.id):false,cited_unsupported:Array.isArray(cited)?cited.filter(id=>!allowed.has(id)):[],memory_proposals_count:parsed.memory_decisions?.length??null,uncertainty:parsed.interpretation?.uncertainty??null};}
 return {valid_json:true,valid_structure:typeof parsed?.teacher_response==='string',current_citation:null,proposal_present:!!parsed?.experience_proposal};}
function envParse(file){if(!fs.existsSync(file))return{};const out={};for(const row of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=row.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);if(m)out[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');}return out;}
async function provider(req,root){const env=envParse(path.join(root,'.env.local'));
 // Reuse existing MyWay provider implementation; fail closed if it is unavailable.
 const sdk=await import(pathToFileURL(path.join(HERE,'s16b54-models.mjs')).href);
 const key=process.env.OPENAI_API_KEY||env.OPENAI_API_KEY||env.MYWAY_OPENAI_API_KEY;
 if(!key)throw Error('Missing OPENAI_API_KEY/.env.local');
 if(!process.env.OPENAI_API_KEY)process.env.OPENAI_API_KEY=key;
 if(!process.env.OPENAI_BASE_URL&&env.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=env.OPENAI_BASE_URL;
 const context=sdk.credentials();return sdk.callProvider(req,context);}
function docs(out,packets,jobs,results,a){const rows=results.map(r=>`| ${r.case_id} | ${r.variant} | ${r.model} | ${r.status} | ${r.validation?.current_citation??'—'} | ${r.validation?.memory_proposals_count??'—'} |`).join('\n');
 fs.writeFileSync(path.join(out,'REVIEW.md'),`# FIX5A — controlled evaluation review\n\nThis is fictional-learner research and NOT a benchmark with ground-truth decisions. Current model prompts are unchanged.\n\nLab: ${a.lab}. Cases: ${packets.length}. Calls planned: ${jobs.length}. Completed: ${results.filter(r=>r.status==='returned').length}.\n\nFor assessment, compare original-vs-rebalanced evidence, then GPT-4.1 mini-vs-GPT-4.1. Rebalanced evidence is an *auditable counterfactual*, not guaranteed to be better; inspect each swap and the exact inputs before judging.\n\nFor handoff, compare the original B learner brief against the same previously observed evidence presented explicitly and as a hypothetical provisional record. Neither is newly verified correctness.\n\n| Case | Evidence condition | Model | Status | Current citation | Memory proposals |\n|---|---|---|---|---|---|\n${rows}\n\n## Reviewer questions\n\n- Was the math or conceptual claim independently verifiable from the presented task?\n- Did assistance, hints, failure or missing visuals change what can be inferred?\n- Did A cite the current evidence and correct historical sources?\n- Did a memory proposal improve future teaching versus relying on observation retrieval?\n- Did B actually adapt the next teaching task, rather than merely restating information?\n- What was retrieved, omitted, and swapped? No retrospective future observations are allowed.\n- If a model fails, is it due to absent evidence, prompt, reasoning, interface, or evaluator ambiguity?\n\nDo not infer model superiority from a single case, verbosity, or memory count.\n`);
 const lines=['case_id,variant,model,status,current_citation,memory_proposals_count,estimated_usd'];for(const r of results)lines.push([r.case_id,r.variant,r.model,r.status,r.validation?.current_citation??'',r.validation?.memory_proposals_count??'',r.estimated_usd??''].map(x=>JSON.stringify(String(x))).join(','));fs.writeFileSync(path.join(out,'RESULTS.csv'),lines.join('\n')+'\n');}
async function run(a){if(a.mode==='embedding-test'){const out=a.out;if(fs.existsSync(out))throw Error('RunId already used');fs.mkdirSync(out,{recursive:true});const res=await embeddingLifecycle();write(path.join(out,'EMBEDDING_LIFECYCLE.json'),res);console.log('FIX5A EMBEDDING TEST',JSON.stringify(res));return;}
 const src=source(a),packets=makePackets(a,src),jobs=modelMatrix(a,packets);
 const unchanged=packets.flatMap(p=>p.variants.filter(v=>v.name==='rebalanced'&&v.sha===p.original_input_sha)).length;
 const plan={stage:'S62B-FIX1R42FIX5A',lab:a.lab,run_id:a.runId,mode:a.mode,source_audit_sha256:src.auditSha,source_final_state_sha256:sha(src.state),cases:packets.map(p=>p.case_id),models:[...new Set(jobs.map(j=>j.model))],planned_model_calls:jobs.length,admission_usd:Number((jobs.length*0.12).toFixed(2)),rebalanced_unchanged_cases:unchanged,provider_calls_if_plan_or_prepare:0};
 console.log('FIX5A PLAN',JSON.stringify(plan));if(a.mode==='plan')return;
 if(a.mode==='model'&&plan.admission_usd>a.budget)throw Error(`Admission estimate ${plan.admission_usd} exceeds authorized budget ${a.budget}`);
 if(fs.existsSync(a.out))throw Error('RunId already exists; never overwrite '+a.out);fs.mkdirSync(a.out,{recursive:true});
 write(path.join(a.out,'PLAN.json'),plan);fs.mkdirSync(path.join(a.out,'cases'));
 for(const c of packets)write(path.join(a.out,'cases',c.case_id+'.json'),c);
 const state={stage:plan.stage,lab:a.lab,run_id:a.runId,mode:a.mode,complete:a.mode==='prepare',failure:null,plan,model_calls:0,estimated_usd:0,requests:[],db_writes:0};write(path.join(a.out,'TRACE.json'),state);
 if(a.mode==='prepare'){docs(a.out,packets,jobs,[],a);console.log('FIX5A PREPARE PASS | no paid calls | '+a.out);return;}
 let results=[];try{for(const job of jobs){const req=clone(job.request);req.store=false;const entry={case_id:job.case_id,model:job.model,variant:job.variant,request_sha256:sha(req),input_sha256:job.input_sha256,status:'prepared'};
   if(state.estimated_usd>=a.budget)throw Error('Spend threshold reached before call');state.requests.push(entry);write(path.join(a.out,'TRACE.json'),state);
   let response;const start=Date.now();try{response=await provider(req,a.root);}catch(e){entry.status='transport_unknown';write(path.join(a.out,'TRACE.json'),state);throw Error('Uncertain provider request status. Do not reuse RunId: '+e.message);}
   entry.status='returned';entry.duration_ms=Date.now()-start;entry.raw=typeof response.raw==='string'?response.raw:JSON.stringify(response.raw);entry.raw_sha256=sha(entry.raw);entry.usage=response.usage??null;
   if(!entry.usage)throw Error('Usage absent on returned provider call; do not retry');
   // Estimate using the installed MyWay pricing helper; record uncertainties explicitly.
   const {estimateCost}=await import(pathToFileURL(path.join(HERE,'s16b61fix1-models.mjs')).href);
   entry.estimated_usd=Number(estimateCost(entry.usage,job.model));state.model_calls++;state.estimated_usd=Number((state.estimated_usd+entry.estimated_usd).toFixed(9));
   entry.validation=validateResponse(job,entry.raw);results.push(entry);write(path.join(a.out,'TRACE.json'),state);
   if(state.estimated_usd>a.budget)throw Error('Estimated spending threshold exceeded after returned response');
  }state.complete=true;write(path.join(a.out,'TRACE.json'),state);
 }catch(e){state.failure={message:String(e.message),unknown_provider_result:state.requests.some(r=>r.status==='transport_unknown')};write(path.join(a.out,'TRACE.json'),state);docs(a.out,packets,jobs,results,a);console.error('FIX5A PARTIAL',e.message);process.exitCode=1;return;}
 docs(a.out,packets,jobs,results,a);console.log('FIX5A MODEL PASS',JSON.stringify({out:a.out,model_calls:state.model_calls,estimated_usd:state.estimated_usd}));}
async function embeddingLifecycle(){const {indexTexts,retrieveR3}=await import(pathToFileURL(path.join(HERE,'s62bfix1r3-retrieval.mjs')).href);let calls=0;
 const embedFn=async arr=>{calls++;return arr.map(t=>Array.from({length:384},(_,i)=>Number.parseInt(sha(t).slice(i%48,i%48+3),16)/4095));};
 const state={observations:[],records:[]};let x=await indexTexts(state,['text v1'],{embedFn});const first=calls;x=await indexTexts(state,['text v1'],{embedFn});const same=calls;x=await indexTexts(state,['text v2'],{embedFn});const changed=calls;
 state.observations.push({id:'O1',topic_id:'T1',text:'an earlier attempt'});const current={id:'O2',topic_id:'T1',text:'current attempt'};const packet=await retrieveR3(state,current,{embedFn});
 state.records.push({id:'R1',type:'root',status:'provisional',claim:'possible cause 1',evidence:{supports_current:['O1'],challenges_current:[]},topics:['T1']});await retrieveR3(state,current,{embedFn});const rootFirst=calls;state.records[0].claim='possible cause revised';await retrieveR3(state,current,{embedFn});const rootChanged=calls;
 const providerSameDimension={...clone(state),semantic_index:{...clone(state.semantic_index),model_revision:'different_revision'}};
 let modelRevisionRefused=false;try{await indexTexts(providerSameDimension,['text v2'],{embedFn});}catch{modelRevisionRefused=true;}
 const result={stage:'S62B-FIX1R42FIX5A',synthetic_vector_test:true,paid_model_calls:0,initial_calls:first,unchanged_calls:same,changed_text_calls:changed,root_first_calls:rootFirst,root_revision_calls:rootChanged,actual_cache_observation_keys:Object.keys(state.semantic_index.vectors).length,context_evidence_ids:packet.allowed_evidence_ids,model_revision_mismatch_refused:modelRevisionRefused,gaps:['Current cache lacks an authenticated embedding-model revision key; a same-provider/same-dimension model change is not proved safe','Old content hashes may remain in cache','Metadata-only corrections do not invalidate text-hash cache','No live MiniLM ranking or cloud-sync claims from synthetic test']};
 if(!(first===1&&same===1&&changed===2&&rootChanged>rootFirst&&packet.allowed_evidence_ids.includes('O1')))throw Error('Embedding lifecycle structural regression');return result;}
run(parse(process.argv.slice(2))).catch(e=>{console.error('FIX5A STOP',e.stack??String(e));process.exitCode=1;});
