#!/usr/bin/env node
/** FIX1 integrity, read-only selftest; no model, embeddings, or production writes. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const PREV=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42-challenges.mjs","bytes":6056,"sha256":"349ffc67ce5a83a0a467667cf064375231137c0cc72a2aa6f5323fe5072936ef"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42-contracts.mjs","bytes":4160,"sha256":"7fc3c22253281521a17c141a954b086cc21172e35a8e87ed3e1caafb8e78176b"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42-runtime.mjs","bytes":41243,"sha256":"52d3014bbbdc2b35bb385619c160eea59ca9cdda07161ee556cd6c6093ddad64"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42-selftest.mjs","bytes":5521,"sha256":"5e44eb9518674b54cba56b2f6ae972ea346853c68bd35fc3adbea8dddb5af1cc"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42-topics.mjs","bytes":3099,"sha256":"31d3f559e085d68cd91c62f985fab1d0a5f5ee2487abe89b3d6f94e203602a4f"},{"path":"scripts/sandbox/v37d2c7a3s62bfix1r42/verify-v37d2c7a3s62bfix1r42.mjs","bytes":5240,"sha256":"c862b393046229391fbc492f30c7c1a3500c9587456d6a2dab97e1fb2c344bc0"}];
const NEW=[{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix1-runtime.mjs","bytes":55302,"sha256":"2d93a80999365d437a2f096d1eba332d9a914e1dd71b4063a35f7688fc45dd46"},{"path":"scripts/sandbox/learning-intelligence/s62bfix1r42fix1-selftest.mjs","bytes":3882,"sha256":"5185bce6a1efce5ffea137d347720be5f6d36cb9dcbe4d1f8c3189ab7a0c8af5"}];
const SELF='scripts/sandbox/v37d2c7a3s62bfix1r42fix1/verify-v37d2c7a3s62bfix1r42fix1.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
function check(e){
 if(!/^scripts\/sandbox\/[A-Za-z0-9_./-]+$/.test(e.path)||e.path.includes('..'))throw Error('Unsafe path '+e.path);
 const p=path.resolve(root,e.path),st=fs.lstatSync(p);
 if(!p.startsWith(root+path.sep)||!st.isFile()||st.isSymbolicLink()||st.size!==e.bytes||sha(fs.readFileSync(p))!==e.sha256)throw Error('Pinned predecessor/new source changed: '+e.path);
 if(p.endsWith('.mjs'))execFileSync(process.execPath,['--check',p],{cwd:root,timeout:30000});
}
function equal(a,b,label){if(!Array.isArray(a)||a.length!==b.length||new Set(a.map(x=>x.path)).size!==b.length)throw Error(label+' receipt count/uniqueness mismatch');const m=new Map(a.map(x=>[x.path,x]));for(const e of b){const v=m.get(e.path);if(!v||v.bytes!==e.bytes||v.sha256!==e.sha256)throw Error(label+' SHA mismatch '+e.path);}}
for(const e of PREV)check(e);
const r42=read(path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1r42/installation.json'));
if(r42.schema!=='myway_s62bfix1r42_receipt_v1'||r42.stage!=='v37d2c7a3s62bfix1r42'||r42.research_only!==true||r42.database_writes!==0)throw Error('Previous R4.2 receipt invalid');
equal(r42.files,PREV,'R4.2');
const res=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/v37d2c7a3s62bfix1r42/verify-v37d2c7a3s62bfix1r42.mjs'),'--integrity-only'],{cwd:root,encoding:'utf8',timeout:90000});
if(!res.includes('S62B-FIX1R42 INTEGRITY PASS'))throw Error('R4.2 predecessor verifier not passed');
const receipt=read(path.join(here,'installation.json'));
if(receipt.schema!=='myway_s62bfix1r42fix1_receipt_v1'||receipt.stage!=='v37d2c7a3s62bfix1r42fix1'||receipt.research_only!==true||receipt.database_writes!==0||receipt.files?.length!==NEW.length+1)throw Error('FIX1 receipt invalid');
const me=receipt.files.find(e=>e.path===SELF),bytes=fs.readFileSync(fileURLToPath(import.meta.url));
if(!me||me.bytes!==bytes.length||me.sha256!==sha(bytes))throw Error('Verifier self-pin mismatch');
equal(receipt.files.filter(x=>x.path!==SELF),NEW,'FIX1');
for(const e of NEW)check(e);
console.log('S62B-FIX1R42FIX1 INTEGRITY PASS | exact R4.2 pinned; add-only; no provider/DB');
if(!process.argv.includes('--integrity-only')){
 const output=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62bfix1r42fix1-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:120000});
 if(!output.includes('S62B-FIX1R42FIX1 SELFTEST PASS'))throw Error('FIX1 local selftest failed');
 console.log(output.trim());console.log('S62B-FIX1R42FIX1 VERIFY PASS | read-only regression');
}
