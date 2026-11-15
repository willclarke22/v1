#!/usr/bin/env node
/** Strict local stage receipt verifier. No network, embedding or DB access. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const receipt=JSON.parse(fs.readFileSync(path.join(here,'installation.json'),'utf8'));
if(receipt.schema!=='myway_s62afix1c1_additive_receipt_v1'||receipt.version!=='v37d2c7a3s62afix1c1'||!receipt.research_only||receipt.database_writes!==0||receipt.additions.length!==3)throw Error('Unexpected FIX1C1 receipt');
const allowed=new Set(["scripts/sandbox/learning-intelligence/s62a-fix1c1-compare.mjs", "scripts/sandbox/learning-intelligence/s62a-fix1c1-selftest.mjs", "scripts/sandbox/v37d2c7a3s62afix1c1/README.md"]);
for(const item of receipt.additions){
 if(!allowed.has(item.path))throw Error('Unapproved FIX1C1 file '+item.path);
 const file=path.join(root,item.path);const stat=fs.lstatSync(file);const content=fs.readFileSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==item.bytes||crypto.createHash('sha256').update(content).digest('hex')!==item.sha256)throw Error('FIX1C1 source mismatch '+item.path);
 if(file.endsWith('.mjs'))execFileSync(process.execPath,['--check',file],{cwd:root,timeout:20000});
}
const predecessor=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/v37d2c7a3s62afix1c/verify-v37d2c7a3s62afix1c.mjs')],{cwd:root,encoding:'utf8',timeout:240000});
if(!predecessor.includes('S62A-FIX1C VERIFY PASS'))throw Error('Previous FIX1C verifier failed');
const mock=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62a-fix1c1-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:120000});
if(!mock.includes('S62A-FIX1C1 SELFTEST PASS'))throw Error('FIX1C1 selftest failed');
console.log(mock.trim());console.log('S62A-FIX1C1 VERIFY PASS | pinned prior stage, unchanged parser, strict restart semantics, no API/embeddings/DB');
