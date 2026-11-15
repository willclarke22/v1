#!/usr/bin/env node
/** Read-only source and synthetic selftest verifier; no network/API/DB writes. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const record=JSON.parse(fs.readFileSync(path.join(here,'installation.json'),'utf8'));
if(record.schema!=='myway_s62afix1c_additive_receipt_v1'||record.version!=='v37d2c7a3s62afix1c'||!record.research_only||record.database_writes!==0||record.additions.length!==6)throw Error('Unexpected FIX1C receipt');
const allowed=new Set(['scripts/sandbox/learning-intelligence/s62a-fix1c-core.mjs','scripts/sandbox/learning-intelligence/s62a-fix1c-journey.mjs','scripts/sandbox/learning-intelligence/s62a-fix1c-compare.mjs','scripts/sandbox/learning-intelligence/s62a-fix1c-plan.mjs','scripts/sandbox/learning-intelligence/s62a-fix1c-selftest.mjs','scripts/sandbox/v37d2c7a3s62afix1c/README.md']);
for(const item of record.additions){
 if(!allowed.has(item.path))throw Error('Unexpected FIX1C payload path '+item.path);
 const name=path.join(root,item.path),st=fs.lstatSync(name),content=fs.readFileSync(name);
 if(!st.isFile()||st.isSymbolicLink()||st.size!==item.bytes||crypto.createHash('sha256').update(content).digest('hex')!==item.sha256)throw Error('FIX1C file changed '+item.path);
 if(name.endsWith('.mjs'))execFileSync(process.execPath,['--check',name],{cwd:root,timeout:20000});
}
const prev=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/v37d2c7a3s62afix1b1/verify-v37d2c7a3s62afix1b1.mjs')],{cwd:root,encoding:'utf8',timeout:240000});
if(!prev.includes('S62A-FIX1B1 VERIFY PASS'))throw Error('FIX1B.1 predecessor verifier failed');
const test=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62a-fix1c-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:120000});
if(!test.includes('S62A-FIX1C SELFTEST PASS'))throw Error('FIX1C selftest failed');
console.log(test.trim());console.log('S62A-FIX1C VERIFY PASS | predecessor pinned; learner record provenance, memory-off B, mock journey; no API/embeddings/DB');
