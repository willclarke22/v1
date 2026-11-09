#!/usr/bin/env node
/** Read-only stage verifier. No network or DB. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const stage='v37d2c7a3s16b58r1fix1';
const data=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox',stage,'installation.json'),'utf8'));
if(data.schema!=='myway-s16b58r1fix1-additive-receipt-v1'||data.version!==stage||data.additions?.length!==4)throw Error('FIX1 stage receipt mismatch');
for(const item of data.additions){
 if(!/^scripts\/sandbox\/[a-zA-Z0-9._/-]+$/.test(item.path)||item.path.split('/').includes('..'))throw Error('Bad receipt path');
 const p=path.join(root,item.path),b=fs.readFileSync(p);const sha=crypto.createHash('sha256').update(b).digest('hex');
 if(sha!==item.sha256||b.length!==item.bytes)throw Error('FIX1 source drift: '+item.path);
}
const out=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s16b58r1fix1-selftest.mjs')],{encoding:'utf8',timeout:90000,cwd:root});
if(!out.includes('S58-R1-FIX1 SELFTEST PASS'))throw Error('FIX1 tests failed');
console.log('S58-R1-FIX1 VERIFY PASS: exact 4 additions, paired non-leading probes, 8 independent observations, no API or DB writes.');
