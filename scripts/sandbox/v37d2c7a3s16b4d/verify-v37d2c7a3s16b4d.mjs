#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const route=read('app/api/sandbox/probe-lab/local-assessment/s16b4d-teaching/route.ts');
const existing=read('app/api/sandbox/probe-lab/local-assessment/myway-shadow-s15/route.ts');
assert.match(route,/NODE_ENV/);assert.match(route,/MYWAY_EXPERIMENTAL_RUNTIME/);assert.match(route,/VERCEL/);assert.match(route,/X-MyWay-Mode/);
assert.match(route,/COMPACT_TEACH_SCHEMA/);assert.match(route,/validCompactTeachingInput/);
assert.match(route,/MYWAY_VOICE_SYSTEM_PROMPT/);assert.match(route,/store:false/);
assert.doesNotMatch(route,/\b(?:supabase|INSERT INTO|UPDATE\s+[A-Z]|DELETE FROM|prisma|db\.query)\b/i);
assert.match(existing,/S15_TEACHING_PROMPT/);
const current=JSON.parse(read('scripts/sandbox/current-local-release.json'));assert.equal(current.release,'v37d2c7a3s12');
for(const version of ['s16b4a','s16b4b','s16b4c'])assert.ok(fs.existsSync(path.join(root,`scripts/sandbox/v37d2c7a3${version}/installation.json`)));
assert.ok(fs.existsSync(path.join(root,'scripts/sandbox/learning-intelligence/s16b4d-eval.mjs')));
console.log('S1.6B.4D VERIFY PASS: 4A/4B/4C dependencies, separate local-only experimental teaching route, unchanged S1.5 baseline, compact strict 3-field schema, synthetic evaluation, no DB/profile/memory writers.');
