#!/usr/bin/env node
/** Source-only release verification; no service calls. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd()),at=p=>path.join(root,...p.split('/'));
const json=p=>JSON.parse(fs.readFileSync(at(p),'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
const git=(cwd,...x)=>execFileSync(process.platform==='win32'?'git.exe':'git',['-C',cwd,...x],{encoding:'utf8',timeout:20000}).trim();
assert.equal(path.basename(root),'v1-learning-experiment');
assert.equal(git(root,'branch','--show-current'),'myway/learning-sandbox-v3_7a');
const original=path.resolve(root,'../v1');assert.equal(git(original,'branch','--show-current'),'main');assert.equal(git(original,'rev-parse','--short=7','HEAD'),'462a7a4');
const common=d=>fs.realpathSync(path.resolve(d,git(d,'rev-parse','--git-common-dir')));assert.equal(common(root),common(original));
const p=json('scripts/sandbox/current-local-release.json');assert.equal(p.release,'v37d2c7a3s12');assert.equal(p.marker,'scripts/sandbox/v37d2c7a3s12/installation.json');
const mark=json(p.marker);assert.equal(mark.schema,'myway-v37d2c7a3s12-local-install-v1');assert.equal(mark.previous_release,'v37d2c7a3s11');assert.equal(mark.original_main,'462a7a4');
for(const k of ['sql_changes','db_writes','cloud_writes','automatic_memory_writes','git_writes','paid_install_calls'])assert.equal(mark[k],false);
for(const [file,h] of Object.entries(mark.hashes))assert.equal(hash(file),h,'S1.2 source drift: '+file);
const s11=json('scripts/sandbox/v37d2c7a3s11/installation.json');assert.equal(s11.schema,'myway-v37d2c7a3s11-local-install-v1');
const overwritten=new Set(['scripts/sandbox/current-local-release.json','scripts/sandbox/learning-intelligence/run.mjs','scripts/sandbox/learning-intelligence/s11-evaluator.mjs','scripts/sandbox/learning-intelligence/runtime-loader.mjs']);
for(const [file,h] of Object.entries(s11.hashes))if(!overwritten.has(file))assert.equal(hash(file),h,'Predecessor S1.1 drift: '+file);
const s1=json('scripts/sandbox/v37d2c7a3s1/installation.json');for(const [file,h] of Object.entries(s1.hashes))if(!overwritten.has(file))assert.equal(hash(file),h,'Predecessor S1 drift: '+file);
const r2=json('scripts/sandbox/v37d2c7a3r2/installation.json');for(const [file,h] of Object.entries(r2.hashes))if(file!=='scripts/sandbox/current-local-release.json')assert.equal(hash(file),h,'Underlying runtime changed: '+file);
const retrieval=fs.readFileSync(at('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts'),'utf8');
assert.ok(retrieval.includes('topicMemory.autoEligible=false'));assert.ok(retrieval.includes('approvedHistoryPresent && !inTopic.length'));
const route=fs.readFileSync(at('app/api/sandbox/probe-lab/local-assessment/memory-adjudicator/route.ts'),'utf8');
assert.ok(route.includes('NODE_ENV!=="development"')&&route.includes('MYWAY_EXPERIMENTAL_RUNTIME!=="v37b"')&&!route.includes('topic_state'));
console.log('V3.7D.2C.7A.3S1.2 VERIFY PASS: S1/S1.1 and R2 runtime intact, source hashes pinned, local model-C route guarded, original main isolated.');
