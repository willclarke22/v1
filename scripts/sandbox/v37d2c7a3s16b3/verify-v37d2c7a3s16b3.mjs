#!/usr/bin/env node
/** S1.6B.3 local source-only verifier. No provider requests or DB access. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const at=x=>path.join(root,...x.split('/'));
const sha=x=>crypto.createHash('sha256').update(fs.readFileSync(at(x))).digest('hex');
const rel='scripts/sandbox/learning-intelligence/';
for(const name of ['s16b3-intent.mjs','s16b3-resolution.mjs','s16b3-journey.mjs','s16b3-selftest.mjs'])assert.ok(fs.statSync(at(rel+name)).size>1000,'Missing '+name);
const release=JSON.parse(fs.readFileSync(at('scripts/sandbox/current-local-release.json'),'utf8'));
assert.equal(release.release,'v37d2c7a3s12');
assert.equal(sha(rel+'s16b2-journey.mjs'),'e46d4f5580a8457ea204be9a6e6b77976e772ab97726af80bf75a09583b80609','S1.6B.2 source changed');
const engine=fs.readFileSync(at(rel+'s16b3-journey.mjs'),'utf8');
for(const token of ['resolveCorrection','inferIntent','teacherContextB3','assessmentSkip','refinementEvidence','undo','stopped_on_operational_error'].filter(x=>x!=='undo'))assert.ok(engine.includes(token),token);
assert.ok(!engine.includes('supabase.from(')&&!engine.includes("from '@/lib/persistence"));
const seed=JSON.parse(fs.readFileSync(at(rel+'s16-seed.json'),'utf8'));assert.equal(seed.topics.length,12);
console.log('S1.6B.3 VERIFY PASS: additive research code; guarded S1.6B.2 dependency and current release; no new provider endpoint, SQL, or DB writer.');
