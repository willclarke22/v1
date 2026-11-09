#!/usr/bin/env node
/** Read-only installed-stage integrity and research selftest. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../..');
const receipt=JSON.parse(fs.readFileSync(path.join(HERE,'installation.json'),'utf8'));
if(receipt.schema!=='myway-s16b59-additive-receipt-v1'||receipt.version!=='v37d2c7a3s16b59'||receipt.additions.length!==5)throw Error('S59 invalid receipt');
for(const item of receipt.additions){
 if(!/^scripts\/sandbox\/[a-zA-Z0-9._/-]+$/.test(item.path)||item.path.includes('..'))throw Error('S59 invalid path');
 const file=path.join(ROOT,item.path);const b=fs.readFileSync(file);const hash=crypto.createHash('sha256').update(b).digest('hex');
 if(hash!==item.sha256||b.length!==item.bytes)throw Error('S59 source changed: '+item.path);
}
const result=execFileSync(process.execPath,[path.join(ROOT,'scripts/sandbox/learning-intelligence/s16b59-selftest.mjs')],{cwd:ROOT,encoding:'utf8',timeout:90000});
console.log(result.trim());console.log('S59 VERIFY PASS: installed hashes, small role-specific context, new learner relationship proposals, exploratory retrieval, controlled probes, no provider or DB writes.');
