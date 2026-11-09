#!/usr/bin/env node
/** S55 local source-integrity and offline regression, no provider or DB writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runStudy,parseArgs} from '../learning-intelligence/s16b55-journey.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const stage='scripts/sandbox/v37d2c7a3s16b55/';
const sourceHash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const record=JSON.parse(fs.readFileSync(path.join(root,stage+'installation.json'),'utf8'));
assert.equal(record.schema,'myway-s16b55-additive-manifest-v1');
assert.equal(record.version,'v37d2c7a3s16b55');
assert.equal(record.branch,'myway/learning-sandbox-v3_7a');
assert.equal(record.original_main,'462a7a4b6ce8b2b20a91021acca716307f4aa2d1');
assert.equal(sourceHash('scripts/sandbox/current-local-release.json'),'24336fe35cd0096d2d510d11a44a39fc0c82a40167914b556069cdd2c9bb16f1');
assert.equal(sourceHash('scripts/sandbox/v37d2c7a3s16b54/installation.json'),'98384125f3c862e76f39b2911804b7b864d5244e5a7e3871d6619bc8bcea17fe');
const previous=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/v37d2c7a3s16b54/installation.json'),'utf8'));
for(const f of previous.additions)assert.equal(sourceHash(f.path),f.sha256,'B54 protected baseline drift: '+f.path);
assert.equal(record.additions.length,7);
for(const f of record.additions){
 assert.ok(f.path.startsWith('scripts/sandbox/learning-intelligence/s16b55-')||f.path.startsWith(stage));
 assert.ok(!f.path.includes('..'));assert.equal(sourceHash(f.path),f.sha256,'S55 payload changed: '+f.path);
}
for(const rel of [
 'scripts/sandbox/learning-intelligence/s16b55-core.mjs',
 'scripts/sandbox/learning-intelligence/s16b55-journey.mjs']){
 const code=fs.readFileSync(path.join(root,rel),'utf8');
 for(const token of ['supabase.from(', 'upsertTopicState(', 'createClient(', 'prisma.', 'fetch(\'/api/', 'process.env.SUPABASE_SERVICE_ROLE_KEY'])assert.ok(!code.includes(token),'Forbidden write-capable product dependency');
}
const output=await runStudy(parseArgs(['--mode','offline','--limit','9','--context','resumed']),{rootCheck:false});
assert.equal(output.summary.processed,9);
assert.equal(output.summary.stopped,false);
assert.equal(output.summary.sessions_reached,3);
assert.equal(output.events[3].context_audit.older_raw_messages_exposed,0);
assert.equal(output.events[3].comparison.full_older_raw_exposed,6);
assert.equal(output.events[5].memory_action.status,'HELD_IDENTITY_UNCERTAIN');
assert.equal(output.summary.authoritative_memory_writes,0);
assert.equal(output.cost.attemptedCalls,0);
console.log('S1.6B.5.5 VERIFY PASS: pinned S54 source, S55 payload hashes, nine-turn offline resumed study and no memory/DB writes.');
