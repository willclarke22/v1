#!/usr/bin/env node
/** FIX3 read-only verification: predecessor stays intact; no paid or database calls. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const receipt=JSON.parse(fs.readFileSync(path.join(here,'installation.json'),'utf8'));
if(receipt.schema!=='myway_s61fix3_additive_receipt_v1'||receipt.version!=='v37d2c7a3s16b61fix3'||receipt.research_only!==true||receipt.database_writes!==0||receipt.additions?.length!==4)throw Error('Wrong FIX3 receipt');
const allowed=/^scripts\/sandbox\/(?:learning-intelligence\/s16b61fix3-(?:compare|selftest)\.mjs|v37d2c7a3s16b61fix3\/(?:README\.md|verify-v37d2c7a3s16b61fix3\.mjs))$/;
for(const item of receipt.additions){
 if(!allowed.test(item.path))throw Error('Unexpected FIX3 file');
 const p=path.join(root,item.path),s=fs.lstatSync(p),b=fs.readFileSync(p);
 if(!s.isFile()||s.isSymbolicLink()||s.size!==item.bytes||crypto.createHash('sha256').update(b).digest('hex')!==item.sha256)throw Error('FIX3 source drift: '+item.path);
 if(item.path.endsWith('.mjs'))execFileSync(process.execPath,['--check',p],{cwd:root,timeout:20000});
}
const predecessor=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/v37d2c7a3s16b61fix2/verify-v37d2c7a3s16b61fix2.mjs')],{cwd:root,encoding:'utf8',timeout:240000});
if(!predecessor.includes('S61-FIX2 VERIFY PASS'))throw Error('FIX2 predecessor verifier failed');
const selftest=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s16b61fix3-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:90000});
if(!selftest.includes('S61-FIX3 SELFTEST PASS'))throw Error('FIX3 selftest failed');
console.log(selftest.trim());
console.log('S61-FIX3 VERIFY PASS: S59/S60/S61/FIX1/FIX2 preserved; matched frozen model assessment and evidence worksheet tested; no API/DB calls.');
