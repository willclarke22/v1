#!/usr/bin/env node
/** Read-only source/guard verification; no network, providers or DB access. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||process.cwd());
const read=p=>fs.readFileSync(path.join(root,...p.split('/')),'utf8');
const sha=p=>crypto.createHash('sha256').update(read(p)).digest('hex');
const rel='scripts/sandbox/learning-intelligence/';
const j=read(rel+'s16b1-journey.mjs'),c=read(rel+'s16b1-continuity.mjs'),test=read(rel+'s16b1-selftest.mjs');
assert.ok(j.includes('LIVE DB WRITES=0')&&j.includes('candidate_ready'));
assert.ok(j.includes('S1.6B.1 REFUSED')&&j.includes('!maxPayloadSafe'));
assert.ok(c.includes('automaticCanonicalRewrite:false')&&c.includes('automaticRepairApplied:false'));
assert.ok(c.includes('maxTurns=2,maxChars=600')&&c.includes('correction_hold'));
assert.ok(test.includes('SELFTEST PASS'));
assert.equal(sha(rel+'s16b-journey.mjs'),'9ebebff726b25373917851dd4f48f0b5f8710a731acb08c2afdff90ccc2692f0');
assert.equal(sha(rel+'s16-space-sim.mjs'),'9ee7e829d9bcd28c2d898873e047b76071ffe152769b439fb6c4983c3045d2e5');
assert.equal(sha(rel+'s16-seed.json'),'85b4bcd6208a6b8e4ac320725fd2c040e6087491b44953e8d6e2820e7b6235b4');
const release=JSON.parse(read('scripts/sandbox/current-local-release.json'));
assert.equal(release.release,'v37d2c7a3s12');
for(const marker of ['v37d2c7a3s151','v37d2c7a3s16','v37d2c7a3s16b'])assert.ok(fs.existsSync(path.join(root,'scripts/sandbox',marker,'installation.json')));
for(const prohibited of ['@/lib/persistence','supabase.createClient','upsertTopicState','from(\'topic_state\')'])assert.ok(!j.includes(prohibited),'Forbidden data-writer dependency');
console.log('S1.6B.1 VERIFY PASS: additive engine, compact context, stable canonical root, strict existing endpoints, unchanged S1.5/S1.6A/B baselines and release.');
