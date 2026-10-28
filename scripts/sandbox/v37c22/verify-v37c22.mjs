#!/usr/bin/env node
/** Read-only source verification, can be run after installation; no network required. */
import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';
const root=path.resolve(process.argv[2]||process.cwd());
const at=rel=>path.join(root,...rel.split('/'));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const fail=m=>{throw Error('V3.7C.2.2 VERIFY BLOCK: '+m);};
const own=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37c22/installation.json'),'utf8'));
const c2=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37c2/installation.json'),'utf8'));
const c1=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37c1/installation.json'),'utf8'));
const b3=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37b3/installation.json'),'utf8'));
if(own.schema!=='myway-v37c22-install-v1'||own.database_writes!==false||c2.database_writes!==false||c1.read_only!==true)fail('State-write policy marker mismatch');
for(const marker of [own,c2,c1,b3])for(const [rel,digest] of Object.entries(marker.file_hashes||{})){
 if(rel.includes('..')||rel.startsWith('/')||!fs.existsSync(at(rel))||sha(at(rel))!==digest)fail('Source integrity '+rel);
}
if(!fs.readFileSync(at('proxy.ts'),'utf8').includes('Route blocked in V3.7C.1'))fail('Legacy route block absent');
console.log('V3.7C.2.2 READ-ONLY VERIFY PASS: latency sources and existing route/worker safety hashes intact.');
