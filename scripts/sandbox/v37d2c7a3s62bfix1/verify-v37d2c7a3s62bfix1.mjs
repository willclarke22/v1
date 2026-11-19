#!/usr/bin/env node
/** S62B-FIX1 (additive) integrity verifier. No API, embeddings or DB calls. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const expected=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1-experience.mjs","bytes":15700,"sha256":"0b460e3dc92a5d62cf433d0408a2b0c61630f7efb88fab6da8b9e3143ad2c410"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1-inspector.mjs","bytes":2994,"sha256":"db5dd0ef4c1d963e6ecbbe1c4a2ac50e5d9e534aa88cf94b4e5fcdba74056ef6"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1-journey.mjs","bytes":21015,"sha256":"9b67a80c07465f751ed840e9b169146102714bb0d8f99047bd768b2421eebf63"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1-selftest.mjs","bytes":16283,"sha256":"fdde68a8dca3c5eb18420d19739e7c10157cc3c854f580b4e77d98277049c3cf"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1/README.md","bytes":1901,"sha256":"5249b630ed7bb42257b26fe654d3265db24de521077866e6ff0c6247193c610d"}];
const receiptPath=path.join(here,'installation.json');
if(!fs.existsSync(receiptPath))throw Error('Missing FIX1 installation receipt');
const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8').replace(/^\uFEFF/,''));
if(receipt.schema!=='myway_s62bfix1_receipt_v1'||receipt.stage!=='v37d2c7a3s62bfix1'||receipt.research_only!==true||receipt.database_writes!==0||receipt.files?.length!==expected.length+1)throw Error('Invalid FIX1 receipt');
const want=new Map(expected.map(x=>[x.path,x]));
for(const item of receipt.files){if(item.path==='scripts/sandbox/v37d2c7a3s62bfix1/verify-v37d2c7a3s62bfix1.mjs')continue;const exp=want.get(item.path);if(!exp||item.bytes!==exp.bytes||item.sha256!==exp.sha256)throw Error('FIX1 receipt mismatch: '+item.path);}
const own=receipt.files.find(x=>x.path==='scripts/sandbox/v37d2c7a3s62bfix1/verify-v37d2c7a3s62bfix1.mjs');if(!own)throw Error('Verifier missing in receipt');
const ownBytes=fs.readFileSync(fileURLToPath(import.meta.url));if(own.bytes!==ownBytes.length||crypto.createHash('sha256').update(ownBytes).digest('hex')!==own.sha256)throw Error('Verifier hash mismatch with receipt');
for(const item of expected){
 const file=path.join(root,item.path),st=fs.lstatSync(file),sha=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(!st.isFile()||st.isSymbolicLink()||st.size!==item.bytes||sha!==item.sha256)throw Error('FIX1 installed bytes differ: '+item.path);
 if(file.endsWith('.mjs'))execFileSync(process.execPath,['--check',file],{cwd:root,timeout:20000});
}
const predecessor=path.join(root,'scripts/sandbox/v37d2c7a3s62b/verify-v37d2c7a3s62b.mjs');
const baselineOutput=execFileSync(process.execPath,[predecessor],{cwd:root,encoding:'utf8',timeout:180000});
if(!baselineOutput.includes('S62B VERIFY PASS'))throw Error('S62B predecessor verification not confirmed');
const testFile=path.join(root,'scripts/sandbox/learning-intelligence/s62bfix1-selftest.mjs');
const output=execFileSync(process.execPath,[testFile],{cwd:root,encoding:'utf8',timeout:180000});
if(!output.includes('S62B-FIX1 SELFTEST PASS'))throw Error('FIX1 regression tests missing pass marker');
console.log(output.trim());
console.log('S62B-FIX1 VERIFY PASS | pinned sources, original S62B, instrumented attempts, replay, mock-model loop; no API/DB');
