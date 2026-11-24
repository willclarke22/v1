#!/usr/bin/env node
/** R5.3R optional C-guided revision. Explicit paid B/X only AFTER a separately paid C plan.
 * Model C is advisory, never a learner-memory fact or automatic authority.
 * Whole-beat edits avoid partial-span sentence joins; no silent probe adaptation.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost} from './s16b61fix1-models.mjs';
import {makeXInput,X_GOLD_SCHEMA,X_GOLD_PROMPT,validateB,clone} from './s62bfix1r43-goldloop-core-anchor-v1.mjs';
import {ROOT,dirFor,stateFor,turnFor,read,write,sha,activeSha,assert,listFeedback,listRetries,nextRetryId,hasPending} from './s62bfix1r44-feedback-store.mjs';
import {normalizeRetryVisualR50} from './s62bfix1r50-output.mjs';
import {makeSceneContract,emptyProbe} from './s62bfix1r46-probe-core.mjs';
import {validateCPlan} from './s62bfix1r53-research-plan.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const MODELS=new Set(['gpt-4.1-mini','gpt-4.1']);
const string={type:'string'},arr=items=>({type:'array',items}),obj=props=>({type:'object',additionalProperties:false,properties:props,required:Object.keys(props)});
const B_BEAT_SCHEMA=obj({reason:string,replacements:arr(obj({beat_id:string,narration:string}))});
const B_PROMPT=`You are MyWay Model B revising an educational experience. A separate Model C has proposed a TENTATIVE interpretation of the learner's feedback; it may be wrong, and it is not evidence of a cognitive cause. Respect the learner's actual feedback and explicit preferences; use C only as an optional guide. Rewrite the COMPLETE narration for exactly the requested beat IDs, not isolated text spans. Ensure each rewritten beat reads coherently and accurately in its surrounding lesson. Preserve effective content and original educational intent unless the learner's feedback requires a different approach. Do not assert the learner has a deficit, or fabricate results. Never rewrite unrequested beat IDs. Do not create a new structured probe, promise interaction execution, or force a quiz. Return JSON only to schema.`;
const X_PROMPT=X_GOLD_PROMPT+`\nR5.3R GUIDED REVISION: You are revising the specified B beats' visual moments. Treat Model C's proposal as a possible design direction, NOT a cognitive fact. Respect explicitly rejected visual metaphors. Return one new visual moment per affected beat, using EXACT beat IDs and supplied narration anchors; preserve continuity with unchanged neighbors. No claim of real rendering, no fabricated learner actions. Return JSON only to schema.`;
export function parseArgs(argv){const o={mode:'preview',session:null,feedback:null,scope:'selected',modelB:'gpt-4.1-mini',modelX:'gpt-4.1-mini',budget:null,allow:false};
 const map={'--mode':'mode','--session-id':'session','--feedback-id':'feedback','--scope':'scope','--model-b':'modelB','--model-x':'modelX','--budget-usd':'budget'};
 for(let i=0;i<argv.length;i++){const k=argv[i];if(k==='--allow-spend'){o.allow=true;continue;}assert(map[k]&&argv[i+1]!==undefined,'Unknown or incomplete argument '+k);o[map[k]]=argv[++i];}
 assert(['preview','retry'].includes(o.mode)&&/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(o.session??'')&&/^fb\d{4,}$/.test(o.feedback??''),'Invalid mode/session/feedback');
 assert(['selected','all'].includes(o.scope),'Invalid revision scope');assert(MODELS.has(o.modelB)&&MODELS.has(o.modelX),'Unsupported model');
 o.budget=o.budget===null?null:Number(o.budget);if(o.mode==='retry')assert(o.allow&&Number.isFinite(o.budget)&&o.budget>0&&o.budget<=10,'Separate paid authorization required');else assert(!o.allow&&o.budget===null,'Preview cannot authorize paid calls');
 return o;
}
function pendingPlans(dir){for(const folder of ['revision-plans','experience-designs','root-backfill']){const p=path.join(dir,folder);if(fs.existsSync(p)&&fs.readdirSync(p).some(n=>n.endsWith('.pending.json')))return true;}return false;}
export function deriveCRevision({turn,feedback,c,scope='selected'}){
 validateCPlan(c);const modes={B:'B_X',X:'X',B_and_X:'B_X'};
 const route=modes[c.revision_scope]??'NOT_APPLICABLE';
 const ids=scope==='all'?turn.B_output.beats.map(b=>b.id):[...new Set(feedback.selections.map(s=>s.beat_id))];
 assert(ids.length>0&&ids.length<=16,'No valid affected beats');
 assert(ids.every(id=>turn.B_output.beats.some(b=>b.id===id)),'Selected beat no longer exists');
 const needsProbeReview=!!(turn.probe_plan??turn.B_output.probe_plan)?.offer&&['adapt','replace','uncertain'].includes(c.probe_impact);
 return {route,affected:ids,probe_impact:c.probe_impact,needs_probe_review:needsProbeReview,scope, c_interpretation_not_learner_fact:true};
}
export function applyWholeBeatReplacements(original,affected,replacements){
 assert(Array.isArray(replacements)&&replacements.length===affected.length,'B returned wrong number of affected beats');
 const map=new Map(),required=new Set(affected);for(const r of replacements){assert(r&&required.has(r.beat_id)&&!map.has(r.beat_id),'Unknown or duplicate B beat');assert(typeof r.narration==='string'&&r.narration.trim().length>=8&&r.narration.length<=1150,'Invalid full-beat narration');map.set(r.beat_id,r.narration.trim());}
 const copy=clone(original);for(const b of copy.beats){if(map.has(b.id))b.narration=map.get(b.id);}validateB(Object.fromEntries(Object.entries(copy).filter(([key])=>key!=='probe_plan')));
 return copy;
}
function prepare(o){const {dir,state,statePath}=stateFor(o.session);assert(!hasPending(o.session)&&!pendingPlans(dir),'Unresolved paid operation requires manual review');
 const f=listFeedback(o.session).find(f=>f.feedback_id===o.feedback);assert(f&&f.session_id===o.session,'Saved feedback missing');const turn=turnFor(state,f.turn_id);assert(state.turns.at(-1)?.turn_id===turn.turn_id,'Only latest completed turn can be revised');assert(activeSha(turn)===f.base_sha256,'Feedback refers to stale content; new selection required');
 assert(!listRetries(o.session).some(r=>r.feedback_id===o.feedback),'Feedback was already used in a paid retry');
 const planFile=path.join(dir,'revision-plans',o.feedback+'.json');assert(fs.existsSync(planFile),'Model C plan missing: run optional C investigation first');
 const trace=read(planFile),rec=trace?.output;assert(trace.status==='complete'&&rec&&rec.kind==='c'&&rec.session_id===o.session&&rec.turn_id===turn.turn_id&&rec.feedback_id===o.feedback&&rec.topic_id===turn.topic_id,'C plan is not complete or does not match feedback');
 assert(rec.plan_sha256===sha(rec.plan),'C plan content changed');const decision=deriveCRevision({turn,feedback:f,c:rec.plan,scope:o.scope});
 const bFirst=decision.route==='B_X';return {state,statePath,dir,feedback:f,turn,c:rec,decision,bFirst};
}
function loadEnv(){if(process.env.OPENAI_API_KEY)return;const p=path.join(ROOT,'.env.local');if(!fs.existsSync(p))return;let dotenv;try{dotenv=require('dotenv');}catch{throw Error('dotenv missing');}const vars=dotenv.parse(fs.readFileSync(p));process.env.OPENAI_API_KEY=vars.OPENAI_API_KEY||vars.MYWAY_OPENAI_API_KEY||'';if(!process.env.OPENAI_BASE_URL&&vars.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=vars.OPENAI_BASE_URL;}
function request(role,input,model,schema,prompt,max_tokens){assert(Buffer.byteLength(JSON.stringify(input))<=50_000,'Revision context too large');return {model,store:false,max_tokens,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'myway_r53r_'+role.toLowerCase(),strict:true,schema}}};}
export async function run(argv=process.argv.slice(2),invoke=null){const o=parseArgs(argv),p=prepare(o);const result={mode:o.mode,session:o.session,feedback_id:o.feedback,turn_id:p.turn.turn_id,c_plan_sha256:p.c.plan_sha256,c_proposal_scope:p.c.plan.revision_scope,scope:o.scope,affected_beats:p.decision.affected,model_calls_expected:p.decision.route==='NOT_APPLICABLE'?0:p.bFirst?2:1,probe_impact:p.decision.probe_impact,probe_requires_review:p.decision.needs_probe_review,plan_is_not_learner_evidence:true,original_turn_trace_preserved:true};
 if(o.mode==='preview')return {...result,status:p.decision.route==='NOT_APPLICABLE'?'C_proposed_no_applyable_B_X_revision':'ready_for_explicit_paid_revision',model_calls:0,state_writes:0};
 assert(p.decision.route!=='NOT_APPLICABLE','Model C recommended '+p.c.plan.revision_scope+'; no B/X revision is justified by this plan');
 const price={ 'gpt-4.1-mini':0.055,'gpt-4.1':0.29},minimum=price[o.modelX]+(p.bFirst?price[o.modelB]:0);assert(o.budget>=minimum,'Admission budget insufficient for explicit B/X revision ('+minimum.toFixed(3)+' USD)');
 if(!invoke){const git=spawnSync('git',['-C',ROOT,'branch','--show-current'],{encoding:'utf8',timeout:10000});assert(git.status===0&&git.stdout.trim()==='myway/learning-sandbox-v3_7a','Wrong Git branch; refusing paid retry');loadEnv();}const creds=invoke?null:credentials();
 const retries=path.join(p.dir,'retries');fs.mkdirSync(retries,{recursive:true});const id=nextRetryId(o.session),pending=path.join(retries,id+'.pending.json'),complete=path.join(retries,id+'.json');
 const trace={schema:'myway_goldloop_targeted_retry_v1',strategy:'R53R_C_guided_whole_beat',retry_id:id,session_id:o.session,turn_id:p.turn.turn_id,feedback_id:o.feedback,base_sha256:p.feedback.base_sha256,c_plan_sha256:p.c.plan_sha256,c_plan_source:'revision-plans/'+o.feedback+'.json',C_as_proposal_not_fact:true,status:'reserved',started_at:new Date().toISOString(),calls:[],total_estimated_usd:0,changes:null,original_turn_trace_unchanged:true};
 fs.writeFileSync(pending,JSON.stringify(trace,null,2)+'\n',{flag:'wx',mode:0o600});const flush=()=>write(pending,trace);let spent=0;
 async function call(role,input,model,schema,prompt,maxTokens){const req=request(role,input,model,schema,prompt,maxTokens);const entry={role,model,request:req,request_sha256:sha(req),status:'submitted',submitted_at:new Date().toISOString()};trace.calls.push(entry);trace.status='submitted_'+role;flush();let r;
  try{r=invoke?await invoke(req,role):await callProvider(req,creds);}catch(e){entry.status='unknown_billing_do_not_retry';entry.error=String(e.message);flush();throw e;}
  entry.status='returned';entry.response_raw=r.raw;entry.response_sha256=sha(r.raw);entry.usage=r.usage??null;entry.estimated_usd=r.usage?estimateCost(r.usage,model):0;spent+=entry.estimated_usd;trace.total_estimated_usd=+spent.toFixed(8);flush();return JSON.parse(r.raw);
 }
 try{
  const selected=p.decision.affected;const original=p.turn;let b=clone(original.B_output);
  const cAdvice={learner_report:p.c.plan.learner_report,alternatives:p.c.plan.hypotheses,reason:p.c.plan.reason,preserve:p.c.plan.preserve,reconsider:p.c.plan.reconsider,uncertainty:p.c.plan.uncertainty,advisory_only:true};
  if(p.bFirst){const bInput={topic_title:original.topic_title,learner_message:original.learner_message,feedback:p.feedback.selections,prior_teaching_intent:b.teaching_intent,original_beats:b.beats,affected_beats:selected,C_revision_proposal:cAdvice,scope:o.scope,source_is_subjective_learner_feedback:true};
   const authored=await call('B_C_RETRY',bInput,o.modelB,B_BEAT_SCHEMA,B_PROMPT,3600);b=applyWholeBeatReplacements(b,selected,authored.replacements);trace.B_retry_raw=authored;trace.composite_B_output=b;flush();}
  const affected=b.beats.filter(beat=>selected.includes(beat.id));
  const xContext=makeXInput({beats:affected,teaching_intent:b.teaching_intent},{topic:{id:original.topic_id,title:original.topic_title},learner_brief_for_B:original.A_brief,provisional_retrieved_memory:[]});
  const xInput={...xContext,feedback:p.feedback.selections,C_revision_proposal:cAdvice,previous_visual_concept:original.X_output.visual_concept,previous_continuity_plan:original.X_output.continuity_plan,prior_moments:original.X_output.moments.filter(m=>selected.includes(m.beat_id)),unchanged_neighbor_moments:original.X_output.moments.filter(m=>!selected.includes(m.beat_id)),scope:o.scope,instruction:'Design new scenes for selected affected beats only. Respect learner preference and leave unaffected beats unchanged. Exact B words and anchor IDs are authoritative.'};
  const rawX=await call('X_C_RETRY',xInput,o.modelX,X_GOLD_SCHEMA,X_PROMPT,3900);
  const output=normalizeRetryVisualR50(rawX,affected,original.X_output);
  // C-guided retry requires complete coverage; do not present silent old-scene holds as redesign.
  assert(output.report.reused_prior_scene_beat_ids?.length===0,'X omitted required scene beat; prior scene not silently reused');
  const x=clone(original.X_output),byId=new Map(output.moments.map(m=>[m.beat_id,m]));for(let i=0;i<x.moments.length;i++){if(byId.has(x.moments[i].beat_id))x.moments[i]=byId.get(x.moments[i].beat_id);}
  if(o.scope==='all'){x.visual_concept=rawX.visual_concept;x.continuity_plan=rawX.continuity_plan;}
  for(let i=0;i<original.B_output.beats.length;i++){const id0=original.B_output.beats[i].id;if(!selected.includes(id0)){assert(b.beats[i].narration===original.B_output.beats[i].narration,'Unselected B beat changed');assert(JSON.stringify(x.moments[i])===JSON.stringify(original.X_output.moments[i]),'Unselected X moment changed');}}
  trace.composite_B_output=b;trace.composite_X_output=x;trace.X_coverage=output.report;trace.status='validated_before_commit';flush();
  const now=stateFor(o.session);assert(now.state.turns.at(-1)?.turn_id===original.turn_id&&activeSha(now.state.turns.at(-1))===p.feedback.base_sha256,'Session changed before commit');
  const changed=now.state.turns.at(-1);changed.B_output=b;changed.X_output=x;changed.teacher_response=b.beats.map(beat=>beat.narration).join('\n\n');
  if(p.decision.needs_probe_review){changed.probe_plan={...emptyProbe(),disabled_reason:'R53R: C-guided revision changed context; previous probe requires a separately reviewed redesign'};changed.B_output.probe_plan=changed.probe_plan;changed.probe_opportunity={...changed.probe_opportunity,status:'revision_probe_requires_review',prior_probe_plan_preserved_in_retry_trace:true};}
  changed.targeted_retry_history=[...(changed.targeted_retry_history??[]),{retry_id:id,feedback_id:o.feedback,strategy:'C_guided_whole_beat',c_plan_sha256:p.c.plan_sha256,base_sha256:p.feedback.base_sha256,latest_sha256:sha({B_output:b,X_output:x}),affected_beat_ids:selected,probe_review_required:p.decision.needs_probe_review,at:new Date().toISOString()}];
  if(Array.isArray(now.state.scene_contracts)&&changed.scene_contract_id){const sc=makeSceneContract(now.state,changed.turn_id,{id:changed.topic_id,title:changed.topic_title},b,x);const index=now.state.scene_contracts.findIndex(s=>s.scene_id===changed.scene_contract_id&&s.source_turn_id===changed.turn_id);if(index>=0&&sc.scene_id===changed.scene_contract_id){now.state.scene_contracts[index]=sc;changed.scene_contract=sc;}else trace.scene_contract_warning='Scene contract not overwritten because reused ID differs';}
  const backups=path.join(p.dir,'retry-backups');fs.mkdirSync(backups,{recursive:true});fs.writeFileSync(path.join(backups,id+'-state-before.json'),fs.readFileSync(now.statePath),{flag:'wx',mode:0o600});
  const temp=path.join(p.dir,'.state-'+id+'-'+process.pid+'.tmp');write(temp,now.state);fs.renameSync(temp,now.statePath);
  trace.changes={affected_beat_ids:selected,whole_beat_narration_replacement:p.bFirst,probe_review_required:p.decision.needs_probe_review,old_probe_plan:original.probe_plan??original.B_output.probe_plan??null,unchanged_beats_preserved:true,c_plan_sha256:p.c.plan_sha256};trace.status='complete';trace.completed_at=new Date().toISOString();trace.latest_sha256=activeSha(changed);flush();fs.renameSync(pending,complete);
  return {...result,status:'complete',retry_id:id,model_calls:trace.calls.map(c=>c.role),estimated_usd:trace.total_estimated_usd,probe_review_required:p.decision.needs_probe_review};
 }catch(e){trace.status='manual_review_required_after_failure';trace.failure=String(e.stack??e.message);flush();throw new Error(String(e.message)+'; paid retry trace retained: '+pending+'; no automatic retry');}
}
const file=path.resolve(fileURLToPath(import.meta.url));if(process.argv[1]&&path.resolve(process.argv[1])===file)run().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
