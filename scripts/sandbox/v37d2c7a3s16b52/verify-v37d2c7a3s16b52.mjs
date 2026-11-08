#!/usr/bin/env node
/** Independent read-only check: synthetic realism tests are additive, no route or cloud policy change. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {loadRealismCorpus,corpusCoverage} from '../learning-intelligence/s16b52-corpus.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const get=p=>fs.readFileSync(path.join(root,p));const sha=p=>crypto.createHash('sha256').update(get(p)).digest('hex');
const checks={
 'proxy.ts':'917bdadc239a25b9625b8cc667b971149e9a5f1e4883fba5b735f73124b61337',
 'app/api/sandbox/probe-lab/local-assessment/s16b4d-teaching/route.ts':'13499f1e9ef8f5ceac0fc482b85465ddd5c3a63e61a5bdcf2181855fca620225',
 'scripts/sandbox/learning-intelligence/s16b51-fidelity.mjs':'f1d05e2b12755f4638f2af591ec09d1f28201362572a7a615f787bd4a97c44b6',
 'scripts/sandbox/learning-intelligence/s16b51-eval.mjs':'2ee027875ec9433b5e1b9e35aa660f92006db3a9eb853ba0193d81c5b83e2e03',
 'scripts/sandbox/learning-intelligence/s16b5-dialogue.mjs':'45a0a7ccc0264880943ec7910d21d41ba87952af87a24dbab985fa836da441c0',
 'scripts/sandbox/learning-intelligence/s16b4d-fixtures.json':'6af14d1e75d27693cfa8b4239b442279f575a2c6625602bdd9e403a449c72ccd',
 'scripts/sandbox/current-local-release.json':'24336fe35cd0096d2d510d11a44a39fc0c82a40167914b556069cdd2c9bb16f1'
};for(const [p,h] of Object.entries(checks))assert.equal(sha(p),h,'Protected dependency changed: '+p);
const src=String(get('scripts/sandbox/learning-intelligence/s16b52-eval.mjs'));
for(const t of ['--allow-spend','--budget-usd','--unlock-holdout','S16B52_BLIND_REVIEW.txt','no_db_writes:true','no_memory_writes:true','no_profile_writes:true','raw_prior_turns','action_truth'])assert.ok(src.includes(t),'Evaluator missing protection: '+t);
assert.ok(src.includes('mode:\'offline\''),'Offline must be default');
const c=loadRealismCorpus(),cover=corpusCoverage(c);
assert.equal(cover.snapshots,48);assert.equal(cover.threads,10);assert.equal(cover.dev,36);assert.equal(cover.holdout,12);
assert.equal(Object.keys(cover.actions).length,7);assert.ok(cover.ambiguity.context_required>=12);
const proxy=String(get('proxy.ts'));assert.ok(proxy.includes('Route blocked in V3.7C.1 read-only sandbox'));
assert.ok(proxy.indexOf('process.env.VERCEL === "1"')<proxy.indexOf('/api/sandbox/probe-lab/local-assessment/s16b4d-teaching'));
assert.equal(JSON.parse(String(get('scripts/sandbox/current-local-release.json'))).release,'v37d2c7a3s12');
for(const st of ['s16b4d','s16b4dfix1','s16b4dfix2','s16b5','s16b51'])assert.ok(fs.existsSync(path.join(root,'scripts/sandbox/v37d2c7a3'+st+'/installation.json')),'Previous installation receipt absent: '+st);
console.log('S1.6B.5.2 VERIFY PASS: 48 synthetic exact raw-turn snapshots in 10 threads; 36 dev/12 holdout; existing route, proxy, models and historical baselines byte-unchanged; paid and holdout opt-ins; no database or learner writes.');
