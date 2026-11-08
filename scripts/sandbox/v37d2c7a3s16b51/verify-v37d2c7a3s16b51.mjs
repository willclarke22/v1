#!/usr/bin/env node
/** S1.6B.5.1 non-writing local guard check and immutable baseline pin. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const route='app/api/sandbox/probe-lab/local-assessment/s16b4d-teaching/route.ts';
assert.equal(sha(route),'13499f1e9ef8f5ceac0fc482b85465ddd5c3a63e61a5bdcf2181855fca620225');
assert.equal(sha('scripts/sandbox/learning-intelligence/s16b5-dialogue.mjs'),'45a0a7ccc0264880943ec7910d21d41ba87952af87a24dbab985fa836da441c0');
assert.equal(sha('scripts/sandbox/learning-intelligence/s16b5-eval.mjs'),'d8419a9a2d99544ae0218e8e0dc144e4421eb0632131a1937e8923e989d00148');
assert.equal(sha('scripts/sandbox/learning-intelligence/s16b4d-fixtures.json'),'6af14d1e75d27693cfa8b4239b442279f575a2c6625602bdd9e403a449c72ccd');
assert.equal(sha('proxy.ts'),'917bdadc239a25b9625b8cc667b971149e9a5f1e4883fba5b735f73124b61337');
const r=read(route),p=read('proxy.ts'),f=read('scripts/sandbox/learning-intelligence/s16b51-fidelity.mjs'),e=read('scripts/sandbox/learning-intelligence/s16b51-eval.mjs');
for(const tag of ['localOnly(request)','process.env.NODE_ENV','MYWAY_EXPERIMENTAL_RUNTIME','process.env.VERCEL','validCompactTeachingInput','readOpenAIUsage','store:false','format_retry','max_tokens:370','S16B51_VOICE_VERSION','buildCalibratedDialoguePrompt','voice_version'])assert.ok(r.includes(tag),'missing guard: '+tag);
assert.ok(r.indexOf('if(!localOnly(request))')<r.indexOf('process.env.OPENAI_API_KEY'));
assert.ok(p.indexOf('process.env.VERCEL === "1"')<p.indexOf('s16b4d-teaching'));
assert.match(p,/Route blocked in V3\.7C\.1 read-only sandbox/);
assert.doesNotMatch(r,/\b(?:supabase|prisma|INSERT INTO|UPDATE\s+\w+|DELETE FROM|db\.query)\b/iu);
for(const v of ['EVIDENCE','CURRENT','ACTION','RETRY'])assert.ok(f.toUpperCase().includes(v));
assert.match(e,/Offline refuses spend flags/);assert.match(e,/--allow-spend/);assert.match(e,/no_database_writes:true/);
assert.match(e,/current','adaptive','calibrated/);assert.match(e,/Frozen dataset hash changed/);
for(const stage of ['s16b4d','s16b4dfix1','s16b4dfix2','s16b5'])assert.ok(fs.existsSync(path.join(root,`scripts/sandbox/v37d2c7a3${stage}/installation.json`)));
assert.equal(JSON.parse(read('scripts/sandbox/current-local-release.json')).release,'v37d2c7a3s12');
console.log('S1.6B.5.1 VERIFY PASS: opt-in calibrated voice, existing adaptive/current baselines intact, cloud/local guards, frozen evidence, no DB/profile/memory writers.');
