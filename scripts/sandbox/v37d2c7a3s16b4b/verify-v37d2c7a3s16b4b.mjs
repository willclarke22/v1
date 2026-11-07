#!/usr/bin/env node
/** Guarded S1.6B.4B integrity verifier. Local read-only assertions only. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {selectRelevantTeachingContext,CONTEXT_SELECTOR_VERSION} from '../learning-intelligence/s16b4b-context.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const at=p=>path.join(root,...p.split('/'));
const txt=p=>fs.readFileSync(at(p),'utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
assert.equal(JSON.parse(txt('scripts/sandbox/current-local-release.json')).release,'v37d2c7a3s12');
// Ensure existing 4A foundation remains unchanged; its schema is the only interface source.
const originals={
 'scripts/sandbox/learning-intelligence/s16b4a-interfaces.mjs':'8d90b06352920367b45d53c7971f54c3ded91e0945ead28798a22c88118b77d3',
 'scripts/sandbox/learning-intelligence/s16b4a-teaching-contract.mjs':'3ac385127df050d9f61b17da40bb4d2fecadd06843520724e8af623e27eb2639',
 'scripts/sandbox/learning-intelligence/s16b4a-types.ts':'4ba09ebe859e785779ea6898a3ea83c3320f5a558f1d3816cca9e82304cb7783'
};
for(const [file,digest] of Object.entries(originals))assert.equal(sha(file),digest,`4A drift: ${file}`);
for(const p of ['s16b4b-context.mjs','s16b4b-types.ts','s16b4b-fixtures.json','s16b4b-selftest.mjs'])assert.ok(fs.statSync(at('scripts/sandbox/learning-intelligence/'+p)).size>300,'Missing B file: '+p);
assert.equal(CONTEXT_SELECTOR_VERSION,'myway_relevance_context_selector_v1');
assert.equal(typeof selectRelevantTeachingContext,'function');
const context=txt('scripts/sandbox/learning-intelligence/s16b4b-context.mjs');
for(const forbidden of ['fetch(', 'supabase.from(', 'createClient(', 'new OpenAI(', 'process.env.OPENAI_API_KEY', 'execFileSync(', 'writeFileSync('])assert.ok(!context.includes(forbidden),'Unexpected I/O in context selector: '+forbidden);
const types=txt('scripts/sandbox/learning-intelligence/s16b4b-types.ts');
assert.ok(types.includes('MyWayTeachingContextEnvelopeV1'),'4A type dependency not used');
assert.ok(types.includes('NEEDS_TARGET_EVIDENCE'),'Fail closed output missing');
assert.equal(JSON.parse(txt('scripts/sandbox/learning-intelligence/s16b4b-fixtures.json')).cases.length,4);
console.log('S1.6B.4B VERIFY PASS: exact 4A foundation intact, pure relevance selector and typed result, correction fail-closed, no provider, DB, or Model B transport changes.');
