#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]||process.cwd()),at=p=>path.join(root,...p.split('/'));
const ts=createRequire(at('package.json'))('typescript');
const page=fs.readFileSync(at('app/sandbox/probe-lab/learning-space/page.tsx'),'utf8');
const demo=fs.readFileSync(at('lib/sandbox/v37d2c4/cloud-learning-space-demo.tsx'),'utf8');
const data=fs.readFileSync(at('lib/sandbox/v37d2c4/demo-topics.ts'),'utf8');
const proxy=fs.readFileSync(at('proxy.ts'),'utf8');
const policy=fs.readFileSync(at('lib/sandbox/v37d2c3/cloud-policy.ts'),'utf8');
const workbench=fs.readFileSync(at('app/sandbox/probe-lab/learning-space/workbench/page.tsx'),'utf8');
for(const [n,s,tsx] of [['demo view',demo,true],['demo topics',data,false],['cloud page',page,true]]){
 const r=ts.transpileModule(s,{fileName:n+(tsx?'.tsx':'.ts'),compilerOptions:{jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
 assert.equal(r.diagnostics?.length||0,0,n+' must transpile');
}
assert.ok(page.includes('process.env.VERCEL === "1" ? <CloudInteractiveDemo/> : <LearningSpacePreview/>'),'cloud path must select demo without touching local component');
assert.ok(demo.includes('SpaceCanvas')&&demo.includes('Sidebar')&&demo.includes('TopicPanel')&&demo.includes('buildLearningSpace'),'must reuse the real 3D renderer and app components');
assert.ok(demo.includes('DEMO_TOPICS')&&demo.includes('disabled aria-label="Learning message input disabled'),'fixture-only demo must disable messaging');
for(const [n,s] of [['3D demo',demo],['topic fixture',data]]){
 for(const forbidden of [/\bfetch\s*\(/,/\bXMLHttpRequest\b/,/\bWebSocket\b/,/executeLearningTurn/,/createClient\s*\(/,/SUPABASE_SERVICE_ROLE_KEY/,/process\.env/,/\bPOST\b/])assert.ok(!forbidden.test(s),`${n}: forbidden operation ${forbidden}`);
}
assert.ok(data.includes('synthetic_cloud_demo')&&data.includes('DEMO_TOPICS'),'fixtures visibly fictional');
assert.ok(workbench.includes('<CloudReadonlyView view="workbench"/>'),'Workbench remains shell');
assert.ok(proxy.includes('cloudRouteDecision')&&policy.includes('if(method!=="GET"&&method!=="HEAD")return "block"'));
assert.ok(policy.includes('pathname==="/sandbox/probe-lab/learning-space"'));
console.log('V3.7D.2C.4 DEMO CONTRACT PASS: existing renderer, no network, disabled messaging, protected cloud API policy.');
