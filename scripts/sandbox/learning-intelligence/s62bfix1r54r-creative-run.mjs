#!/usr/bin/env node
/** R5.4R isolated optional paid creative experience with structured A context and extended request deadline. B-only = ONE call doing pedagogy, teaching AND code.
 * B+X = TWO calls: B educational design -> X executable HTML/CSS/JS. Does not alter normal learning turns.
 * Permanent no-retry reservation before provider calls. No generated code executed on server.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {credentials} from './s16b54-models.mjs';
import {callProviderExtended} from './s62bfix1r54r-provider.mjs';
import {estimateCost} from './s16b61fix1-models.mjs';
import {ID,TURN,VARIANTS,sha,S,B_BRIEF_SCHEMA,ACTIVITY_SCHEMA,validateActivity} from './s62bfix1r54-creative-core.mjs';
import {BASE} from './s62bfix1r54-creative-store.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../..');const require=createRequire(import.meta.url);
const check=(v,m)=>{if(!v)throw Error('R54 creative: '+m);};const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const models=new Set(['gpt-4.1-mini','gpt-4.1']);
const minSpend=model=>model==='gpt-4.1'?0.29:0.055;
export function parseArgs(argv){const o={mode:'check',session:null,turn:null,variant:null,modelB:'gpt-4.1-mini',modelX:'gpt-4.1-mini',budget:null,allow:false,focus:''};
 const map={'--mode':'mode','--session-id':'session','--turn-id':'turn','--variant':'variant','--model-b':'modelB','--model-x':'modelX','--budget-usd':'budget','--focus':'focus'};
 for(let i=0;i<argv.length;i++){if(argv[i]==='--allow-spend'){o.allow=true;continue;}check(map[argv[i]]&&argv[i+1]!==undefined,'unknown CLI argument '+argv[i]);o[map[argv[i]]]=argv[++i];}
 check(['check','model'].includes(o.mode)&&ID.test(o.session??'')&&TURN.test(o.turn??'')&&VARIANTS.has(o.variant),'invalid mode/session/turn/variant');
 check(models.has(o.modelB)&&models.has(o.modelX),'unsupported model');check(o.focus.length<=600,'focus too long');
 o.budget=o.budget===null?null:Number(o.budget);
 if(o.mode==='model'){const threshold=o.variant==='bx'?minSpend(o.modelB)+minSpend(o.modelX):minSpend(o.modelB);check(o.allow&&Number.isFinite(o.budget)&&o.budget>=threshold&&o.budget<=10,'explicit paid approval, sufficient admission budget and ceiling $10 required');}
 else check(!o.allow&&o.budget===null,'check mode must be free');return o;
}
function branch(){const x=spawnSync('git',['-C',ROOT,'branch','--show-current'],{encoding:'utf8',timeout:10000});check(x.status===0&&x.stdout.trim()==='myway/learning-sandbox-v3_7a','wrong protected Git branch');}
function env(){if(process.env.OPENAI_API_KEY)return;const f=path.join(ROOT,'.env.local');if(fs.existsSync(f)){const dot=require('dotenv').parse(fs.readFileSync(f));process.env.OPENAI_API_KEY=dot.OPENAI_API_KEY||dot.MYWAY_OPENAI_API_KEY||'';if(!process.env.OPENAI_BASE_URL&&dot.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=dot.OPENAI_BASE_URL;}}
function context(o){const dir=path.join(BASE,o.session),sp=path.join(dir,'state.json');check(fs.existsSync(sp),'existing learner session missing');const state=read(sp);
 check(state.schema==='myway_goldloop_human_v1'&&state.learner===o.session,'session identity mismatch');
 check(!fs.readdirSync(path.join(dir,'turns')).some(n=>n.endsWith('.pending.json')),'pending paid learning turn');
 const t=state.turns.at(-1);check(t?.turn_id===o.turn,'only latest completed turn can generate creative experience');
 const folder=path.join(dir,'creative-designs'),stem=o.turn+'-'+o.variant;const pending=path.join(folder,stem+'.pending.json'),done=path.join(folder,stem+'.json');
 check(!fs.existsSync(pending)&&!fs.existsSync(done),'this variant already reserved/completed; never rerun paid design');
 const facts={source_turn_id:t.turn_id,topic_id:t.topic_id,topic_title:t.topic_title,learner_original_message:String(t.learner_message??'').slice(0,1700),model_A_learner_brief_is_tentative:typeof t.A_brief==='string'?t.A_brief.slice(0,3000):JSON.stringify(t.A_brief??null).slice(0,3000),B_recent_teaching_intent:String(t.B_output?.teaching_intent??'').slice(0,1300),B_recent_narration:(t.B_output?.beats??[]).slice(0,7).map(b=>({id:b.id,text:String(b.narration??'').slice(0,500)})),X_recent_visual_concept:String(t.X_output?.visual_concept??'').slice(0,1300),prior_probe_offered:t.probe_plan?.offer===true,prior_probe_may_have_been_suppressed:true,user_optional_focus:o.focus||null,source_not_a_verified_learning_diagnosis:true};
 return {dir,state,t,folder,pending,done,facts};
}
const DESIGN_SYSTEM=`You are MyWay Model B doing unconstrained EDUCATIONAL EXPERIENCE DESIGN. Given what the learner actually said and provisional Model A evidence, invent a learning experience that would be genuinely useful now. It can be a creative experiment, interactive explanation, simulation, story, challenge or exploration. Do not default to a generic multiple-choice quiz, a recall of prescribed steps or an invented cognitive diagnosis. Choose whatever is educationally compelling. Decide what learner behavior might be informative to A and what remains ambiguous; do not claim a correct answer when it cannot be independently checked. No list of fixed probe modalities, scene selectors, or rubric. Your brief is handed to an experience implementation model. Produce a vivid but concise design brief including learner-facing teaching/narration, meaningful actions and intended consequences. No need to constrain to our old seven templates.`;
const BUILD_SYSTEM=`You are a highly capable creative EDUCATIONAL EXPERIENCE DESIGNER and FRONT-END IMPLEMENTER. Create an original functional browser activity, not a storyboard description or a static quiz. You have HTML/CSS/JS, inline SVG, Canvas, browser DOM and browser-native controls. Use any interactions that fit the educational purpose, including branching experiences, mini-games, visualizations and exploratory lessons. Do NOT use outside network resources, images, imports, fetch, local/session storage, cookies, top-level navigation, audio/video external media, workers or external libraries. Return an HTML FRAGMENT (not full html/head/body) with inline <style> and <script> only. HTML executes in an opaque-origin sandboxed iframe with CSP blocking networking. Make all interactions genuinely work with self-contained code, visually clear, appropriately responsive, with accessible labeling and meaningful feedback. The activity MUST work without external resources. When user actions matter, call window.mywayRecord(actionName, detailString) with event type and meaningful information (e.g. prediction, choose, change, reveal, hint, reset, answer, finish); these reports are unverified and may not represent mastery. Provide explanatory in-activity text where needed, not just an isolated exam. Do not suggest physical accuracy where simulation is illustrative. Avoid ungrounded automatic correctness claims. Allow the learner to try things, fail safely, revise, and inspect outcomes. The evidence_notes field should say what action reports could mean and what they cannot prove. The limitations field must truthfully disclose nonfunctional aspects. No restriction to seven old templates. Be imaginative and focus on the actual learner problem.`;
function reqFor(model,system,user,schema,name,max_tokens){return {model,store:false,max_tokens,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(user)}],response_format:{type:'json_schema',json_schema:{name,strict:true,schema}}};}
export async function run(argv=process.argv.slice(2),{invoke=null,skipBranch=false,base=null}={}){
 const o=parseArgs(argv);if(!skipBranch)branch();const c=context(o);if(o.mode==='check')return {status:'ready',variant:o.variant,session_id:o.session,turn_id:o.turn,models_to_call:o.variant==='b_only'?['B_ONLY']:['B_DESIGN','X_IMPLEMENT'],model_calls:0,writes:0,existing_learning_turn_immutable:true};
 if(base)throw Error('Test alternate base not supported; use fixture ROOT override'); // only fixture with isolated session root supported via copied repo
 env();const cred=invoke?null:credentials();fs.mkdirSync(c.folder,{recursive:true});
 const trace={schema:'myway_r54_creative_trace_v1',status:'reserved',session_id:o.session,turn_id:o.turn,topic_id:c.t.topic_id,variant:o.variant,focus:o.focus,model_b:o.modelB,model_x:o.modelX,started_at:new Date().toISOString(),calls:[],spent_estimated_usd:0,learning_state_untouched:true,source_context_sha256:sha(c.facts)};
 fs.writeFileSync(c.pending,JSON.stringify(trace,null,2)+'\n',{flag:'wx',mode:0o600});const flush=()=>fs.writeFileSync(c.pending,JSON.stringify(trace,null,2)+'\n');
 let spent=0;
 async function call(role,req,model){check(Buffer.byteLength(JSON.stringify(req))<=26000,'request too large');const log={role,model,request:req,status:'submitted',at:new Date().toISOString()};trace.calls.push(log);trace.status='provider_call_submitted';flush();let result;try{result=invoke?await invoke(req,role):await callProviderExtended(req,cred,{timeoutMs:120000});}catch(e){log.status='billing_unknown_do_not_retry';log.error=String(e.message);throw e;}
 log.status='returned';log.raw=result.raw;log.usage=result.usage;log.estimated_usd=estimateCost(result.usage,model);spent+=log.estimated_usd;trace.spent_estimated_usd=spent;flush();check(spent<=o.budget,'reported usage exceeds admission budget; manual review');return JSON.parse(result.raw);}
 try{
 let brief='',activity;
 if(o.variant==='bx'){
  const plan=await call('B_DESIGN',reqFor(o.modelB,DESIGN_SYSTEM,{learner_context:c.facts,request:'Design whatever experience best serves this learner. No rigid activity types.'},B_BRIEF_SCHEMA,'myway_r54_b_design',2800),o.modelB);
  check(typeof plan.brief==='string'&&plan.brief.trim().length>=40&&plan.brief.length<=12000,'invalid educational brief');brief=plan.brief;
  activity=await call('X_IMPLEMENT',reqFor(o.modelX,BUILD_SYSTEM,{learner_context:c.facts,model_B_educational_design:brief,request:'Implement this experience as runnable HTML+CSS+JS fragment; genuinely interactive.'},ACTIVITY_SCHEMA,'myway_r54_x_implementation',7800),o.modelX);
 }else{
  activity=await call('B_ONLY',reqFor(o.modelB,DESIGN_SYSTEM+'\n\n'+BUILD_SYSTEM+'\n\nYou alone handle pedagogy, teaching narration AND technical implementation in THIS SINGLE CALL.',{learner_context:c.facts,request:'One-call design + teach + implement executable experience.'},ACTIVITY_SCHEMA,'myway_r54_b_alone',7800),o.modelB);
  brief='B-only simultaneously authored pedagogy and runnable activity in one model call';
 }
 validateActivity(activity);
 const output={schema:'myway_r54_creative_artifact_v1',status:'complete',variant:o.variant,session_id:o.session,turn_id:o.turn,topic_id:c.t.topic_id,title:activity.title,brief,activity,activity_sha256:sha(activity),source_context_sha256:sha(c.facts),model_calls:trace.calls.length,estimated_usd:+spent.toFixed(8),created_at:new Date().toISOString(),quality_unverified:true,no_automatic_scoring:true};
 trace.output=output;trace.status='complete';trace.completed_at=new Date().toISOString();flush();fs.renameSync(c.pending,c.done);
 return {status:'complete',variant:o.variant,turn_id:o.turn,title:activity.title,estimated_usd:output.estimated_usd,model_calls:output.model_calls,activity_sha256:output.activity_sha256,learning_state_untouched:true};
 }catch(e){trace.status='manual_review_required_no_automatic_retry';trace.failure=String(e.stack??e.message);flush();throw Error(String(e.message)+'; inspect '+c.pending+'; do not retry paid research calls');}
}
const isMain=process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url));if(isMain)run().then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
