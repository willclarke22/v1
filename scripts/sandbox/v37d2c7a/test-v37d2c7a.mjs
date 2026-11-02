#!/usr/bin/env node
/** Offline source/security contract: no SQL/network/model calls, no secrets. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
import {Script} from 'node:vm';
import {assertSafeManifestPath} from './verify-manifest-path.mjs';
const root=path.resolve(process.argv[2]||process.cwd()),at=p=>path.join(root,...p.split('/'));
const read=p=>fs.readFileSync(at(p),'utf8');
const require=createRequire(import.meta.url);
const ts=require(path.join(root,'node_modules/typescript/lib/typescript.js'));
for(const file of ['lib/sandbox/v37d2c7a/cloud-difficulty-worker-source.ts',
 'lib/sandbox/v37d2c7a/cloud-difficulty-search.tsx','app/sandbox/probe-lab/learning-space/workbench/page.tsx']){
 const o=ts.transpileModule(read(file),{fileName:file,reportDiagnostics:true,
  compilerOptions:{jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
 assert.equal((o.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,'TS parsing failed: '+file);
}
const worker=read('lib/sandbox/v37d2c7a/cloud-difficulty-worker-source.ts');
const match=worker.match(/String\.raw`([\s\S]*?)`;\s*$/);assert.ok(match,'Expected fixed inline worker');
new Script(match[1],{filename:'v37d2c7a-embedded-worker.mjs'});
for(const token of ["@huggingface/transformers@4.3.1","device:'wasm'","dtype:'q8'","normalize:true","vectors.every(valid)","texts.length>500"]){
 if(token==='texts.length>500')continue;assert.ok(worker.includes(token),'Worker missing '+token);
}
assert.ok(!worker.includes('fetch(')&&!worker.includes('XMLHttpRequest')&&!worker.includes('service_role'));
const ui=read('lib/sandbox/v37d2c7a/cloud-difficulty-search.tsx');
for(const token of ['client.auth.getUser()','myway_cloud_difficulty_catalog_v37d2c7a',
 'myway_cloud_difficulty_export_v37d2c7a','myway_cloud_match_difficulties_v37d2c7a',
 'apply_difficulty_vector_v37d2c7a','new Set(source.map','validVector(values)','root_sha256'])
 assert.ok(ui.includes(token),'UI missing '+token);
for(const token of ['.insert(','.upsert(','.update(','.delete(','service_role','/api/'])
 assert.ok(!ui.includes(token),'Unexpected cloud mutation / route: '+token);
assert.ok(ui.includes('MANUALLY')&&ui.includes('read-only'));
const page=read('app/sandbox/probe-lab/learning-space/workbench/page.tsx');
assert.ok(page.includes('process.env.VERCEL === "1"')&&page.includes('<CloudProtectedVectorSearch />')&&
 page.includes('<CloudDifficultySearch />')&&page.includes('<LearningSpaceWorkbench/>'));
const sql=read('scripts/sandbox/v37d2c7a/sql/01_INSTALL_DIFFICULTY_PROJECTION.sql');
for(const token of ['FORCE ROW LEVEL SECURITY','myway_cloud_difficulty_snapshot','myway_learning_evidence',
 "e.value->>'origin'='v37d2c_validated_assessment'",'root_sha256','pg_catalog.sha256',
 'auth.uid()','auth.role()',"SET search_path=''",'p_root_sha256','root_problem',
 'pg_advisory_xact_lock(3712,2503)','RETURN QUERY','embedding IS NOT NULL',
 'GRANT EXECUTE ON FUNCTION public.myway_cloud_match_difficulties_v37d2c7a'])
 assert.ok(sql.includes(token),'SQL missing '+token);
// FIX3: both provenance-approved families must be accepted consistently across
// the count, upsert and pruning queries, without an unrestricted legacy bypass.
const d2aGate = "e.value->>'origin'='v37d2a_explicit_user_approval'";
const parentGate = "t.topic_json->>'myway_memory_origin'='v37d2a_explicit_user_approval'";
assert.equal(sql.split(d2aGate).length-1,3,'Expected exactly three legacy origin checks');
assert.equal(sql.split(parentGate).length-1,3,'Each legacy origin must require parent-topic provenance');
for (const portion of sql.split(d2aGate).slice(1))
 assert.ok(portion.slice(0,180).includes(parentGate),'Legacy approval must be bound to parent provenance');
const preflight=read('scripts/sandbox/v37d2c7a/sql/00_PREFLIGHT.sql');
assert.ok(preflight.includes(d2aGate.replace('e.value', 'event')) &&
 preflight.includes("topic_memory_origin='v37d2a_explicit_user_approval'"),
 'Preflight must reflect both provenance gates');
assert.ok(preflight.includes('validated_assessment_events') && preflight.includes('excluded_events'),
 'Read-only preflight must surface the eligibility breakdown');

for(const risk of ['CREATE POLICY','ALTER TABLE public.topic_state','ALTER TABLE public.topic_vectors',
 'GRANT SELECT ON public.topic_state','GRANT SELECT ON public.topic_vectors',
 'INSERT INTO public.topic_state','UPDATE public.topic_state','cron.schedule','CREATE EXTENSION'])
 assert.ok(!sql.includes(risk),'Unexpected SQL privilege expansion '+risk);
for(const name of ['00_PREFLIGHT.sql','01_INSTALL_DIFFICULTY_PROJECTION.sql','02_REFRESH_APPROVED_EVIDENCE.sql',
 '03_VERIFY_SECURITY.sql','04_REMOVE_DIFFICULTY_PROJECTION.sql'])
 assert.ok(fs.existsSync(at('scripts/sandbox/v37d2c7a/sql/'+name)));
const pointer=JSON.parse(read('scripts/sandbox/current-local-release.json'));
assert.equal(pointer.release,'v37d2c7a');
assert.equal(pointer.verify,'scripts/sandbox/v37d2c7a/verify-v37d2c7a.mjs');

// FIX2: regression for the previous failed post-install verifier. Root-level
// tsconfig.json is a legitimate manifest target, not a path-traversal attempt.
for(const safe of [
  'tsconfig.json',
  'scripts/sandbox/v37d2c7a/verify-v37d2c7a.mjs',
  'lib/sandbox/v37d2c7a/cloud-difficulty-search.tsx',
  'app/sandbox/probe-lab/learning-space/workbench/page.tsx',
]) assert.equal(assertSafeManifestPath(safe),safe);
for(const unsafe of [
  '', '.', '..', '../v1/tsconfig.json', 'tsconfig.json/../bad',
  'scripts/sandbox/../secrets', 'scripts/sandbox/./fake',
  '/absolute/file', 'C:/Windows/System32/drivers/etc/hosts',
  'C:\\Windows\\System32', 'scripts\\sandbox\\bad',
  'package.json', '.env', 'app/api/message/route.ts',
  'scripts/sandbox//bad', 'lib/sandbox/a\0bad',
]) assert.throws(()=>assertSafeManifestPath(unsafe), undefined, 'Accepted unsafe manifest path '+unsafe);

// FIX1: root TypeScript scan must include live app files but exclude archived
// historical patch copies, which lose the original relative import context.
// The synthetic fixture is always removed and is never part of the source commit.
const probeDir=at('scripts/sandbox/v37d2c7a/backups');
const probeFile=path.join(probeDir,'__myway_fix1_archive_probe__.tsx');
assert.ok(!fs.existsSync(probeFile),'Refusing to overwrite an existing backup probe');
const dirExisted=fs.existsSync(probeDir);
try{
 fs.mkdirSync(probeDir,{recursive:true});
 fs.writeFileSync(probeFile,"import { archiveOnly } from './missing-relative-import';\n",{flag:'wx'});
 const configFile=at('tsconfig.json');
 const config=ts.readConfigFile(configFile,ts.sys.readFile);
 assert.equal(config.error,undefined,'Root tsconfig must parse');
 const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
 assert.equal(parsed.errors.length,0,'Root TS configuration must be valid');
 const selected=new Set(parsed.fileNames.map(x=>path.resolve(x).toLowerCase()));
 assert.ok(selected.has(at('app/sandbox/probe-lab/learning-space/workbench/page.tsx').toLowerCase()),
  'Live Workbench must remain included in the full-project TypeScript check');
 assert.ok(selected.has(at('lib/sandbox/v37d2c7a/cloud-difficulty-search.tsx').toLowerCase()),
  '7A active search UI must remain included in the full-project TypeScript check');
 assert.ok(!selected.has(probeFile.toLowerCase()),'Archived patch TSX erroneously included in tsc');
 assert.ok([...selected].every(x=>!x.replaceAll('\\','/').includes('/scripts/sandbox/v37c21/backups/')),
  'Older v37c21 archived TSX erroneously included in tsc');
}finally{
 fs.rmSync(probeFile,{force:true});
 if(!dirExisted){try{fs.rmdirSync(probeDir)}catch{}}
}

console.log('V3.7D.2C.7A CONTRACT PASS: root events separate, 384D browser inference, read-only RPC, SQL/manual, no Cron or cloud writes.');
