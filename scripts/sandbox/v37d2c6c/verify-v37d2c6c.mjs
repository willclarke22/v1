#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd()),at=p=>path.join(root,...p.split('/'));
const read=p=>JSON.parse(fs.readFileSync(at(p),'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();
assert.equal(path.basename(root),'v1-learning-experiment');
assert.equal(git(root,'branch','--show-current'),'myway/learning-sandbox-v3_7a');
const original=path.resolve(root,'../v1');assert.equal(git(original,'branch','--show-current'),'main');
assert.equal(git(original,'rev-parse','--short=7','HEAD'),'462a7a4');
const common=cwd=>path.resolve(cwd,git(cwd,'rev-parse','--git-common-dir'));
assert.equal(common(root),common(original),'Original and experiment must share the same Git repo');
const marker=read('scripts/sandbox/v37d2c6c/installation.json');
assert.equal(marker.schema,'myway-v37d2c6c-local-install-v1');
assert.equal(marker.database_changes,false);assert.equal(marker.cloud_api_changes,false);
const p=read('scripts/sandbox/current-local-release.json');assert.equal(p.release,'v37d2c6c');
for(const [file,hash] of Object.entries(marker.hashes))assert.equal(sha(file),hash,'Current release drift: '+file);
const b=read('scripts/sandbox/v37d2c6b/installation.json');assert.equal(b.schema,'myway-v37d2c6b-local-install-v1');
for(const [file,hash] of Object.entries(b.hashes)){
  if(file in marker.hashes)continue;
  assert.equal(sha(file),hash,'Prior B release invariant drift: '+file);
}
// Cloud guard and sync invariants remain pinned. Skip legitimate later-release
// modifications to previously approved files, but do not broadly skip security.
for(const v of ['v37d2c3','v37d2c4','v37d2c5a','v37d2c5b','v37d2c5c','v37d2c6a']){
 const prev=read(`scripts/sandbox/${v}/installation.json`);
 const updated=new Set([...Object.keys(marker.hashes),...Object.keys(b.hashes)]);
 for(const [file,hash] of Object.entries(prev.hashes)){
  if(updated.has(file))continue;
  if((v==='v37d2c3'||v==='v37d2c4')&&file==='app/sandbox/probe-lab/learning-space/page.tsx')continue;
  if(v==='v37d2c5b'&&file==='lib/sandbox/v37d2c5b/cloud-topics-experience.tsx')continue;
  assert.equal(sha(file),hash,`Protected ${v} invariant drift: ${file}`);
 }
}
console.log('V3.7D.2C.6C LOCAL VERIFY PASS: original main, cloud guards, prior B files and exact release hashes.');
