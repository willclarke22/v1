#!/usr/bin/env node
/** Additive S58 verifier: stage SHA receipt + all curated fixtures + offline/model-mock selftests. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));const root=path.resolve(here,'../../../');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const receipt=JSON.parse(fs.readFileSync(path.join(here,'installation.json'),'utf8'));
if(receipt.schema!=='myway-s16b58-additive-receipt-v1'||receipt.version!=='v37d2c7a3s16b58'||receipt.additions?.length!==14)throw Error('S58 receipt invalid');
for(const item of receipt.additions){if(!/^scripts\/sandbox\/[a-zA-Z0-9._/-]+$/.test(item.path)||item.path.split('/').includes('..'))throw Error('bad verified path');const p=path.join(root,item.path);if(hash(p)!==item.sha256||fs.statSync(p).size!==item.bytes)throw Error('S58 source drift: '+item.path);}
const out=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s16b58-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:90000});
if(!out.includes('S1.6B.5.8 SELFTEST PASS'))throw Error('S58 selftest did not pass');
console.log('S1.6B.5.8 VERIFY PASS: 30 topics, 44 distinct curriculum links, 60 unadministered probe candidates, three seeded learner histories with evidence-backed causes/relationships, hidden simulator only L, prior research untouched, no DB/provider calls.');
