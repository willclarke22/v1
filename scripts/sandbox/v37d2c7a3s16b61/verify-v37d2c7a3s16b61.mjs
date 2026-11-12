#!/usr/bin/env node
/** S61 stage verifier: deterministic and read-only. Previous S60 verifier is authoritative on S60 files. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../..');
const receipt=JSON.parse(fs.readFileSync(path.join(HERE,'installation.json'),'utf8'));
if(receipt.schema!=='myway-s16b61-additive-receipt-v1'||receipt.version!=='v37d2c7a3s16b61'||receipt.based_on!=='v37d2c7a3s16b60'||receipt.production_unchanged!==true||receipt.additive_only!==true||receipt.db_writes!==0||receipt.additions.length<4)throw Error('S61 invalid stage receipt');
for(const item of receipt.additions){
 if(!/^scripts\/sandbox\/(?:learning-intelligence\/s16b61-[A-Za-z0-9_.\/-]+|v37d2c7a3s16b61\/[A-Za-z0-9_.\/-]+)$/.test(item.path)||item.path.split('/').some(x=>x==='..'||x==='.'))throw Error('S61 unsafe path '+item.path);
 const full=path.join(ROOT,item.path),st=fs.lstatSync(full);if(!st.isFile()||st.isSymbolicLink())throw Error('S61 nonregular source '+item.path);
 const b=fs.readFileSync(full);if(b.length!==item.bytes||crypto.createHash('sha256').update(b).digest('hex')!==item.sha256)throw Error('S61 changed: '+item.path);
}
const prior=path.join(ROOT,'scripts/sandbox/v37d2c7a3s16b60/verify-v37d2c7a3s16b60.mjs');
const result=execFileSync(process.execPath,[prior],{cwd:ROOT,encoding:'utf8',timeout:90000,stdio:'pipe'});
if(!result.includes('S60 VERIFY PASS'))throw Error('S60 predecessor verification failed');
for(const script of ['s16b61-journey.mjs','s16b61-selftest.mjs'])execFileSync(process.execPath,['--check',path.join(ROOT,'scripts/sandbox/learning-intelligence',script)],{cwd:ROOT,timeout:20000,stdio:'pipe'});
const output=execFileSync(process.execPath,[path.join(ROOT,'scripts/sandbox/learning-intelligence/s16b61-selftest.mjs')],{cwd:ROOT,encoding:'utf8',timeout:90000,stdio:'pipe'});
if(!output.includes('S61 SELFTEST PASS'))throw Error('S61 selftest output missing');
console.log(output.trim());console.log('S61 VERIFY PASS: S59/S60 unchanged, 30 topics / 8 fictional learners, safe longitudinal research workflow, zero model/DB calls.');
