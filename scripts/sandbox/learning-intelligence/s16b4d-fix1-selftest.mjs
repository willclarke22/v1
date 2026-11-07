#!/usr/bin/env node
/** Dynamic isolated evaluation of proxy request guards; no API or provider calls. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const source=fs.readFileSync(path.join(root,'proxy.ts'),'utf8');
assert.ok(source.includes('Route blocked in V3.7C.1 read-only sandbox'));
assert.ok(source.includes('if (process.env.VERCEL === "1")'));
assert.ok(source.indexOf('process.env.VERCEL === "1"')<source.indexOf('s16b4d-teaching'));
const route='/api/sandbox/probe-lab/local-assessment/s16b4d-teaching';
assert.equal(source.split(`if (path === "${route}")`).length,2);
// Remove only two import lines and TypeScript type on the exported function.
const runnable=source.replace(/^import .*;\r?\n/gm,'').replace('export function proxy(request: NextRequest)', 'function proxy(request)').replace(/export const config = \{matcher: "\/:path\*"\};/,'');
assert.ok(runnable.includes('function proxy(request)'));
const guard={
 NextResponse:class NextResponse {constructor(body,{status}={}){this.body=body;this.status=status??200;this.kind='response';} static next(){return {kind:'next',status:200};} static redirect(){return {kind:'redirect',status:307};}},
 URL,process:{env:{}},currentCloudShellStatus:()=>({ok:true}),cloudRouteDecision:()=> 'block'
};
const proxy=vm.runInNewContext(runnable+'\nproxy;',guard,{timeout:1500});
function call(p,method,env={},host='127.0.0.1:3001'){
 guard.process.env= {NODE_ENV:'development',MYWAY_EXPERIMENTAL_RUNTIME:'v37b',...env};
 return proxy({nextUrl:{pathname:p},method,headers:{get:key=>key==='host'?host:null},url:'http://127.0.0.1:3001'+p});
}
assert.equal(call(route,'POST').kind,'next','new local pinned POST must pass proxy');
for(const method of ['GET','HEAD','PUT','PATCH','DELETE']) assert.equal(call(route,method).status,405,method+' denied');
for(const env of [{NODE_ENV:'production'},{MYWAY_EXPERIMENTAL_RUNTIME:'other'}]) assert.equal(call(route,'POST',env).status,403,'pin rejected');
assert.equal(call(route,'POST',{},'public.example.org:3001').status,403,'nonlocal host rejected');
assert.equal(call(route,'POST',{VERCEL:'1'}).status,403,'cloud request rejected before allowlist');
assert.equal(call('/api/sandbox/probe-lab/local-assessment/unlisted','POST').status,403,'unknown API denied');
assert.equal(call('/api/sandbox/probe-lab/local-assessment/myway-shadow-s15','POST').kind,'next','existing teacher preserved');
assert.equal(call('/api/sandbox/probe-lab/local-assessment/myway-shadow-s15','GET').status,405,'old route method guard preserved');
assert.equal(call('/sandbox/probe-lab/learning-space','GET').kind,'next','read-only preview preserved');
assert.equal(call('/sandbox/probe-lab/learning-space','POST').status,405,'read-only preview guarded');
console.log('S1.6B.4D FIX1 SELFTEST PASS: pinned local POST forwarded; non-POST, nonlocal, cloud, nondev, unpinned and unknown routes denied; S1.5 and preview unchanged.');
