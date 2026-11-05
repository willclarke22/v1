#!/usr/bin/env node
/** S1.2.1 additive overlay verification. No API calls or writes. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd());const at=p=>path.join(root,...p.split('/'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(at(p),'utf8'));
const git=(cwd,...args)=>execFileSync(process.platform==='win32'?'git.exe':'git',['-C',cwd,...args],{encoding:'utf8',timeout:20000}).trim();
assert.equal(path.basename(root),'v1-learning-experiment');
assert.equal(git(root,'branch','--show-current'),'myway/learning-sandbox-v3_7a');
const original=path.resolve(root,'../v1');
assert.equal(git(original,'branch','--show-current'),'main');assert.equal(git(original,'rev-parse','--short=7','HEAD'),'462a7a4');
const common=cwd=>fs.realpathSync(path.resolve(cwd,git(cwd,'rev-parse','--git-common-dir')));
assert.equal(common(root),common(original));
const s12=read('scripts/sandbox/v37d2c7a3s12/installation.json');assert.equal(s12.schema,'myway-v37d2c7a3s12-local-install-v1');
for(const [p,h] of Object.entries(s12.hashes))assert.equal(sha(p),h,'S1.2 source drift: '+p);
const pointer=read('scripts/sandbox/current-local-release.json');assert.equal(pointer.release,'v37d2c7a3s12','S1.2 compatibility overlay keeps existing pointer');
const marker=read('scripts/sandbox/v37d2c7a3s121/installation.json');
assert.equal(marker.schema,'myway-v37d2c7a3s121-local-overlay-v1');
assert.equal(marker.previous_release,'v37d2c7a3s12');
assert.equal(marker.original_proxy_sha256,'44b3912889b469186a2f326f535b83d31d583157252b6f25b4eb53851d8e8da3');
for(const [p,h] of Object.entries(marker.hashes))assert.equal(sha(p),h,'S1.2.1 source drift: '+p);
const proxy=fs.readFileSync(at('proxy.ts'),'utf8');
assert.ok(proxy.includes('if (process.env.VERCEL === "1")'));
assert.ok(proxy.indexOf('if (process.env.VERCEL === "1")')<proxy.indexOf('memory-adjudicator'));
assert.ok(proxy.includes('return new NextResponse("Route blocked in V3.7C.1 read-only sandbox", {status:403})'));
console.log('V3.7D.2C.7A.3S1.2.1 VERIFY PASS: exact source hashes, S1.2 unchanged, cloud gate precedes local allowlist, original main isolated.');
