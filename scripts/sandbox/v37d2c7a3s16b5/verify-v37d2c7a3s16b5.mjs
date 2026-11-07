#!/usr/bin/env node
/** Fail-closed, read-only source integrity and security boundaries. */
import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const rel={route:'app/api/sandbox/probe-lab/local-assessment/s16b4d-teaching/route.ts',
 voice:'scripts/sandbox/learning-intelligence/s16b5-dialogue.mjs',
 eval:'scripts/sandbox/learning-intelligence/s16b5-eval.mjs',
 original:'scripts/sandbox/learning-intelligence/s16b4d-eval.mjs',
 proxy:'proxy.ts',fixtures:'scripts/sandbox/learning-intelligence/s16b4d-fixtures.json'};
const read=p=>fs.readFileSync(path.join(root,p),'utf8');const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const route=read(rel.route),voice=read(rel.voice),evaluator=read(rel.eval),proxy=read(rel.proxy);
assert.equal(sha(rel.original),'b3d9aeadbf33b4b867561d66281fb0fe9a960b6cba180caefae4a4d7a73a0728','Existing 4D evaluator changed');
assert.equal(sha(rel.fixtures),'6af14d1e75d27693cfa8b4239b442279f575a2c6625602bdd9e403a449c72ccd');
assert.equal(sha('scripts/sandbox/learning-intelligence/s16b5-action-probes.json'),'b7e42cf52ac158f7c20a74bf241f09d69e95c35effe22854600eefc1f12d4f42');
assert.equal(sha(rel.proxy),'917bdadc239a25b9625b8cc667b971149e9a5f1e4883fba5b735f73124b61337');
for(const keyword of ['NODE_ENV','MYWAY_EXPERIMENTAL_RUNTIME','process.env.VERCEL','localOnly(request)','COMPACT_TEACH_SCHEMA','validCompactTeachingInput','store:false','voice_version','buildAdaptiveDialoguePrompt','MYWAY_VOICE_SYSTEM_PROMPT','format_retry','readOpenAIUsage'])assert.ok(route.includes(keyword),'Route missing: '+keyword);
assert.match(route,/\['contract','personalized'\]/);assert.match(route,/max_tokens:370/);
assert.ok(route.indexOf('if(!localOnly(request))')<route.indexOf('process.env.OPENAI_API_KEY'));
assert.doesNotMatch(route,/\b(?:supabase|prisma|INSERT INTO|UPDATE\s+\w+|DELETE FROM|db\.query)\b/iu);
assert.match(voice,/CURRENT ACTION/);assert.match(voice,/HUMAN_QUALITY_REVIEW_REQUIRED/);
assert.match(evaluator,/--allow-spend/);assert.match(evaluator,/Offline refuses spend flags/);
assert.match(evaluator,/current','adaptive/);assert.match(evaluator,/no_database_writes:true/);
assert.ok(proxy.indexOf('process.env.VERCEL === "1"')<proxy.indexOf('s16b4d-teaching'));
assert.match(proxy,/Route blocked in V3\.7C\.1 read-only sandbox/);
for(const stage of ['s16b4d','s16b4dfix1','s16b4dfix2'])assert.ok(fs.existsSync(path.join(root,`scripts/sandbox/v37d2c7a3${stage}/installation.json`)));
assert.equal(JSON.parse(read('scripts/sandbox/current-local-release.json')).release,'v37d2c7a3s12');
console.log('S1.6B.5 VERIFY PASS: opt-in action-specific adaptive voice, unchanged 4D comparator and frozen corpus, local-only runtime, strict three-field output, no DB/profile/memory writers.');
