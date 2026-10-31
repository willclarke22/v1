#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]||process.cwd());const at=p=>path.join(root,...p.split('/'));
const ts=createRequire(at('package.json'))('typescript');
const page=fs.readFileSync(at('app/sandbox/probe-lab/learning-space/workbench/page.tsx'),'utf8');
const auth=fs.readFileSync(at('lib/sandbox/v37d2c5a/cloud-auth-check.tsx'),'utf8');
const policy=fs.readFileSync(at('lib/sandbox/v37d2c3/cloud-policy.ts'),'utf8');
const demo=fs.readFileSync(at('lib/sandbox/v37d2c4/cloud-learning-space-demo.tsx'),'utf8');
for(const [name,content] of [['auth check',auth],['Workbench page',page]]){
  const out=ts.transpileModule(content,{fileName:name+'.tsx',compilerOptions:{jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
  assert.equal(out.diagnostics?.length??0,0,name+' must transpile');
}
assert.match(page,/process\.env\.VERCEL === "1"/,'Cloud-only auth diagnostic');
assert.ok(page.includes('<CloudReadonlyView view="workbench"/>'),'D2C4 Workbench status remains');
assert.ok(page.includes('<LearningSpaceWorkbench/>'),'Local Workbench remains');
assert.ok(page.includes('<CloudAuthCheck />'),'Auth diagnostic only in cloud page');
for(const token of ['signInWithPassword','auth.getUser()','auth.signOut()','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY'])assert.ok(auth.includes(token),'Auth contract '+token);
for(const forbidden of [/\.from\s*\(/,/\.rpc\s*\(/,/\.storage\./,/\.functions\./,/signUp\s*\(/,/SUPABASE_SERVICE_ROLE_KEY/,/fetch\s*\(/,/XMLHttpRequest/,/password\.toString/])assert.ok(!forbidden.test(auth),'Forbidden access in auth-only component '+forbidden);
assert.ok(policy.includes('if(method!=="GET"&&method!=="HEAD")return "block"'),'All non-read routes blocked');
assert.ok(!policy.includes('"/api/sandbox/probe-lab/learning-space/readonly"'),'No cloud API endpoint allowed');
assert.ok(demo.includes('DEMO_TOPICS'),'3D demo remains fictional');
console.log('V3.7D.2C.5A AUTH CONTRACT PASS: Auth-only, unchanged local Workbench, prior cloud route restrictions and fictional demo.');
