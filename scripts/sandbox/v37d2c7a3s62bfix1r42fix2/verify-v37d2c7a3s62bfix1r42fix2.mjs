#!/usr/bin/env node
/** FIX2 pinned read-only integrity and no-provider QA. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const PREV=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix1-runtime.mjs","bytes":55302,"sha256":"2d93a80999365d437a2f096d1eba332d9a914e1dd71b4063a35f7688fc45dd46"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix1-selftest.mjs","bytes":3882,"sha256":"5185bce6a1efce5ffea137d347720be5f6d36cb9dcbe4d1f8c3189ab7a0c8af5"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r42fix1/verify-v37d2c7a3s62bfix1r42fix1.mjs","bytes":4474,"sha256":"fae63d1e78dce00e554479fe2ca4f272f56ea322c5b07f52f8fd081158b0ea21"}];
const NEW=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix2-runtime.mjs","bytes":76293,"sha256":"5817a5119ebdee5bbb9f31c357ae3c9b7ed75704205ca33b9c82cd6825cabb56"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix2-executor.mjs","bytes":17148,"sha256":"a4a6db06258b0d3280a4025ae94b41ba7d7dbccfefd5bbf8dda9bea311335ed7"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix2-selftest.mjs","bytes":6105,"sha256":"a03becc54b68535541582358dc403b153084a1000b1b3434aa02784956e8a4be"}];
const SELF="scripts/sandbox/v37d2c7a3s62bfix1r42fix2/verify-v37d2c7a3s62bfix1r42fix2.mjs";
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
function check(e){
 if(!/^scripts\/sandbox\/[A-Za-z0-9_./-]+$/.test(e.path)||e.path.includes('..'))throw Error('Unsafe path '+e.path);
 const p=path.resolve(root,e.path),st=fs.lstatSync(p);
 if(!p.startsWith(root+path.sep)||!st.isFile()||st.isSymbolicLink()||st.size!==e.bytes||hash(fs.readFileSync(p))!==e.sha256)throw Error('Pinned file changed: '+e.path);
 if(p.endsWith('.mjs'))execFileSync(process.execPath,['--check',p],{cwd:root,timeout:30000});
}
function equal(a,b,label){if(!Array.isArray(a)||a.length!==b.length||new Set(a.map(x=>x.path)).size!==b.length)throw Error(label+' receipt count/uniqueness mismatch');const map=new Map(a.map(x=>[x.path,x]));for(const e of b){const v=map.get(e.path);if(!v||v.bytes!==e.bytes||v.sha256!==e.sha256)throw Error(label+' pinned digest mismatch '+e.path);}}
for(const e of PREV)check(e);
const earlier=read(path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1r42fix1/installation.json'));
if(earlier.schema!=='myway_s62bfix1r42fix1_receipt_v1'||earlier.stage!=='v37d2c7a3s62bfix1r42fix1'||earlier.research_only!==true||earlier.database_writes!==0)throw Error('FIX1 receipt invalid');
equal(earlier.files,PREV,'FIX1');
const priorVerifier=path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1r42fix1/verify-v37d2c7a3s62bfix1r42fix1.mjs');
const result=execFileSync(process.execPath,[priorVerifier,'--integrity-only'],{cwd:root,encoding:'utf8',timeout:90000});
if(!result.includes('S62B-FIX1R42FIX1 INTEGRITY PASS'))throw Error('FIX1 integrity not verified');
const receipt=read(path.join(here,'installation.json'));
if(receipt.schema!=='myway_s62bfix1r42fix2_receipt_v1'||receipt.stage!=='v37d2c7a3s62bfix1r42fix2'||receipt.research_only!==true||receipt.database_writes!==0||receipt.files?.length!==NEW.length+1)throw Error('FIX2 receipt invalid');
const me=receipt.files.find(e=>e.path===SELF),bytes=fs.readFileSync(fileURLToPath(import.meta.url));
if(!me||me.bytes!==bytes.length||me.sha256!==hash(bytes))throw Error('FIX2 verifier self hash mismatch');
equal(receipt.files.filter(x=>x.path!==SELF),NEW,'FIX2');
for(const e of NEW)check(e);
console.log('S62B-FIX1R42FIX2 INTEGRITY PASS | pinned FIX1 and FIX2, add-only, no provider or DB');
if(!process.argv.includes('--integrity-only')){
 const q=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62bfix1r42fix2-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:180000});
 if(!q.includes('S62B-FIX1R42FIX2 SELFTEST PASS'))throw Error('FIX2 20+20 no-provider selftest failed');
 console.log(q.trim());console.log('S62B-FIX1R42FIX2 VERIFY PASS | no provider/DB');
}
