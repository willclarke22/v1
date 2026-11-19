#!/usr/bin/env node
/** FIX5 add-only integrity verifier; no paid/model/database calls except explicit runner. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const PREV=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix4-audit.mjs","bytes":22775,"sha256":"e6b066e6092efc631b2075ab4b069065da31ad80c3db0b74574fc7a5badfdf93"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix4-selftest.mjs","bytes":1571,"sha256":"4bf687342eddd342a0d1e129fef491d156402b5d9d05d2624d3b61e98724f996"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r42fix4/verify-v37d2c7a3s62bfix1r42fix4.mjs","bytes":4127,"sha256":"1f8d008809c90f123ea03bfa1e4eeff9530087baf6b7a627cc39b35f06cbb70f"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r3-retrieval.mjs","bytes":5376,"sha256":"7e1758c7cc8fb5f07992d8a029160fb1e587408a35db169a119a30b972ee38ba"}];
const NEW=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix5-evaluate.mjs","bytes":22895,"sha256":"214cf607a32adf03f3da988cd8ebb66975256d254707aa9e53edd199adfd8b7b"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix5-selftest.mjs","bytes":2272,"sha256":"0e53305dceaa7f3dba4de3b6e57a6f63232fd03a3e89046ed5d060671a90604d"}];
const SELF='scripts/sandbox/v37d2c7a3s62bfix1r42fix5/verify-v37d2c7a3s62bfix1r42fix5.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function check(e){
 if(!/^scripts\/sandbox\/[A-Za-z0-9_./-]+$/.test(e.path)||e.path.includes('..'))throw Error('Unsafe file path '+e.path);
 const p=path.resolve(root,e.path),st=fs.lstatSync(p);
 if(!p.startsWith(root+path.sep)||!st.isFile()||st.isSymbolicLink()||st.size!==e.bytes||hash(fs.readFileSync(p))!==e.sha256)throw Error('Pinned file changed: '+e.path);
 if(p.endsWith('.mjs'))execFileSync(process.execPath,['--check',p],{cwd:root,timeout:30000});
}
for(const e of PREV)check(e);
const prevReceipt=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1r42fix4/installation.json'),'utf8'));
if(prevReceipt.schema!=='myway_s62bfix1r42fix4_receipt_v1'||prevReceipt.research_only!==true||prevReceipt.database_writes!==0)throw Error('FIX4 receipt invalid');
for(const e of PREV.filter(x=>x.path.includes('fix4')) ){if(!prevReceipt.files.some(x=>x.path===e.path&&x.sha256===e.sha256&&x.bytes===e.bytes)){if(!e.path.includes('verify-'))throw Error('FIX4 receipt mismatch '+e.path);}}
const prev=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1r42fix4/verify-v37d2c7a3s62bfix1r42fix4.mjs'),'--integrity-only'],{cwd:root,encoding:'utf8',timeout:90000});
if(!prev.includes('S62B-FIX1R42FIX4 INTEGRITY PASS'))throw Error('FIX4 integrity check failed');
const receipt=JSON.parse(fs.readFileSync(path.join(here,'installation.json'),'utf8'));
if(receipt.schema!=='myway_s62bfix1r42fix5_receipt_v1'||receipt.stage!=='v37d2c7a3s62bfix1r42fix5'||receipt.research_only!==true||receipt.database_writes!==0||receipt.files?.length!==NEW.length+1)throw Error('FIX5 receipt invalid');
const self=receipt.files.find(x=>x.path===SELF),source=fs.readFileSync(fileURLToPath(import.meta.url));
if(!self||self.bytes!==source.length||self.sha256!==hash(source))throw Error('FIX5 self integrity failed');
for(const e of NEW){const found=receipt.files.find(x=>x.path===e.path);if(!found||found.bytes!==e.bytes||found.sha256!==e.sha256)throw Error('FIX5 receipt mismatch '+e.path);check(e);}
console.log('S62B-FIX1R42FIX5 INTEGRITY PASS | pinned FIX4, add-only; no provider/DB');
if(!process.argv.includes('--integrity-only')){
 const t=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62bfix1r42fix5-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:180000});
 if(!t.includes('S62B-FIX1R42FIX5 SELFTEST PASS'))throw Error('FIX5 offline selftest failed');
 console.log(t.trim());console.log('S62B-FIX1R42FIX5 VERIFY PASS');
}
