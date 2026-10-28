#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]||process.cwd());
const req=createRequire(path.join(root,'package.json'));
const ts=req('typescript');
const src=fs.readFileSync(path.join(root,'lib/sandbox/v37d2c3/cloud-policy.ts'),'utf8');
const result=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
if(result.diagnostics?.length)throw Error('Cloud policy TS transpile diagnostics: '+result.diagnostics.length);
const mod={exports:{}};new Function('module','exports',result.outputText)(mod,mod.exports);
const {evaluateCloudShell,cloudRouteDecision}=mod.exports;
const policy={schema:'myway-v37d2c3-cloud-identity-v1',mode:'readonly_shell',vercel_project_id:'prj_Example12345',branch:'myway/learning-sandbox-v3_7a',repository_owner:'willclarke22',repository_slug:'v1',sandbox_host:'sandbox-example.supabase.co'};
const env={VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:policy.vercel_project_id,VERCEL_GIT_COMMIT_REF:policy.branch,VERCEL_GIT_REPO_OWNER:policy.repository_owner,VERCEL_GIT_REPO_SLUG:policy.repository_slug,MYWAY_CLOUD_SHELL_MODE:'readonly',NEXT_PUBLIC_SUPABASE_URL:'https://sandbox-example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test_public_key_only'};
assert.equal(evaluateCloudShell(env,policy).ok,true,'expected valid isolated cloud environment');
let testCount=1;
for(const [name,change] of Object.entries({
  wrong_project:{VERCEL_PROJECT_ID:'prj_Other123456'},
  wrong_branch:{VERCEL_GIT_COMMIT_REF:'main'},
  wrong_repo:{VERCEL_GIT_REPO_SLUG:'v2'},
  wrong_owner:{VERCEL_GIT_REPO_OWNER:'someoneelse'},
  wrong_environment:{VERCEL_ENV:'preview'},
  no_cloud_opt_in:{MYWAY_CLOUD_SHELL_MODE:''},
  production_supabase:{NEXT_PUBLIC_SUPABASE_URL:'https://production.supabase.co'},
  missing_url:{NEXT_PUBLIC_SUPABASE_URL:''},
  service_role:{SUPABASE_SERVICE_ROLE_KEY:'do_not_use'},
  secret_key:{SUPABASE_SECRET_KEY:'do_not_use'},
  db_url:{DATABASE_URL:'postgresql://bad'},
  qdrant:{QDRANT_URL:'https://example.com'},
  local_runtime_override:{MYWAY_EXPERIMENTAL_RUNTIME:'v37b'},
  missing_anon:{NEXT_PUBLIC_SUPABASE_ANON_KEY:''},
  missing_system_vars:{VERCEL_GIT_REPO_OWNER:''},
})){
 assert.equal(evaluateCloudShell({...env,...change},policy).ok,false,name);
 testCount++;
}
for(const route of ['/','/sandbox/probe-lab/learning-space','/sandbox/probe-lab/learning-space/workbench','/_next/static/test.js','/favicon.ico']){
 assert.notEqual(cloudRouteDecision(route,'GET'),'block',route);testCount++;
}
for(const [route,method] of [['/api/sandbox/probe-lab/learning-space/retrieve','POST'],['/api/sandbox/probe-lab/learning-space/readonly','GET'],['/api/sandbox/probe-lab/local-assessment/openai','POST'],['/api/messages','POST'],['/sandbox/probe-lab/learning-space','POST'],['/unprotected-original-route','GET']]){
 assert.equal(cloudRouteDecision(route,method),'block',route);testCount++;
}
const p=fs.readFileSync(path.join(root,'proxy.ts'),'utf8');
const next=fs.readFileSync(path.join(root,'next.config.ts'),'utf8');
assert.ok(p.includes('if (process.env.VERCEL === "1")')&&p.includes('cloudRouteDecision')&&p.includes('Experimental MyWay is local-only'));
assert.ok(next.includes('assertExperimentalStartupGate')&&next.includes('assertCloudShellBuildGate'));
assert.ok(!p.includes('service_role'));
console.log(`V3.7D.2C.3 CLOUD CONTRACT PASS: ${testCount} identity/allowlist cases; original local route gates retained.`);
