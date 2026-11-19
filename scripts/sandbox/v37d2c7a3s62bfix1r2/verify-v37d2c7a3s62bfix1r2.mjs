#!/usr/bin/env node
/** S62B-FIX1R2 add-only research verifier: predecessor R1 v2 integrity-only + R2 hashes.
 * No real model, embedding or DB calls. Old FIX1 HTML-writing selftests never invoked.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const R2_PINNED=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r2-core.mjs","bytes":4053,"sha256":"f7a89a3c6c9ecbb28d356aba600e7eea3244e402178bb6480ed0c99c76417874"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r2-experience.mjs","bytes":4779,"sha256":"77e4ca1935f330e974835c6b076cdf6abcad0b599f59f8454bda7aa5333feea3"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r2-journey.mjs","bytes":25261,"sha256":"42ca5ee48e4a8eaf25027513a5b092012c9138968e183d97d856fc557d6398d8"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r2-report.mjs","bytes":2193,"sha256":"0020b9032521d4c00bd3909f2df0eca1530b82b9069ca10e30f60f939203bf6a"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r2-selftest.mjs","bytes":8900,"sha256":"db72b8a2d9518893d3fd0f3b73360655435c32f04c8b64cdeea7cce6c5c4672d"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r2/README.md","bytes":755,"sha256":"cdb95f20b1e6314ab32857fd3b317bbc11b7479bbd7c10a568c3bdc4c2cc340b"}];
const R1_PINNED=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r1-journey.mjs","bytes":21985,"sha256":"e0553f34ca856e659a1918f2d7a8b31e9cd75eba4219107a2f68abe81f99e968"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r1-report.mjs","bytes":2247,"sha256":"52d9e2e7cc9abae06c39e218848b797b9cfca0c893255377f6ec2d27665644d0"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r1-selftest.mjs","bytes":3256,"sha256":"e6a13dd52a55a6bcb4dfb7d66554e7baee714cd08c9dd9242856f4c10b30f32b"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r1/README.md","bytes":1840,"sha256":"2954a0ec83fa92a1519e603766b0352d69e818afc7c479f791da8cc0af7ba522"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r1/verify-v37d2c7a3s62bfix1r1.mjs","bytes":6449,"sha256":"8f34439e397c2900eb5c3ee5837855e5de50bf733926b4ea4ad3ad8b3d1fc52e"}];
const R1_VERIFIER={"path":"scripts/sandbox/v37d2c7a3s62bfix1r1/verify-v37d2c7a3s62bfix1r1.mjs","bytes":6449,"sha256":"8f34439e397c2900eb5c3ee5837855e5de50bf733926b4ea4ad3ad8b3d1fc52e"};
function digest(x){return crypto.createHash('sha256').update(x).digest('hex');}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
function checkFile(item,label){
 if(!/^scripts\/sandbox\/[A-Za-z0-9_./-]+$/.test(item.path)||item.path.includes('..'))throw Error('Unsafe '+label+' path: '+item.path);
 const file=path.resolve(root,item.path),st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size!==item.bytes||digest(fs.readFileSync(file))!==item.sha256)throw Error('Changed '+label+' file: '+item.path);
 if(file.endsWith('.mjs'))execFileSync(process.execPath,['--check',file],{cwd:root,timeout:20000});
}
function receiptMatches(receiptItems,expected,label){
 if(!Array.isArray(receiptItems)||receiptItems.length!==expected.length)throw Error(label+' receipt file count mismatch');
 const m=new Map(receiptItems.map(x=>[x.path,x]));
 for(const e of expected){const r=m.get(e.path);if(!r||r.bytes!==e.bytes||r.sha256!==e.sha256)throw Error(label+' receipt file mismatch: '+e.path);}
}
// The R1 v2 verifier is pinned, and is invoked INTEGRITY-ONLY so legacy HTML-writing
// predecessor tests are never executed during R2 installation or a normal R2 launch.
checkFile(R1_VERIFIER,'R1 predecessor verifier');
const predecessor=execFileSync(process.execPath,[path.join(root,R1_VERIFIER.path),'--integrity-only'],{cwd:root,encoding:'utf8',timeout:90000});
if(!predecessor.includes('S62B-FIX1R1 INTEGRITY PASS'))throw Error('R1 pinned integrity confirmation missing');
const r1Receipt=readJson(path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1r1/installation.json'));
if(r1Receipt.schema!=='myway_s62bfix1r1_receipt_v1'||r1Receipt.stage!=='v37d2c7a3s62bfix1r1'||r1Receipt.research_only!==true||r1Receipt.database_writes!==0)throw Error('Bad R1 installation receipt');
receiptMatches(r1Receipt.files,R1_PINNED,'R1');
const receipt=readJson(path.join(here,'installation.json'));
if(receipt.schema!=='myway_s62bfix1r2_receipt_v1'||receipt.stage!=='v37d2c7a3s62bfix1r2'||receipt.research_only!==true||receipt.database_writes!==0||receipt.files?.length!==R2_PINNED.length+1)throw Error('Bad R2 installation receipt');
const selfPath='scripts/sandbox/v37d2c7a3s62bfix1r2/verify-v37d2c7a3s62bfix1r2.mjs';
const self=receipt.files.find(x=>x.path===selfPath),own=fs.readFileSync(fileURLToPath(import.meta.url));
if(!self||self.bytes!==own.length||self.sha256!==digest(own))throw Error('R2 verifier hash mismatch with receipt');
receiptMatches(receipt.files.filter(x=>x.path!==selfPath),R2_PINNED,'R2');
for(const e of R2_PINNED)checkFile(e,'R2');
console.log('S62B-FIX1R2 INTEGRITY PASS | pinned R1 v2 and R2, receipts/source checked; no old HTML tests or API/DB');
if(!process.argv.includes('--integrity-only')){
 const selftest=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62bfix1r2-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:90000});
 if(!selftest.includes('S62B-FIX1R2 SELFTEST PASS'))throw Error('New R2 regression selftest did not pass');
 console.log(selftest.trim());
 console.log('S62B-FIX1R2 VERIFY PASS | assessment/memory independence, bounded technical repair, end-to-end mock trace, no API/DB');
}
