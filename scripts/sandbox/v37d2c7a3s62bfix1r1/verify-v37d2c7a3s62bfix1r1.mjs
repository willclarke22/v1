#!/usr/bin/env node
/** FIX1R1 v2 verifier: byte-pinned S62B + FIX1 + R1; do not rerun legacy HTML-writing tests. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const expectedR1=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r1-journey.mjs","bytes":21985,"sha256":"e0553f34ca856e659a1918f2d7a8b31e9cd75eba4219107a2f68abe81f99e968"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r1-report.mjs","bytes":2247,"sha256":"52d9e2e7cc9abae06c39e218848b797b9cfca0c893255377f6ec2d27665644d0"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r1-selftest.mjs","bytes":3256,"sha256":"e6a13dd52a55a6bcb4dfb7d66554e7baee714cd08c9dd9242856f4c10b30f32b"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r1/README.md","bytes":1840,"sha256":"2954a0ec83fa92a1519e603766b0352d69e818afc7c479f791da8cc0af7ba522"}];
const expectedFix1=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1-experience.mjs","bytes":15700,"sha256":"0b460e3dc92a5d62cf433d0408a2b0c61630f7efb88fab6da8b9e3143ad2c410"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1-inspector.mjs","bytes":2994,"sha256":"db5dd0ef4c1d963e6ecbbe1c4a2ac50e5d9e534aa88cf94b4e5fcdba74056ef6"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1-journey.mjs","bytes":21015,"sha256":"9b67a80c07465f751ed840e9b169146102714bb0d8f99047bd768b2421eebf63"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1-selftest.mjs","bytes":16283,"sha256":"fdde68a8dca3c5eb18420d19739e7c10157cc3c854f580b4e77d98277049c3cf"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1/README.md","bytes":1901,"sha256":"5249b630ed7bb42257b26fe654d3265db24de521077866e6ff0c6247193c610d"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1/verify-v37d2c7a3s62bfix1.mjs","bytes":3481,"sha256":"0a603dc788aab40f308a2e8b2d68accf0abc57653166807538a6da8c677568fa"}];
const expectedS62B=[{"path":"scripts/sandbox/learning-intelligence/s62b-core.mjs","bytes":11008,"sha256":"dbe10859895d6ee319dcd05daf3ad1e877bbe12ef4eb75d7447c940a2ff92b0b"},{"path":"scripts/sandbox/learning-intelligence/s62b-scenario.mjs","bytes":6155,"sha256":"6c74f19c19eba3f9ff4a12dc3b10e5b9cea7e8721e8c56883d1ac1910e4b5050"},{"path":"scripts/sandbox/learning-intelligence/s62b-retrieval.mjs","bytes":4322,"sha256":"5b9b83e857bf0b1ee9bc1d3bf7e2b953da326838893e212ecaca52711da6ae3f"},{"path":"scripts/sandbox/learning-intelligence/s62b-experience.mjs","bytes":12832,"sha256":"a1c19a8069cd0a10bd295dd6f264cee18111828eb2e406f33c86396444b6095c"},{"path":"scripts/sandbox/learning-intelligence/s62b-journey.mjs","bytes":20827,"sha256":"f75c9ae45ec39c99951e7977a7ac68460e316ff85f6a48bb11e1a6ea985d32a9"},{"path":"scripts/sandbox/learning-intelligence/s62b-inspector.mjs","bytes":2979,"sha256":"88345e9a95444521e37e1417384f544c3a65df713e5e82de101c4c99d76731b9"},{"path":"scripts/sandbox/learning-intelligence/s62b-selftest.mjs","bytes":8782,"sha256":"89067d5d0b2cd4808371f20b37f3eace3ed7c6ddbe31d19f4263e16eaaa1896d"},{"path":"scripts/sandbox/v37d2c7a3s62b/README.md","bytes":4082,"sha256":"78881b62c9d17b5c10768af351a58403413ae6d4258b7e18e7cfe2b09b89bbef"}];
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
function validateFiles(files,label){
 for(const entry of files){
  if(!/^scripts\/sandbox\/[A-Za-z0-9_./-]+$/.test(entry.path)||entry.path.includes('..')) throw Error('Unsafe '+label+' path '+entry.path);
  const absolute=path.resolve(root,entry.path),stat=fs.lstatSync(absolute);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==entry.bytes||crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')!==entry.sha256)throw Error('Changed '+label+' file '+entry.path);
  if(absolute.endsWith('.mjs'))execFileSync(process.execPath,['--check',absolute],{cwd:root,timeout:20000});
 }
}
function matchReceipt(list,reference,label){
 if(!Array.isArray(list)||list.length!==reference.length)throw Error(label+' receipt count mismatch');
 const matched=new Map(list.map(x=>[x.path,x]));
 for(const e of reference){const x=matched.get(e.path);if(!x||x.bytes!==e.bytes||x.sha256!==e.sha256)throw Error(label+' receipt hash mismatch '+e.path);}
}
const fix1Receipt=readJson(path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1/installation.json'));
if(fix1Receipt.schema!=='myway_s62bfix1_receipt_v1'||fix1Receipt.stage!=='v37d2c7a3s62bfix1'||fix1Receipt.research_only!==true||fix1Receipt.database_writes!==0)throw Error('Bad S62B-FIX1 receipt');
matchReceipt(fix1Receipt.files,expectedFix1,'FIX1');
const baseReceipt=readJson(path.join(root,'scripts/sandbox/v37d2c7a3s62b/installation.json'));
if(baseReceipt.schema!=='myway_s62b_additive_receipt_v1'||baseReceipt.version!=='v37d2c7a3s62b'||baseReceipt.research_only!==true||baseReceipt.database_writes!==0||baseReceipt.add_only!==true)throw Error('Bad S62B receipt');
matchReceipt(baseReceipt.additions,expectedS62B,'S62B');
validateFiles(expectedFix1,'FIX1');validateFiles(expectedS62B,'S62B');
const receipt=readJson(path.join(here,'installation.json'));
if(receipt.schema!=='myway_s62bfix1r1_receipt_v1'||receipt.stage!=='v37d2c7a3s62bfix1r1'||receipt.research_only!==true||receipt.database_writes!==0||receipt.files?.length!==expectedR1.length+1)throw Error('Bad R1 receipt');
const ownRelative='scripts/sandbox/v37d2c7a3s62bfix1r1/verify-v37d2c7a3s62bfix1r1.mjs';
const own=receipt.files.find(e=>e.path===ownRelative),bytes=fs.readFileSync(fileURLToPath(import.meta.url));
if(!own||own.bytes!==bytes.length||own.sha256!==crypto.createHash('sha256').update(bytes).digest('hex'))throw Error('R1 verifier receipt mismatch');
matchReceipt(receipt.files,[...expectedR1,own],'R1');validateFiles(expectedR1,'R1');
if(process.argv.includes('--integrity-only')){
 console.log('S62B-FIX1R1 INTEGRITY PASS | S62B/FIX1/R1 receipts, pinned hashes, source checks; no legacy integration tests or API/DB');
}else{
 const out=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62bfix1r1-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:180000});
 if(!out.includes('S62B-FIX1R1 SELFTEST PASS'))throw Error('R1 regressions did not pass');
 console.log(out.trim());
 console.log('S62B-FIX1R1 VERIFY PASS | pinned predecessor receipts and hashes; new R1 synthetic loop and deferred HTML; no API/DB');
}
