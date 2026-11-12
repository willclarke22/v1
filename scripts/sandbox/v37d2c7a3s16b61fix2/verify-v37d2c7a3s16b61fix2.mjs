#!/usr/bin/env node
/** Read-only S61-FIX2 verification. Never calls an API, modifies memory, or writes to DB. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../..');
const receipt=JSON.parse(fs.readFileSync(path.join(HERE,'installation.json'),'utf8'));
if(receipt.schema!=='myway_s61fix2_additive_receipt_v1'||receipt.version!=='v37d2c7a3s16b61fix2'||receipt.research_only!==true||receipt.database_writes!==0||receipt.additions?.length!==4)throw Error('Wrong FIX2 receipt');
for(const item of receipt.additions){
 if(!/^scripts\/sandbox\/(?:learning-intelligence\/s16b61fix2-(?:review|selftest)\.mjs|v37d2c7a3s16b61fix2\/(?:README\.md|installation\.json|verify-v37d2c7a3s16b61fix2\.mjs))$/.test(item.path))throw Error('Unexpected path in FIX2 receipt');
 const file=path.join(ROOT,item.path),st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink())throw Error('Not a regular FIX2 file: '+item.path);
 if(st.size!==item.bytes||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==item.sha256)throw Error('FIX2 source changed: '+item.path);
 if(item.path.endsWith('.mjs'))execFileSync(process.execPath,['--check',file],{cwd:ROOT,timeout:20000});
}
const predecessor=execFileSync(process.execPath,[path.join(ROOT,'scripts/sandbox/v37d2c7a3s16b61fix1/verify-v37d2c7a3s16b61fix1.mjs')],{cwd:ROOT,encoding:'utf8',timeout:240000});
if(!predecessor.includes('S61-FIX1 VERIFY PASS'))throw Error('FIX1 baseline verifier did not pass');
const selftest=execFileSync(process.execPath,[path.join(ROOT,'scripts/sandbox/learning-intelligence/s16b61fix2-selftest.mjs')],{cwd:ROOT,encoding:'utf8',timeout:90000});
if(!selftest.includes('S61-FIX2 SELFTEST PASS'))throw Error('S61-FIX2 selftest did not pass');
console.log(selftest.trim());console.log('S61-FIX2 VERIFY PASS: all earlier stage sources remain pinned; reviewer evidence coverage, resumability, integrity and safe scoring tested offline; no API/DB writes.');
