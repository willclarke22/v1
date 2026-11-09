#!/usr/bin/env node
/** S57 frozen source and offline verifier. Never calls API or database. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {runStudy,parseArgs} from '../learning-intelligence/s16b57-journey.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const receipt=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/v37d2c7a3s16b57/installation.json'),'utf8'));
assert.equal(receipt.schema,'myway-s16b57-additive-receipt-v1');assert.equal(receipt.version,'v37d2c7a3s16b57');
assert.equal(receipt.original_main,'462a7a4b6ce8b2b20a91021acca716307f4aa2d1');assert.equal(receipt.additions.length,5);
assert.equal(hash('scripts/sandbox/v37d2c7a3s16b56r1/installation.json'),receipt.s56r1_receipt_sha256);
for(const file of receipt.additions){assert.ok(/^scripts\/sandbox\/(?:learning-intelligence\/s16b57-|v37d2c7a3s16b57\/)/.test(file.path));assert.equal(hash(file.path),file.sha256,'Exact S57 source '+file.path);}
for(const filename of ['s16b57-activity.mjs','s16b57-journey.mjs']){
 const content=fs.readFileSync(path.join(root,'scripts/sandbox/learning-intelligence',filename),'utf8');
 for(const denied of ['createClient(', 'supabase.from(', 'process.env.SUPABASE_SERVICE_ROLE_KEY','prisma.'])assert.ok(!content.includes(denied),'Unplanned DB reach: '+denied);
}
const t=await runStudy(parseArgs(['--mode','offline','--limit','12','--history','resumed','--retrieval','lexical','--activity','simulated','--activity-profile','needs-feedback']),{rootCheck:false});
assert.equal(t.summary.processed,12);assert.equal(t.summary.simulated_activities,1);assert.equal(t.cost.calls,0);assert.equal(t.summary.db_writes,0);assert.equal(t.summary.authoritative_memory_writes,0);
assert.equal(t.state.personalization_hypotheses[0].status,'insufficient_evidence_for_stable_preference');
console.log('S1.6B.5.7 VERIFY PASS: exact added source, pinned S56-R1, renderable-declarative scene contract, synthetic evidence + provisional relationships, no provider/DB/production writes.');
