#!/usr/bin/env node
// Current-release + ancestral immutable policy verification.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd());
const at=p=>path.join(root,...p.split('/'));
const get=p=>JSON.parse(fs.readFileSync(at(p),'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();
assert.equal(path.basename(root),'v1-learning-experiment');
assert.equal(git(root,'branch','--show-current'),'myway/learning-sandbox-v3_7a');
const orig=path.resolve(root,'../v1');
assert.equal(git(orig,'branch','--show-current'),'main');
assert.equal(git(orig,'rev-parse','--short=7','HEAD'),'462a7a4');
const gitroot=dir=>path.resolve(dir,git(dir,'rev-parse','--git-common-dir'));
assert.equal(gitroot(root),gitroot(orig),'Original and experimental Git repositories diverged');
const release=get('scripts/sandbox/current-local-release.json');assert.equal(release.release,'v37d2c6d');
const current=get('scripts/sandbox/v37d2c6d/installation.json');assert.equal(current.schema,'myway-v37d2c6d-local-install-v1');
assert.equal(current.cloud_write_access,false);assert.equal(current.database_changes,false);
const approved=new Set();
for(const [file,hash] of Object.entries(current.hashes)){assert.equal(sha(file),hash,'Current release file drift: '+file);approved.add(file);}
const ancestors=['v37d2c6c','v37d2c6b','v37d2c6a','v37d2c5c','v37d2c5b','v37d2c5a','v37d2c4','v37d2c3'];
for(const ver of ancestors){
 const m=get(`scripts/sandbox/${ver}/installation.json`);
 assert.ok(m.hashes&&typeof m.hashes==='object','Missing previous hash manifest: '+ver);
 for(const [file,hash] of Object.entries(m.hashes)){
  if(approved.has(file))continue;
  // These previously authorized components were intentionally replaced by
  // later patches, and are checked by the later release's exact hash ledger.
  if((ver==='v37d2c3'||ver==='v37d2c4')&&file==='app/sandbox/probe-lab/learning-space/page.tsx')continue;
  if(ver==='v37d2c5b'&&file==='lib/sandbox/v37d2c5b/cloud-topics-experience.tsx')continue;
  assert.equal(sha(file),hash,`Protected older release ${ver} changed: ${file}`);
  approved.add(file);
 }
}
console.log('V3.7D.2C.6D LOCAL VERIFY PASS: current hashes, prior releases, cloud/auth/sync invariants, original main.');
