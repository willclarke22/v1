#!/usr/bin/env node
/** S1.3 proxy behavior, without actual network calls. Independent S1.3 harness self-tests imported below. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import '../learning-intelligence/s13-selftest.mjs';
const root=path.resolve(process.argv[2]||process.cwd());
const require=createRequire(import.meta.url),ts=require(path.join(root,'node_modules/typescript/lib/typescript.js'));
const source=fs.readFileSync(path.join(root,'proxy.ts'),'utf8');
const s12='/api/sandbox/probe-lab/local-assessment/memory-adjudicator';
const s13='/api/sandbox/probe-lab/local-assessment/memory-adjudicator-s13';
assert.ok(source.includes(`path === "${s13}"`));assert.ok(source.includes(`path === "${s12}"`));
assert.equal(source.split(`path === "${s13}"`).length-1,1);assert.equal(source.split(`path === "${s12}"`).length-1,1);
const transpile=ts.transpileModule(source,{fileName:'proxy.ts',reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
assert.equal((transpile.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
function execute({pathname=s13,method='POST',host='127.0.0.1:3001',env={NODE_ENV:'development',MYWAY_EXPERIMENTAL_RUNTIME:'v37b'},cloudOk=true}={}){
 const exports={};class NextResponse{constructor(body,{status=200}={}){this.body=body;this.status=status;this.passed=false;}
  static next(){return {status:200,passed:true};}static redirect(url){return {status:307,redirected:true,url:String(url),passed:false};}}
 const stubs={'next/server':{NextResponse},'./lib/sandbox/v37d2c3/cloud-gate':{currentCloudShellStatus:()=>({ok:cloudOk})},
  './lib/sandbox/v37d2c3/cloud-policy':{cloudRouteDecision:(p,m)=>m!=='GET'&&m!=='HEAD'?'block':p==='/'?'redirect':['/sandbox/probe-lab/learning-space','/sandbox/probe-lab/learning-space/workbench'].includes(p)?'allow':'block'}};
 vm.runInNewContext(transpile.outputText,{exports,require:id=>{if(!(id in stubs))throw Error('Disallowed proxy import: '+id);return stubs[id];},process:{env},URL},{timeout:1000});
 const req={nextUrl:{pathname},method,headers:{get:k=>k==='host'?host:null},url:'http://'+host+pathname};return exports.proxy(req);
}
for(const url of [s12,s13]){
 assert.equal(execute({pathname:url}).passed,true,'Pinned localhost must allow model evaluation');
 for(const method of ['GET','HEAD','PUT','PATCH','DELETE','OPTIONS'])assert.equal(execute({pathname:url,method}).status,405,'Wrong method accepted: '+method);
 for(const host of ['example.org:3001','localhost:3000','127.0.0.1:3000'])assert.equal(execute({pathname:url,host}).status,403,'Non-local host accepted');
 for(const env of [{NODE_ENV:'production',MYWAY_EXPERIMENTAL_RUNTIME:'v37b'},{NODE_ENV:'development'},{}])assert.equal(execute({pathname:url,env}).status,403,'Missing dev pin accepted');
 assert.equal(execute({pathname:url,env:{VERCEL:'1',NODE_ENV:'development',MYWAY_EXPERIMENTAL_RUNTIME:'v37b'}}).status,403,'Cloud API POST accepted');
 assert.equal(execute({pathname:url,env:{VERCEL:'1'},method:'GET'}).status,403,'Cloud API GET accepted');
}
for(const pathname of ['/api/message','/api/sandbox/probe-lab/local-assessment/unknown','/api/sandbox/probe-lab/local-assessment/memory-adjudicator-s13/extra','/api/sandbox/probe-lab/learning-space/commit'])assert.equal(execute({pathname}).status,403,'Unexpected API access: '+pathname);
assert.equal(execute({pathname:'/api/sandbox/probe-lab/learning-space/readonly',method:'GET'}).passed,true);
assert.equal(execute({pathname:'/api/sandbox/probe-lab/learning-space/readonly',method:'POST'}).status,405);
assert.equal(execute({pathname:'/sandbox/probe-lab/learning-space',method:'GET'}).passed,true);
assert.equal(execute({pathname:'/',method:'GET'}).status,307);
assert.equal(execute({env:{VERCEL:'1'},cloudOk:false}).status,403);
const s13route=fs.readFileSync(path.join(root,'app/api/sandbox/probe-lab/local-assessment/memory-adjudicator-s13/route.ts'),'utf8');
for(const item of ['MYWAY_EXPERIMENTAL_RUNTIME','NODE_ENV','origin','store:false','S13_SCHEMA','S13_PROMPT'])assert.ok(s13route.includes(item));
assert.ok(!s13route.includes('Supabase')&&!s13route.includes('topic_state'));
console.log('V3.7D.2C.7A.3S1.3 TEST PASS: loopback POST-only security for S12 and S13, Vercel denied, fail-closed legacy routes, S1.3 harness selftests.');
