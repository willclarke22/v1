#!/usr/bin/env node
/** S62B R4 research verifier: pinned R3 receipt and new R4 additive content.
 * Runs only the NEW R4 offline injected-vector tests, not old HTML writer tests.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const R4_PINNED=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r4-quality.mjs","bytes":13555,"sha256":"fe4c1af3712badc396f7eb9666276c4335f2ace4ab7d02a513a98218d4519f1f"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r4-journey.mjs","bytes":34722,"sha256":"e4c9e7d352705f7a060c96aaaeabacdace6ad87f845bf14f4d5137edc0449f1c"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r4-selftest.mjs","bytes":7838,"sha256":"729ae9662fea6c3315469850c6b8caf7d9d3b5e0e0dfab5fd882456e612a75bb"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r4-report.mjs","bytes":2193,"sha256":"53655e789e32e693dde54967a2e7ae47469a628545e91bd09f1e53d08d79ed27"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r4/README.md","bytes":428,"sha256":"63c713b4a3abc97282e3c7a478d66bec6104de3580e78cbde1e15df8618161cd"}];
const R3_PINNED=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r3-evidence.mjs","bytes":9442,"sha256":"0607c8dd590cd890886ff7cea3be7cb2cc0f1242294770d7c11e0390b567b050"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r3-journey.mjs","bytes":30445,"sha256":"c00c7dcddcf6ce21d1d5b9ed7b9f1c1402c0ce87072bfbe2bff99361801577ac"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r3-report.mjs","bytes":2193,"sha256":"d46fc445b4f310a9801e067675efee28c693c63ff0f0e46d9f7718d9c266ecd0"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r3-retrieval.mjs","bytes":5376,"sha256":"7e1758c7cc8fb5f07992d8a029160fb1e587408a35db169a119a30b972ee38ba"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r3-selftest.mjs","bytes":9000,"sha256":"04eee14d2eb924760911d64e77d6bc2b6152ff79f010c35759ad94b352c3eb4f"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r3/README.md","bytes":1291,"sha256":"063d1b05ba3b0c4377479c4f87c03dae8ee6018e9bf7cdff17e94ee7bb2de4db"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r3/verify-v37d2c7a3s62bfix1r3.mjs","bytes":5670,"sha256":"9a683372957e835805b2cbf213a404988649778ff6cadcf7be4aa257f255f141"}];
const R3_VERIFIER={"path":"scripts/sandbox/v37d2c7a3s62bfix1r3/verify-v37d2c7a3s62bfix1r3.mjs","bytes":5670,"sha256":"9a683372957e835805b2cbf213a404988649778ff6cadcf7be4aa257f255f141"};
const SELF="scripts/sandbox/v37d2c7a3s62bfix1r4/verify-v37d2c7a3s62bfix1r4.mjs";
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function check(p,label){
 if(!/^scripts\/sandbox\/[A-Za-z0-9_./-]+$/.test(p.path)||p.path.includes('..'))throw Error('Unsafe path '+label);
 const file=path.resolve(root,p.path),s=fs.lstatSync(file);
 if(!s.isFile()||s.isSymbolicLink()||s.size!==p.bytes||digest(fs.readFileSync(file))!==p.sha256)throw Error('Pinned byte mismatch '+label+': '+p.path);
 if(file.endsWith('.mjs'))execFileSync(process.execPath,['--check',file],{cwd:root,timeout:20000});
}
function same(got,want,label){
 if(!Array.isArray(got)||got.length!==want.length||new Set(got.map(x=>x.path)).size!==want.length)throw Error(label+' receipt count mismatch');
 const map=new Map(got.map(x=>[x.path,x]));
 for(const e of want){const r=map.get(e.path);if(!r||r.bytes!==e.bytes||r.sha256!==e.sha256)throw Error(label+' receipt mismatched: '+e.path);}
}
check(R3_VERIFIER,'R3 verifier');
const r3=execFileSync(process.execPath,[path.join(root,R3_VERIFIER.path),'--integrity-only'],{cwd:root,encoding:'utf8',timeout:90000});
if(!r3.includes('S62B-FIX1R3 INTEGRITY PASS'))throw Error('R3 predecessor integrity-only confirmation missing');
const r3Receipt=readJson(path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1r3/installation.json'));
if(r3Receipt.schema!=='myway_s62bfix1r3_receipt_v1'||r3Receipt.stage!=='v37d2c7a3s62bfix1r3'||r3Receipt.research_only!==true||r3Receipt.database_writes!==0)throw Error('Bad R3 receipt');
same(r3Receipt.files,R3_PINNED,'R3');
const receipt=readJson(path.join(here,'installation.json'));
if(receipt.schema!=='myway_s62bfix1r4_receipt_v1'||receipt.stage!=='v37d2c7a3s62bfix1r4'||receipt.research_only!==true||receipt.database_writes!==0||receipt.files?.length!==R4_PINNED.length+1)throw Error('Bad R4 receipt');
const own=fs.readFileSync(fileURLToPath(import.meta.url)),self=receipt.files.find(x=>x.path===SELF);
if(!self||self.bytes!==own.length||self.sha256!==digest(own))throw Error('R4 verifier receipt/hash mismatch');
same(receipt.files.filter(x=>x.path!==SELF),R4_PINNED,'R4');
for(const p of R4_PINNED)check(p,'R4');
console.log('S62B-FIX1R4 INTEGRITY PASS | R3 predecessor and R4 additive pinned; no API/DB');
if(!process.argv.includes('--integrity-only')){
 const out=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62bfix1r4-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:150000});
 if(!out.includes('S62B-FIX1R4 SELFTEST PASS'))throw Error('R4 synthetic selftest failed');
 console.log(out.trim());
 console.log('S62B-FIX1R4 VERIFY PASS | offline guided 2+4 continuation, no-activity, factual evidence, unscored fidelity; 0 API/DB');
}
