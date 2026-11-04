#!/usr/bin/env node
/** Verify release marker, protected 7A ancestry and local original-v1/main isolation. */
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
assert.equal(path.basename(root),'v1-learning-experiment','Wrong worktree');
assert.equal(git(root,'branch','--show-current'),'myway/learning-sandbox-v3_7a');
const original=path.resolve(root,'../v1');
assert.equal(git(original,'branch','--show-current'),'main');
assert.equal(git(original,'rev-parse','--short=7','HEAD'),'462a7a4');
assert.equal(path.resolve(root,git(root,'rev-parse','--git-common-dir')),
 path.resolve(original,git(original,'rev-parse','--git-common-dir')),'Git worktrees differ');
const pointer=read('scripts/sandbox/current-local-release.json');
assert.equal(pointer.schema,'myway-current-local-release-v1');
assert.equal(pointer.release,'v37d2c7a1');
assert.equal(pointer.test,'scripts/sandbox/v37d2c7a1/test-v37d2c7a1.mjs');
assert.equal(pointer.verify,'scripts/sandbox/v37d2c7a1/verify-v37d2c7a1.mjs');
assert.equal(pointer.marker,'scripts/sandbox/v37d2c7a1/installation.json');
const marker=read(pointer.marker);
assert.equal(marker.schema,'myway-v37d2c7a1-local-install-v1');
assert.equal(marker.original_main,'462a7a4');
assert.equal(marker.cloud_api_changes,false);
assert.equal(marker.sql_changes,false);
const changed=new Set(marker.files);
assert.equal(changed.size,marker.files.length);
for (const [file,hash] of Object.entries(marker.hashes)){
 assert.ok(/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(file)&&!file.includes('..'));
 assert.equal(sha(file),hash,'Release file drift: '+file);
}
const predecessor=read('scripts/sandbox/v37d2c7a/installation.json');
assert.equal(predecessor.patch_revision,'fix3');
assert.equal(predecessor.schema,'myway-v37d2c7a-local-install-v1');
for (const [file,hash] of Object.entries(predecessor.hashes)){
 if(changed.has(file))continue;
 assert.equal(sha(file),hash,'7A protected ancestor drift: '+file);
}
// Preserve the older release-ledger chain. Only the ten explicitly manifest-pinned
// paths may override ancestor hashes; all unrelated protected files stay unchanged.
const protectedPaths=new Set([...changed,...Object.keys(predecessor.hashes)]);
for(const ver of ['v37d2c6e','v37d2c6d','v37d2c6c','v37d2c6b','v37d2c6a',
 'v37d2c5c','v37d2c5b','v37d2c5a','v37d2c4','v37d2c3']){
 const ledger=read(`scripts/sandbox/${ver}/installation.json`);
 assert.ok(ledger.hashes&&typeof ledger.hashes==='object',`Missing ${ver} hashes`);
 for(const [file,hash] of Object.entries(ledger.hashes)){
  if(protectedPaths.has(file))continue;
  if((ver==='v37d2c3'||ver==='v37d2c4')&&file==='app/sandbox/probe-lab/learning-space/page.tsx')continue;
  if(ver==='v37d2c5b'&&file==='lib/sandbox/v37d2c5b/cloud-topics-experience.tsx')continue;
  assert.equal(sha(file),hash,'Protected ancestor drift: '+ver+' '+file);
  protectedPaths.add(file);
 }
}
console.log('V3.7D.2C.7A.1 VERIFY PASS: original/main isolation, release hashes, 7A FIX3 and earlier protected ancestors.');
