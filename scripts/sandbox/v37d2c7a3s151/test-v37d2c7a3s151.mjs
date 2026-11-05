#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd());const at=p=>path.join(root,...p.split('/'));
const read=p=>fs.readFileSync(at(p),'utf8');
const flow=read('scripts/sandbox/learning-intelligence/s15-flow.mjs');
const integ=read('scripts/sandbox/learning-intelligence/s151-retrieval.mjs');
for(const term of ['rankFixtureEvidence','evidenceIntegrity','--retrieval-policy','teaching_complete_memory_hold_retrieval_integrity','fixtureRetrieve','sandboxRetrieve','paidCall('])assert.ok(flow.includes(term),'missing S1.5.1 term '+term);
assert.ok(flow.indexOf("stage(out,'model_b'")<flow.indexOf("stage(out,'retrieval_integrity'"),'Teaching no longer independent of retrieval');
assert.ok(!integ.includes('commitTopicMemory')&&!integ.includes('supabase.from')&&!integ.includes('/api/sandbox/probe-lab/learning-space/retrieve'));
for(const x of ['scripts/sandbox/learning-intelligence/s151-retrieval.mjs','scripts/sandbox/learning-intelligence/s15-flow.mjs'])execFileSync(process.execPath,['--check',at(x)],{cwd:root,stdio:'inherit'});
for(const s of ['scripts/sandbox/learning-intelligence/s15-selftest.mjs','scripts/sandbox/learning-intelligence/s151-selftest.mjs'])execFileSync(process.execPath,[at(s)],{cwd:root,stdio:'inherit',timeout:60000});
console.log('V3.7D.2C.7A.3S1.5.1 TEST PASS: read-only topology, old S1.5 and new retrieval regressions.');
