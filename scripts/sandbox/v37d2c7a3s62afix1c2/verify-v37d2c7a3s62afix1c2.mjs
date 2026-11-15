#!/usr/bin/env node
/** Read-only verification of installed FIX1C.2 stage. No paid models, embeddings or DB calls. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const rec=JSON.parse(fs.readFileSync(path.join(here,'installation.json'),'utf8'));
if(rec.schema!=='myway_s62afix1c2_additive_receipt_v1'||rec.version!=='v37d2c7a3s62afix1c2'||!rec.research_only||rec.database_writes!==0||rec.additions.length!==5)throw Error('Bad FIX1C2 receipt');
const allowed=new Set(['scripts/sandbox/learning-intelligence/s62a-fix1c2-core.mjs','scripts/sandbox/learning-intelligence/s62a-fix1c2-journey.mjs','scripts/sandbox/learning-intelligence/s62a-fix1c2-inspector.mjs','scripts/sandbox/learning-intelligence/s62a-fix1c2-selftest.mjs','scripts/sandbox/v37d2c7a3s62afix1c2/README.md']);
for(const x of rec.additions){
 if(!allowed.has(x.path))throw Error('Unapproved file '+x.path);
 const f=path.join(root,x.path),st=fs.lstatSync(f),data=fs.readFileSync(f);
 if(!st.isFile()||st.isSymbolicLink()||st.size!==x.bytes||crypto.createHash('sha256').update(data).digest('hex')!==x.sha256)throw Error('FIX1C2 file hash changed '+x.path);
 if(f.endsWith('.mjs'))execFileSync(process.execPath,['--check',f],{cwd:root,timeout:20000});
}
const prev=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/v37d2c7a3s62afix1c1/verify-v37d2c7a3s62afix1c1.mjs')],{cwd:root,encoding:'utf8',timeout:240000});
if(!prev.includes('S62A-FIX1C1 VERIFY PASS'))throw Error('Predecessor stage verification failed');
const result=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62a-fix1c2-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:120000});
if(!result.includes('S62A-FIX1C2 SELFTEST PASS'))throw Error('FIX1C2 selftest failed');
console.log(result.trim());console.log('S62A-FIX1C2 VERIFY PASS | typed state/revision, full mocked A→B→L loop, B shadow, no API/embeddings/DB');
