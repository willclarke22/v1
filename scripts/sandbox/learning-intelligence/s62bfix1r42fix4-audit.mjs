#!/usr/bin/env node
/**
 * S62B-FIX1R4.2-FIX4: read-only transparency and evidence audit.
 * Reads existing paid research traces; NEVER invokes a provider, database, or learner simulation.
 * Judgments remain reviewer questions, not algorithmically inferred ground truth.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const clone=x=>structuredClone(x);
const write=(p,obj)=>fs.writeFileSync(p,JSON.stringify(obj,null,2)+'\n');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const REPORTS=['fix2_paid_pilot_1','fix2_paid_rounds2to5','fix2_paid_rounds6to10','fix2_paid_rounds11to15','fix2_paid_rounds16to20_retry01','fix3_paid_complete20_01'];
const SPEC=[
 {round:1,arm:'b-only',reason:'First visit: no previous understanding records'},
 {round:3,arm:'b+x',reason:'Conditional probability and numeric predictions'},
 {round:5,arm:'b+x',reason:'Return to probability; competing prior evidence'},
 {round:7,arm:'b-only',reason:'Graph slopes revisit, prior teaching context'},
 {round:9,arm:'b-only',reason:'Dimensional scaling and explanation'},
 {round:10,arm:'b+x',reason:'Longer historical context; exponential growth'},
 {round:11,arm:'b-only',reason:'Rejected experience and conversational response'},
 {round:14,arm:'b-only',reason:'Cooking-ratio competence after teaching'},
 {round:15,arm:'b-only',reason:'Exponential-growth numerical inconsistency'},
 {round:15,arm:'b+x',reason:'Medical testing/Bayes inference'},
 {round:17,arm:'b-only',reason:'Area-versus-volume transfer claim'},
 {round:20,arm:'b+x',reason:'Late-history retrieval and teaching handoff'}
];
const safeId=id=>/^[A-Za-z0-9_-]{1,40}$/.test(id);
function options(argv){const o={mode:'plan',runId:'fix4_audit',root:process.cwd(),reportsDir:null};for(let i=0;i<argv.length;i++){
 const k=argv[i];if(!['--mode','--run-id','--root','--reports-dir'].includes(k))throw Error('Unknown option '+k);
 if(i+1>=argv.length)throw Error('Missing value for '+k);const v=argv[++i];
 if(k==='--mode')o.mode=v;if(k==='--run-id')o.runId=v;if(k==='--root')o.root=v;if(k==='--reports-dir')o.reportsDir=v;
}if(!['plan','audit','embedding-test'].includes(o.mode)||!safeId(o.runId))throw Error('Bad mode/run-id');
 o.root=path.resolve(o.root);o.reportsDir=o.reportsDir?path.resolve(o.reportsDir):path.join(o.root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix2','paireds');
 o.output=path.join(o.root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix4','audits',o.runId);
 return o;}
function unwrap(r,name){const f=path.join(r,name);if(!fs.existsSync(f))throw Error('Report missing '+f);return read(f);}
function loadChain(base){let prior=null, entries=[],sources=[],statuses=[];
 for(const run of REPORTS){const dir=path.join(base,run),trace=unwrap(dir,'TRACE.json'),start=unwrap(dir,'START_STATE.json');
  const isPartial=run==='fix2_paid_rounds16to20_retry01', expectedEnd=isPartial?18:run==='fix3_paid_complete20_01'?20:null;
  const stop=isPartial?unwrap(dir,'CHECKPOINT.json'):unwrap(dir,'STATE.json');
  if(!Array.isArray(trace.entries)||trace.lab!=='paired'||start.schema!=='myway_r42fix2_paired_state_v1')throw Error('Unexpected paired report '+run);
  if(prior && start.state_sha256!==prior.state_sha256)throw Error('Broken report lineage entering '+run);
  if(start.state_sha256!==sha(start.state)||stop.state_sha256!==sha(stop.state))throw Error('Snapshot hash mismatch '+run);
  if(expectedEnd!==null && stop.completed_rounds!==expectedEnd)throw Error('Incorrect recovery checkpoint '+run);
  if(!isPartial && trace.complete!==true)throw Error('Non-complete source run '+run);
  if(isPartial && (trace.complete!==false||!trace.failure))throw Error('Expected partial recovery source '+run);
  const completed=trace.entries.filter(e=>e.completed===true && e.round<=stop.completed_rounds);
  if(completed.some(e=>!['b-only','b+x'].every(a=>e.arms?.[a]?.pre_a?.valid&&e.arms?.[a]?.post_a?.valid)))throw Error('Missing verified assessment in '+run);
  for(const e of completed){if(entries.some(x=>x.round===e.round))throw Error('Duplicate completed round '+e.round);entries.push({...clone(e),_source_run:run});}
  sources.push({run,trace_sha256:sha(trace),start_rounds:start.completed_rounds,end_rounds:stop.completed_rounds,complete:trace.complete,completed_rounds_from_trace:completed.map(e=>e.round),request_count:trace.requests?.length??0,replayed_calls:trace.replayed_calls??0,approx_cost_usd:trace.known_estimated_usd});
  statuses.push({run,trace,stop});prior=stop;
 }
 entries.sort((a,b)=>a.round-b.round);
 if(entries.length!==20||entries.some((e,i)=>e.round!==i+1)||prior.completed_rounds!==20)throw Error('Study not exactly 20 paired rounds');
 return {entries,sources,statuses,finalState:prior.state};
}
function requestRecords(traces,round,arm,phase){const records=[];
 for(const {run,trace} of traces){for(const r of trace.requests??[]){if(r.role!=='A'||r.arm!==arm||r.round!==round)continue;const rec=String(r.record??'');if(rec.startsWith(phase+':A'))records.push({run,record:rec,status:r.status,request_sha256:r.request_sha256,response_sha256:r.response_sha256,request:r.request,raw:r.raw,usage:r.usage??null});}}
 return records;
}
function assess(a,traceRequests){const input=a?.input??{},retrieval=a?.retrieval??{},out=a?.output??{},data=input.coverage?.context_packing??a?.context_packing??null;
 const selected=(retrieval.evidence??[]).map(x=>({id:x.id,topic_id:x.topic_id,kind:x.kind,text:x.text,compact_index_text:x.compact_index_text,reason:retrieval.selection_reasons?.[x.id]??null}));
 const delivered=(input.observations??[]).map(x=>({id:x.id,topic_id:x.topic_id,kind:x.kind,text:x.text,compact_index_text:x.compact_index_text}));
 const ids=new Set(delivered.map(x=>x.id));const reportedOmissions=data?.omitted_evidence_ids??[];
 return {valid:a?.valid??null,error:a?.error??null,current_id:input.current?.id??null,current_observation:input.current??null,
  original_retrieval:{coverage:retrieval.coverage??null,selected,ranked_preview:retrieval.ranked_preview??[],selection_reasons:retrieval.selection_reasons??{},allowed_ids:retrieval.allowed_evidence_ids??[],memory_candidates:retrieval.memory_candidates??[]},
  delivered_input:input,delivered_observations:delivered,selected_but_not_delivered:selected.filter(x=>!ids.has(x.id)).map(x=>x.id),reported_omissions:reportedOmissions,
  context_packing:data,raw_model_output:a?.raw??null,structured_output:out,proposed_memory_actions:a?.proposed_memory_actions??[],applied_changes:a?.changes??[],rejected_actions:a?.rejected_memory_actions??[],memory_before:a?.memory_before??[],memory_after:a?.memory_after??[],
  more_history_requested:a?.more_history_requested??null,validation_retry:a?.validation_retry??null,all_model_A_calls:traceRequests,
  cited_current:Array.isArray(out?.observed?.evidence_ids)&&out.observed.evidence_ids.includes(input.current?.id)
 };
}
function htmlEscape(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function auditCase(c,e,chain){const a=e.arms?.[c.arm];if(!a||!a.pre_a?.valid||!a.post_a?.valid)throw Error('Missing valid case '+c.round+' '+c.arm);
 const pre=assess(a.pre_a,requestRecords(chain.statuses,c.round,c.arm,'pre'));
 const post=assess(a.post_a,requestRecords(chain.statuses,c.round,c.arm,'post'));
 const next=chain.entries.find(x=>x.round>c.round&&x.arms?.[c.arm]?.topic_id===a.topic_id);
 const nextBranch=next?.arms[c.arm];
 return {case_id:`R${String(c.round).padStart(2,'0')}_${c.arm.replace('+','plus').replace('-','')}`,round:c.round,arm:c.arm,selection_rationale:c.reason,source_run:e._source_run,
  topic_id:a.topic_id,topic_title:a.topic_title,opening:a.opening,activity_execution:a.execution??null,teacher_output:a.b_output??null,technical_implementation:a.implementation??null,activity_observation:a.observation??null,learner_response:a.learner_response??null,
  pre_a:pre,post_a:post,b_handoff:{learner_brief_received:a.creative_input?.learner_brief??null,full_creative_input:a.creative_input??null,teacher_response:a.b_output?.teacher_response??null,source_pre_brief:pre.structured_output?.learner_brief_for_B??null},
  subsequent_same_topic_visit:next?{round:next.round,source_run:next._source_run,learner_opening:nextBranch.opening,pre_assessment_brief:nextBranch.pre_a?.output?.learner_brief_for_B??null,b_input_brief:nextBranch.creative_input?.learner_brief??null,teacher_response:nextBranch.b_output?.teacher_response??null}:null,
  review_questions:['Does the cited learner evidence support Model A’s reported demonstrated/untested claims?','What teaching or hints preceded the learner response?','Is the activity result verifiable independently of the learner claim?','Were any decisive historical observations retrieved but not delivered?','Was the no-change or memory-change decision justified? Would a narrow provisional competence record materially improve future teaching?','Does the learner brief reflect evidence and uncertainty, and does Model B use it?','If a root hypothesis is proposed, is it learner-specific and explanatory rather than just restating a topic?']};
}
function vectorAudit(state){const out={};for(const arm of ['b-only','b+x']){const s=state.branches[arm],i=s.semantic_index??{},vectors=i.vectors??{};
 const keyFor=o=>sha(String(o.compact_index_text??o.text??'').slice(0,3000));
 const observationHits=s.observations.map(x=>({id:x.id,key:keyFor(x),present:!!vectors[keyFor(x)]}));const obsKeys=new Set(observationHits.map(x=>x.key));
 out[arm]={observations:s.observations.length,vector_keys:Object.keys(vectors).length,dimension:i.dimension,provider:i.provider,version:i.version,
  observation_vector_matches:observationHits.filter(x=>x.present).length,observation_vectors_missing:observationHits.filter(x=>!x.present).map(x=>x.id),
  unclassified_extra_vector_keys:Object.keys(vectors).filter(x=>!obsKeys.has(x)).length,
  note:'Extra keys can include focused queries, old versions of changed indexed text, or other indexed inputs; the v1 cache does not store provenance for every key.',
  provider_model_version:null,provider_model_version_verified:false,root_reembedding_observed:s.records.length>0,
  fixed_rules:['The cache is keyed by truncated indexed text SHA256, not observation ID.','An unchanged indexed string can reuse its vector; a changed indexed string gets a new vector on next indexing/retrieval, leaving older vector keys.','Changing observation metadata alone does not change the indexed text.','The cache checks provider identifier and vector dimension; it lacks explicit embedding-model revision identity.']};}
 return out;}
function summarize(cases){return {cases:cases.length,assessments:cases.length*2,
 zero_memory_change_assessments:cases.flatMap(c=>[c.pre_a,c.post_a]).filter(x=>x.applied_changes.length===0).length,
 assessments_with_history_omissions:cases.flatMap(c=>[c.pre_a,c.post_a]).filter(x=>x.reported_omissions.length>0).length,
 cases_with_next_same_topic:cases.filter(x=>x.subsequent_same_topic_visit!==null).length,
 observational_not_correctness_scoring:true};}
function writeDocs(out,cases,chain,vector){const head=['# FIX4 — Model A transparent decision review','',
 'Research only. These cases are **not** educational ground truth; Model L is fictional and activities are symbolic. Full original evidence and prompts are preserved in the JSON case files. No model calls or DB writes.','',
 '## Chain integrity','',`Verified ${chain.entries.length} paired rounds (40 visits), including the interrupted round-18 checkpoint and FIX3 recovery.`,
 '',...chain.sources.map(s=>`- ${s.run}: rounds ${s.start_rounds}→${s.end_rounds}; trace ${s.trace_sha256.slice(0,16)}…; ${s.complete?'complete':'checkpointed partial'}`),'',
 '## Inspection cases','',
 '| Case | Topic | Current evidence cited pre/post | Retrieved-to-delivered exclusions | Applied memory actions |','|---|---|---|---:|---:|',
 ...cases.map(c=>`| ${c.case_id} | ${c.topic_title} | ${c.pre_a.cited_current?'yes':'no'} / ${c.post_a.cited_current?'yes':'no'} | ${c.pre_a.selected_but_not_delivered.length+c.post_a.selected_but_not_delivered.length} | ${c.pre_a.applied_changes.length+c.post_a.applied_changes.length} |`),
 '','## What to review before concluding Model A is wrong','',
 'A no-change decision may be appropriate if the evidence is coached, unscored, or already available via retrieval. Evaluate the *future teaching consequence* rather than treating memory count as a score.',
 'A model’s recorded assessment is inspectable; this audit does not reveal private hidden reasoning.',
 'Inspect each case JSON for complete inputs and verbatim recorded output and the next same-topic visit for downstream consequences.',
 '', '## Semantic index status','',
 ...Object.entries(vector).map(([arm,v])=>`- ${arm}: ${v.observation_vector_matches}/${v.observations} observations matched current text-hash vectors; ${v.vector_keys} cached vectors, ${v.dimension} dimensions; embedding model revision **not recorded**.`),
 '','## Open limitations','',
 '- Presence of an embedding does not mean evidence was retained in the final packed assessment context.',
 '- The content-addressed cache does not proactively delete obsolete text hashes; root-claim re-embedding was untested because no root records existed.',
 '- Input relevance and mathematical correctness require independent review; this report does not grade them automatically.',
 '- Review at least one case where an observation could justify provisional competence and one where refraining from a root hypothesis was appropriate.',
 '','## Reviewer workflow','',
 'For each case: open `cases/<case-id>.json` and compare `pre_a.original_retrieval` to `pre_a.delivered_input`; then inspect `post_a`, the model output, memory decision, B handoff, and subsequent visit if available.',
 ''];fs.writeFileSync(path.join(out,'README_REVIEW.md'),head.join('\n'));
 const ws=['# Independent reviewer worksheet','','Do not fill this based on memory count or expected synthetic answers. Cite case ID and original observation ID for each judgment.','',
 ...cases.flatMap(c=>[`## ${c.case_id} — ${c.topic_title}`,'',`Reason selected: ${c.selection_rationale}`,'',
 '- What source evidence was available, and how reliable was it?','- What did the model actually receive versus what retrieval selected?','- Is A’s demonstrated/untested interpretation warranted?','- Was A’s root or competence uncertainty appropriate?','- Was its memory action (including none) useful for future teaching?','- Did the brief for B carry relevant evidence; was it used?','- What limitation best explains any disagreement: data, retrieval, prompt, model, symbolic executor, or insufficient evidence?','- Reviewer conclusion: supported / questionable / unsupported / not assessable, with citations to observation IDs.','','---',''])];fs.writeFileSync(path.join(out,'REVIEW_WORKSHEET.md'),ws.join('\n'));
 const rows=cases.map(c=>`<tr><td>${htmlEscape(c.case_id)}</td><td>${htmlEscape(c.topic_title)}</td><td>${htmlEscape(c.arm)}</td><td>${htmlEscape(c.pre_a.structured_output?.observed?.demonstrated??'')}</td><td>${htmlEscape(c.post_a.structured_output?.observed?.demonstrated??'')}</td><td>${htmlEscape(JSON.stringify(c.post_a.structured_output?.memory_decisions??[]))}</td><td>${c.post_a.reported_omissions.length}</td></tr>`).join('');
 fs.writeFileSync(path.join(out,'INSPECTOR.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MyWay FIX4 Model A Inspector</title><style>body{font:15px system-ui,Arial;margin:28px;line-height:1.45;max-width:1500px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #b7bdc6;padding:8px;vertical-align:top}th{background:#eee}td:nth-child(4),td:nth-child(5){min-width:240px}code{overflow-wrap:anywhere}small{color:#555}</style></head><body><h1>FIX4 — Model A decision inspector</h1><p><strong>Read-only, retrospective, fictional learner.</strong> The table summarizes recorded decisions, not hidden reasoning or proven learning. Open the per-case JSON for full evidence, prompts, and B handoff.</p><p>Cases: ${cases.length}. Full longitudinal chain: 20 rounds.</p><table><thead><tr><th>Case</th><th>Topic</th><th>Arm</th><th>A pre: demonstrated</th><th>A post: demonstrated</th><th>Post memory proposals</th><th>Omitted evidence IDs</th></tr></thead><tbody>${rows}</tbody></table><p><small>Original reports are unmodified. No automated quality score.</small></p></body></html>`);
}
async function embeddingTest(root){const here=path.dirname(fileURLToPath(import.meta.url));const {indexTexts,retrieveR3}=await import(pathToFileURL(path.join(here,'s62bfix1r3-retrieval.mjs')).href);
 const hits=[];let calls=0;const embedFn=async texts=>{calls++;hits.push([...texts]);return texts.map(t=>Array.from({length:384},(_,i)=>((Number.parseInt(sha(t).slice(i%20,(i%20)+4),16)%1000)-500)/500));};
 const state={observations:[],records:[]};let v=await indexTexts(state,['first evidence'],{embedFn});if(calls!==1||v.stats.embedded_now!==1)throw Error('Initial embedding did not occur');
 v=await indexTexts(state,['first evidence'],{embedFn});if(calls!==1||v.stats.cache_hits!==1)throw Error('Cache hit was missed');
 v=await indexTexts(state,['revised evidence'],{embedFn});if(calls!==2||v.stats.embedded_now!==1||Object.keys(state.semantic_index.vectors).length!==2)throw Error('Changed text was not embedded; old cache keys may remain');
 const hist={id:'O1',topic_id:'T02',text:'Earlier evidence on quantity and rate'};state.observations.push(hist);
 const current={id:'O2',topic_id:'T04',text:'New evidence on rates'};
 const a=await retrieveR3(state,current,{embedFn});if(!a.allowed_evidence_ids.includes('O2')||!a.allowed_evidence_ids.includes('O1'))throw Error('Current and historical evidence not returned');
 const prevCalls=calls;state.records.push({id:'R1',type:'root',status:'provisional',claim:'Possible confusion about rate compared with total',evidence:{supports_current:['O1'],challenges_current:[]},topics:['T02']});
 await retrieveR3(state,current,{embedFn});if(calls<=prevCalls)throw Error('New root-claim query was not embedded');
 const rootCalls=calls;state.records[0].claim='Revised possible cause: confusing accumulated quantity with instantaneous rate';await retrieveR3(state,current,{embedFn});if(calls<=rootCalls)throw Error('Revised root claim was not re-embedded');
 const providerMismatch={semantic_index:{...state.semantic_index,provider:'other-model-same-dimension'},observations:[],records:[]};let refused=false;try{await indexTexts(providerMismatch,['a'],{embedFn});}catch(e){refused=/provider\/version mismatch/.test(String(e.message));}if(!refused)throw Error('Provider identity mismatch not rejected');
 return {result:'PASS',source_module:'s62bfix1r3-retrieval.mjs',simulated_embeddings_only:true,provider_calls:0,database_writes:0,embedding_fn_invocations:calls,embedded_batches:hits.map(x=>({count:x.length,text_sha256:x.map(sha)})),
  verified:['new indexed content gets a vector','unchanged content reuses cache','changed text gets a new content-hash vector','a newly introduced provisional root claim becomes an embedding query','revised root claim generates a new vector on next retrieval','cache provider name mismatch fails closed','current and historical observations appear in retrieval evidence'],
  gaps:['The old cached vector for revised text is not deleted immediately; content-hash keys can accumulate.','The cache has no explicit embedding model identity/revision; a model change under same provider and dimension may silently reuse vectors.','Observation metadata changes that do not affect compact_index_text/text do not trigger a new embedding.','Synthetic injected vectors test lifecycle and retrieval wiring, NOT actual MiniLM semantic ranking or production cloud sync.']};
}
async function main(){const o=options(process.argv.slice(2));const base={stage:'S62B-FIX1R42FIX4',mode:o.mode,run_id:o.runId,research_only:true,provider_calls:0,database_writes:0,report_directory:o.reportsDir,output_directory:o.output};
 if(o.mode==='embedding-test'){const result=await embeddingTest(o.root);console.log(JSON.stringify({...base,embedding_lifecycle:result}));return;}
 const chain=loadChain(o.reportsDir);const plan={...base,source_runs:chain.sources.map(x=>({run:x.run,start:x.start_rounds,end:x.end_rounds,complete:x.complete})),paired_rounds:20,learning_visits:40,review_cases:SPEC.length,provider_calls:0,database_writes:0};
 if(o.mode==='plan'){console.log('S62B-FIX1R42FIX4 PLAN '+JSON.stringify(plan));return;}
 if(fs.existsSync(o.output))throw Error('Output run ID already exists: '+o.output);
 fs.mkdirSync(path.join(o.output,'cases'),{recursive:true});
 const cases=SPEC.map(c=>auditCase(c,chain.entries.find(e=>e.round===c.round),chain));for(const c of cases)write(path.join(o.output,'cases',c.case_id+'.json'),c);
 const vectors=vectorAudit(chain.finalState);const lifecycle=await embeddingTest(o.root);
 const result={...plan,summary:summarize(cases),sources:chain.sources,vector_audit:vectors,embedding_lifecycle:lifecycle,review_case_ids:cases.map(x=>x.case_id),limitations:['No hidden internal model reasoning visible','Not a scientific validity or human learning outcome study','Model A output judgments do not automatically establish correctness','FIX4 does not alter prompts, memory, embeddings, or original reports']};
 write(path.join(o.output,'AUDIT.json'),result);writeDocs(o.output,cases,chain,vectors);
 const prompts=[];const seen=new Set();for(const {run,trace} of chain.statuses){for(const r of trace.requests??[]){for(const msg of r.request?.messages??[]){if(msg.role!=='system')continue;const key=sha(msg.content);if(!seen.has(key)){seen.add(key);prompts.push({role:r.role,record:r.record,source_run:run,model:r.request?.model,sha256:key,text:msg.content});}}}}
 write(path.join(o.output,'ACTIVE_PROMPTS.json'),prompts);
 const md=['# Active prompts captured from actual recorded requests','',`Unique system-prompt hashes: ${prompts.length}. Prompts may vary by stage or repair call.`,...prompts.flatMap(p=>['',`## ${p.role} / ${p.record} — ${p.sha256.slice(0,14)}`,`Source run: ${p.source_run}, requested model: ${p.model}`, '', '```text', p.text,'```'])];fs.writeFileSync(path.join(o.output,'ACTIVE_PROMPTS.md'),md.join('\n'));
 console.log('S62B-FIX1R42FIX4 AUDIT PASS '+JSON.stringify({run:o.runId,rounds:20,cases:cases.length,assessments:cases.length*2,provider_calls:0,database_writes:0,outputs:o.output}));
}
main().catch(e=>{console.error('S62B-FIX1R42FIX4 STOP '+(e.stack??e));process.exitCode=1;});
