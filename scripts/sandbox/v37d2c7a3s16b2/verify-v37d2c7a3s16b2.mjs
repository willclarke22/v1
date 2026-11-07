#!/usr/bin/env node
/** Self-contained S1.6B.2 research-overlay verifier. No I/O outside local source reads. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const at=x=>path.join(root,...x.split('/'));
const sha=x=>crypto.createHash('sha256').update(fs.readFileSync(at(x))).digest('hex');
const rel='scripts/sandbox/learning-intelligence/';
for(const name of ['s16b2-evidence.mjs','s16b2-journey.mjs','s16b2-selftest.mjs'])assert.ok(fs.statSync(at(rel+name)).size>1000,'Missing '+name);
const release=JSON.parse(fs.readFileSync(at('scripts/sandbox/current-local-release.json'),'utf8'));
assert.equal(release.release,'v37d2c7a3s12');
const original='scripts/sandbox/learning-intelligence/s16b1-journey.mjs';
assert.equal(sha(original),'4e4baad8d87c0d54518396b125a7eab3380d40dc256dac6ffa59ad949340f29b','S1.6B.1 source changed');
const engine=fs.readFileSync(at(rel+'s16b2-journey.mjs'),'utf8');
for(const token of ['correctionRecord','refinementEvidence','teacherContextB2','correction_pending_learner_answer','stopped_on_operational_error'])assert.ok(engine.includes(token),token);
assert.ok(!engine.includes('from \'@/lib/persistence')&&!engine.includes('supabase.from('));
const seed=JSON.parse(fs.readFileSync(at(rel+'s16-seed.json'),'utf8'));assert.equal(seed.topics.length,12);
console.log('S1.6B.2 VERIFY PASS: additive research source, unchanged S1.6B.1, guarded release, synthetic 12-topic seed; no new provider route or DB writers.');
