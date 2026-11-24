#!/usr/bin/env node
/** R5.3 research-only, optional single paid call to X (interactive experience) or C (feedback interpretation).
 * No automatic continuation or retry. Plans remain fallible source-labelled model outputs, never learner facts.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost} from './s16b61fix1-models.mjs';
import {activeSha} from './s62bfix1r44-feedback-store.mjs';
const require=createRequire(import.meta.url);
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../..');
const BASE=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
const SESSION=/^[A-Za-z][A-Za-z0-9_-]{0,39}$/,TURN=/^t\d{4,}$/;
const str={type:'string'},list=items=>({type:'array',items}),obj=p=>({type:'object',additionalProperties:false,properties:p,required:Object.keys(p)});
const stepSchema=obj({id:str,kind:{type:'string',enum:['reveal','choose','predict','explain','compare']},context:str,challenge:str,options:list(str),hint:str});
export const X_EXPERIENCE_SCHEMA=obj({title:str,educational_intent:str,scene_description:str,why_this_interaction:str,scaffolding_plan:str,steps:list(stepSchema),limitations:str});
const hypothesis=obj({possibility:str,observed_evidence:str,uncertainty:str});
export const C_PLAN_SCHEMA=obj({learner_report:str,reported_experience_not_diagnosis:{type:'boolean'},hypotheses:list(hypothesis),revision_scope:{type:'string',enum:['B','X','B_and_X','probe','clarify','no_change']},reason:str,preserve:list(str),reconsider:list(str),probe_impact:{type:'string',enum:['keep','adapt','replace','not_applicable','uncertain']},evidence_needed:str,uncertainty:str});
const X_PROMPT=`You are MyWay Model X running an EXPERIMENTAL interactive-experience research call. Model B owns the educational purpose; do NOT rewrite B narration. Your task is to imagine a concrete, useful, executable sequence of 2–5 browser-native interactions that actually investigates the relevant learning uncertainty. Compose activities from reveal, choose, predict, explain and compare STEPS, rather than selecting an overall fixed quiz template. Each step's context is learner-visible content, challenge is the concrete prompt, options are 2–6 distinct choices ONLY for choose (empty for other kinds), hint is optional and must not reveal the answer. Progressive stories, cumulative relationship tracking, prediction/reveal, context changes and transfer scenarios are welcome when educationally justified. Build an EXPERIENCE, not a list of study instructions or an exercise to repeat the teacher's steps. Respect prior learner feedback, do not invent learner capability or independent grades. No audio, physics, game engine, real animations, external images, or 2D/3D renderer: text/collapsible steps, selections and authored answers are what this research runtime can currently execute. Do not promise executed or scored effects. Do not require knowledge of a specific language or topic. Return JSON only to schema.`;
import {C_R553_PROMPT} from './s62bfix1r553-prompts.mjs';
const C_PROMPT=C_R553_PROMPT;
const sha=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const assert=(a,msg)=>{if(!a)throw Error('R53 PLAN: '+msg);};
const safe=(v,n)=>String(v??'').slice(0,n);
export function validateXExperience(x){
 assert(x&&typeof x==='object'&&!Array.isArray(x),'X plan not object');
 assert(Object.keys(x).sort().join('|')===Object.keys(X_EXPERIENCE_SCHEMA.properties).sort().join('|'),'X plan fields unexpected');
 for(const k of ['title','educational_intent','scene_description','why_this_interaction','scaffolding_plan','limitations'])assert(typeof x[k]==='string'&&x[k].length<=1800,'invalid X '+k);
 assert(x.title.trim().length>=4&&x.educational_intent.trim().length>=8,'missing X title/intent');
 assert(Array.isArray(x.steps)&&x.steps.length>=2&&x.steps.length<=5,'X must provide 2–5 distinct stages');
 for(const [i,s] of x.steps.entries()){
  assert(s&&Object.keys(s).sort().join('|')===Object.keys(stepSchema.properties).sort().join('|'),'invalid X stage fields');
  assert(s.id==='e'+String(i+1).padStart(2,'0'),'stages must use sequential IDs e01..');
  assert(['reveal','choose','predict','explain','compare'].includes(s.kind),'unknown stage kind');
  for(const k of ['context','challenge','hint'])assert(typeof s[k]==='string'&&s[k].length<=1300,'bad stage '+k);
  assert(s.context.trim().length>=3&&s.challenge.trim().length>=3,'empty step content');
  assert(Array.isArray(s.options)&&s.options.every(v=>typeof v==='string'&&v.trim()&&v.length<=200),'invalid options');
  if(s.kind==='choose')assert(s.options.length>=2&&s.options.length<=6&&new Set(s.options).size===s.options.length,'choice must have distinct options');
  else assert(s.options.length===0,'only choose has options');
 }
 return x;
}
export function validateCPlan(p){
 assert(p&&typeof p==='object'&&!Array.isArray(p),'C plan not object');
 assert(Object.keys(p).sort().join('|')===Object.keys(C_PLAN_SCHEMA.properties).sort().join('|'),'C plan fields unexpected');
 assert(p.reported_experience_not_diagnosis===true,'C must mark feedback as experience not diagnosis');
 assert(Array.isArray(p.hypotheses)&&p.hypotheses.length<=4,'C must give <=4 alternatives');
 for(const h of p.hypotheses){for(const k of ['possibility','observed_evidence','uncertainty'])assert(typeof h[k]==='string'&&h[k].length<=1000,'bad C hypothesis');}
 assert(C_PLAN_SCHEMA.properties.revision_scope.enum.includes(p.revision_scope),'unknown C revision scope');
 assert(C_PLAN_SCHEMA.properties.probe_impact.enum.includes(p.probe_impact),'unknown C probe status');
 for(const k of ['learner_report','reason','evidence_needed','uncertainty'])assert(typeof p[k]==='string'&&p[k].length<=1600,'bad C '+k);
 for(const k of ['preserve','reconsider'])assert(Array.isArray(p[k])&&p[k].length<=8&&p[k].every(v=>typeof v==='string'&&v.length<=350),'bad C '+k);
 return p;
}
export function parseArgs(args){const o={kind:null,session:null,turn:null,feedback:null,model:'gpt-4.1-mini',budget:null,allow:false,mode:'check'};
 const map={'--kind':'kind','--session-id':'session','--turn-id':'turn','--feedback-id':'feedback','--model':'model','--budget-usd':'budget','--mode':'mode'};
 for(let i=0;i<args.length;i++){const a=args[i];if(a==='--allow-spend'){o.allow=true;continue;}assert(map[a]&&args[i+1]!==undefined,'invalid argument '+a);o[map[a]]=args[++i];}
 assert(['x','c'].includes(o.kind)&&SESSION.test(o.session??'')&&TURN.test(o.turn??''),'kind/session/turn required');
 assert(['check','model'].includes(o.mode),'invalid mode');assert(['gpt-4.1-mini','gpt-4.1'].includes(o.model),'unsupported model');
 if(o.kind==='c')assert(/^fb\d{4,}$/.test(o.feedback??''),'feedback ID required for C');
 if(o.kind==='x')assert(o.feedback===null,'X experience uses current B probe, not feedback');
 o.budget=o.budget===null?null:Number(o.budget);
 if(o.mode==='model')assert(o.allow&&Number.isFinite(o.budget)&&o.budget>= (o.model==='gpt-4.1'?0.29:0.055)&&o.budget<=10,'explicit approval and sufficient admission budget required');
 else assert(!o.allow&&o.budget===null,'read-only checks must not authorize spending');
 return o;
}
function loadEnv(){if(process.env.OPENAI_API_KEY)return;const p=path.join(ROOT,'.env.local');if(fs.existsSync(p)){let dot;try{dot=require('dotenv')}catch{throw Error('dotenv missing');}const vars=dot.parse(fs.readFileSync(p));process.env.OPENAI_API_KEY=vars.OPENAI_API_KEY||vars.MYWAY_OPENAI_API_KEY||'';if(!process.env.OPENAI_BASE_URL&&vars.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=vars.OPENAI_BASE_URL;}}
function branchOK(){const x=spawnSync('git',['-C',ROOT,'branch','--show-current'],{encoding:'utf8',timeout:10000});assert(x.status===0&&x.stdout.trim()==='myway/learning-sandbox-v3_7a','wrong Git branch');}
function contextFor(o){const dir=path.join(BASE,o.session),statePath=path.join(dir,'state.json');assert(fs.existsSync(statePath),'session state missing');
 const state=read(statePath);assert(state.schema==='myway_goldloop_human_v1'&&state.learner===o.session,'session identity mismatch');
 assert(!(fs.readdirSync(path.join(dir,'turns')).some(n=>n.endsWith('.pending.json'))),'unresolved pending paid turn');
 const t=state.turns.at(-1);assert(t&&t.turn_id===o.turn,'experiment requires latest completed turn');
 const plan=t.probe_plan??t.B_output?.probe_plan;
 let input,folder,key;
 if(o.kind==='x'){
  assert(plan?.offer===true,'B did not offer a probe; X should not create one unilaterally');
  folder='experience-designs';key=t.turn_id;
  input={role:'X_INTERACTIVE',topic:{id:t.topic_id,title:t.topic_title},B_exact_teaching_intent:t.B_output.teaching_intent,B_probe_educational_purpose:plan.purpose,B_probe_prompt:plan.prompt,B_probe_novelty:plan.novelty,learner_evidence_brief_is_unverified:t.A_brief??null,existing_scene:t.X_output?.visual_concept,existing_storyboard:(t.X_output?.moments??[]).map(m=>safe(m.scene_description,400)),original_learner_message:safe(t.learner_message,1600),alternative_to_the_seven_fixed_browser_templates:true,no_ground_truth_answer_supplied:true};
 }else{
  folder='revision-plans';key=o.feedback;
  const p=path.join(dir,'feedback',key+'.json');assert(fs.existsSync(p),'saved feedback missing');const feedback=read(p);
  assert(feedback.turn_id===t.turn_id&&feedback.base_sha256===activeSha(t),'feedback does not match latest active version');
  input={role:'C_FEEDBACK',topic:{id:t.topic_id,title:t.topic_title},reported_selections:feedback.selections,original_learner_message:safe(t.learner_message,1600),teaching_intent:t.B_output.teaching_intent,B_narration:t.B_output.beats.map(b=>({id:b.id,text:b.narration})),X_moments:t.X_output.moments.map(m=>({beat_id:m.beat_id,scene:safe(m.scene_description,1100)})),probe_plan:plan,original_turn_active_sha256:feedback.base_sha256,no_model_A_memory_write:true};
 }
 const out=path.join(dir,folder);const pending=path.join(out,key+'.pending.json'),done=path.join(out,key+'.json');
 assert(!fs.existsSync(pending)&&!fs.existsSync(done),'plan already reserved or completed; no re-run');
 return {dir,state,t,folder,key,out,pending,done,input};
}
export async function run(argv=process.argv.slice(2),{invoke=null,skipBranch=false}={}){
 const o=parseArgs(argv);if(!skipBranch)branchOK();const c=contextFor(o);
 if(o.mode==='check')return {status:'ready_for_explicit_paid_experiment',kind:o.kind,session:o.session,turn_id:o.turn,feedback_id:o.feedback,existing_turn_unchanged:true,model_calls:0,writes:0,scope:'separate experimental plan only',requires_explicit_spend:true};
 loadEnv();const creds=invoke?null:credentials();const schema=o.kind==='x'?X_EXPERIENCE_SCHEMA:C_PLAN_SCHEMA,prompt=o.kind==='x'?X_PROMPT:C_PROMPT;
 const req={model:o.model,store:false,max_tokens:o.kind==='x'?2300:1600,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(c.input)}],response_format:{type:'json_schema',json_schema:{name:'myway_r53_'+o.kind,strict:true,schema}}};
 assert(Buffer.byteLength(JSON.stringify(req))<=30000,'prompt too large');
 fs.mkdirSync(c.out,{recursive:true});const trace={schema:'myway_r53_research_plan_v1',kind:o.kind,source_turn:o.turn,source_feedback:o.feedback,source_topic_id:c.t.topic_id,status:'reserved',calls:[],started_at:new Date().toISOString(),model:o.model,request_sha256:sha(req),original_state_immutable:true};
 fs.writeFileSync(c.pending,JSON.stringify(trace,null,2)+'\n',{flag:'wx',mode:0o600});const flush=()=>fs.writeFileSync(c.pending,JSON.stringify(trace,null,2)+'\n');
 try{
  const entry={role:o.kind==='x'?'X_INTERACTIVE':'C_FEEDBACK',request:req,request_sha256:sha(req),status:'submitted',at:new Date().toISOString()};trace.calls.push(entry);trace.status='model_call_submitted';flush();
  let out;try{out=invoke?await invoke(req):await callProvider(req,creds);}catch(e){entry.status='unknown_billing_do_not_retry';entry.failure=String(e.message);throw e;}
  entry.status='returned';entry.response_raw=out.raw;entry.response_sha256=sha(out.raw);entry.usage=out.usage;entry.estimated_usd=estimateCost(out.usage,o.model);flush();
  const data=JSON.parse(out.raw);o.kind==='x'?validateXExperience(data):validateCPlan(data);
  const record={schema:'myway_r53_experimental_'+o.kind+'_v1',kind:o.kind,session_id:o.session,turn_id:o.turn,feedback_id:o.feedback,topic_id:c.t.topic_id,source_sha256:sha(c.input),plan_sha256:sha(data),created_at:new Date().toISOString(),plan:data,estimated_usd:entry.estimated_usd,not_a_learner_fact:true,no_independent_scoring:true,experimental:true};
  trace.output=record;trace.status='complete';trace.completed_at=new Date().toISOString();flush();fs.renameSync(c.pending,c.done);
  return {status:'complete',kind:o.kind,turn_id:o.turn,feedback_id:o.feedback,estimated_usd:entry.estimated_usd,plan:record,model_calls:1,original_turn_unchanged:true};
 }catch(e){trace.status='manual_review_required_no_automatic_retry';trace.failure=String(e.stack??e.message);flush();throw Error(String(e.message)+'; saved plan trace: '+c.pending+'; do not retry');}
}
const self=path.resolve(fileURLToPath(import.meta.url));if(process.argv[1]&&path.resolve(process.argv[1])===self)run().then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(String(e.message));process.exitCode=1;});
