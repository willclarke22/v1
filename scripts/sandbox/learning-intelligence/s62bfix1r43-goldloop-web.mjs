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
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../..');
const OUTPUT=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
const RUNNER=path.join(HERE,'s62bfix1r43-goldloop-run.mjs');
const WEBFILES={ '/':'s62bfix1r43-goldloop-web.html', '/style.css':'s62bfix1r43-goldloop-web.css', '/client.js':'s62bfix1r43-goldloop-client.js'};
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
function getSession(session){const dir=getSessionDir(session),p=path.join(dir,'state.json');const s=fs.existsSync(p)?readJSON(p):null;const pend=path.join(dir,'turns');const pending=fs.existsSync(pend)?fs.readdirSync(pend).filter(x=>x.endsWith('.pending.json')):[];
 if(s&&(s.schema!=='myway_goldloop_human_v1'||s.learner!==session))throw bad('Unrecognized state format; no writes performed',409);
 const turns=(s?.turns??[]).slice(-80).map(t=>{const full=path.join(pend,t.turn_id+'.json');let detail=null;try{if(fs.existsSync(full))detail=readJSON(full);}catch{}return {...t,route:detail?.route??null,A:detail?.A?{output:detail.A.output,retrieval_summary:detail.A.retrieval_summary,changes:detail.A.changes,validation:detail.A.validation}:null,estimated_usd:detail?.total_estimated_usd??null,model_calls:(detail?.calls??[]).map(c=>({role:c.role,model:c.model,estimated_usd:c.estimated_usd??null,usage:c.usage??null})),completed_at:detail?.completed_at??null};});
 return {session_id:session,exists:!!s,turn_count:s?.turns?.length??0,topic_count:s?.topics?.length??0,topics:s?.topics??[],observation_count:s?.observations?.length??0,memory_record_count:s?.records?.length??0,history:turns,pending_turns:pending,blocked_pending:pending.length>0,local_only:true};
}
function listSessions(){if(!fs.existsSync(OUTPUT))return [];const result=[];for(const d of fs.readdirSync(OUTPUT,{withFileTypes:true})){if(!d.isDirectory()||!validId(d.name))continue;try{const s=getSession(d.name);if(s.exists||s.blocked_pending)result.push({session_id:d.name,turn_count:s.turn_count,pending:s.pending_turns.length});}catch{}}return result.sort((a,b)=>b.turn_count-a.turn_count).slice(0,100);}
function readBody(req,max=16000){return new Promise((resolve,reject)=>{let buf='',size=0,done=false;req.on('data',x=>{if(done)return;size+=x.length;if(size>max){done=true;reject(bad('Request too large',413));req.destroy();return;}buf+=x.toString('utf8');});req.on('end',()=>{if(done)return;try{const x=JSON.parse(buf);if(!x||typeof x!=='object'||Array.isArray(x))throw Error('object required');resolve(x);}catch{reject(bad('Invalid JSON request'));}});req.on('error',reject);});}
function runCLI(args,{maxOutput=1_250_000}={}){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[RUNNER,...args],{cwd:ROOT,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='',bytes=0,tooBig=false;const capture=(key,v)=>{bytes+=v.length;if(bytes>maxOutput){tooBig=true;child.kill();return;}if(key==='out')out+=v.toString('utf8');else err+=v.toString('utf8');};child.stdout.on('data',x=>capture('out',x));child.stderr.on('data',x=>capture('err',x));child.on('error',reject);child.on('close',code=>{if(tooBig)return reject(bad('Runner output exceeded safety limit. Inspect files before retry.',500));if(code!==0)return reject(bad('GoldLoop returned an error; do not automatically retry any paid turn. '+err.slice(0,1300),500));try{resolve(JSON.parse(out));}catch{return reject(bad('GoldLoop returned non-JSON output. Inspect the turn files before retry.',500));}});});}
export function makeServer({port=8877,token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex'),verifyBranch=true}={}){
 // Test injection changes only module-internal defaults. CLI invocation has no bypass knobs.
 let busy=false;const accessToken=token;
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
   if(p==='/api/status'&&req.method==='GET')return safeJSON(res,200,{status:'ready',isolated:true,storage:'local ignored files only',real_embeddings_required:true,model_spend_requires_each_turn_approval:true,csrf,default_session:'goldpilot01',existing_sessions:listSessions(),models:[...MODELS],visuals:'text storyboard, not rendered scenes',pending_policy:'manual review; never auto retry',port:srv.address()?.port??port});
   if(p==='/api/session'&&req.method==='GET'){const id=url.searchParams.get('id');return safeJSON(res,200,getSession(id));}
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
     let i=1,turnId='';const dir=getSessionDir(session);const turnsDir=path.join(dir,'turns');const inputs=path.join(dir,'inputs');fs.mkdirSync(inputs,{recursive:true});
     // Reserve a unique message-file name; do not overwrite or silently retry any prior turn.
     for(;i<10000;i++){const candidate='t'+String(i).padStart(4,'0');if(!fs.existsSync(path.join(turnsDir,candidate+'.json'))&&!fs.existsSync(path.join(turnsDir,candidate+'.pending.json'))&&!fs.existsSync(path.join(inputs,candidate+'.txt'))){turnId=candidate;break;}}
     if(!turnId)throw bad('No available turn IDs',409);const msgPath=path.join(inputs,turnId+'.txt');
     // Server-level lock prevents double-click paid requests. Runner also reserves a no-retry pending marker.
     busy=true;try{fs.writeFileSync(msgPath,msg.trim(),{mode:0o600,flag:'wx'});const args=['--mode','model','--session-id',session,'--turn-id',turnId,'--message-file',msgPath,'--model-a',modelA,'--model-b',modelB,'--model-x',modelX,'--budget-usd',String(budget),'--allow-spend'];const result=await runCLI(args);return safeJSON(res,200,{result,session:getSession(session)});}finally{busy=false;}
   }
   if(req.method==='GET'&&Object.hasOwn(WEBFILES,p)){
     const filepath=path.join(HERE,WEBFILES[p]);const data=fs.readFileSync(filepath);const ext=path.extname(filepath);
     res.writeHead(200,{'Content-Type':CONTENT_TYPES[ext]??'application/octet-stream','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});res.end(data);return;
   }
   throw bad('Not found',404);
  }catch(e){if(!res.headersSent)safeJSON(res,e.httpStatus??500,{error:String(e.message??e)});else res.end();}
 });srv.requestTimeout=300000;srv.headersTimeout=20000;return {server:srv,accessToken,csrf};
}
const THIS=path.resolve(fileURLToPath(import.meta.url));
if(process.argv[1]&&path.resolve(process.argv[1])===THIS){
 const arg=process.argv.slice(2);let port=8877;if(arg.length){if(arg.length!==2||arg[0]!=='--port'||!/^[0-9]{4,5}$/.test(arg[1]))throw bad('Usage: node ...goldloop-web.mjs [--port 8877]');port=Number(arg[1]);if(port<1024||port>65535)throw bad('Invalid port');}
 if(!branchOK())throw Error('Wrong Git branch. Start from isolated myway/learning-sandbox-v3_7a worktree.');
 if(!fs.existsSync(RUNNER))throw Error('GoldLoop CLI runner not found; install R4.3 first.');
 const {server,accessToken}=makeServer({port});server.listen(port,'127.0.0.1',()=>{console.log('\nMYWAY GOLDLOOP LOCAL SANDBOX\n');console.log('Open in your browser: http://127.0.0.1:'+port+'/?access='+accessToken);console.log('\nOnly accessible on this computer (127.0.0.1). No model call until you explicitly approve each paid turn.');console.log('Press Ctrl+C to stop the sandbox.\n');});server.on('error',e=>{console.error('Could not bind local UI:',e.message);process.exitCode=1;});
}
