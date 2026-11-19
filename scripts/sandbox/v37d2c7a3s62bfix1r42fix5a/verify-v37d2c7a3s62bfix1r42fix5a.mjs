#!/usr/bin/env node
/** FIX5A pinned integrity and selftest; never calls providers. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const PREV=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix5-evaluate.mjs","bytes":22895,"sha256":"214cf607a32adf03f3da988cd8ebb66975256d254707aa9e53edd199adfd8b7b"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix5-selftest.mjs","bytes":2272,"sha256":"0e53305dceaa7f3dba4de3b6e57a6f63232fd03a3e89046ed5d060671a90604d"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r42fix5/verify-v37d2c7a3s62bfix1r42fix5.mjs","bytes":4068,"sha256":"4795043d93264f283a0f0c715ebc4578f7c92a32c18b94b060b2c846d210dba1"}];
const NEW=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix5a-evaluate.mjs","bytes":22922,"sha256":"ed108f090aaf99136501528812d5f4b6fb4b7a4e6318b941160fda44bbdf6185"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix5a-selftest.mjs","bytes":3752,"sha256":"c2f1db98cb058b4f64bf962a9887c6509e4a450c977ffdf402a0b5bdcd6160f9"}];
const SELF="scripts/sandbox/v37d2c7a3s62bfix1r42fix5a/verify-v37d2c7a3s62bfix1r42fix5a.mjs";
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function check(e){
 if(!/^scripts\/sandbox\/[A-Za-z0-9_./-]+$/.test(e.path)||e.path.includes('..'))throw Error('Unsafe file path '+e.path);
 const p=path.resolve(root,e.path),st=fs.lstatSync(p);
 if(!p.startsWith(root+path.sep)||!st.isFile()||st.isSymbolicLink()||st.size!==e.bytes||hash(fs.readFileSync(p))!==e.sha256)throw Error('Pinned file changed: '+e.path);
 if(p.endsWith('.mjs'))execFileSync(process.execPath,['--check',p],{cwd:root,timeout:30000});
}
for(const e of PREV)check(e);
const prevReceipt=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1r42fix5/installation.json'),'utf8'));
if(prevReceipt.schema!=='myway_s62bfix1r42fix5_receipt_v1'||prevReceipt.stage!=='v37d2c7a3s62bfix1r42fix5'||prevReceipt.research_only!==true||prevReceipt.database_writes!==0)throw Error('FIX5 predecessor receipt invalid');
for(const e of PREV){if(!prevReceipt.files.some(x=>x.path===e.path&&x.sha256===e.sha256&&x.bytes===e.bytes))throw Error('FIX5 predecessor mismatch '+e.path);}
const out=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1r42fix5/verify-v37d2c7a3s62bfix1r42fix5.mjs'),'--integrity-only'],{cwd:root,encoding:'utf8',timeout:90000});
if(!out.includes('S62B-FIX1R42FIX5 INTEGRITY PASS'))throw Error('Predecessor verifier failed');
const receipt=JSON.parse(fs.readFileSync(path.join(here,'installation.json'),'utf8'));
if(receipt.schema!=='myway_s62bfix1r42fix5a_receipt_v1'||receipt.stage!=='v37d2c7a3s62bfix1r42fix5a'||receipt.research_only!==true||receipt.database_writes!==0||receipt.files?.length!==NEW.length+1)throw Error('FIX5A receipt invalid');
const self=receipt.files.find(x=>x.path===SELF),source=fs.readFileSync(fileURLToPath(import.meta.url));
if(!self||self.bytes!==source.length||self.sha256!==hash(source))throw Error('FIX5A self integrity failure');
for(const e of NEW){const found=receipt.files.find(x=>x.path===e.path);if(!found||found.bytes!==e.bytes||found.sha256!==e.sha256)throw Error('FIX5A receipt mismatch');check(e);}
console.log('S62B-FIX1R42FIX5A INTEGRITY PASS | pinned FIX5, add-only; no provider/DB');
if(!process.argv.includes('--integrity-only')){
 const t=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62bfix1r42fix5a-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:180000});
 if(!t.includes('S62B-FIX1R42FIX5A SELFTEST PASS'))throw Error('FIX5A offline selftest failed');
 console.log(t.trim());console.log('S62B-FIX1R42FIX5A VERIFY PASS');
}
