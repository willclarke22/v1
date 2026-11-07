#!/usr/bin/env node
/** Exact-source and guard verification. Does not invoke any provider. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const route='app/api/sandbox/probe-lab/local-assessment/s16b4d-teaching/route.ts';
const evalPath='scripts/sandbox/learning-intelligence/s16b4d-eval.mjs';
assert.equal(hash(route),'79020d85740ba1a5f9f0d4fb7860fd8dd5fe2b7bdc8c56c38068f8b2bc12c98c');
assert.equal(hash(evalPath),'b3d9aeadbf33b4b867561d66281fb0fe9a960b6cba180caefae4a4d7a73a0728');
for(const v of ['s16b4d','s16b4dfix1'])assert.ok(fs.existsSync(path.join(root,`scripts/sandbox/v37d2c7a3${v}/installation.json`)));
const proxy=fs.readFileSync(path.join(root,'proxy.ts'),'utf8');
assert.equal(hash('proxy.ts'),'917bdadc239a25b9625b8cc667b971149e9a5f1e4883fba5b735f73124b61337');
assert.ok(proxy.indexOf('process.env.VERCEL === "1"')<proxy.indexOf('s16b4d-teaching'));
assert.match(proxy,/Route blocked in V3\.7C\.1 read-only sandbox/);
console.log('S1.6B.4D FIX2 VERIFY PASS: S16B5 reviewed route, unchanged evaluator, unchanged proxy and cloud guards; bounded format retry and diagnostic-only writes.');
