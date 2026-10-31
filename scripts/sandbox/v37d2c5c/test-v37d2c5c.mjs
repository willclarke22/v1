#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]||process.cwd());const at=p=>path.join(root,...p.split('/'));
const read=p=>fs.readFileSync(at(p),'utf8');
const ts=createRequire(at('package.json'))('typescript');
const source=read('lib/sandbox/v37d2c5b/cloud-topics-experience.tsx');
const result=ts.transpileModule(source,{fileName:'cloud-topics-experience.tsx',compilerOptions:{jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal(result.diagnostics?.length??0,0,'frontend TSX syntax');
for(const expected of ['getUser()','onAuthStateChange','SIGNED_OUT','SIGNED_IN','myway_cloud_topic_snapshot','myway_cloud_relationship_snapshot','setInterval','visibilitychange','focus','60_000','lastPayload=signature']){
 assert.ok(source.includes(expected),'Expected frontend behavior '+expected);
}
for(const disallowed of [/\.insert\s*\(/,/\.update\s*\(/,/\.delete\s*\(/,/\.upsert\s*\(/,/\.rpc\s*\(/,/SUPABASE_SERVICE_ROLE_KEY/,/localStorage\.setItem/,/\bfetch\s*\(/])assert.ok(!disallowed.test(source),'No frontend mutation');
const dir='scripts/sandbox/v37d2c5c/sql/';
for(const name of ['00_READONLY_PREFLIGHT.sql','01_INSTALL_REFRESH_FUNCTION.sql','02_RUN_ONE_REFRESH.sql','03_ENABLE_CRON.sql','04_VERIFY_READONLY.sql','05_STOP_CRON.sql','06_REMOVE_SYNC_FUNCTION.sql'])assert.ok(read(dir+name).includes('V3.7D.2C.5C'),'SQL scripts present');
const install=read(dir+'01_INSTALL_REFRESH_FUNCTION.sql');
assert.ok(install.includes('CREATE SCHEMA myway_sync_private'));
assert.ok(install.includes("SECURITY DEFINER SET search_path = ''"));
assert.ok(install.includes('REVOKE ALL ON FUNCTION myway_sync_private.refresh_cloud_snapshot() FROM PUBLIC, anon, authenticated, service_role'));
assert.ok(install.includes('REVOKE ALL ON SCHEMA myway_sync_private'));
assert.ok(!/\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+public\.(?:topic_state|topic_vectors|runs|attempts)\b/i.test(install),'Original tables stay unchanged');
assert.ok(!/\bCREATE TRIGGER\b/i.test(install),'No trigger can break a local write');
assert.ok(install.includes('pg_advisory_xact_lock')&&install.includes('ON CONFLICT')&&install.includes('jsonb_array_elements'));
assert.ok(!/topic_json\s*[,)]/i.test(install),'No full topic_json export');
const cron=read(dir+'03_ENABLE_CRON.sql');
assert.ok(cron.includes('cron.schedule')&&cron.includes("'* * * * *'"));
assert.ok(read(dir+'05_STOP_CRON.sql').includes('cron.unschedule'));
console.log('V3.7D.2C.5C CONTRACT PASS: 60-second visibility-aware auth SELECTs, private admin-only SQL refresh, manual Cron, source of truth untouched.');
