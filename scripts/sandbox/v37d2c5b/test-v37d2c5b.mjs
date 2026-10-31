#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]||process.cwd());const at=p=>path.join(root,...p.split('/'));
const ts=createRequire(at('package.json'))('typescript');
const read=p=>fs.readFileSync(at(p),'utf8');
const page=read('app/sandbox/probe-lab/learning-space/page.tsx');
const experience=read('lib/sandbox/v37d2c5b/cloud-topics-experience.tsx');
const scene=read('lib/sandbox/v37d2c5b/cloud-snapshot-scene.tsx');
const mapping=read('lib/sandbox/v37d2c5b/cloud-topic-mapping.ts');
const demo=read('lib/sandbox/v37d2c4/cloud-learning-space-demo.tsx');
const auth=read('lib/sandbox/v37d2c5a/cloud-auth-check.tsx');
const policy=read('lib/sandbox/v37d2c3/cloud-policy.ts');
for(const [name,s] of [['page',page],['experience',experience],['scene',scene],['mapping',mapping]]){
 const result=ts.transpileModule(s,{fileName:name+(name==='mapping'?'.ts':'.tsx'),compilerOptions:{jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
 assert.equal(result.diagnostics?.length??0,0,name+' TypeScript syntax');
}
assert.match(page,/process\.env\.VERCEL === "1" \? <CloudTopicsExperience\/> : <LearningSpacePreview\/>/);
assert.ok(experience.includes('client.auth.getUser()')&&experience.includes('event==="SIGNED_OUT"'));
assert.ok(experience.includes('client.from("myway_cloud_topic_snapshot")')&&experience.includes('client.from("myway_cloud_relationship_snapshot")'));
assert.ok(experience.includes('CloudInteractiveDemo')&&experience.includes('myway-experiment-v37d2c5a-auth'));
for(const s of [experience,scene,mapping])for(const bad of [/\.insert\s*\(/,/\.update\s*\(/,/\.delete\s*\(/,/\.upsert\s*\(/,/\.rpc\s*\(/,/SUPABASE_SERVICE_ROLE_KEY/,/localStorage\.setItem/,/fetch\s*\(/,/api\/sandbox/])assert.ok(!bad.test(s),'No cloud mutation or unauthorized API');
assert.ok(scene.includes('SpaceCanvas')&&scene.includes('Sidebar')&&scene.includes('TopicPanel')&&scene.includes('buildLearningSpace'));
assert.ok(scene.includes('<input disabled')&&demo.includes('DEMO_TOPICS'));
assert.ok(auth.includes('signInWithPassword')&&auth.includes('auth.signOut()'));
assert.ok(policy.includes('if(method!=="GET"&&method!=="HEAD")return "block"'));
assert.ok(!policy.includes('"/api/sandbox/probe-lab/learning-space/readonly"'));
const sql=read('scripts/sandbox/v37d2c5b/sql/01_CREATE_CLOUD_READONLY_TABLES.sql');
const seed=read('scripts/sandbox/v37d2c5b/sql/02_SEED_ONE_OWNER_SNAPSHOT.sql');
assert.match(sql,/FOR SELECT TO authenticated USING \(\(SELECT auth\.uid\(\)\) = owner_uid\)/g);
assert.equal((sql.match(/CREATE POLICY/g)||[]).length,2);
assert.ok(sql.includes('REVOKE ALL')&&sql.includes('GRANT SELECT')&&sql.includes('FORCE ROW LEVEL SECURITY'));
assert.ok(!/GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)/i.test(sql));
assert.ok(seed.includes('Expected exactly 1 sandbox Auth user')&&seed.includes('topic_count <> 43'));
assert.ok(!/topic_json\s*[,)]/i.test(seed),'Must not copy the entire topic_json');
console.log('V3.7D.2C.5B CONTRACT PASS: auth-scoped SELECT only, read-only snapshot, real renderer, protected fallback and independent SQL migration.');
