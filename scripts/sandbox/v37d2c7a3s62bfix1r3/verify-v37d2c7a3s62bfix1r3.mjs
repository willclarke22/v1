#!/usr/bin/env node
/** R3 research verifier: pinned R2 installation integrity and R3 add-only source hashes.
 * Offline selftest only; NO API/embedding/DB and NO predecessor HTML selftests.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const R3_PINNED=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r3-evidence.mjs","bytes":9442,"sha256":"0607c8dd590cd890886ff7cea3be7cb2cc0f1242294770d7c11e0390b567b050"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r3-journey.mjs","bytes":30445,"sha256":"c00c7dcddcf6ce21d1d5b9ed7b9f1c1402c0ce87072bfbe2bff99361801577ac"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r3-report.mjs","bytes":2193,"sha256":"d46fc445b4f310a9801e067675efee28c693c63ff0f0e46d9f7718d9c266ecd0"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r3-retrieval.mjs","bytes":5376,"sha256":"7e1758c7cc8fb5f07992d8a029160fb1e587408a35db169a119a30b972ee38ba"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r3-selftest.mjs","bytes":9000,"sha256":"04eee14d2eb924760911d64e77d6bc2b6152ff79f010c35759ad94b352c3eb4f"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r3/README.md","bytes":1291,"sha256":"063d1b05ba3b0c4377479c4f87c03dae8ee6018e9bf7cdff17e94ee7bb2de4db"}];
const R2_PINNED=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r2-core.mjs","bytes":4053,"sha256":"f7a89a3c6c9ecbb28d356aba600e7eea3244e402178bb6480ed0c99c76417874"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r2-experience.mjs","bytes":4779,"sha256":"77e4ca1935f330e974835c6b076cdf6abcad0b599f59f8454bda7aa5333feea3"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r2-journey.mjs","bytes":25261,"sha256":"42ca5ee48e4a8eaf25027513a5b092012c9138968e183d97d856fc557d6398d8"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r2-report.mjs","bytes":2193,"sha256":"0020b9032521d4c00bd3909f2df0eca1530b82b9069ca10e30f60f939203bf6a"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r2-selftest.mjs","bytes":8900,"sha256":"db72b8a2d9518893d3fd0f3b73360655435c32f04c8b64cdeea7cce6c5c4672d"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r2/README.md","bytes":755,"sha256":"cdb95f20b1e6314ab32857fd3b317bbc11b7479bbd7c10a568c3bdc4c2cc340b"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r2/verify-v37d2c7a3s62bfix1r2.mjs","bytes":5648,"sha256":"ec3308a854d960167dc93c138e689fb54eac63b82092675641d4725b74dbcec2"}];
const R2_VERIFIER={"path":"scripts/sandbox/v37d2c7a3s62bfix1r2/verify-v37d2c7a3s62bfix1r2.mjs","bytes":5648,"sha256":"ec3308a854d960167dc93c138e689fb54eac63b82092675641d4725b74dbcec2"};
const SELF="scripts/sandbox/v37d2c7a3s62bfix1r3/verify-v37d2c7a3s62bfix1r3.mjs";
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function fileCheck(item,label){
 if(!/^scripts\/sandbox\/[A-Za-z0-9_./-]+$/.test(item.path)||item.path.includes('..'))throw Error('Unsafe '+label+' file');
 const f=path.resolve(root,item.path),st=fs.lstatSync(f);
 if(!st.isFile()||st.isSymbolicLink()||st.size!==item.bytes||digest(fs.readFileSync(f))!==item.sha256)throw Error('Changed '+label+': '+item.path);
 if(f.endsWith('.mjs'))execFileSync(process.execPath,['--check',f],{cwd:root,timeout:20000});
}
function receiptMatches(got,want,label){
 if(!Array.isArray(got)||got.length!==want.length||new Set(got.map(x=>x.path)).size!==want.length)throw Error(label+' receipt file set invalid');
 const map=new Map(got.map(x=>[x.path,x]));
 for(const e of want){const r=map.get(e.path);if(!r||r.bytes!==e.bytes||r.sha256!==e.sha256)throw Error(label+' receipt mismatched: '+e.path);}
}
fileCheck(R2_VERIFIER,'R2 predecessor verifier');
const predecessor=execFileSync(process.execPath,[path.join(root,R2_VERIFIER.path),'--integrity-only'],{cwd:root,encoding:'utf8',timeout:90000});
if(!predecessor.includes('S62B-FIX1R2 INTEGRITY PASS'))throw Error('R2 integrity-only confirmation missing');
const r2Receipt=readJson(path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1r2/installation.json'));
if(r2Receipt.schema!=='myway_s62bfix1r2_receipt_v1'||r2Receipt.stage!=='v37d2c7a3s62bfix1r2'||r2Receipt.research_only!==true||r2Receipt.database_writes!==0)throw Error('Bad R2 receipt');
receiptMatches(r2Receipt.files,R2_PINNED,'R2');
const receipt=readJson(path.join(here,'installation.json'));
if(receipt.schema!=='myway_s62bfix1r3_receipt_v1'||receipt.stage!=='v37d2c7a3s62bfix1r3'||receipt.research_only!==true||receipt.database_writes!==0||receipt.files?.length!==R3_PINNED.length+1)throw Error('Bad R3 receipt');
const own=fs.readFileSync(fileURLToPath(import.meta.url)),self=receipt.files.find(x=>x.path===SELF);
if(!self||self.bytes!==own.length||self.sha256!==digest(own))throw Error('R3 verifier hash/receipt mismatch');
receiptMatches(receipt.files.filter(x=>x.path!==SELF),R3_PINNED,'R3');
for(const e of R3_PINNED)fileCheck(e,'R3');
console.log('S62B-FIX1R3 INTEGRITY PASS | pinned R2 and R3, receipts/source checked; no older selftests or API/DB');
if(!process.argv.includes('--integrity-only')){
 const test=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62bfix1r3-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:150000});
 if(!test.includes('S62B-FIX1R3 SELFTEST PASS'))throw Error('R3 offline selftest failed');
 console.log(test.trim());
 console.log('S62B-FIX1R3 VERIFY PASS | semantic cache/resume, event intent, failed-tech memory, offline simulated A/B/X/L; no API/DB');
}
