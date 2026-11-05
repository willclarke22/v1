#!/usr/bin/env node
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=path.resolve(process.argv[2]||process.cwd()),at=p=>path.join(root,...p.split('/'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
const mark=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37d2c7a3s151/installation.json')));
const old=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37d2c7a3s15/installation.json')));
assert.equal(mark.schema,'myway-v37d2c7a3s151-local-overlay-v1');
assert.equal(mark.previous_overlay,'v37d2c7a3s15');
assert.equal(JSON.parse(fs.readFileSync(at('scripts/sandbox/current-local-release.json'))).release,'v37d2c7a3s12');
assert.equal(old.hashes['scripts/sandbox/learning-intelligence/s15-flow.mjs'],mark.preimage_flow_sha256);
for(const [p,h] of Object.entries(old.hashes))if(p!=='scripts/sandbox/learning-intelligence/s15-flow.mjs')assert.equal(sha(p),h,'S1.5 prior overlay source drift '+p);
for(const [p,h] of Object.entries(mark.hashes))if(p!=='scripts/sandbox/v37d2c7a3s151/installation.json')assert.equal(sha(p),h,'S1.5.1 source drift '+p);
assert.equal(sha('scripts/sandbox/learning-intelligence/s15-flow.mjs'),mark.hashes['scripts/sandbox/learning-intelligence/s15-flow.mjs']);
console.log('S1.5.1 VERIFY PASS: exact source overlay, preceding S1.5 source intact except approved CLI change, release pointer unchanged.');
