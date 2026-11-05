#!/usr/bin/env node
/** Offline exact proxy behavior regression; no HTTP, no database, no provider. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const root=path.resolve(process.argv[2]||process.cwd());
const require=createRequire(import.meta.url);
const ts=require(path.join(root,'node_modules/typescript/lib/typescript.js'));
const pathTo=(p)=>path.join(root,...p.split('/'));
const source=fs.readFileSync(pathTo('proxy.ts'),'utf8');
const route='app/api/sandbox/probe-lab/local-assessment/memory-adjudicator/route.ts';
const routeSource=fs.readFileSync(pathTo(route),'utf8');
const exact='/api/sandbox/probe-lab/local-assessment/memory-adjudicator';
assert.equal(source.split(exact).length-1,1,'Adjudicator path must occur exactly once in proxy');
assert.ok(routeSource.includes('NODE_ENV!=="development"') && routeSource.includes('MYWAY_EXPERIMENTAL_RUNTIME!=="v37b"'));
assert.ok(routeSource.includes("request.headers.get('origin')"));
assert.ok(!routeSource.includes('createServerSupabaseClient')&&!routeSource.includes('topic_state'));
const transpile=ts.transpileModule(source,{fileName:'proxy.ts',reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
assert.equal((transpile.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,'proxy.ts syntax');
function execute({path:pathname=exact,method='POST',host='127.0.0.1:3001',env={NODE_ENV:'development',MYWAY_EXPERIMENTAL_RUNTIME:'v37b'},cloudOk=true}={}) {
 const exports={};
 class NextResponse{
  constructor(body,{status=200}={}){this.body=body;this.status=status;this.passed=false;}
  static next(){return {status:200,passed:true};}
  static redirect(url){return {status:307,redirected:true,url:String(url),passed:false};}
 }
 const stubs={
  'next/server':{NextResponse},
  './lib/sandbox/v37d2c3/cloud-gate':{currentCloudShellStatus:()=>({ok:cloudOk})},
  './lib/sandbox/v37d2c3/cloud-policy':{cloudRouteDecision:(p,m)=>m!=='GET'&&m!=='HEAD'?'block':p==='/'?'redirect':['/sandbox/probe-lab/learning-space','/sandbox/probe-lab/learning-space/workbench'].includes(p)?'allow':'block'}
 };
 const req={nextUrl:{pathname},method,headers:{get:(k)=>k==='host'?host:null},url:'http://'+host+pathname};
 vm.runInNewContext(transpile.outputText,{exports,require:id=>{if(!(id in stubs))throw Error('Unexpected proxy import: '+id);return stubs[id];},process:{env},URL}, {timeout:1000});
 return exports.proxy(req);
}
assert.equal(execute().passed,true,'Only local POST should pass');
for(const method of ['GET','HEAD','PUT','PATCH','DELETE','OPTIONS']) assert.equal(execute({method}).status,405,'Non-POST method: '+method);
for(const host of ['example.org:3001','localhost:3000','127.0.0.1:3000']) assert.equal(execute({host}).status,403,'Nonlocal host: '+host);
assert.equal(execute({host:'localhost:3001'}).passed,true);
for(const env of [{NODE_ENV:'production',MYWAY_EXPERIMENTAL_RUNTIME:'v37b'},{NODE_ENV:'development'},{}])assert.equal(execute({env}).status,403,'Missing runtime pin should block');
assert.equal(execute({env:{VERCEL:'1',NODE_ENV:'development',MYWAY_EXPERIMENTAL_RUNTIME:'v37b'}}).status,403,'Cloud denies POST');
assert.equal(execute({env:{VERCEL:'1'},method:'GET'}).status,403,'Cloud denies API GET');
assert.equal(execute({env:{VERCEL:'1'},cloudOk:false}).status,403,'Cloud identity rejection intact');
for(const pathname of ['/api/message','/api/sandbox/probe-lab/learning-space/retrieve/other','/api/sandbox/probe-lab/local-assessment/memory-adjudicator/x','/api/sandbox/probe-lab/local-assessment/unknown','/api/sandbox/probe-lab/learning-space/commit'])assert.equal(execute({path:pathname}).status,403,'Unknown API still blocked: '+pathname);
assert.equal(execute({path:'/api/sandbox/probe-lab/learning-space/readonly',method:'GET'}).passed,true,'Existing readonly GET');
assert.equal(execute({path:'/api/sandbox/probe-lab/learning-space/readonly',method:'POST'}).status,405,'Existing readonly POST denied');
assert.equal(execute({path:'/api/sandbox/probe-lab/learning-space/retrieve',method:'POST'}).passed,true,'Existing retrieval POST');
assert.equal(execute({path:'/api/sandbox/probe-lab/local-assessment/teaching',method:'POST'}).passed,true,'Existing teaching POST');
assert.equal(execute({path:'/sandbox/probe-lab/learning-space',method:'GET'}).passed,true,'Existing UI GET');
assert.equal(execute({path:'/sandbox/probe-lab/learning-space',method:'POST'}).status,405,'Existing UI POST denied');
assert.equal(execute({path:'/',method:'GET'}).status,307,'Existing landing redirect');
console.log('V3.7D.2C.7A.3S1.2.1 TEST PASS: narrow local POST only, cloud and default deny intact, legacy routes unchanged, Model C route has independent guards.');
