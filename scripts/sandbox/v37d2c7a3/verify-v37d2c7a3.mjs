#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd());
const at=p=>path.join(root,...p.split('/'));
const read=p=>JSON.parse(fs.readFileSync(at(p),'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
const git=(cwd,...args)=>execFileSync(process.platform==='win32'?'git.exe':'git',['-C',cwd,...args],{encoding:'utf8'}).trim();
assert.equal(path.basename(root),'v1-learning-experiment');
assert.equal(git(root,'branch','--show-current'),'myway/learning-sandbox-v3_7a');
const original=path.resolve(root,'../v1');
assert.equal(git(original,'branch','--show-current'),'main');
assert.equal(git(original,'rev-parse','--short=7','HEAD'),'462a7a4');
assert.equal(path.resolve(root,git(root,'rev-parse','--git-common-dir')),path.resolve(original,git(original,'rev-parse','--git-common-dir')));
const pointer=read('scripts/sandbox/current-local-release.json');
assert.equal(pointer.release,'v37d2c7a3');
assert.equal(pointer.marker,'scripts/sandbox/v37d2c7a3/installation.json');
assert.equal(pointer.test,'scripts/sandbox/v37d2c7a3/test-v37d2c7a3.mjs');
const marker=read(pointer.marker);
assert.equal(marker.schema,'myway-v37d2c7a3-local-install-v1');
assert.equal(marker.original_main,'462a7a4');
assert.equal(marker.cloud_api_changes,false);
assert.equal(marker.sql_changes,false);
assert.equal(marker.new_cloud_writes,false);
const changed=new Set(marker.files);
assert.equal(changed.size,marker.files.length);
assert.equal(Object.keys(marker.hashes).length,changed.size);
for(const [p,h] of Object.entries(marker.hashes)){
 assert.match(p,/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/);
 assert.equal(sha(p),h,'7A.3 source drift '+p);
}
const protect=new Set(changed);
for(const v of ['v37d2c7a2','v37d2c7a1','v37d2c7a','v37d2c6e','v37d2c6d','v37d2c6c','v37d2c6b','v37d2c6a','v37d2c5c','v37d2c5b','v37d2c5a','v37d2c4','v37d2c3']){
 const l=read(`scripts/sandbox/${v}/installation.json`);
 assert.ok(l.hashes&&typeof l.hashes==='object','Missing ancestor '+v);
 if(v==='v37d2c7a2')assert.equal(l.schema,'myway-v37d2c7a2-local-install-v1');
 for(const [p,h] of Object.entries(l.hashes)){
  if(protect.has(p))continue;
  if((v==='v37d2c3'||v==='v37d2c4')&&p==='app/sandbox/probe-lab/learning-space/page.tsx')continue;
  if(v==='v37d2c5b'&&p==='lib/sandbox/v37d2c5b/cloud-topics-experience.tsx')continue;
  assert.equal(sha(p),h,'Protected ancestor drift '+v+' '+p);
  protect.add(p);
 }
}
console.log('V3.7D.2C.7A.3 VERIFY PASS: worktree/main isolation, release hashes and protected ancestors.');
