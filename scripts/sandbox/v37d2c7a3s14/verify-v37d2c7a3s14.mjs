#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||process.cwd());
const manifest=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/v37d2c7a3s14/installation.json'),'utf8'));
assert.equal(manifest.schema,'myway-v37d2c7a3s14-local-overlay-v1');
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/current-local-release.json'),'utf8')).release,'v37d2c7a3s12');
for(const [p,h] of Object.entries(manifest.hashes)){
 const data=fs.readFileSync(path.join(root,...p.split('/')));assert.equal(crypto.createHash('sha256').update(data).digest('hex'),h,'S1.4 drift: '+p);
}
console.log('V3.7D.2C.7A.3S1.4 VERIFY PASS: scoped source hashes and unchanged S1.2 release pointer.');
