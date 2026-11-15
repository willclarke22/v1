#!/usr/bin/env node
/** Source + receipts only; no paid model calls, network/embedding requests, or DB writes. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const receipt=JSON.parse(fs.readFileSync(path.join(here,'installation.json'),'utf8'));
if(receipt.schema!=='myway_s62afix1b1_additive_receipt_v1'||receipt.version!=='v37d2c7a3s62afix1b1'||receipt.research_only!==true||receipt.database_writes!==0||receipt.additions.length!==5)throw Error('Invalid FIX1B.1 receipt');
const allowed=new Set([
 'scripts/sandbox/learning-intelligence/s62a-fix1b1-resume.mjs',
 'scripts/sandbox/learning-intelligence/s62a-fix1b1-journey.mjs',
 'scripts/sandbox/learning-intelligence/s62a-fix1b1-plan.mjs',
 'scripts/sandbox/learning-intelligence/s62a-fix1b1-selftest.mjs',
 'scripts/sandbox/v37d2c7a3s62afix1b1/README.md'
]);
for(const item of receipt.additions){
 if(!allowed.has(item.path))throw Error('Unexpected FIX1B.1 file '+item.path);
 const file=path.join(root,item.path),st=fs.lstatSync(file),bytes=fs.readFileSync(file);
 if(!st.isFile()||st.isSymbolicLink()||bytes.length!==item.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('FIX1B.1 target modified '+item.path);
 if(item.path.endsWith('.mjs'))execFileSync(process.execPath,['--check',file],{cwd:root,timeout:20000});
}
const previous=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/v37d2c7a3s62afix1b/verify-v37d2c7a3s62afix1b.mjs')],{cwd:root,encoding:'utf8',timeout:240000});
if(!previous.includes('S62A-FIX1B VERIFY PASS'))throw Error('FIX1B previous stage verification failed');
const test=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62a-fix1b1-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:60000});
if(!test.includes('S62A-FIX1B1 SELFTEST PASS'))throw Error('FIX1B.1 selftest failed');
console.log(test.trim());console.log('S62A-FIX1B1 VERIFY PASS | predecessor pinned, safe resume, evidence-ID diagnostics, no paid/API/DB calls');
