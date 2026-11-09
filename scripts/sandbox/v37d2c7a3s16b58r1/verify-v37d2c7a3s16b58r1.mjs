#!/usr/bin/env node
/** Read-only S58-R1 additive stage verifier. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const file=path.join(root,'scripts/sandbox/v37d2c7a3s16b58r1/installation.json');
const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
if(receipt.schema!=='myway-s16b58r1-additive-receipt-v1'||receipt.version!=='v37d2c7a3s16b58r1'||receipt.additions?.length!==5)throw Error('S58-R1 receipt mismatch');
for(const item of receipt.additions){if(!/^scripts\/sandbox\/[a-zA-Z0-9._/-]+$/.test(item.path)||item.path.split('/').includes('..'))throw Error('Invalid receipt path');const p=path.join(root,item.path);const b=fs.readFileSync(p);if(crypto.createHash('sha256').update(b).digest('hex')!==item.sha256||b.length!==item.bytes)throw Error('S58-R1 payload drift: '+item.path);}
const out=execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s16b58r1-selftest.mjs')],{encoding:'utf8',timeout:90000,cwd:root});
if(!out.includes('S58-R1 SELFTEST PASS'))throw Error('S58-R1 selftest did not pass');
console.log('S58-R1 VERIFY PASS: five hashed payload sources, zero DB/model calls, trial condition gates and probe/revision research regression.');
