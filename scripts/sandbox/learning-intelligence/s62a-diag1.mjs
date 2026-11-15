#!/usr/bin/env node
/** S62A-DIAG1: non-mutating diagnostic of archived longitudinal learner assessments.
 * No provider/network, DB, embeddings, simulated learning, or existing report mutation.
 * Automated signals are structural/routing *questions*, not correctness judgments.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateA} from './s16b59-lean-core.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const REPORTS=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports');
const OUTBASE=path.join(REPORTS,'s62a-diag1');
const clone=x=>structuredClone(x);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const asArray=x=>Array.isArray(x)?x:[];
const get=(x,k)=>x&&typeof x==='object'?x[k]:undefined;
const s=x=>typeof x==='string'?x:'';
const idSet=x=>new Set(asArray(x).filter(v=>typeof v==='string'));
const clip=(x,n=800)=>s(x).slice(0,n);
const sortUnique=x=>[...new Set(x)].sort();
const safeJson=x=>JSON.stringify(x,null,2)+'\n';

export function requireTracePath(input){
 const filename=path.resolve(input);
 if(path.basename(filename)!=='trace.json'||!filename.startsWith(REPORTS+path.sep))throw Error('Trace must be trace.json inside the ignored learning-intelligence-reports directory');
 const realbase=fs.realpathSync(REPORTS),real=fs.realpathSync(filename);
 if(!real.startsWith(realbase+path.sep)||!fs.statSync(real).isFile()||fs.statSync(real).size>40_000_000)throw Error('Trace path escapes report root or exceeds size limit');
 if(fs.existsSync(OUTBASE)&&real.startsWith(fs.realpathSync(OUTBASE)+path.sep))throw Error('Diagnostic output is not a source trace');
 return real;
}
function readTrace(filename){
 const real=requireTracePath(filename),bytes=fs.readFileSync(real);
 const t=JSON.parse(bytes.toString('utf8'));
 if(!['myway_s62a_longitudinal_v1','myway_s16b61_longitudinal_v1'].includes(t.schema)||t.private_truth_in_A_B_C!==false||t.database_writes!==0||!Array.isArray(t.timeline)||!t.learner_histories)throw Error('Unrecognized or unsafe source trace '+real);
 return {file:real,sha256:sha(bytes),trace:t};
}
function walkTraces(dir,depth=0){
 if(!fs.existsSync(dir)||depth>4)return [];
 const out=[];
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(e.isSymbolicLink())continue;
  const p=path.join(dir,e.name);
  if(e.isFile()&&e.name==='trace.json')out.push(p);
  else if(e.isDirectory())out.push(...walkTraces(p,depth+1));
 }
 return out;
}
export function discoverTraces(){
 const candidates=[...walkTraces(path.join(REPORTS,'s62a')),...walkTraces(path.join(REPORTS,'s16b61fix1')),...walkTraces(path.join(REPORTS,'s16b61'))];
 const all=[];
 for(const p of candidates){try{all.push(readTrace(p));}catch{ /* unrelated or incomplete report ignored; explicit paths fail */ }}
 const best=new Map();
 for(const x of all){
  if(x.trace.run_type!=='model')continue;
  for(const name of ['ELLI','MICA','SAGE']){
   if(!x.trace.timeline.some(e=>e.learner_id===name))continue;
   const key=name,n=x.trace.timeline.filter(e=>e.learner_id===name).length;
   const old=best.get(key),oldn=old?.trace.timeline.filter(e=>e.learner_id===name).length??0;
   if(!old||n>oldn||n===oldn&&fs.statSync(x.file).mtimeMs>fs.statSync(old.file).mtimeMs)best.set(key,x);
  }
 }
 return [...new Set([...best.values()])];
}
function historyState(trace,step){
 const h=trace.learner_histories?.[step.learner_id];if(!h)throw Error('No history for '+step.learner_id);
 const ledger=asArray(h.observations),idx=ledger.findIndex(o=>o.id===step.learner_observation_id);
 if(idx<0)throw Error('Observation missing from historical ledger: '+step.learner_observation_id);
 const prior=ledger.slice(0,idx),including=ledger.slice(0,idx+1),priorIds=idSet(prior.map(o=>o.id));
 const rootsBefore=asArray(h.roots).filter(r=>asArray(r.revisions).some(v=>priorIds.has(v.source_event_id)));
 const linksBefore=asArray(h.relationships).filter(r=>asArray(r.revisions).some(v=>priorIds.has(v.source_event_id)));
 // This state is sufficient for validator reference checks; terminal objects are NOT presented as prior model state.
 const topics=asArray(step.model_inputs?.A?.context?.topics).map(t=>({id:t.id??t.topic_id}));
 const allTopicIds=sortUnique([...topics.map(t=>t.id),...asArray(trace.timeline).map(t=>t.topic_id)]);
 return {prior,priorIds,including,h,rootsBefore,linksBefore,state:{obs:including,roots:rootsBefore,relationships:linksBefore,topics:allTopicIds.map(id=>({id})),explicit_instructions:[]}};
}
function associatedRevisions(h,step){
 const changes=[];
 for(const [type,items] of [['root',h.roots],['relationship',h.relationships]])for(const item of asArray(items)){
  for(const r of asArray(item.revisions).filter(v=>v.source_event_id===step.learner_observation_id))changes.push({type,id:item.id,claim_after:clip(item.claim,600),version:r.version,action:r.action,reason:r.reason,cited_ids:r.observation_ids,cause_counter_ids:r.counter_ids,alternatives:r.alternatives,implied_bucket:['weaken','challenge'].includes(r.action)?'counter_ids':'support_ids',terminal_memory_warning:'claim_after is terminal root claim; may differ from claim at this step'});
 }
 return changes;
}
function checksEqual(a,b){return JSON.stringify(a)===JSON.stringify(b);}
export function diagnoseStep(trace,step,origin={}){
 const {prior,priorIds,including,h,rootsBefore,linksBefore,state}=historyState(trace,step);
 const input=step.model_inputs?.A,a=step.model_a;
 if(!input||!a||!Array.isArray(input.allowed_observation_ids))throw Error('Missing exact Model A input/output for step '+step.step);
 const allowed=idSet(input.allowed_observation_ids),ledgerIds=idSet(including.map(o=>o.id));
 const cited=sortUnique([
  ...asArray(a.observed_understanding).flatMap(x=>asArray(x.observation_ids)),
  ...asArray(a.possible_underlying_causes).flatMap(x=>[...asArray(x.support_ids),...asArray(x.counter_ids)]),
  ...asArray(a.root_actions).flatMap(x=>asArray(x.observation_ids)),
  ...asArray(a.relationship_actions).flatMap(x=>asArray(x.observation_ids)),
 ].filter(x=>typeof x==='string'));
 const missing=cited.filter(id=>!allowed.has(id));
 let validator,comparison;
 try{validator=validateA(a,state,allowed);comparison={matches_archived_checks:checksEqual(validator.checks,step.validation),reconstructed_accepted:validator.proposals.map(x=>({type:x.type,action:x.action,existing_id:x.existing_id??null})),archive_accepted:step.memory_changes};}
 catch(e){comparison={error:String(e.message),archive_accepted:step.memory_changes};}
 const revisionTrace=associatedRevisions(h,step);
 const beforeCounter=rootsBefore.flatMap(r=>asArray(r.counter_ids).filter(x=>priorIds.has(x)).map(id=>({root_id:r.id,evidence_id:id,visible_to_A:allowed.has(id)})));
 const risk=sortUnique([
  ...revisionTrace.filter(r=>r.implied_bucket==='support_ids'&&r.action==='refine').map(r=>`REFINE_ASSIGNS_ACTION_CITATIONS_TO_SUPPORT:${r.id}`),
  ...revisionTrace.filter(r=>asArray(r.cause_counter_ids).some(id=>asArray(r.cited_ids).includes(id))&&r.implied_bucket==='support_ids').map(r=>`COUNTEREVIDENCE_CITED_IN_SUPPORT_BUCKET:${r.id}`),
  ...missing.map(id=>`MODEL_A_REFERENCED_NONVISIBLE_ID:${id}`),
  ...asArray(step.validation).filter(x=>x.accepted===false).map(x=>`ARCHIVED_VALIDATION_REJECTED:${x.type}`),
  ...(!comparison.matches_archived_checks?['STRUCTURAL_REPLAY_DIFFERS_FROM_ARCHIVE']:[]),
  ...(step.learner_source?.startsWith('MODEL_L')&&!input.probe_conditions?['MODEL_L_FOLLOWUP_WITHOUT_PROBE_NOT_INDEPENDENCE_PROOF']:[]),
 ]);
 const priorTutor=asArray(input.recent_dialogue).at(-1)??null;
 const categories=[
  ...(revisionTrace.some(r=>r.action==='refine')?['refinement']:[]),
  ...(revisionTrace.some(r=>['support','propose'].includes(r.action))?['support_or_new_root']:[]),
  ...(revisionTrace.some(r=>['weaken','challenge'].includes(r.action))?['weakening']:[]),
  ...(asArray(a.root_actions).length===0?['abstention']:[]),
  ...(asArray(a.relationship_actions).length?['relationship']:[]),
  ...(missing.length?['citation_issue']:[]),
  ...(step.learner_source?.startsWith('MODEL_L')?['synthetic_reaction']:['curator_opening']),
  ...(step.model_inputs?.A?.probe_conditions?['after_probe']:['no_formal_probe']),
 ];
 return {case_id:`${step.learner_id}-${origin.hash?.slice(0,7)??'src'}-STEP${step.step}`,
  source:{trace_sha256:origin.hash,source_file:origin.file,step:step.step,learner:step.learner_id,visit:step.case_id,topic:step.topic_id,learner_evidence_id:step.learner_observation_id},
  observation:{exact_text:step.learner,source:step.learner_source,task_conditions:including.at(-1)?.task_conditions,probe_conditions:input.probe_conditions,preceding_tutor:priorTutor,probe:step.probe,model_l_responded:!!step.model_l,not_scientifically_scored:true},
  input_coverage:{allowed_ids:input.allowed_observation_ids,complete_ledger_ids:including.map(o=>o.id),unseen_historical_ids:prior.map(o=>o.id).filter(id=>!allowed.has(id)),retrieval:step.retrieval?.A,request_diagnostics:step.request_diagnostics?.A,prior_root_ids:rootsBefore.map(r=>r.id),historical_root_counterevidence:beforeCounter},
  full_historical_evidence:including.map(o=>({id:o.id,topic_id:o.topic_id,text:o.text,source:o.source,task_conditions:o.task_conditions,was_visible_to_A:allowed.has(o.id)})),
  exact_model_a_input:clone(input),original_model_a_assessment:clone(a),b_response:{reply:step.model_b?.reply??step.tutor,probe_offer:step.model_b?.probe_offer},
  archive_validation:step.validation,independent_structural_recheck:comparison,
  archive_memory_changes:step.memory_changes,root_and_relationship_revisions:revisionTrace,
  cited_observation_ids:cited,model_cited_ids_missing_from_input:missing,
  categories:sortUnique(categories),structural_questions:risk,semantic_accuracy:'UNSCORED_BY_DESIGN',
  evidence_origin:'synthetic_or_curator_authored_not_real_learner'};
}
export function diagnoseTrace(source){
 const origin={hash:source.sha256,file:source.file},t=source.trace;
 return asArray(t.timeline).filter(x=>x.model_inputs?.A&&x.model_a).map(x=>diagnoseStep(t,x,origin));
}
export function chooseCases(items,limit){
 const sorted=[...items].sort((a,b)=>Number(b.structural_questions.length>0)-Number(a.structural_questions.length>0)||a.source.step-b.source.step);
 const result=[],selected=new Set();
 const kinds=['refinement','weakening','support_or_new_root','abstention','relationship','citation_issue','after_probe','no_formal_probe','synthetic_reaction','curator_opening'];
 const learners=sortUnique(sorted.map(x=>x.source.learner));
 const add=x=>{if(x&&!selected.has(x.case_id)&&result.length<limit){result.push(x);selected.add(x.case_id);}};
 for(const k of kinds)for(const l of learners)add(sorted.find(x=>x.source.learner===l&&x.categories.includes(k)&&!selected.has(x.case_id)));
 for(const k of kinds)add(sorted.find(x=>x.categories.includes(k)&&!selected.has(x.case_id)));
 for(const x of sorted)add(x);
 return result;
}
function markdown(cases,inventory,all){
 const lines=['# S62A-DIAG1 | Evidence-to-action dossiers','',
 'Research-only diagnostic. **No automatic science, causal, learner-mastery, or model-accuracy verdicts.** Categories and flags direct review; they do not label a learner correct or incorrect.','',
 `Selected ${cases.length} of ${all.length} archived steps from ${inventory.length} source trace(s).`,'',
 '## Inventory','',...inventory.map(x=>`- ${path.basename(path.dirname(x.file))}: ${x.trace.summary?.steps??x.trace.timeline.length} steps; ${x.sha256.slice(0,16)}…; learners ${sortUnique(x.trace.timeline.map(e=>e.learner_id)).join(', ')}`),''];
 for(const c of cases){
  lines.push(`## ${c.case_id}`,`**Learner/topic:** ${c.source.learner} / ${c.source.topic} · **archived step:** ${c.source.step}`,
   `**Conditions:** ${c.observation.task_conditions??'unknown'}; formal probe: ${c.observation.probe_conditions?'yes':'no'}`,
   '',`**Exact observation:** ${c.observation.exact_text}`,'',
   `**Prior tutor:** ${clip(c.observation.preceding_tutor?.tutor,700)||'(not in bounded recent dialogue)'}`,'',
   `**A observed understanding:** ${JSON.stringify(c.original_model_a_assessment.observed_understanding)}`,'',
   `**A presenting difficulty:** ${JSON.stringify(c.original_model_a_assessment.presenting_difficulty)}`,'',
   `**A underlying hypotheses:** ${JSON.stringify(c.original_model_a_assessment.possible_underlying_causes)}`,'',
   `**A root actions:** ${JSON.stringify(c.original_model_a_assessment.root_actions)}`,'',
   `**Relationships / teaching effects:** ${JSON.stringify([c.original_model_a_assessment.relationship_actions,c.original_model_a_assessment.teaching_effect_hypotheses])}`,'',
   `**Reference checks:** ${JSON.stringify(c.archive_validation)}; structural replay matches: ${c.independent_structural_recheck.matches_archived_checks??'unknown'}`,'',
   `**Memory changes:** ${JSON.stringify(c.root_and_relationship_revisions)}`,'',
   `**Available historical IDs:** ${c.input_coverage.allowed_ids.join(', ')}`,'',
   `**Known but unavailable historical IDs:** ${c.input_coverage.unseen_historical_ids.join(', ')||'(none)'}`,'',
   `**Structural questions:** ${c.structural_questions.join('; ')||'(no automated flags)'}`,'',
   '**Reviewer needs to establish:** Did the learner show independently demonstrated reasoning? Is the hypothesized root learner-specific? Do cited observations actually support or contradict it? Did action semantics faithfully encode A’s own assessment?','');
 }
 return lines.join('\n')+'\n';
}
const reviewTemplate=(cases)=>['# Independent human review — unscored until completed','',
 'Assess each dimension separately; do not accept scripted responses, automated risk flags, reviewer model output, or rubric text as truth. Refer to exact evidence IDs and tutor conditions.','',
 ...cases.flatMap(x=>[`## ${x.case_id}`,'','- Current demonstrated understanding / correctness: **UNSCORED** — evidence:','- Presenting difficulty versus learner-specific underlying cause: **UNSCORED** — alternatives:','- Competing causes / uncertainty / decisive probe: **UNSCORED** — evidence:','- Relationship validity (including justified non-discovery): **UNSCORED** — evidence:','- Independent vs coached learning / teaching effect confounds: **UNSCORED** — evidence:','- Retrieved versus missing history: **UNSCORED** — IDs:','- Model A’s semantic reasoning versus chosen memory action: **UNSCORED** — explanation:','- Reducer representation versus model intent: **UNSCORED** — discrepancy:','- Model B scientific/probe quality and L credibility: **UNSCORED** — evidence:','- Most economical next change (or no change):',''])].join('\n');
function writeReports(sources,cases,all){
 fs.mkdirSync(OUTBASE,{recursive:true});
 const dir=fs.mkdtempSync(path.join(OUTBASE,new Date().toISOString().replace(/[:.]/g,'-')+'-'));
 const save=(name,obj)=>fs.writeFileSync(path.join(dir,name),typeof obj==='string'?obj:safeJson(obj),{flag:'wx',mode:0o600});
 save('CASE_DOSSIERS.md',markdown(cases,sources,all));
 save('INDEPENDENT_REVIEW_WORKSHEET.md',reviewTemplate(cases));
 save('CASES_FULL_EVIDENCE.json',{warning:'ARCHIVED SYNTHETIC RESEARCH. NOT CORRECTNESS GROUND TRUTH.',cases});
 save('FROZEN_CASES.json',{schema:'myway_s62adiag1_frozen_v1',frozen_at:new Date().toISOString(),research_only:true,source_trace_hashes:sources.map(x=>x.sha256),cases:cases.map(c=>({case_id:c.case_id,source:c.source,input:c.exact_model_a_input,original_model_a:c.original_model_a_assessment,archived_validation:c.archive_validation,archive_memory_changes:c.archive_memory_changes,prior_root_ids:c.input_coverage.prior_root_ids}))});
 save('AUTOMATED_QUESTIONS.json',all.map(c=>({case_id:c.case_id,source:c.source,categories:c.categories,structural_questions:c.structural_questions,archived_validation:c.archive_validation,rechecked:c.independent_structural_recheck,root_revisions:c.root_and_relationship_revisions,unseen_historical_ids:c.input_coverage.unseen_historical_ids})));
 save('SOURCE_INVENTORY.json',sources.map(x=>({file:x.file,sha256:x.sha256,schema:x.trace.schema,steps:x.trace.timeline.length,complete:!x.trace.failure,synthetic:true})));
 const summary={schema:'myway_s62adiag1_summary_v1',case_count:cases.length,archived_steps_seen:all.length,trace_count:sources.length,learners:sortUnique(cases.map(c=>c.source.learner)),flagged_steps:all.filter(c=>c.structural_questions.length).length,replay_mismatches:all.filter(c=>c.independent_structural_recheck.matches_archived_checks===false).length,automated_scientific_grading:false,api_calls:0,db_writes:0,embeddings_calls:0};
 save('SUMMARY.json',summary);
 save('README_RESULTS.md',`# Diagnostic completed\n\n${JSON.stringify(summary,null,2)}\n\nStart with CASE_DOSSIERS.md and fill INDEPENDENT_REVIEW_WORKSHEET.md. Full exact frozen A inputs are in FROZEN_CASES.json. The flags identify possible structural problems; they do **not** judge correctness. Source traces were only read. No model calls, DB writes, or embedding calls.\n`);
 return {dir,summary};
}
export function parseArgs(argv){
 const o={auto:false,traces:[],limit:15,help:false};
 for(let i=0;i<argv.length;i++){
  const k=argv[i];if(k==='--help'){o.help=true;continue;}if(k==='--auto'){o.auto=true;continue;}
  if(k==='--trace'&&argv[i+1]){o.traces.push(argv[++i]);continue;}
  if(k==='--limit'&&argv[i+1]){o.limit=Number(argv[++i]);continue;}
  throw Error('Unknown or missing DIAG1 option: '+k);
 }
 if(!Number.isInteger(o.limit)||o.limit<1||o.limit>40)throw Error('--limit must be an integer 1..40');
 if(o.auto&&o.traces.length)throw Error('Use --auto OR explicit --trace');
 if(!o.auto&&!o.traces.length&&!o.help)o.auto=true;
 return o;
}
async function main(){
 const o=parseArgs(process.argv.slice(2));if(o.help){console.log('Usage: node s62a-diag1.mjs --auto --limit 15 [or --trace PATH --trace PATH]');return;}
 const sources=o.auto?discoverTraces():o.traces.map(readTrace);
 if(!sources.length)throw Error('No archived ELLI/MICA/SAGE model traces found. Original run reports are excluded from full code dumps. Copy previous report ZIP(s) into the ignored experiment report folders, or supply --trace PATH for actual local archived trace.json files. No invented fixtures used.');
 const all=sources.flatMap(diagnoseTrace),cases=chooseCases(all,o.limit);if(!cases.length)throw Error('No steps with exact model-facing inputs in selected trace(s)');
 const {dir,summary}=writeReports(sources,cases,all);
 console.log('S62A-DIAG1 REPORT '+dir);console.log('SUMMARY '+JSON.stringify(summary));console.log('S62A-DIAG1 COMPLETE | RESEARCH ONLY | NO API OR DB WRITES');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S62A-DIAG1 STOP: '+String(e?.message??e));process.exitCode=1;});
