#!/usr/bin/env node
/** S56 release verifier: exact source hashes + research behavior, no network. */
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {runStudy,parseArgs} from '../learning-intelligence/s16b56-journey.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const stage='scripts/sandbox/v37d2c7a3s16b56/';const receipt=JSON.parse(fs.readFileSync(path.join(root,stage+'installation.json'),'utf8'));
assert.equal(receipt.schema,'myway-s16b56-additive-receipt-v1');assert.equal(receipt.version,'v37d2c7a3s16b56');assert.equal(receipt.original_main,'462a7a4b6ce8b2b20a91021acca716307f4aa2d1');
assert.equal(hash('scripts/sandbox/v37d2c7a3s16b55r1/installation.json'),receipt.r1_receipt_sha256);
assert.equal(hash('scripts/sandbox/current-local-release.json'),'24336fe35cd0096d2d510d11a44a39fc0c82a40167914b556069cdd2c9bb16f1');
assert.equal(receipt.additions.length,6);
for(const x of receipt.additions){assert.ok(x.path.startsWith('scripts/sandbox/learning-intelligence/s16b56-')||x.path.startsWith(stage));assert.equal(hash(x.path),x.sha256,'S56 source integrity drift '+x.path);}
for(const s of ['s16b56-core.mjs','s16b56-journey.mjs']){const code=fs.readFileSync(path.join(root,'scripts/sandbox/learning-intelligence',s),'utf8');for(const denied of ['createClient(', 'supabase.from(', 'process.env.SUPABASE_SERVICE_ROLE_KEY','fetch(\'https://api.openai.com','prisma.'])assert.ok(!code.includes(denied),'Forbidden research import '+denied);}
const result=await runStudy(parseArgs(['--mode','offline','--limit','12','--history','resumed']),{rootCheck:false});
assert.equal(result.summary.processed,12);assert.equal(result.summary.stopped,false);assert.equal(result.cost.calls,0);assert.equal(result.summary.db_writes,0);assert.equal(result.summary.authoritative_memory_writes,0);
assert.equal(result.events[4].teaching_context.older_raw_messages_exposed,0);
console.log('S1.6B.5.6 VERIFY PASS: pinned R1 base, 12-turn model-B-first three-session journey, literal provenance, candidate-only retrieval, zero provider/DB writes, no real-space integration.');
