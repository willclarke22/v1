#!/usr/bin/env node
/** 7A.3R release integrity; read-only, no DB or deployments. */
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
assert.equal(git(root,'rev-parse','HEAD'),'03e87909db593846f24117fe972c04d93662d65f');
const original=path.resolve(root,'../v1');
assert.equal(git(original,'branch','--show-current'),'main');
assert.equal(git(original,'rev-parse','--short=7','HEAD'),'462a7a4');
const common=cwd=>{const raw=git(cwd,'rev-parse','--git-common-dir');return fs.realpathSync(path.resolve(cwd,raw));};
assert.equal(common(root),common(original));
const pointer=read('scripts/sandbox/current-local-release.json');
assert.equal(pointer.release,'v37d2c7a3r');
assert.equal(pointer.marker,'scripts/sandbox/v37d2c7a3r/installation.json');
assert.equal(pointer.test,'scripts/sandbox/v37d2c7a3r/test-v37d2c7a3r.mjs');
assert.equal(pointer.verify,'scripts/sandbox/v37d2c7a3r/verify-v37d2c7a3r.mjs');
const marker=read(pointer.marker);
assert.equal(marker.schema,'myway-v37d2c7a3r-local-install-v1');
assert.equal(marker.original_main,'462a7a4');
assert.equal(marker.previous_release,'v37d2c7a3');
assert.equal(marker.sql_changes,false);
assert.equal(marker.cloud_api_changes,false);
assert.equal(marker.new_cloud_writes,false);
assert.equal(marker.auto_existing_topic_writes,false);
const changed=new Set(marker.files);
assert.equal(changed.size,marker.files.length);
assert.equal(Object.keys(marker.hashes).length,changed.size);
for(const [p,h] of Object.entries(marker.hashes)){
 assert.match(p,/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/);
 assert.equal(sha(p),h,'7A.3R source drift '+p);
}
const protect=new Set(changed);
for(const v of ['v37d2c7a3','v37d2c7a2','v37d2c7a1','v37d2c7a','v37d2c6e','v37d2c6d','v37d2c6c','v37d2c6b','v37d2c6a','v37d2c5c','v37d2c5b','v37d2c5a','v37d2c4','v37d2c3']){
 const prior=read(`scripts/sandbox/${v}/installation.json`);
 assert.ok(prior.hashes&&typeof prior.hashes==='object','Ancestor missing: '+v);
 for(const [p,h] of Object.entries(prior.hashes)){
  if(protect.has(p))continue;
  if((v==='v37d2c3'||v==='v37d2c4')&&p==='app/sandbox/probe-lab/learning-space/page.tsx')continue;
  if(v==='v37d2c5b'&&p==='lib/sandbox/v37d2c5b/cloud-topics-experience.tsx')continue;
  assert.equal(sha(p),h,'Protected ancestor drift '+v+' '+p);
  protect.add(p);
 }
}
console.log('V3.7D.2C.7A.3R VERIFY PASS: source hashes, unchanged ancestors, experiment branch & original main.');
