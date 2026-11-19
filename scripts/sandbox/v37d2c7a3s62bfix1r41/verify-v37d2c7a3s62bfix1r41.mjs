#!/usr/bin/env node
/** Add-only R4.1 verifier; pinned R4 predecessor, no legacy HTML tests. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const PREV=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r4-quality.mjs","bytes":13555,"sha256":"fe4c1af3712badc396f7eb9666276c4335f2ace4ab7d02a513a98218d4519f1f"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r4-journey.mjs","bytes":34722,"sha256":"e4c9e7d352705f7a060c96aaaeabacdace6ad87f845bf14f4d5137edc0449f1c"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r4-selftest.mjs","bytes":7838,"sha256":"729ae9662fea6c3315469850c6b8caf7d9d3b5e0e0dfab5fd882456e612a75bb"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r4-report.mjs","bytes":2193,"sha256":"53655e789e32e693dde54967a2e7ae47469a628545e91bd09f1e53d08d79ed27"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r4/README.md","bytes":428,"sha256":"63c713b4a3abc97282e3c7a478d66bec6104de3580e78cbde1e15df8618161cd"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r4/verify-v37d2c7a3s62bfix1r4.mjs","bytes":5411,"sha256":"1c5ff7a393ae47e4bf99c4472e081adaffdfed5ba8b94cdef59c4a53f67d1441"}];
const NEW=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r41-prompts.mjs","bytes":12925,"sha256":"c9d8a520e35c0ec8002fd3368f41680361be3ad3cd971a8935ae1562059d85b7"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r41-journey.mjs","bytes":33919,"sha256":"4800544778b49d6d64ef1a9b7fbf5d3da7a6074d9ae75c4b33fac498836624d9"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r41-compare.mjs","bytes":9909,"sha256":"6e3483d6d52377597b4122ef90e546e82d8829e37261936e6f134be4fb57fd9b"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r41-selftest.mjs","bytes":5214,"sha256":"e5aabcd83e35d6233df671fad8ac03954081f6c5bc806331b95ade348458e4a0"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r41-report.mjs","bytes":2204,"sha256":"7ec1f8a6700234b0a0292323965c0011581c8f1b176a0239cf0e619e5c1b650a"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r41/README.md","bytes":147,"sha256":"105049a8787bed1d6cb7a9221b8eb13a1576d77a8587f804ad10ea82030558d4"}];
const PVER={"path":"scripts/sandbox/v37d2c7a3s62bfix1r4/verify-v37d2c7a3s62bfix1r4.mjs","bytes":5411,"sha256":"1c5ff7a393ae47e4bf99c4472e081adaffdfed5ba8b94cdef59c4a53f67d1441"};
const SELF='scripts/sandbox/v37d2c7a3s62bfix1r41/verify-v37d2c7a3s62bfix1r41.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
function check(x){
 if(!/^scripts\/sandbox\/[A-Za-z0-9_./-]+$/.test(x.path)||x.path.includes('..'))throw Error('Unsafe source path');
 const file=path.resolve(root,x.path),s=fs.lstatSync(file);
 if(!file.startsWith(root+path.sep)||!s.isFile()||s.isSymbolicLink()||s.size!==x.bytes||sha(fs.readFileSync(file))!==x.sha256)throw Error('Pinned byte mismatch '+x.path);
 if(file.endsWith('.mjs'))execFileSync(process.execPath,['--check',file],{cwd:root,timeout:20000});
}
function equal(got,want,label){
 if(!Array.isArray(got)||got.length!==want.length||new Set(got.map(x=>x.path)).size!==want.length)throw Error(label+' receipt count');
 const map=new Map(got.map(x=>[x.path,x]));for(const x of want){const y=map.get(x.path);if(!y||y.bytes!==x.bytes||y.sha256!==x.sha256)throw Error(label+' receipt mismatch '+x.path);}
}
check(PVER);
const parent=execFileSync(process.execPath,[path.join(root,PVER.path),'--integrity-only'],{cwd:root,encoding:'utf8',timeout:90000});
if(!parent.includes('S62B-FIX1R4 INTEGRITY PASS'))throw Error('R4 integrity check not confirmed');
const old=read(path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1r4/installation.json'));
if(old.schema!=='myway_s62bfix1r4_receipt_v1'||old.stage!=='v37d2c7a3s62bfix1r4'||old.research_only!==true||old.database_writes!==0)throw Error('Invalid predecessor receipt');
equal(old.files,PREV,'R4');
const cur=read(path.join(here,'installation.json'));
if(cur.schema!=='myway_s62bfix1r41_receipt_v1'||cur.stage!=='v37d2c7a3s62bfix1r41'||cur.research_only!==true||cur.database_writes!==0||cur.files?.length!==NEW.length+1)throw Error('Invalid R4.1 receipt');
const raw=fs.readFileSync(fileURLToPath(import.meta.url)),self=cur.files.find(x=>x.path===SELF);
if(!self||self.bytes!==raw.length||self.sha256!==sha(raw))throw Error('Verifier receipt mismatch');
equal(cur.files.filter(x=>x.path!==SELF),NEW,'R4.1');
for(const x of NEW)check(x);
console.log('S62B-FIX1R41 INTEGRITY PASS | R4 pinned + R4.1 additive; no API/DB');
if(!process.argv.includes('--integrity-only')){
 const out=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62bfix1r41-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:150000});
 if(!out.includes('S62B-FIX1R4.1 SELFTEST PASS'))throw Error('New R4.1 selftest missing pass marker');
 console.log(out.trim());console.log('S62B-FIX1R41 VERIFY PASS | free 2+4 and prompt comparison; zero provider/DB calls');
}
