#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||process.cwd());const at=p=>path.join(root,...p.split('/'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
const marker=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37d2c7a3s15/installation.json'),'utf8'));
assert.equal(marker.schema,'myway-v37d2c7a3s15-local-overlay-v1');
assert.equal(JSON.parse(fs.readFileSync(at('scripts/sandbox/current-local-release.json'),'utf8')).release,'v37d2c7a3s12');
assert.equal(marker.previous_overlay,'v37d2c7a3s14');
for(const [p,hash] of Object.entries(marker.hashes)){assert.equal(sha(p),hash,'S1.5 source drift: '+p);}
const previous=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37d2c7a3s14/installation.json'),'utf8'));
for(const [p,h] of Object.entries(previous.hashes))if(p!=='proxy.ts')assert.equal(sha(p),h,'S1.4 drift: '+p);
console.log('V3.7D.2C.7A.3S1.5 VERIFY PASS: source unchanged outside exact S1.5 overlay; predecessor intact.');
