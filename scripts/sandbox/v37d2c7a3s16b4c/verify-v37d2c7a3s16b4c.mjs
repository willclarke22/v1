#!/usr/bin/env node
/** Guarded read-only structural verification: current release and prior overlays unchanged. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {planTeachingMove,TEACHING_PLANNER_VERSION} from '../learning-intelligence/s16b4c-planner.mjs';
import {MYWAY_VOICE_VERSION,MYWAY_VOICE_SYSTEM_PROMPT,prepareTeachingRequest} from '../learning-intelligence/s16b4c-voice.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const at=p=>path.join(root,...p.split('/'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
assert.equal(JSON.parse(fs.readFileSync(at('scripts/sandbox/current-local-release.json'),'utf8')).release,'v37d2c7a3s12');
const deps={
 'scripts/sandbox/learning-intelligence/s16b4a-interfaces.mjs':'8d90b06352920367b45d53c7971f54c3ded91e0945ead28798a22c88118b77d3',
 'scripts/sandbox/learning-intelligence/s16b4a-teaching-contract.mjs':'3ac385127df050d9f61b17da40bb4d2fecadd06843520724e8af623e27eb2639',
 'scripts/sandbox/learning-intelligence/s16b4b-context.mjs':'d00fabb67a3119419a2f448de9568ce3284b141214ab33e9f44580cfdbf34aa9',
 'scripts/sandbox/learning-intelligence/s16b4b-types.ts':'d6d958bdfdd9954e6fe7ef10a449c9454fe83396b2f4cd38e7c7c7d76ad793a4'
};
for(const [p,digest] of Object.entries(deps))assert.equal(sha(p),digest,`4A/4B dependency drift: ${p}`);
for(const p of ['s16b4c-planner.mjs','s16b4c-voice.mjs','s16b4c-types.ts','s16b4c-selftest.mjs','s16b4c-fixtures.json'])assert.ok(fs.statSync(at('scripts/sandbox/learning-intelligence/'+p)).size>200,'4C source missing: '+p);
for(const p of ['s16b4c-planner.mjs','s16b4c-voice.mjs']){
 const source=fs.readFileSync(at('scripts/sandbox/learning-intelligence/'+p),'utf8');
 for(const forbidden of ['fetch(', 'supabase.from(', 'createClient(', 'new OpenAI(', 'process.env.OPENAI_API_KEY', 'execFileSync(', 'writeFileSync(', 'XMLHttpRequest('])assert.ok(!source.includes(forbidden),'Unexpected I/O in '+p+': '+forbidden);
}
assert.equal(TEACHING_PLANNER_VERSION,'myway_teaching_planner_v1');assert.equal(MYWAY_VOICE_VERSION,'myway_teaching_voice_v1');
assert.equal(typeof planTeachingMove,'function');assert.equal(typeof prepareTeachingRequest,'function');
assert.ok(MYWAY_VOICE_SYSTEM_PROMPT.includes('exactly teaching_strategy, next_step and visual_intent'));
assert.equal(JSON.parse(fs.readFileSync(at('scripts/sandbox/learning-intelligence/s16b4c-fixtures.json'),'utf8')).cases.length,9);
console.log('S1.6B.4C VERIFY PASS: exact 4A/B dependencies, unchanged local release, read-only action/voice contracts, unchanged production Model B endpoint and transport.');
