#!/usr/bin/env node
/** Research-only integrity verifier; no provider, DB, product mutation. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runStudy,parseArgs} from '../learning-intelligence/s16b55r1-journey.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const relative='scripts/sandbox/v37d2c7a3s16b55r1/';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const receipt=JSON.parse(fs.readFileSync(path.join(root,relative+'installation.json'),'utf8'));
assert.equal(receipt.schema,'myway-s16b55r1-additive-receipt-v1');
assert.equal(receipt.version,'v37d2c7a3s16b55r1');
assert.equal(receipt.branch,'myway/learning-sandbox-v3_7a');
assert.equal(receipt.original_main,'462a7a4b6ce8b2b20a91021acca716307f4aa2d1');
assert.equal(hash('scripts/sandbox/v37d2c7a3s16b55/installation.json'),receipt.s55_receipt_sha256);
assert.equal(hash('scripts/sandbox/current-local-release.json'),'24336fe35cd0096d2d510d11a44a39fc0c82a40167914b556069cdd2c9bb16f1');
const prev=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/v37d2c7a3s16b55/installation.json'),'utf8'));
for(const file of prev.additions)assert.equal(hash(file.path),file.sha256,'Preserved S55 source drift: '+file.path);
assert.equal(receipt.additions.length,6);
for(const file of receipt.additions){
 assert.ok(file.path.startsWith('scripts/sandbox/learning-intelligence/s16b55r1-')||file.path.startsWith(relative));
 assert.ok(!file.path.includes('..'));
 assert.equal(hash(file.path),file.sha256,'R1 source changed: '+file.path);
}
for(const file of [
 'scripts/sandbox/learning-intelligence/s16b55r1-core.mjs',
 'scripts/sandbox/learning-intelligence/s16b55r1-journey.mjs']){
 const source=fs.readFileSync(path.join(root,file),'utf8');
 for(const denied of ['supabase.from(', 'upsertTopicState(', 'createClient(', 'prisma.', 'process.env.SUPABASE_SERVICE_ROLE_KEY', 'fs.writeFileSync(\'/api'])assert.ok(!source.includes(denied),'Forbidden DB/product side effect');
}
const trace=await runStudy(parseArgs(['--mode','offline','--limit','9','--context','resumed']),{rootCheck:false});
assert.equal(trace.summary.processed,9);
assert.equal(trace.summary.stopped,false);
assert.equal(trace.summary.durable_evidence_entries,9);
assert.equal(trace.events[5].memory_action.status,'PROVISIONAL_NEW_ROOT');
assert.equal(trace.summary.visual_proposals,1);
assert.equal(trace.summary.visual_deferred,1);
assert.equal(trace.summary.root_relationships,0);
assert.equal(trace.summary.db_writes,0);
assert.equal(trace.cost.attemptedCalls,0);
console.log('S1.6B.5.5-R1 VERIFY PASS: S55 baseline hashes, 9-turn R1 evidence/identity/visual controls, no provider or DB writes.');
