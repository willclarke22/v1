#!/usr/bin/env node
/** R4.3 LOCAL-ONLY HUMAN LEARNER UI. Deliberately NOT a Next/Vercel route.
 * Reuses existing R4.3 GoldLoop CLI, its MiniLM retrieval, model calls, provenance and ignored state.
 * No import into any production application; no Director or asset-library integration.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import zlib from 'node:zlib';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {saveFeedback,listFeedback,listRetries,activeSha,hasPending} from './s62bfix1r44-feedback-store.mjs';
import {loadState,backfillPreview,rootSummary,pendingExists,rankCandidateRoots,clone} from './s62bfix1r45-root-memory.mjs';
import {commitProbeAttempt} from './s62bfix1r46-probe-store.mjs';
import {commitExperienceAttempt} from './s62bfix1r53-experience-store.mjs';
import {ATTEMPT_RE,probeContinuationContext} from './s62bfix1r54-probe-continuation.mjs';
import {commitCreativeAttempt} from './s62bfix1r54-creative-store.mjs';
import {frameDocument} from './s62bfix1r54-creative-core.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../..');
const OUTPUT=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
const RUNNER=path.join(HERE,'s62bfix1r54-goldloop-run.mjs');
const CREATIVE_RUNNER=path.join(HERE,'s62bfix1r54r-creative-run.mjs');
const X_RECOVERY_RUNNER=path.join(HERE,'s62bfix1r54r-x-recovery.mjs');
const R53_PLAN_RUNNER=path.join(HERE,'s62bfix1r53-research-plan.mjs');
const BACKFILL_RUNNER=path.join(HERE,'s62bfix1r45-root-backfill-run.mjs');
const RETRY_RUNNER=path.join(HERE,'s62bfix1r50-retry-run.mjs');
const C_GUIDED_RETRY_RUNNER=path.join(HERE,'s62bfix1r53r-c-guided-retry.mjs');
const WEBFILES={ '/':'s62bfix1r53-goldloop.html', '/style.css':'s62bfix1r54-goldloop.css', '/client.js':'s62bfix1r54r-goldloop-client.js'};
const MODELS=new Set(['gpt-4.1-mini','gpt-4.1']);
const ID=/^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const BRANCH='myway/learning-sandbox-v3_7a';
const CONTENT_TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
function bad(msg,status=400){const e=new Error(msg);e.httpStatus=status;return e;}
const validId=v=>typeof v==='string'&&ID.test(v);
function branchOK(root=ROOT){const x=spawnSync('git',['-C',root,'branch','--show-current'],{encoding:'utf8',timeout:10000});return x.status===0&&x.stdout.trim()===BRANCH;}
function readJSON(p){return JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));}
function safeJSON(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function onlyToken(v){return typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);}
function cookieValue(headers){return String(headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('myway_goldloop_lab='))?.split('=')[1]??'';}
function getSessionDir(session){if(!validId(session))throw bad('Invalid session ID');return path.join(OUTPUT,session);}
function allocateNextTurnId(dir){
 const turnsDir=path.join(dir,'turns'),inputs=path.join(dir,'inputs');fs.mkdirSync(inputs,{recursive:true});
 const diskState=fs.existsSync(path.join(dir,'state.json'))?readJSON(path.join(dir,'state.json')):null;
 const sourceMax=diskState?.derived_session?.source_max_turn_number??0;
 const retainedMax=Math.max(0,...(diskState?.turns??[]).map(t=>/^t\d{4,}$/.test(t.turn_id??'')?Number(t.turn_id.slice(1)):0));
 if(!Number.isInteger(sourceMax)||sourceMax<0||sourceMax>=10000)throw bad('Invalid reset turn high-water mark',409);
 for(let i=Math.max(sourceMax,retainedMax)+1;i<10000;i++){
  const id='t'+String(i).padStart(4,'0');
  if(!fs.existsSync(path.join(turnsDir,id+'.json'))&&!fs.existsSync(path.join(turnsDir,id+'.pending.json'))&&!fs.existsSync(path.join(inputs,id+'.txt')))return id;
 }
 throw bad('No available turn IDs',409);
}

function getSession(session){const dir=getSessionDir(session),p=path.join(dir,'state.json');const s=fs.existsSync(p)?readJSON(p):null;const pend=path.join(dir,'turns');const pending=fs.existsSync(pend)?fs.readdirSync(pend).filter(x=>x.endsWith('.pending.json')):[];
 if(s&&(s.schema!=='myway_goldloop_human_v1'||s.learner!==session))throw bad('Unrecognized state format; no writes performed',409);
 const allFeedback=listFeedback(session), allRetries=listRetries(session);
 const latestTurnId=s?.turns?.at(-1)?.turn_id??null;
 const completedContinuations=new Map((s?.turns??[]).filter(t=>t.continuation_source?.attempt_id).map(t=>[t.continuation_source.attempt_id,t.turn_id]));
 const latestAttemptId=s?.probe_attempts?.at(-1)?.attempt_id??null;
 const probeAttempts=(s?.probe_attempts??[]).map(a=>{
   const completed=completedContinuations.get(a.attempt_id)??null;
   const reserved=fs.existsSync(path.join(dir,'probe-continuations',a.attempt_id+'.json'));
   return {...a,continuation_turn_id:completed,continuation_reserved:reserved,
     continuation_eligible:a.status==='submitted'&&a.turn_id===latestTurnId&&a.attempt_id===latestAttemptId&&!completed&&!reserved&&!pending.length};
 });
 const readPlan=(folder,id)=>{const p=path.join(dir,folder,id+'.json');try{if(!fs.existsSync(p))return null;const trace=readJSON(p);return trace.status==='complete'?trace.output??null:null;}catch{return null;}};
 const creativeRecovery=t=>{
  const folder=path.join(dir,'creative-designs'),source=path.join(folder,t.turn_id+'-bx.pending.json');
  const canonical=path.join(folder,t.turn_id+'-bx.json'),recoveryPending=path.join(folder,t.turn_id+'-bx.recovery01.pending.json'),recoveryDone=path.join(folder,t.turn_id+'-bx.recovery01.json');
  if(!fs.existsSync(source))return null;
  try{
    const trace=readJSON(source);const b=trace.calls?.[0],x=trace.calls?.[1];
    if(trace.session_id!==session||trace.turn_id!==t.turn_id||trace.variant!=='bx'||trace.topic_id!==t.topic_id)return {status:'incompatible_trace',eligible:false};
    const brief=b?.status==='returned'&&typeof b.raw==='string'?JSON.parse(b.raw).brief:null;
    const suitable=trace.status==='manual_review_required_no_automatic_retry'&&b?.status==='returned'&&x?.role==='X_IMPLEMENT'&&x?.status==='billing_unknown_do_not_retry'&&!x.raw&&!x.usage&&typeof brief==='string'&&brief.length>=40;
    const completed=fs.existsSync(canonical),reserved=fs.existsSync(recoveryPending)||fs.existsSync(recoveryDone);
    return {status:completed?'recovered':reserved?'recovery_reserved':suitable?'original_X_unrecorded':'manual_review',eligible:suitable&&!completed&&!reserved&&!pending.length&&latestTurnId===t.turn_id,brief:typeof brief==='string'?brief.slice(0,12000):null,original_x_billing_unknown:true,original_pending_preserved:true};
  }catch{return {status:'unreadable_trace',eligible:false};}
 };
 const turns=(s?.turns??[]).slice(-80).map(t=>{const full=path.join(pend,t.turn_id+'.json');let detail=null;try{if(fs.existsSync(full))detail=readJSON(full);}catch{}const creativeDesigns={};for(const variant of ['b_only','bx']){const d=readPlan('creative-designs',t.turn_id+'-'+variant);if(d?.activity){const nonce=crypto.randomBytes(16).toString('hex');try{creativeDesigns[variant]={variant,title:d.title,brief:d.brief,activity_sha256:d.activity_sha256,estimated_usd:d.estimated_usd,model_calls:d.model_calls,evidence_notes:d.activity.evidence_notes,limitations:d.activity.limitations,frame_nonce:nonce,frame_url:`/creative-frame?session=${encodeURIComponent(session)}&turn=${encodeURIComponent(t.turn_id)}&variant=${variant}&nonce=${nonce}`};}catch(e){creativeDesigns[variant]={variant,title:d.title,error:'Activity transport invalid; do not execute: '+String(e.message)}}}}return {...t,creative_recovery:creativeRecovery(t),creative_designs:creativeDesigns,experience_design:readPlan('experience-designs',t.turn_id)?.plan??null,experience_design_sha256:readPlan('experience-designs',t.turn_id)?.plan_sha256??null,revision_plans:allFeedback.filter(f=>f.turn_id===t.turn_id).map(f=>readPlan('revision-plans',f.feedback_id)).filter(Boolean).map(r=>({feedback_id:r.feedback_id,plan:r.plan,estimated_usd:r.estimated_usd})),probe_attempts:probeAttempts.filter(a=>a.turn_id===t.turn_id),active_sha256:activeSha(t),feedback:allFeedback.filter(f=>f.turn_id===t.turn_id),targeted_retries:allRetries.filter(r=>r.turn_id===t.turn_id).map(r=>({retry_id:r.retry_id,feedback_id:r.feedback_id,affected_beats:r.changes?.affected_beat_ids,estimated_usd:r.total_estimated_usd})),route:detail?.route??null,A:detail?.A?{output:detail.A.output,retrieval_summary:detail.A.retrieval_summary,root_similarity_candidates:detail.A.root_similarity_candidates,changes:detail.A.changes,validation:detail.A.validation}:null,estimated_usd:detail?.total_estimated_usd??null,x_coverage_report:detail?.X?.coverage_report??null,model_calls:(detail?.calls??[]).map(c=>({role:c.role,model:c.model,estimated_usd:c.estimated_usd??null,usage:c.usage??null})),completed_at:detail?.completed_at??null};});
 return {probe_attempt_count:probeAttempts.length,probe_scene_count:s?.scene_contracts?.length??0,root_memory:s?rootSummary(s):{records:[],backfill_history:[],provisional_record_count:0},root_backfill_pending:fs.existsSync(path.join(dir,'root-backfill','bf0001.pending.json')),session_id:session,exists:!!s,turn_count:s?.turns?.length??0,topic_count:s?.topics?.length??0,topics:s?.topics??[],observation_count:s?.observations?.length??0,memory_record_count:s?.records?.length??0,history:turns,pending_turns:pending,blocked_pending:pendingExists(dir),local_only:true};
}
/** Sanitized, read-only view of the on-disk paid-turn checkpoint.
 * This does NOT expose the provider's hidden reasoning, prompts, outputs or learner messages.
 * A role is completed only after the runner recorded its provider return.
 */
export function describeTurnProgress(trace){
 const statuses={ROUTE:trace?.input_kind==='submitted_probe_attempt'?'done':'queued',A:'queued',B:'queued',X:'queued'};
 if(!trace || !Array.isArray(trace.calls)) return {phase:'preparing',roles:statuses,stage_label:'Preparing the turn'};
 for(const role of ['ROUTE','A','B','X']){
   const calls=trace.calls.filter(c=>c&&c.role===role);
   if(!calls.length)continue;
   statuses[role]=calls.every(c=>c.status==='returned')?'done':'running';
 }
 const state=String(trace.status??'');
 if(state.startsWith('manual_review_required_'))return {phase:'review',roles:statuses,stage_label:'The turn stopped; review the saved trace before retrying'};
 if(state==='complete')return {phase:'finalizing',roles:statuses,stage_label:'Saving the learning turn'};
 const active=['X','B','A','ROUTE'].find(role=>statuses[role]==='running');
 if(active)return {phase:active,roles:statuses,stage_label:({ROUTE:'Identifying the topic',A:'Assessing available learner evidence',B:'Preparing a teaching response',X:'Designing aligned text scenes'})[active]};
 if(statuses.ROUTE==='done'&&statuses.A==='queued')return {phase:'retrieving',roles:statuses,stage_label:'Retrieving relevant history with local MiniLM'};
 if(statuses.A==='done'&&statuses.B==='queued')return {phase:'assessing',roles:statuses,stage_label:'Finishing evidence assessment'};
 if(statuses.B==='done'&&statuses.X==='queued')return {phase:'storyboard',roles:statuses,stage_label:'Preparing the scene request'};
 return {phase:'preparing',roles:statuses,stage_label:'Preparing the turn'};
}

function listSessions(){if(!fs.existsSync(OUTPUT))return [];const result=[];for(const d of fs.readdirSync(OUTPUT,{withFileTypes:true})){if(!d.isDirectory()||!validId(d.name))continue;try{const s=getSession(d.name);if(s.exists||s.blocked_pending)result.push({session_id:d.name,turn_count:s.turn_count,pending:s.pending_turns.length});}catch{}}return result.sort((a,b)=>b.turn_count-a.turn_count).slice(0,100);}
function readBody(req,max=16000){return new Promise((resolve,reject)=>{let buf='',size=0,done=false;req.on('data',x=>{if(done)return;size+=x.length;if(size>max){done=true;reject(bad('Request too large',413));req.destroy();return;}buf+=x.toString('utf8');});req.on('end',()=>{if(done)return;try{const x=JSON.parse(buf);if(!x||typeof x!=='object'||Array.isArray(x))throw Error('object required');resolve(x);}catch{reject(bad('Invalid JSON request'));}});req.on('error',reject);});}
function runCLI(args,{maxOutput=1_250_000,runner=RUNNER}={}){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[runner,...args],{cwd:ROOT,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='',bytes=0,tooBig=false;const capture=(key,v)=>{bytes+=v.length;if(bytes>maxOutput){tooBig=true;child.kill();return;}if(key==='out')out+=v.toString('utf8');else err+=v.toString('utf8');};child.stdout.on('data',x=>capture('out',x));child.stderr.on('data',x=>capture('err',x));child.on('error',reject);child.on('close',code=>{if(tooBig)return reject(bad('Runner output exceeded safety limit. Inspect files before retry.',500));if(code!==0)return reject(bad('GoldLoop returned an error; do not automatically retry any paid turn. '+err.slice(0,1300),500));try{resolve(JSON.parse(out));}catch{return reject(bad('GoldLoop returned non-JSON output. Inspect the turn files before retry.',500));}});});}

/** In-memory ZIP writer using the standard ZIP deflate method and CRC32.
 * No dependency installs, temporary files, network access or model calls.
 */
const ZIP_CRC_TABLE=Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(buf){let c=0xFFFFFFFF;for(const b of buf)c=ZIP_CRC_TABLE[(c^b)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
export function makeZip(files){
 const local=[],central=[];let offset=0;
 for(const [name,data] of files){
  if(!/^[A-Za-z0-9_./-]+$/.test(name)||name.includes('..')||name.startsWith('/'))throw bad('Invalid export entry name',500);
  const fn=Buffer.from(name,'utf8'),input=Buffer.isBuffer(data)?data:Buffer.from(data),packed=zlib.deflateRawSync(input,{level:6}),checksum=crc32(input);
  const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);l.writeUInt16LE(0x800,6);l.writeUInt16LE(8,8);l.writeUInt32LE(checksum,14);l.writeUInt32LE(packed.length,18);l.writeUInt32LE(input.length,22);l.writeUInt16LE(fn.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt32LE(checksum,16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(input.length,24);c.writeUInt16LE(fn.length,28);c.writeUInt32LE(offset,42);
  local.push(l,fn,packed);central.push(c,fn);offset+=l.length+fn.length+packed.length;
 }
 if(files.length>65535)throw bad('Too many files in export',413);
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,cd,end]);
}
function exportSession(session){
 const dir=getSessionDir(session),statePath=path.join(dir,'state.json'),turnPath=path.join(dir,'turns'),inputPath=path.join(dir,'inputs');
 const exists=fs.existsSync(statePath),turnFiles=fs.existsSync(turnPath)?fs.readdirSync(turnPath).filter(n=>/^t[0-9]{3,}\.(?:json|pending\.json)$/.test(n)).sort():[];
 if(!exists&&!turnFiles.length)throw bad('No completed or pending turns to export for this session',404);
 if(exists){const s=readJSON(statePath);if(s.schema!=='myway_goldloop_human_v1'||s.learner!==session)throw bad('Unrecognized state format; nothing exported',409);}
 const entries=[],meta=[];let size=0;const MAX_EXPORT_BYTES=50*1024*1024;
 function add(name,file){const st=fs.lstatSync(file);if(!st.isFile())throw bad('Unexpected non-regular export file',409);size+=st.size;if(size>MAX_EXPORT_BYTES)throw bad('Session export exceeds 50 MiB; inspect local files before sharing',413);
  const data=fs.readFileSync(file);entries.push([name,data]);meta.push({name,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});}
 if(exists)add('session/state.json',statePath);
 for(const n of turnFiles)add('session/turns/'+n,path.join(turnPath,n));
 if(fs.existsSync(inputPath))for(const n of fs.readdirSync(inputPath).filter(x=>/^t[0-9]{3,}\.txt$/.test(x)).sort())add('session/inputs/'+n,path.join(inputPath,n));
 for(const [folder,regex] of [['feedback',/^fb[0-9]{4,}\.json$/],['retries',/^r[0-9]{4,}\.(?:json|pending\.json)$/],['root-backfill',/^bf[0-9]{4,}\.(?:json|pending\.json)$/],['probe-attempts',/^pa[0-9]{4,}\.json$/],['probe-continuations',/^pa[0-9]{4,}\.json$/],['experience-designs',/^t[0-9]{4,}\.(?:json|pending\.json)$/],['revision-plans',/^fb[0-9]{4,}\.(?:json|pending\.json)$/],['creative-designs',/^t[0-9]{4,}-(?:b_only|bx)(?:\.recovery01)?\.(?:json|pending\.json)$/]]){const folderPath=path.join(dir,folder);if(fs.existsSync(folderPath))for(const n of fs.readdirSync(folderPath).filter(n=>regex.test(n)).sort())add('session/'+folder+'/'+n,path.join(folderPath,n));}
 const complete=turnFiles.filter(n=>/\.json$/.test(n)&&!/pending/.test(n)).length;
 const pending=turnFiles.filter(n=>n.endsWith('.pending.json')).length;
 const manifest={export_schema:'myway_goldloop_session_export_v6_with_coverage_metadata',session_id:session,exported_at:new Date().toISOString(),source:'R4.7 X coverage and independent scroll on R4.6 probe lab and R4.5 root memory and R4.4 highlighted feedback; raw on-disk session and trace records',complete_turn_traces:complete,pending_turn_traces:pending,real_embeddings:'Traces identify selected historical evidence; saved session state may include embedding vectors. This export itself does NOT run embeddings.',limitations:['Gold standard simulations are not automatically imported','Structural validation is not educational quality','Model X directions are textual, not rendered visuals','R4.6 probe browser controls are placeholders; attempts not automatically graded'],privacy:'RAW learner messages, model prompts/responses and evidence may contain personal or confidential content. Review the ZIP before sharing. No .env files, access cookie/token, application credentials, or other sessions are included.',files:meta};
 entries.unshift(['MANIFEST.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n')]);
 return {zip:makeZip(entries),manifest};
}
export function makeServer({port=8877,token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex'),verifyBranch=true}={}){
 // Test injection changes only module-internal defaults. CLI invocation has no bypass knobs.
 let busy=false,activeTurn=null;const accessToken=token;
 const srv=http.createServer(async(req,res)=>{
  try{
   const hostname=req.headers.host??'';if(!/^127\.0\.0\.1(?::\d+)?$/.test(hostname))throw bad('Localhost only',403);
   const url=new URL(req.url,'http://127.0.0.1:'+port);const p=url.pathname;
   res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
   if(p==='/'&&req.method==='GET'&&url.searchParams.has('access')){
     if(url.searchParams.get('access')!==accessToken)throw bad('Invalid access link',403);
     res.writeHead(302,{'Location':'/','Set-Cookie':`myway_goldloop_lab=${accessToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`});res.end();return;
   }
   if(cookieValue(req.headers)!==accessToken)throw bad('Open the exact access URL shown in the terminal.',401);
   if(req.headers['sec-fetch-site']&& !['same-origin','none'].includes(req.headers['sec-fetch-site']))throw bad('Cross-site requests are blocked',403);
   if(req.method==='POST'){
     if(req.headers.origin!==`http://127.0.0.1:${srv.address()?.port??port}`)throw bad('Cross-origin POST rejected',403);
     if(req.headers['x-myway-csrf']!==csrf)throw bad('CSRF check failed',403);
     if(req.headers['content-type']?.split(';')[0]!=='application/json')throw bad('JSON required',415);
   }
   if(p==='/creative-frame'&&req.method==='GET'){
     const id=url.searchParams.get('session'),turnId=url.searchParams.get('turn'),variant=url.searchParams.get('variant'),nonce=url.searchParams.get('nonce');
     if(!validId(id)||!/^t[0-9]{4,}$/.test(turnId??'')||!['bx','b_only'].includes(variant)||!/^[a-f0-9]{32}$/.test(nonce??''))throw bad('Invalid creative frame reference');
     const file=path.join(getSessionDir(id),'creative-designs',turnId+'-'+variant+'.json');if(!fs.existsSync(file))throw bad('Creative artifact missing',404);
     const trace=readJSON(file),a=trace.output;
     if(trace.status!=='complete'||a?.session_id!==id||a.turn_id!==turnId||a.variant!==variant||a?.activity_sha256!==crypto.createHash('sha256').update(JSON.stringify(a.activity)).digest('hex'))throw bad('Creative artifact not verified',409);
     const html=frameDocument(a.activity.html_fragment,nonce);
     res.removeHeader('X-Frame-Options');
     res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; worker-src 'none'; frame-ancestors 'self'"});res.end(html);return;
   }
   if(p==='/api/status'&&req.method==='GET')return safeJSON(res,200,{status:'ready',isolated:true,storage:'local ignored files only',real_embeddings_required:true,model_spend_requires_each_turn_approval:true,csrf,default_session:fs.existsSync(path.join(OUTPUT,'goldpilot01_clean04','state.json'))?'goldpilot01_clean04':fs.existsSync(path.join(OUTPUT,'goldpilot01_clean03','state.json'))?'goldpilot01_clean03':fs.existsSync(path.join(OUTPUT,'goldpilot01_clean02','state.json'))?'goldpilot01_clean02':'goldpilot01_clean01',existing_sessions:listSessions(),models:[...MODELS],visuals:'original storyboard plus isolated executable creative research iframe (R54)',pending_policy:'manual review; never auto retry',port:srv.address()?.port??port});
   if(p==='/api/turn-progress'&&req.method==='GET'){
     const id=url.searchParams.get('id');
     if(!validId(id))throw bad('Invalid session ID');
     if(!activeTurn || activeTurn.session!==id){
       return safeJSON(res,200,{active:false,phase:'idle',roles:{ROUTE:'queued',A:'queued',B:'queued',X:'queued'},no_model_content:true});
     }
     const pendingFile=path.join(getSessionDir(id),'turns',activeTurn.turnId+'.pending.json');
     const doneFile=path.join(getSessionDir(id),'turns',activeTurn.turnId+'.json');
     let trace=null;
     try{
       if(fs.existsSync(pendingFile))trace=readJSON(pendingFile);
       else if(fs.existsSync(doneFile))trace=readJSON(doneFile);
     }catch{
       // A concurrent trace write can temporarily be unreadable. Report only a neutral state.
     }
     return safeJSON(res,200,{active:true,turn_id:activeTurn.turnId,...describeTurnProgress(trace),no_model_content:true});
   }
   if(p==='/api/session'&&req.method==='GET'){const id=url.searchParams.get('id');return safeJSON(res,200,getSession(id));}
   if(p==='/api/export'&&req.method==='GET'){
     const id=url.searchParams.get('id');const {zip}=exportSession(id);
     res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':`attachment; filename=\"MyWay_GoldLoop_${id}_Export.zip\"`,'Content-Length':zip.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
     res.end(zip);return;
   }

   if(p==='/api/roots'&&req.method==='GET'){
     const id=url.searchParams.get('id'),st=loadState(id);
     return safeJSON(res,200,{preview:backfillPreview(st.state,path.join(st.dir,'turns')),root_memory:rootSummary(st.state),no_model_calls:true});
   }
   if(p==='/api/root-match'&&req.method==='POST'){
     if(busy)throw bad('Another operation is running',409);
     const b=await readBody(req,6000);if(!validId(b.session_id)||typeof b.query!=='string'||!b.query.trim()||b.query.length>1500)throw bad('Valid session and root query required');
     const st=loadState(b.session_id);busy=true;
     try{const candidate=await rankCandidateRoots(clone(st.state),{topic_id:b.topic_id??'unassigned',text:b.query});return safeJSON(res,200,{...candidate,session_id:b.session_id,model_calls:0,state_writes:0});}finally{busy=false;}
   }
   if(p==='/api/root-backfill'&&req.method==='POST'){
     if(busy)throw bad('Another operation is running',409);
     if(verifyBranch&&!branchOK(ROOT))throw bad('Wrong Git branch; refusing paid call',403);
     const b=await readBody(req,6000),budget=Number(b.budget_usd);
     if(!validId(b.session_id)||!MODELS.has(b.model_a)||b.allow_spend!==true||!Number.isFinite(budget)||budget<=0||budget>10)throw bad('Backfill requires a valid session, Model A, explicit approval and budget');
     const st=getSession(b.session_id);if(st.blocked_pending)throw bad('Incomplete paid operation requires manual review',409);if(!st.turn_count)throw bad('No completed learning turns to backfill',409);
     busy=true;try{const result=await runCLI(['--mode','model','--session-id',b.session_id,'--model-a',b.model_a,'--budget-usd',String(budget),'--allow-spend'],{runner:BACKFILL_RUNNER});return safeJSON(res,200,{result,session:getSession(b.session_id)});}finally{busy=false;}
   }

   if(p==='/api/probe-attempt'&&req.method==='POST'){
     if(busy)throw bad('Another session operation is running',409);
     if(verifyBranch&&!branchOK(ROOT))throw bad('Wrong Git branch; refusing local state write',403);
     const body=await readBody(req,75000);
     if(!validId(body.session_id)||!/^t[0-9]{4,}$/.test(body.turn_id??''))throw bad('Invalid probe session or turn');
     if(getSession(body.session_id).blocked_pending)throw bad('Incomplete paid operation requires manual review before probe attempt',409);
     busy=true;
     try{const result=commitProbeAttempt(body);return safeJSON(res,200,{result,session:getSession(body.session_id)});}
     finally{busy=false;}
   }
   if(p==='/api/probe-continue'&&req.method==='POST'){
     if(busy)throw bad('Another task is running; nothing charged by this request',409);
     if(verifyBranch&&!branchOK(ROOT))throw bad('Wrong Git branch; refusing paid probe continuation',403);
     const b=await readBody(req,7000),budget=Number(b.budget_usd);
     const session=b.session_id,attemptId=b.attempt_id,modelA=b.model_a??'gpt-4.1-mini',modelB=b.model_b??'gpt-4.1-mini',modelX=b.model_x??'gpt-4.1-mini';
     if(!validId(session)||!ATTEMPT_RE.test(attemptId??'')||b.allow_spend!==true||!Number.isFinite(budget)||budget<=0||budget>10||![modelA,modelB,modelX].every(m=>MODELS.has(m)))throw bad('Probe continuation requires saved attempt, models and explicit per-turn paid authorization',400);
     const sessionSummary=getSession(session);
     if(!sessionSummary.exists||sessionSummary.blocked_pending)throw bad('Missing session or pending paid operation; inspect before continuing',409);
     const dir=getSessionDir(session),source=readJSON(path.join(dir,'state.json'));
     const info=probeContinuationContext(source,attemptId);
     if(fs.existsSync(path.join(dir,'probe-continuations',attemptId+'.json')))throw bad('This attempt was already reserved for continuation; no automatic retry',409);
     const turnId=allocateNextTurnId(dir),eventFile=path.join(dir,'inputs',turnId+'.txt');
     busy=true;activeTurn={session,turnId};
     try{
       fs.writeFileSync(eventFile,info.marker,{flag:'wx',mode:0o600});
       const args=['--mode','probe-continue','--session-id',session,'--turn-id',turnId,'--attempt-id',attemptId,'--message-file',eventFile,'--model-a',modelA,'--model-b',modelB,'--model-x',modelX,'--budget-usd',String(budget),'--allow-spend'];
       const result=await runCLI(args);
       return safeJSON(res,200,{result,session:getSession(session)});
     }finally{activeTurn=null;busy=false;}
   }
   if(p==='/api/creative-design'&&req.method==='POST'){
     if(busy)throw bad('Another task is running; nothing charged',409);
     if(verifyBranch&&!branchOK(ROOT))throw bad('Wrong protected Git branch',403);
     const b=await readBody(req,8000),budget=Number(b.budget_usd);
     const variant=b.variant,mb=b.model_b??'gpt-4.1-mini',mx=b.model_x??'gpt-4.1-mini';
     const min=m=>m==='gpt-4.1'?0.29:0.055;
     if(!validId(b.session_id)||!/^t[0-9]{4,}$/.test(b.turn_id??'')||!['b_only','bx'].includes(variant)||!MODELS.has(mb)||!MODELS.has(mx)||b.allow_spend!==true||!Number.isFinite(budget)||budget<(variant==='bx'?min(mb)+min(mx):min(mb))||budget>10||typeof (b.focus??'')!=='string'||(b.focus??'').length>600)throw bad('Creative experiment requires latest turn, variant, models, explicit paid approval and adequate budget');
     const st=getSession(b.session_id);
     if(!st.exists||st.blocked_pending||st.history.at(-1)?.turn_id!==b.turn_id)throw bad('Missing/stale session or pending paid operation',409);
     busy=true;
     try{const args=['--mode','model','--session-id',b.session_id,'--turn-id',b.turn_id,'--variant',variant,'--model-b',mb,'--model-x',mx,'--budget-usd',String(budget),'--focus',b.focus??'','--allow-spend'];const result=await runCLI(args,{runner:CREATIVE_RUNNER,maxOutput:1_800_000});return safeJSON(res,200,{result,session:getSession(b.session_id)});}finally{busy=false;}
   }
   if(p==='/api/creative-x-recover'&&req.method==='POST'){
     if(busy)throw bad('Another task is running; nothing charged',409);
     if(verifyBranch&&!branchOK(ROOT))throw bad('Wrong protected Git branch',403);
     const b=await readBody(req,5000),budget=Number(b.budget_usd),model=b.model_x??'gpt-4.1-mini';
     if(!validId(b.session_id)||!/^t[0-9]{4,}$/.test(b.turn_id??'')||!MODELS.has(model)||b.allow_spend!==true||b.approval_phrase!=='NEW_X_CALL_OLD_X_BILLING_UNKNOWN'||!Number.isFinite(budget)||budget<(model==='gpt-4.1'?0.29:0.055)||budget>10)throw bad('Recovery requires explicit new-X-call approval, acknowledgement of unknown old X billing, and sufficient budget');
     const st=getSession(b.session_id),latest=st.history.at(-1);
     if(!st.exists||st.blocked_pending||latest?.turn_id!==b.turn_id||latest.creative_recovery?.eligible!==true)throw bad('Saved B plan not eligible for new X-only call, or a recovery has already been reserved',409);
     busy=true;
     try{const args=['--mode','model','--session-id',b.session_id,'--turn-id',b.turn_id,'--model-x',model,'--budget-usd',String(budget),'--allow-spend'];const result=await runCLI(args,{runner:X_RECOVERY_RUNNER,maxOutput:1_800_000});return safeJSON(res,200,{result,session:getSession(b.session_id)});}finally{busy=false;}
   }
   if(p==='/api/creative-attempt'&&req.method==='POST'){
     if(busy)throw bad('Another operation is running',409);
     if(verifyBranch&&!branchOK(ROOT))throw bad('Wrong protected Git branch',403);
     const b=await readBody(req,130000);
     if(!validId(b.session_id)||!/^t[0-9]{4,}$/.test(b.turn_id??'')||!['b_only','bx'].includes(b.variant))throw bad('Invalid creative attempt session/turn/variant');
     const st=getSession(b.session_id);if(st.blocked_pending)throw bad('Pending operation needs manual review',409);
     busy=true;try{let result;try{result=commitCreativeAttempt(b);}catch(e){if(String(e.message??'').startsWith('R54 creative store: '))throw bad(e.message,400);throw e;}return safeJSON(res,200,{result,session:getSession(b.session_id)});}finally{busy=false;}
   }
   if(p==='/api/experience-attempt'&&req.method==='POST'){
     if(busy)throw bad('Another operation is running',409);
     if(verifyBranch&&!branchOK(ROOT))throw bad('Wrong Git branch',403);
     const b=await readBody(req,24000);
     if(!validId(b.session_id)||!/^t[0-9]{4,}$/.test(b.turn_id??''))throw bad('Invalid session or source turn');
     if(getSession(b.session_id).blocked_pending)throw bad('Incomplete paid operation needs manual review',409);
     busy=true;try{const result=commitExperienceAttempt(b);return safeJSON(res,200,{result,session:getSession(b.session_id)});}finally{busy=false;}
   }
   if(p==='/api/experience-plan'&&req.method==='POST'){
     if(busy)throw bad('Another operation is running; nothing charged',409);
     if(verifyBranch&&!branchOK(ROOT))throw bad('Wrong Git branch',403);
     const b=await readBody(req,8000),budget=Number(b.budget_usd);
     if(!validId(b.session_id)||!/^t[0-9]{4,}$/.test(b.turn_id??'')||b.allow_spend!==true||!MODELS.has(b.model_x)||!(budget>=0.055&&budget<=10))throw bad('Explicitly approve one X interaction-design call and valid budget');
     if(getSession(b.session_id).blocked_pending)throw bad('Pending paid operation needs manual review',409);
     busy=true;try{const result=await runCLI(['--mode','model','--kind','x','--session-id',b.session_id,'--turn-id',b.turn_id,'--model',b.model_x,'--budget-usd',String(budget),'--allow-spend'],{runner:R53_PLAN_RUNNER});return safeJSON(res,200,{result,session:getSession(b.session_id)});}finally{busy=false;}
   }
   if(p==='/api/revision-plan'&&req.method==='POST'){
     if(busy)throw bad('Another operation is running; nothing charged',409);
     if(verifyBranch&&!branchOK(ROOT))throw bad('Wrong Git branch',403);
     const b=await readBody(req,8000),budget=Number(b.budget_usd);
     if(!validId(b.session_id)||!/^t[0-9]{4,}$/.test(b.turn_id??'')||!/^fb[0-9]{4,}$/.test(b.feedback_id??'')||b.allow_spend!==true||!MODELS.has(b.model_c)||!(budget>=0.055&&budget<=10))throw bad('Explicitly approve one Model C research call with a valid budget');
     if(getSession(b.session_id).blocked_pending)throw bad('Pending paid operation needs manual review',409);
     busy=true;try{const result=await runCLI(['--mode','model','--kind','c','--session-id',b.session_id,'--turn-id',b.turn_id,'--feedback-id',b.feedback_id,'--model',b.model_c,'--budget-usd',String(budget),'--allow-spend'],{runner:R53_PLAN_RUNNER});return safeJSON(res,200,{result,session:getSession(b.session_id)});}finally{busy=false;}
   }
   if(p==='/api/feedback'&&req.method==='POST'){
     if(busy)throw bad('Another session operation is running',409);
     if(verifyBranch&&!branchOK(ROOT))throw bad('Wrong Git branch',403);
     const b=await readBody(req,16000);
     if(!validId(b.session_id)||!/^t[0-9]{3,}$/.test(b.turn_id??'')||typeof b.base_sha256!=='string'||!Array.isArray(b.selections))throw bad('Invalid feedback request');
     busy=true;try{const record=saveFeedback(b.session_id,b.turn_id,b.base_sha256,b.selections);return safeJSON(res,200,{status:'saved',feedback_id:record.feedback_id,added_evidence_ids:record.added_evidence_ids,session:getSession(b.session_id)});}finally{busy=false;}
   }
   if(p==='/api/c-guided-retry'&&req.method==='POST'){
     if(busy)throw bad('Another operation is running; nothing charged',409);
     if(verifyBranch&&!branchOK(ROOT))throw bad('Wrong Git branch; refusing C-guided paid revision',403);
     const b=await readBody(req,8000),budget=Number(b.budget_usd);
     if(!validId(b.session_id)||!/^fb[0-9]{4,}$/.test(b.feedback_id??'')||!['selected','all'].includes(b.scope)||b.allow_spend!==true||!Number.isFinite(budget)||budget<=0||budget>10||![b.model_b,b.model_x].every(m=>MODELS.has(m)))throw bad('C-guided revision requires saved C proposal, scope, supported B/X models and explicit spending approval');
     if(getSession(b.session_id).blocked_pending)throw bad('An incomplete paid turn/retry must be reviewed before proceeding',409);
     busy=true;try{const result=await runCLI(['--mode','retry','--session-id',b.session_id,'--feedback-id',b.feedback_id,'--scope',b.scope,'--model-b',b.model_b,'--model-x',b.model_x,'--budget-usd',String(budget),'--allow-spend'],{runner:C_GUIDED_RETRY_RUNNER});return safeJSON(res,200,{result,session:getSession(b.session_id)});}finally{busy=false;}
   }
   if(p==='/api/retry'&&req.method==='POST'){
     if(busy)throw bad('Another task is running; no charge',409);
     if(verifyBranch&&!branchOK(ROOT))throw bad('Wrong Git branch; refusing paid calls',403);
     const b=await readBody(req);const budget=Number(b.budget_usd);
     if(!validId(b.session_id)||!/^fb[0-9]{4,}$/.test(b.feedback_id??'')||b.allow_spend!==true||!Number.isFinite(budget)||budget<=0||budget>10||![b.model_b,b.model_x].every(m=>MODELS.has(m)))throw bad('Retry requires session, saved feedback, supported models and explicit per-retry paid approval');
     if(getSession(b.session_id).blocked_pending)throw bad('An incomplete paid turn/retry must be reviewed before proceeding',409);
     busy=true;try{const result=await runCLI(['--mode','retry','--session-id',b.session_id,'--feedback-id',b.feedback_id,'--model-b',b.model_b,'--model-x',b.model_x,'--budget-usd',String(budget),'--allow-spend'],{runner:RETRY_RUNNER});return safeJSON(res,200,{result,session:getSession(b.session_id)});}finally{busy=false;}
   }
   if(p==='/api/preflight'&&req.method==='POST'){
     if(busy)throw bad('A model or embedding check is already running',409);busy=true;try{const result=await runCLI(['--mode','preflight']);return safeJSON(res,200,result);}finally{busy=false;}
   }
   if(p==='/api/retrieval-check'&&req.method==='POST'){
     if(busy)throw bad('Another task is running',409);const body=await readBody(req);const session=body.session_id,query=body.query;
     if(!validId(session)||typeof query!=='string'||query.trim().length<1||query.length>4000)throw bad('Valid session and query required');
     if(!getSession(session).exists)throw bad('Session has no completed turns yet',409);
     const tmp=path.join(os.tmpdir(),`myway-goldloop-ui-${crypto.randomBytes(16).toString('hex')}.txt`);busy=true;
     try{fs.writeFileSync(tmp,query,{mode:0o600,flag:'wx'});const result=await runCLI(['--mode','retrieval-check','--session-id',session,'--turn-id','retrieval_audit','--message-file',tmp]);return safeJSON(res,200,result);}finally{busy=false;try{fs.unlinkSync(tmp);}catch{}}
   }
   if(p==='/api/turn'&&req.method==='POST'){
     if(busy)throw bad('A turn is already running. Nothing was charged by this request.',409);
     if(verifyBranch&&!branchOK(ROOT))throw bad('Wrong git branch; refusing model calls',403);
     const b=await readBody(req);const session=b.session_id,msg=b.message,allow=b.allow_spend,budget=Number(b.budget_usd),modelA=b.model_a??'gpt-4.1-mini',modelB=b.model_b??'gpt-4.1-mini',modelX=b.model_x??'gpt-4.1-mini';
     if(!validId(session)||typeof msg!=='string'||!msg.trim()||msg.length>4000||allow!==true||!Number.isFinite(budget)||budget<=0||budget>10||![modelA,modelB,modelX].every(m=>MODELS.has(m)))throw bad('Invalid session/message/models or missing explicit per-turn paid approval (budget 0..10 USD)');
     const state=getSession(session);if(state.blocked_pending)throw bad('Session has an incomplete paid turn. Inspect the pending trace manually before continuing.',409);
     const dir=getSessionDir(session);const turnId=allocateNextTurnId(dir);const msgPath=path.join(dir,'inputs',turnId+'.txt');
     // Server-level lock prevents double-click paid requests. Runner also reserves a no-retry pending marker.
     busy=true;activeTurn={session,turnId};try{fs.writeFileSync(msgPath,msg.trim(),{mode:0o600,flag:'wx'});const args=['--mode','model','--session-id',session,'--turn-id',turnId,'--message-file',msgPath,'--model-a',modelA,'--model-b',modelB,'--model-x',modelX,'--budget-usd',String(budget),'--allow-spend'];const result=await runCLI(args);return safeJSON(res,200,{result,session:getSession(session)});}finally{activeTurn=null;busy=false;}
   }
   if(req.method==='GET'&&Object.hasOwn(WEBFILES,p)){
     const filepath=path.join(HERE,WEBFILES[p]);const data=fs.readFileSync(filepath);const ext=path.extname(filepath);
     res.writeHead(200,{'Content-Type':CONTENT_TYPES[ext]??'application/octet-stream','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});res.end(data);return;
   }
   throw bad('Not found',404);
  }catch(e){if(!res.headersSent)safeJSON(res,e.httpStatus??500,{error:String(e.message??e)});else res.end();}
 });srv.requestTimeout=300000;srv.headersTimeout=20000;return {server:srv,accessToken,csrf};
}
const THIS=path.resolve(fileURLToPath(import.meta.url));
if(process.argv[1]&&path.resolve(process.argv[1])===THIS){
 const arg=process.argv.slice(2);let port=8877;if(arg.length){if(arg.length!==2||arg[0]!=='--port'||!/^[0-9]{4,5}$/.test(arg[1]))throw bad('Usage: node ...goldloop-web.mjs [--port 8877]');port=Number(arg[1]);if(port<1024||port>65535)throw bad('Invalid port');}
 if(!branchOK())throw Error('Wrong Git branch. Start from isolated myway/learning-sandbox-v3_7a worktree.');
 if(!fs.existsSync(RUNNER)||!fs.existsSync(BACKFILL_RUNNER))throw Error('R5.3 runner not found; install the complete research-experience patch.');
 const {server,accessToken}=makeServer({port});server.listen(port,'127.0.0.1',()=>{console.log('\nMYWAY GOLDLOOP LOCAL SANDBOX (R5.4R CREATIVE PROBE RECOVERY RESEARCH)\n');console.log('Open in your browser: http://127.0.0.1:'+port+'/?access='+accessToken);console.log('\nOnly accessible on this computer (127.0.0.1). No model call until you explicitly approve each paid turn.');console.log('Press Ctrl+C to stop the sandbox.\n');});server.on('error',e=>{console.error('Could not bind local UI:',e.message);process.exitCode=1;});
}
