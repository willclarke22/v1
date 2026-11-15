#!/usr/bin/env node
/** Read-only, deterministic S62A-DIAG1 stage verifier. No provider, network or DB calls. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const receipt=JSON.parse(fs.readFileSync(path.join(here,'installation.json'),'utf8'));
if(receipt.schema!=='myway_s62adiag1_additive_receipt_v1'||receipt.version!=='v37d2c7a3s62adiag1'||receipt.research_only!==true||receipt.database_writes!==0||receipt.additions.length!==5)throw Error('S62A-DIAG1 invalid additive receipt');
const allowable=/^scripts\/sandbox\/(?:learning-intelligence\/s62a-diag1(?:-selftest|-compare)?\.mjs|v37d2c7a3s62adiag1\/(?:README\.md|verify-v37d2c7a3s62adiag1\.mjs))$/;
for(const item of receipt.additions){
 if(!allowable.test(item.path))throw Error('Stage additions not allowlisted: '+item.path);
 const p=path.join(root,item.path),st=fs.lstatSync(p),raw=fs.readFileSync(p);
 if(!st.isFile()||st.isSymbolicLink()||raw.length!==item.bytes||crypto.createHash('sha256').update(raw).digest('hex')!==item.sha256)throw Error('Stage drift '+item.path);
 if(item.path.endsWith('.mjs'))execFileSync(process.execPath,['--check',p],{cwd:root,timeout:15000});
}
// A real S62A predecessor verifier ensures research baselines and historical assumptions are retained.
const prev=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/v37d2c7a3s62a/verify-v37d2c7a3s62a.mjs')],{cwd:root,encoding:'utf8',timeout:240000});
if(!prev.includes('S62A VERIFY PASS'))throw Error('S62A predecessor did not pass');
const self=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62a-diag1-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:30000});
if(!self.includes('S62A-DIAG1 SELFTEST PASS'))throw Error('DIAG1 selftest did not pass');
console.log(self.trim());
console.log('S62A-DIAG1 VERIFY PASS | Additive stage; S62A predecessor unchanged; no paid calls / embeddings / DB mutations.');
