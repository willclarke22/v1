#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const route='app/api/sandbox/probe-lab/local-assessment/s16b4d-teaching/route.ts';
// FIX2 explicitly authorizes the reviewed prompt-length/format-retry update.
assert.ok(['715063ed7f9320c0f664084276e2b7f6d2fd193266e79321f7d1586213dee48f','ad435bb2a9b3efa03795b88ee40b5a918a3773de394780034e44a92ccec5f242','79020d85740ba1a5f9f0d4fb7860fd8dd5fe2b7bdc8c56c38068f8b2bc12c98c','13499f1e9ef8f5ceac0fc482b85465ddd5c3a63e61a5bdcf2181855fca620225'].includes(hash(route)),'4D route changed outside approved FIX1/FIX2/S16B5/S16B5.1 source versions');
assert.ok(fs.existsSync(path.join(root,'scripts/sandbox/v37d2c7a3s16b4d/installation.json')));
const proxy=fs.readFileSync(path.join(root,'proxy.ts'),'utf8');
assert.match(proxy,/process\.env\.VERCEL === "1"/);
assert.match(proxy,/Route blocked in V3\.7C\.1 read-only sandbox/);
assert.match(proxy,/S1\.6B\.4D FIX1/);
assert.ok(proxy.indexOf('process.env.VERCEL === "1"')<proxy.indexOf('s16b4d-teaching'));
console.log('S1.6B.4D FIX1 VERIFY PASS: approved 4D/S16B5 route, cloud gate precedes local allowlist, default deny retained.');
