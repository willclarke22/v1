#!/usr/bin/env node
/** S62B installed source verifier: no network/model/embedding/DB calls. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const receipt=JSON.parse(fs.readFileSync(path.join(here,'installation.json'),'utf8'));
if(receipt.schema!=='myway_s62b_additive_receipt_v1'||receipt.version!=='v37d2c7a3s62b'||!receipt.research_only||receipt.database_writes!==0||receipt.additions.length!==8)throw Error('Bad S62B receipt');
const approved=new Set(["scripts/sandbox/learning-intelligence/s62b-core.mjs", "scripts/sandbox/learning-intelligence/s62b-scenario.mjs", "scripts/sandbox/learning-intelligence/s62b-retrieval.mjs", "scripts/sandbox/learning-intelligence/s62b-experience.mjs", "scripts/sandbox/learning-intelligence/s62b-journey.mjs", "scripts/sandbox/learning-intelligence/s62b-inspector.mjs", "scripts/sandbox/learning-intelligence/s62b-selftest.mjs", "scripts/sandbox/v37d2c7a3s62b/README.md"]);
for(const item of receipt.additions){
 if(!approved.has(item.path))throw Error('Unapproved S62B file '+item.path);
 const file=path.join(root,item.path),stat=fs.lstatSync(file),hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==item.bytes||hash!==item.sha256)throw Error('S62B file changed '+item.path);
 if(file.endsWith('.mjs'))execFileSync(process.execPath,['--check',file],{cwd:root,timeout:20000});
}
const prev=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/v37d2c7a3s62afix1c2/verify-v37d2c7a3s62afix1c2.mjs')],{cwd:root,encoding:'utf8',timeout:240000});
if(!prev.includes('S62A-FIX1C2 VERIFY PASS'))throw Error('Prior FIX1C2 verifier failed');
const output=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s62b-selftest.mjs')],{cwd:root,encoding:'utf8',timeout:120000});
if(!output.includes('S62B SELFTEST PASS'))throw Error('S62B selftest failed');
console.log(output.trim());console.log('S62B VERIFY PASS | typed roots, staged visibility, replay, full mock loop; no API/embeddings/DB');
