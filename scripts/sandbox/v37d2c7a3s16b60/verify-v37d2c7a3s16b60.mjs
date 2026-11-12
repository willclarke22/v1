#!/usr/bin/env node
/** S60 installed stage verifier; read only, model-free, DB-free. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../..');
const receipt=JSON.parse(fs.readFileSync(path.join(HERE,'installation.json'),'utf8'));
if(receipt.schema!=='myway-s16b60-additive-receipt-v1'||receipt.version!=='v37d2c7a3s16b60'||receipt.based_on!=='v37d2c7a3s16b59'||receipt.production_unchanged!==true||receipt.db_writes!==0||receipt.additive_only!==true||receipt.additions.length<10)throw Error('S60 invalid receipt');
for(const item of receipt.additions){
 if(!/^scripts\/sandbox\/[a-zA-Z0-9._/-]+$/.test(item.path)||item.path.split('/').includes('..'))throw Error('S60 unsafe receipt path');
 const dest=path.join(ROOT,item.path);const stat=fs.lstatSync(dest);if(!stat.isFile()||stat.isSymbolicLink())throw Error('S60 nonregular source '+item.path);
 const b=fs.readFileSync(dest),sha=crypto.createHash('sha256').update(b).digest('hex');if(b.length!==item.bytes||sha!==item.sha256)throw Error('S60 changed: '+item.path);
}
const prior=path.join(ROOT,'scripts/sandbox/v37d2c7a3s16b59/verify-v37d2c7a3s16b59.mjs');
execFileSync(process.execPath,[prior],{cwd:ROOT,encoding:'utf8',timeout:90000,stdio:'pipe'});
const scripts=['s16b60-fixture.mjs','s16b60-retrieval.mjs','s16b60-prompts.mjs','s16b60-benchmark.mjs','s16b60-selftest.mjs'];
for(const name of scripts)execFileSync(process.execPath,['--check',path.join(ROOT,'scripts/sandbox/learning-intelligence',name)],{cwd:ROOT,timeout:12000,stdio:'pipe'});
const output=execFileSync(process.execPath,[path.join(ROOT,'scripts/sandbox/learning-intelligence/s16b60-selftest.mjs')],{cwd:ROOT,encoding:'utf8',timeout:90000});
console.log(output.trim());console.log('S60 VERIFY PASS: predecessor S59 intact, hashed S60 additions, 30-topic fixture, guarded A/B ablations, zero provider/DB calls.');
