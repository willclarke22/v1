#!/usr/bin/env node
/** S61-FIX1 additive/edit stage verifier; never calls a provider, touches DB, or mutates files. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const receipt=JSON.parse(fs.readFileSync(path.join(HERE,'installation.json'),'utf8'));
if(receipt.schema!=='myway_s61fix1_receipt_v1'||receipt.version!=='v37d2c7a3s16b61fix1'||!receipt.research_only||receipt.database_writes!==0||!Array.isArray(receipt.updates)||!Array.isArray(receipt.additions)||!Array.isArray(receipt.untouched_s61))throw Error('Invalid S61-FIX1 receipt');
function verify(item){if(!/^scripts\/sandbox\/(?:learning-intelligence\/s16b61(?:fix1-.*|-(?:journey\.mjs|fixtures\/journeys_PRIVATE\.json|selftest\.mjs))|v37d2c7a3s16b61(?:fix1)?\/[^/]+)$/.test(item.path)||item.path.split('/').some(x=>x==='..'||x==='.'))throw Error('Invalid receipt file path '+item.path);
 const file=path.join(ROOT,item.path),st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink())throw Error('Nonregular stage file '+item.path);
 const b=fs.readFileSync(file);if(b.length!==item.bytes||sha(b)!==item.sha256)throw Error('S61-FIX1 changed file: '+item.path);}
for(const f of [...receipt.updates,...receipt.additions,...receipt.untouched_s61])verify(f);
const verifyS60=path.join(ROOT,'scripts/sandbox/v37d2c7a3s16b60/verify-v37d2c7a3s16b60.mjs');
const prior=execFileSync(process.execPath,[verifyS60],{cwd:ROOT,encoding:'utf8',timeout:100000,stdio:'pipe'});
if(!prior.includes('S60 VERIFY PASS'))throw Error('S60 predecessor verifier did not pass');
for(const item of [...receipt.updates,...receipt.additions].filter(x=>x.path.endsWith('.mjs'))){
 execFileSync(process.execPath,['--check',path.join(ROOT,item.path)],{cwd:ROOT,timeout:20000,stdio:'pipe'});
}
const check=(name,label)=>{const result=execFileSync(process.execPath,[path.join(ROOT,'scripts/sandbox/learning-intelligence',name)],{cwd:ROOT,encoding:'utf8',timeout:180000,stdio:'pipe'});if(!result.includes(label))throw Error(label+' absent');console.log(result.trim());};
check('s16b61-selftest.mjs','S61 SELFTEST PASS');check('s16b61fix1-selftest.mjs','S61-FIX1 SELFTEST PASS');
console.log('S61-FIX1 VERIFY PASS: S59/S60 unchanged, historical S61 provenance preserved, bounded context and evaluation tests pass; no real model/DB writes.');
