#!/usr/bin/env node
/** FIX1B verifier: no models, network/embeddings or DB. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const receipt=JSON.parse(fs.readFileSync(path.join(here,'installation.json'),'utf8'));
if(receipt.schema!=='myway_s62afix1b_additive_receipt_v1'||receipt.version!=='v37d2c7a3s62afix1b'||receipt.research_only!==true||receipt.database_writes!==0||receipt.additions.length!==6)throw Error('Invalid FIX1B receipt');
const paths=new Set([
 'scripts/sandbox/learning-intelligence/s62a-fix1b-core.mjs',
 'scripts/sandbox/learning-intelligence/s62a-fix1b-journey.mjs',
 'scripts/sandbox/learning-intelligence/s62a-fix1b-compare.mjs',
 'scripts/sandbox/learning-intelligence/s62a-fix1b-plan.mjs',
 'scripts/sandbox/learning-intelligence/s62a-fix1b-selftest.mjs',
 'scripts/sandbox/v37d2c7a3s62afix1b/README.md'
]);
for(const it of receipt.additions){
 if(!paths.has(it.path))throw Error('Unexpected FIX1B receipt addition '+it.path);
 const p=path.join(root,it.path),stat=fs.lstatSync(p),buf=fs.readFileSync(p);
 if(!stat.isFile()||stat.isSymbolicLink()||buf.length!==it.bytes||crypto.createHash('sha256').update(buf).digest('hex')!==it.sha256)throw Error('FIX1B changed file '+it.path);
 if(it.path.endsWith('.mjs'))execFileSync(process.execPath,['--check',p],{cwd:root,timeout:10000});
}
const prior=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/v37d2c7a3s62afix1a/verify-v37d2c7a3s62afix1a.mjs')],{cwd:root,encoding:'utf8',timeout:240000});
if(!prior.includes('S62A-FIX1A VERIFY PASS'))throw Error('FIX1A predecessor verifier failed');
const test=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62a-fix1b-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:50000});
if(!test.includes('S62A-FIX1B SELFTEST PASS'))throw Error('FIX1B learner-first selftest failed');
console.log(test.trim());console.log('S62A-FIX1B VERIFY PASS | pinned predecessor, learner-first schema, polarity, mock journey; no API/embeddings/DB');
