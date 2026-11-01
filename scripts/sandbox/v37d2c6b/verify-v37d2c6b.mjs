#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd()),at=p=>path.join(root,...p.split('/'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();
assert.equal(path.basename(root),'v1-learning-experiment');
assert.equal(git(root,'branch','--show-current'),'myway/learning-sandbox-v3_7a');
const original=path.resolve(root,'../v1');assert.equal(git(original,'branch','--show-current'),'main');
assert.equal(git(original,'rev-parse','--short=7','HEAD'),'462a7a4');
const common=cwd=>path.resolve(cwd,git(cwd,'rev-parse','--git-common-dir'));
assert.equal(common(root),common(original));
const marker=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37d2c6b/installation.json')));
assert.equal(marker.schema,'myway-v37d2c6b-local-install-v1');assert.equal(marker.database_changes,false);assert.equal(marker.cloud_api_changes,false);
const pointer=JSON.parse(fs.readFileSync(at('scripts/sandbox/current-local-release.json')));assert.equal(pointer.release,'v37d2c6b');
for(const v of ['v37d2c3','v37d2c4','v37d2c5a','v37d2c5b','v37d2c5c','v37d2c6a']){
 const prev=JSON.parse(fs.readFileSync(at(`scripts/sandbox/${v}/installation.json`)));
 const skipped=new Set(Object.keys(marker.hashes));
 for(const [file,hash] of Object.entries(prev.hashes)){if(skipped.has(file))continue;
  // Existing cloud-topic component is updated by the approved previous 5C release.
  if(v==='v37d2c5b'&&file==='lib/sandbox/v37d2c5b/cloud-topics-experience.tsx')continue;
  if(v==='v37d2c3'&&file==='app/sandbox/probe-lab/learning-space/page.tsx')continue;
  if(v==='v37d2c4'&&file==='app/sandbox/probe-lab/learning-space/page.tsx')continue;
  assert.equal(sha(file),hash,'Invariant drift '+file);
 }
}
for(const [file,hash] of Object.entries(marker.hashes))assert.equal(sha(file),hash,'Release source drift '+file);
console.log('V3.7D.2C.6B LOCAL VERIFY PASS: experiment/main isolation, immutable cloud guard, exact scoped release hashes.');
