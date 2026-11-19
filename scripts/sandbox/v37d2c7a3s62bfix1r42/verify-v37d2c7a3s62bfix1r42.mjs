#!/usr/bin/env node
/** R4.2 add-only SHA integrity and FREE regression; no production DB. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const PREV=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r41-prompts.mjs","bytes":12925,"sha256":"c9d8a520e35c0ec8002fd3368f41680361be3ad3cd971a8935ae1562059d85b7"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r41-journey.mjs","bytes":33919,"sha256":"4800544778b49d6d64ef1a9b7fbf5d3da7a6074d9ae75c4b33fac498836624d9"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r41-compare.mjs","bytes":9909,"sha256":"6e3483d6d52377597b4122ef90e546e82d8829e37261936e6f134be4fb57fd9b"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r41-selftest.mjs","bytes":5214,"sha256":"e5aabcd83e35d6233df671fad8ac03954081f6c5bc806331b95ade348458e4a0"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r41-report.mjs","bytes":2204,"sha256":"7ec1f8a6700234b0a0292323965c0011581c8f1b176a0239cf0e619e5c1b650a"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r41/README.md","bytes":147,"sha256":"105049a8787bed1d6cb7a9221b8eb13a1576d77a8587f804ad10ea82030558d4"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r41/verify-v37d2c7a3s62bfix1r41.mjs","bytes":5132,"sha256":"bc69ce7d9d5805614dbaf642f65fb621c0c66784a333ebf3042fdadd6032a77b"}];
const NEW=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42-challenges.mjs","bytes":6056,"sha256":"349ffc67ce5a83a0a467667cf064375231137c0cc72a2aa6f5323fe5072936ef"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42-contracts.mjs","bytes":4160,"sha256":"7fc3c22253281521a17c141a954b086cc21172e35a8e87ed3e1caafb8e78176b"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42-runtime.mjs","bytes":41243,"sha256":"52d3014bbbdc2b35bb385619c160eea59ca9cdda07161ee556cd6c6093ddad64"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42-selftest.mjs","bytes":5521,"sha256":"5e44eb9518674b54cba56b2f6ae972ea346853c68bd35fc3adbea8dddb5af1cc"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42-topics.mjs","bytes":3099,"sha256":"31d3f559e085d68cd91c62f985fab1d0a5f5ee2487abe89b3d6f94e203602a4f"}];
const SELF="scripts/sandbox/v37d2c7a3s62bfix1r42/verify-v37d2c7a3s62bfix1r42.mjs";
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function check(e){
 if(!/^scripts\/sandbox\/[A-Za-z0-9_./-]+$/.test(e.path)||e.path.includes('..'))throw Error('Unsafe relative path '+e.path);
 const target=path.resolve(root,e.path),stat=fs.lstatSync(target);
 if(!target.startsWith(root+path.sep)||!stat.isFile()||stat.isSymbolicLink()||stat.size!==e.bytes||sha(fs.readFileSync(target))!==e.sha256)throw Error('Pinned byte mismatch '+e.path);
 if(target.endsWith('.mjs'))execFileSync(process.execPath,['--check',target],{cwd:root,timeout:30000});
}
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
function equal(actual,expected,label){
 if(!Array.isArray(actual)||actual.length!==expected.length||new Set(actual.map(x=>x.path)).size!==expected.length)throw Error(label+' receipt entries mismatch');
 const map=new Map(actual.map(x=>[x.path,x]));for(const e of expected){const got=map.get(e.path);if(!got||got.bytes!==e.bytes||got.sha256!==e.sha256)throw Error(label+' receipt mismatch '+e.path);}
}
for(const e of PREV)check(e);
const oldReceipt=read(path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1r41/installation.json'));
if(oldReceipt.schema!=='myway_s62bfix1r41_receipt_v1'||oldReceipt.stage!=='v37d2c7a3s62bfix1r41'||oldReceipt.research_only!==true||oldReceipt.database_writes!==0)throw Error('Invalid R4.1 installed receipt');
equal(oldReceipt.files,PREV,'R4.1');
const oldVerifier=path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1r41/verify-v37d2c7a3s62bfix1r41.mjs');
const prevOutput=execFileSync(process.execPath,[oldVerifier,'--integrity-only'],{cwd:root,encoding:'utf8',timeout:90000});
if(!prevOutput.includes('S62B-FIX1R41 INTEGRITY PASS'))throw Error('R4.1 integrity pass not confirmed');
const r=read(path.join(here,'installation.json'));
if(r.schema!=='myway_s62bfix1r42_receipt_v1'||r.stage!=='v37d2c7a3s62bfix1r42'||r.research_only!==true||r.database_writes!==0||r.files?.length!==NEW.length+1)throw Error('Invalid R4.2 installed receipt');
const raw=fs.readFileSync(fileURLToPath(import.meta.url)),self=r.files.find(x=>x.path===SELF);
if(!self||self.bytes!==raw.length||self.sha256!==sha(raw))throw Error('R4.2 verifier not pinned in receipt');
equal(r.files.filter(x=>x.path!==SELF),NEW,'R4.2');
for(const e of NEW)check(e);
console.log('S62B-FIX1R42 INTEGRITY PASS | R4.1 pinned and R4.2 add-only; no provider or DB');
if(!process.argv.includes('--integrity-only')){
 const runner=path.join(root,'scripts/sandbox/learning-intelligence/s62bfix1r42-selftest.mjs');
 const out=execFileSync(process.execPath,[runner],{cwd:root,encoding:'utf8',timeout:180000});
 if(!out.includes('S62B-FIX1R4.2 SELFTEST PASS'))throw Error('R4.2 selftest did not pass');
 console.log(out.trim());console.log('S62B-FIX1R42 VERIFY PASS | no provider calls, add-only research');
}
