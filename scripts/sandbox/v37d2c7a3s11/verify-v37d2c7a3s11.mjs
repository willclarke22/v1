#!/usr/bin/env node
/** Source-integrity verification only; no model calls, network, DB reads, or Git writes. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd());
const at=p=>path.join(root,...p.split('/'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(at(p),'utf8'));
const git=(cwd,...args)=>execFileSync(process.platform==='win32'?'git.exe':'git',['-C',cwd,...args],{encoding:'utf8',timeout:20000}).trim();
assert.equal(path.basename(root),'v1-learning-experiment');
assert.equal(git(root,'branch','--show-current'),'myway/learning-sandbox-v3_7a');
const main=path.resolve(root,'../v1');
assert.equal(git(main,'branch','--show-current'),'main');
assert.equal(git(main,'rev-parse','--short=7','HEAD'),'462a7a4');
const common=cwd=>fs.realpathSync(path.resolve(cwd,git(cwd,'rev-parse','--git-common-dir')));
assert.equal(common(root),common(main));
const current=read('scripts/sandbox/current-local-release.json');
assert.equal(current.schema,'myway-current-local-release-v1');
assert.equal(current.release,'v37d2c7a3s11');
assert.equal(current.marker,'scripts/sandbox/v37d2c7a3s11/installation.json');
const marker=read(current.marker);
assert.equal(marker.schema,'myway-v37d2c7a3s11-local-install-v1');
assert.equal(marker.previous_release,'v37d2c7a3s1');
for(const key of ['database_writes','model_calls','sql_changes','cloud_writes','git_writes'])assert.equal(marker[key],false);
assert.equal(marker.original_main,'462a7a4');
for(const [p,h] of Object.entries(marker.hashes)){
 assert.match(p,/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/);
 assert.equal(sha(p),h,'S1.1 source drift: '+p);
}
// Read-only S1, 7A.3R2 runtime and approved history are unchanged, except the S1 runner release allowlist.
const s1=read('scripts/sandbox/v37d2c7a3s1/installation.json');
assert.equal(s1.schema,'myway-v37d2c7a3s1-local-install-v1');
for(const [p,h] of Object.entries(s1.hashes))if(p!=='scripts/sandbox/current-local-release.json'&&p!=='scripts/sandbox/learning-intelligence/run.mjs')assert.equal(sha(p),h,'Predecessor S1 changed unexpectedly '+p);
const r2=read('scripts/sandbox/v37d2c7a3r2/installation.json');
assert.equal(r2.schema,'myway-v37d2c7a3r2-local-install-v1');
for(const [p,h] of Object.entries(r2.hashes))if(p!=='scripts/sandbox/current-local-release.json')assert.equal(sha(p),h,'R2 runtime changed unexpectedly '+p);
const route=fs.readFileSync(at('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts'),'utf8');
assert.ok(route.includes('approvedHistoryPresent && !inTopic.length'),'Missing fail-closed route guard');
assert.ok(route.includes('topicMemory.autoEligible=false'),'Unexpected automatic identity writes');
const original=fs.readFileSync(at('scripts/sandbox/learning-intelligence/run.mjs'),'utf8');
assert.ok(original.includes("'v37d2c7a3s11'"),'S1 model cost runner release check not extended');
console.log('V3.7D.2C.7A.3S1.1 VERIFY PASS: prior S1/R2 source intact, updated evaluation allowlist, new hashes, branch and original main isolation.');
