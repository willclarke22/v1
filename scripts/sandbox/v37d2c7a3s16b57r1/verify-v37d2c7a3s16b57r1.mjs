#!/usr/bin/env node
/** S57-R1 exact-source and research offline verifier; no DB/network/provider calls. */
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runStudy,parseArgs} from '../learning-intelligence/s16b57r1-journey.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const h=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const receipt=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/v37d2c7a3s16b57r1/installation.json'),'utf8'));
assert.equal(receipt.schema,'myway-s16b57r1-additive-receipt-v1');assert.equal(receipt.version,'v37d2c7a3s16b57r1');assert.equal(receipt.original_main,'462a7a4b6ce8b2b20a91021acca716307f4aa2d1');
assert.equal(receipt.additions.length,5);assert.equal(h('scripts/sandbox/v37d2c7a3s16b57/installation.json'),receipt.s57_receipt_sha256);
for(const x of receipt.additions){assert.match(x.path,/^scripts\/sandbox\/(?:learning-intelligence\/s16b57r1-|v37d2c7a3s16b57r1\/)/);assert.equal(h(x.path),x.sha256,'Exact S57-R1 source '+x.path);}
for(const name of ['s16b57r1-journey.mjs','s16b57r1-loop.mjs']){
 const content=fs.readFileSync(path.join(root,'scripts/sandbox/learning-intelligence',name),'utf8');
 for(const forbidden of ['createClient(', 'supabase.from(', 'process.env.SUPABASE_SERVICE_ROLE_KEY', 'prisma.'])assert.ok(!content.includes(forbidden),'Unplanned DB reach: '+forbidden);
}
const t=await runStudy(parseArgs(['--mode','offline','--limit','12','--history','resumed','--retrieval','lexical','--activity-profile','needs-feedback']),{rootCheck:false});
assert.equal(t.summary.processed,12);assert.equal(t.summary.simulated_activities,1);assert.equal(t.summary.activity_adaptations,1);
assert.equal(t.state.activity_adaptations[0].disposition.kind,'feedback_assisted_success');assert.equal(t.cost.calls,0);
assert.equal(t.summary.db_writes,0);assert.equal(t.summary.authoritative_memory_writes,0);
const act=t.events.find(e=>e.activity);assert.ok(act.reply.includes('Would you like to try?'));assert.equal(act.activity.scene.renderer_status,'NOT_RENDERED_SIMULATED');
console.log('S1.6B.5.7-R1 VERIFY PASS: S57 predecessor preserved, learner-visible consent, independent action evidence, Model A next-move bridge, no provider/DB/production writes.');
