#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../../');
const release=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/current-local-release.json'),'utf8'));
assert.equal(release.release,'v37d2c7a3s12');
assert.ok(fs.existsSync(path.join(root,'scripts/sandbox/v37d2c7a3s151/installation.json')));
const paths=['scripts/sandbox/learning-intelligence/s16-space-sim.mjs','scripts/sandbox/learning-intelligence/s16-seed.json','scripts/sandbox/learning-intelligence/s16-selftest.mjs','scripts/sandbox/v37d2c7a3s16/README.md'];
for(const p of paths)assert.ok(fs.existsSync(path.join(root,p)),`S1.6A source missing: ${p}`);
const seed=JSON.parse(fs.readFileSync(path.join(root,paths[1]),'utf8'));
assert.equal(seed.topics.length,12);assert.equal(seed.turns.length,18);
console.log('S1.6A VERIFY PASS: additive files present, S1.5.1 installation marker preserved, release unchanged, 12 synthetic topics and 18 turns.');
