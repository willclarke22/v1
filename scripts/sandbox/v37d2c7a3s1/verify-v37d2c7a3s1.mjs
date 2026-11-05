#!/usr/bin/env node
/** Source-integrity check; does not require the old precommit 7A.3R2 Git HEAD. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd());
const at=p=>path.join(root,...p.split('/'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(at(p),'utf8'));
const git=(cwd,...args)=>execFileSync(process.platform==='win32'?'git.exe':'git',['-C',cwd,...args],{encoding:'utf8'}).trim();
assert.equal(path.basename(root),'v1-learning-experiment');
assert.equal(git(root,'branch','--show-current'),'myway/learning-sandbox-v3_7a');
const main=path.resolve(root,'../v1');
assert.equal(git(main,'branch','--show-current'),'main');
assert.equal(git(main,'rev-parse','--short=7','HEAD'),'462a7a4');
const shared=cwd=>{const raw=git(cwd,'rev-parse','--git-common-dir');return fs.realpathSync(path.resolve(cwd,raw));};
assert.equal(shared(root),shared(main));
const marker=read('scripts/sandbox/v37d2c7a3s1/installation.json');
assert.equal(marker.schema,'myway-v37d2c7a3s1-local-install-v1');
assert.equal(marker.previous_release,'v37d2c7a3r2');
assert.equal(marker.original_main,'462a7a4');
assert.equal(marker.database_writes,false);assert.equal(marker.cloud_api_changes,false);assert.equal(marker.auto_memory_writes,false);
const pointer=read('scripts/sandbox/current-local-release.json');
assert.equal(pointer.release,'v37d2c7a3s1');
assert.equal(pointer.marker,'scripts/sandbox/v37d2c7a3s1/installation.json');
const paths=Object.keys(marker.hashes);assert.equal(paths.length,marker.files.length);
for(const p of paths){assert.match(p,/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/);assert.equal(sha(p),marker.hashes[p],'S1 source drift '+p);}
// Enforce unchanged 7A.3R2 runtime/source, excluding only the intentionally revised release pointer.
const prior=read('scripts/sandbox/v37d2c7a3r2/installation.json');
assert.equal(prior.schema,'myway-v37d2c7a3r2-local-install-v1');
for(const [p,h] of Object.entries(prior.hashes))if(p!=='scripts/sandbox/current-local-release.json')assert.equal(sha(p),h,'7A.3R2 changed unexpectedly '+p);
console.log('V3.7D.2C.7A.3S1 VERIFY PASS: runtime source unchanged, package hashes, experiment branch, original main isolated.');
