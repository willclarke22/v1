#!/usr/bin/env node
/** Read-only stage verifier: historical FIX3 intact, new files integrity-pinned, offline research tests. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const receipt=JSON.parse(fs.readFileSync(path.join(here,'installation.json'),'utf8'));
if(receipt.schema!=='myway_s62a_additive_receipt_v1'||receipt.version!=='v37d2c7a3s62a'||receipt.research_only!==true||receipt.database_writes!==0||receipt.additions?.length!==7)throw Error('Invalid S62A stage receipt');
const re=/^scripts\/sandbox\/(?:learning-intelligence\/s62a-(?:journey|selftest|embeddings-check)\.mjs|learning-intelligence\/s62a-(?:profiles_PRIVATE|visits_PUBLIC)\.json|v37d2c7a3s62a\/(?:README\.md|verify-v37d2c7a3s62a\.mjs))$/;
for(const item of receipt.additions){if(!re.test(item.path))throw Error('Non-allowlisted S62A file '+item.path);
 const p=path.join(root,item.path),st=fs.lstatSync(p),b=fs.readFileSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.size!==item.bytes||crypto.createHash('sha256').update(b).digest('hex')!==item.sha256)throw Error('S62A source drift: '+item.path);
 if(item.path.endsWith('.mjs'))execFileSync(process.execPath,['--check',p],{cwd:root,timeout:20000});
}
const prev=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/v37d2c7a3s16b61fix3/verify-v37d2c7a3s16b61fix3.mjs')],{cwd:root,encoding:'utf8',timeout:240000});
if(!prev.includes('S61-FIX3 VERIFY PASS'))throw Error('FIX3 predecessor verification failed');
const self=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62a-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:180000});
if(!self.includes('S62A SELFTEST PASS'))throw Error('S62A offline selftest failed');
console.log(self.trim());console.log('S62A VERIFY PASS: S59/S60/S61/FIX1/FIX2/FIX3 intact; 144-step offline + mocked semantic and root revisions; no paid API or DB writes.');
