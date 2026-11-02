#!/usr/bin/env node
/** Verify full installed 7A identity, exact hashes, earlier trust ledgers, original main. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {assertSafeManifestPath} from './verify-manifest-path.mjs';
const root=path.resolve(process.argv[2]||process.cwd()),at=p=>path.join(root,...p.split('/'));
const get=p=>JSON.parse(fs.readFileSync(at(p),'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
const git=(cwd,...args)=>execFileSync(process.platform==='win32'?'git.exe':'git',['-C',cwd,...args],{encoding:'utf8'}).trim();
assert.equal(path.basename(root),'v1-learning-experiment');
assert.equal(git(root,'branch','--show-current'),'myway/learning-sandbox-v3_7a');
const orig=path.resolve(root,'../v1');assert.equal(git(orig,'branch','--show-current'),'main');
assert.equal(git(orig,'rev-parse','--short=7','HEAD'),'462a7a4');
assert.equal(path.resolve(root,git(root,'rev-parse','--git-common-dir')),
 path.resolve(orig,git(orig,'rev-parse','--git-common-dir')));
const pointer=get('scripts/sandbox/current-local-release.json');assert.equal(pointer.release,'v37d2c7a');
const marker=get('scripts/sandbox/v37d2c7a/installation.json');
assert.equal(marker.schema,'myway-v37d2c7a-local-install-v1');
assert.equal(marker.patch_revision,'fix3');assert.equal(marker.database_changes,false);assert.equal(marker.cloud_write_access,false);
assert.equal(marker.sql_manual_only,true);assert.equal(marker.cloud_api_changes,false);
const approved=new Set();
for(const [file,hash] of Object.entries(marker.hashes)){
 assertSafeManifestPath(file);
 assert.equal(sha(file),hash,'Current 7A payload drift: '+file);approved.add(file);
}
for(const ver of ['v37d2c6e','v37d2c6d','v37d2c6c','v37d2c6b','v37d2c6a',
 'v37d2c5c','v37d2c5b','v37d2c5a','v37d2c4','v37d2c3']){
 const m=get(`scripts/sandbox/${ver}/installation.json`);assert.ok(m.hashes&&typeof m.hashes==='object');
 for(const [file,hash] of Object.entries(m.hashes)){
  if(approved.has(file))continue;
  if((ver==='v37d2c3'||ver==='v37d2c4')&&file==='app/sandbox/probe-lab/learning-space/page.tsx')continue;
  if(ver==='v37d2c5b'&&file==='lib/sandbox/v37d2c5b/cloud-topics-experience.tsx')continue;
  assert.equal(sha(file),hash,'Protected ancestor drift: '+ver+' '+file);approved.add(file);
 }
}
console.log('V3.7D.2C.7A VERIFY PASS: experiment/main isolation, protected ancestors, manifest payload, read-only cloud and manual SQL.');
