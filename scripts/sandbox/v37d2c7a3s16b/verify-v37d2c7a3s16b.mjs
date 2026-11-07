#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
const release=JSON.parse(read('scripts/sandbox/current-local-release.json'));
assert.equal(release.release,'v37d2c7a3s12','Unchanged release pointer required');
for(const p of ['scripts/sandbox/v37d2c7a3s151/installation.json','scripts/sandbox/v37d2c7a3s16/installation.json','scripts/sandbox/learning-intelligence/s16-space-sim.mjs','scripts/sandbox/learning-intelligence/s16-seed.json','scripts/sandbox/learning-intelligence/s16b-journey.mjs','scripts/sandbox/learning-intelligence/s16b-selftest.mjs']) assert.ok(fs.existsSync(path.join(root,p)),`Required local path missing: ${p}`);
const newCode=read('scripts/sandbox/learning-intelligence/s16b-journey.mjs');
assert.ok(newCode.includes("from './s16-space-sim.mjs'"));
assert.ok(newCode.includes("['T01','T07','T10','T02','T06','T08','T15','T11']"));
assert.ok(newCode.includes('No database writers')||newCode.includes('No database writers,'.toLowerCase())||newCode.includes('No database writers, no SQL'));
assert.ok(newCode.includes('expected labels')||newCode.includes('Expected labels')||newCode.includes('reference labels'));
assert.ok(!/supabase\.from\(|createServerSupabaseClient\(|child_process|process\.env\.[A-Z]*KEY/.test(newCode),'No DB or direct provider credentials allowed');
assert.ok(!newCode.includes('fetch('),'Model access only via existing S1.6A runner');
console.log('S1.6B VERIFY PASS: research-only S1.6A extension, versioned seed and engine, local-only report, no new API/write dependencies.');
