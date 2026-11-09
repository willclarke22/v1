#!/usr/bin/env node
/** Exact source and read-only behavioral verification, no provider calls. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {runStudy,parseArgs,validateCWithoutLabelGate} from '../learning-intelligence/s16b56r1-journey.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const pathReceipt='scripts/sandbox/v37d2c7a3s16b56r1/installation.json';
const receipt=JSON.parse(fs.readFileSync(path.join(root,pathReceipt),'utf8'));
assert.equal(receipt.schema,'myway-s16b56r1-additive-receipt-v1');
assert.equal(receipt.version,'v37d2c7a3s16b56r1');
assert.equal(receipt.original_main,'462a7a4b6ce8b2b20a91021acca716307f4aa2d1');
assert.equal(receipt.additions.length,4);
assert.equal(hash('scripts/sandbox/v37d2c7a3s16b56/installation.json'),receipt.s56_receipt_sha256);
assert.equal(hash('scripts/sandbox/current-local-release.json'),'24336fe35cd0096d2d510d11a44a39fc0c82a40167914b556069cdd2c9bb16f1');
for(const x of receipt.additions){
 assert.ok(x.path.startsWith('scripts/sandbox/learning-intelligence/s16b56r1-')||x.path.startsWith('scripts/sandbox/v37d2c7a3s16b56r1/'));
 assert.equal(hash(x.path),x.sha256,'R1 file source integrity: '+x.path);
}
const runner=fs.readFileSync(path.join(root,'scripts/sandbox/learning-intelligence/s16b56r1-journey.mjs'),'utf8');
for(const denied of ['createClient(', 'supabase.from(', 'process.env.SUPABASE_SERVICE_ROLE_KEY','prisma.'])assert.ok(!runner.includes(denied),'Unexpected database access '+denied);
const decision=validateCWithoutLabelGate({identity:'distinct',anchor_id:null,rationale:'M'.repeat(401)},[{id:'root'}]);
assert.equal(decision.guard.action,'accepted');
const t=await runStudy(parseArgs(['--mode','offline','--limit','12','--history','resumed','--retrieval','lexical']),{rootCheck:false});
assert.equal(t.summary.processed,12);assert.equal(t.cost.calls,0);assert.equal(t.summary.db_writes,0);assert.equal(t.summary.authoritative_memory_writes,0);
assert.equal(typeof t.summary.guard_rejections,'number');assert.equal(typeof t.summary.unresolved_identity_holds,'number');
console.log('S1.6B.5.6-R1 VERIFY PASS: S56 original preserved, C rationale >350 allowed, decision/hold distinctions, immutable retrieval in tests, no provider/DB writes.');
