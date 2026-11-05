#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]||process.cwd()),at=p=>path.join(root,...p.split('/')),read=p=>fs.readFileSync(at(p),'utf8');
const proxy=read('proxy.ts'),base=read('scripts/sandbox/v37d2c7a3s14/installation.json');
assert.ok(proxy.includes('path === "/api/sandbox/probe-lab/local-assessment/myway-shadow-s15"'));
assert.ok(proxy.includes('if (process.env.VERCEL === "1")'));
assert.ok(proxy.includes('const decision = cloudRouteDecision(path, request.method)'));
assert.ok(proxy.includes('request.method === "POST" ? NextResponse.next()'));
assert.ok(proxy.includes('process.env.MYWAY_EXPERIMENTAL_RUNTIME !== "v37b"'));
assert.ok(proxy.includes('Route blocked in V3.7C.1 read-only sandbox'));
const route=read('app/api/sandbox/probe-lab/local-assessment/myway-shadow-s15/route.ts');
for(const rule of ['process.env.VERCEL===\'1\'','process.env.NODE_ENV!==\'development\'','MYWAY_EXPERIMENTAL_RUNTIME','validS13Input','validCompactTeachingInput','readOpenAIUsage','store:false','max_tokens'])assert.ok(route.includes(rule),'Missing route guard '+rule);
for(const unwanted of ['getLatestTopicState','supabase.from','commitTopicMemory','issueApproval','saveIndependentObservation','DELETE FROM','INSERT INTO'])assert.ok(!route.includes(unwanted),'Unexpected writer dependency '+unwanted);
const flow=read('scripts/sandbox/learning-intelligence/s15-flow.mjs');
assert.ok(flow.includes('validateAssessment')&&flow.includes('resolveAssessmentRoute')&&flow.includes('buildUserPrompt'));
assert.ok(flow.includes('sandboxRetrieve')&&flow.includes('fixtureRetrieve')&&flow.includes('scoreEvents')&&flow.includes('chooseHistory'));
assert.ok(flow.includes("policy==='myway'")&&flow.includes("policy==='baseline'"));
assert.ok(flow.includes('shadowAssessmentGate')&&flow.includes('teaching_complete_shadow_memory_proposal'));
assert.ok(!flow.includes('commitTopicMemory(')&&!flow.includes('consumeApproval(')&&!flow.includes('x-myway-approval'));
const req=createRequire(at('package.json'));const ts=req('typescript');
for(const rel of ['sandbox/probe-lab/learning-space/myway-shadow-voice-s15.ts','app/api/sandbox/probe-lab/local-assessment/myway-shadow-s15/route.ts']){
 const output=ts.transpileModule(read(rel),{fileName:rel,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
 assert.equal((output.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,'TypeScript syntax '+rel);
}
execFileSync(process.execPath,[at('scripts/sandbox/learning-intelligence/s15-selftest.mjs')],{cwd:root,stdio:'inherit',timeout:30000});
console.log('V3.7D.2C.7A.3S1.5 TEST PASS: shadow prompts, read-only proxy, A/B/C + two-turn regression, baseline preserved.');
