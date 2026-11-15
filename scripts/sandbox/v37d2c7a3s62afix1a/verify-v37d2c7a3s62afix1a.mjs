#!/usr/bin/env node
/** Offline additive stage verifier. No provider/network/DB calls. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const receipt=JSON.parse(fs.readFileSync(path.join(here,'installation.json'),'utf8'));
if(receipt.schema!=='myway_s62afix1a_additive_receipt_v1'||receipt.version!=='v37d2c7a3s62afix1a'||receipt.research_only!==true||receipt.database_writes!==0||receipt.additions.length!==3)throw Error('Invalid FIX1A stage receipt');
const allowed=new Set(['scripts/sandbox/learning-intelligence/s62a-fix1a-compare.mjs','scripts/sandbox/learning-intelligence/s62a-fix1a-selftest.mjs','scripts/sandbox/v37d2c7a3s62afix1a/README.md']);
for(const item of receipt.additions){
 if(!allowed.has(item.path))throw Error('Unexpected receipt path: '+item.path);
 const p=path.join(root,item.path),st=fs.lstatSync(p),raw=fs.readFileSync(p);
 if(!st.isFile()||st.isSymbolicLink()||raw.length!==item.bytes||crypto.createHash('sha256').update(raw).digest('hex')!==item.sha256)throw Error('Stage changed: '+item.path);
 if(p.endsWith('.mjs'))execFileSync(process.execPath,['--check',p],{cwd:root,timeout:15000});
}
// Prior verification fully retained, including the installed S62A-DIAG1 research code.
const p=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/v37d2c7a3s62adiag1/verify-v37d2c7a3s62adiag1.mjs')],{cwd:root,encoding:'utf8',timeout:240000});
if(!p.includes('S62A-DIAG1 VERIFY PASS'))throw Error('DIAG1 predecessor verification failed');
const r=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62a-fix1a-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:30000});
if(!r.includes('S62A-FIX1A SELFTEST PASS'))throw Error('FIX1A selftest failed');
console.log(r.trim());console.log('S62A-FIX1A VERIFY PASS | predecessor unchanged; paired control valid; no API, embeddings or DB calls');
