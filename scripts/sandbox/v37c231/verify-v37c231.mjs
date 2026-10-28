#!/usr/bin/env node
/** NVIDIA patch verification, including the existing remote sandbox read-only audit. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd());
const original=path.resolve(process.argv[3]||path.resolve(root,'../v1'));
const fail=s=>{throw Error('V3.7C.2.3.1 VERIFY STOP: '+s)};
const at=p=>path.join(root,...p.split('/'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
const marker=at('scripts/sandbox/v37c231/installation.json');
if(!fs.existsSync(marker))fail('V3.7C.2.3.1 not installed');
const own=JSON.parse(fs.readFileSync(marker,'utf8'));
if(own.schema!=='myway-v37c231-install-v1'||own.database_writes!==false||own.legacy_worker_enabled!==false||own.original_checkout_modified!==false)fail('Installation marker or safety flags invalid');
for(const [rel,digest]of Object.entries(own.file_hashes||{})){
 if(!/^[A-Za-z0-9_./-]+$/.test(rel)||rel.includes('..')||!fs.existsSync(at(rel))||sha(rel)!==digest)fail('File drift '+rel);
}
const src=fs.readFileSync(at('app/api/sandbox/probe-lab/local-assessment/glm/route.ts'),'utf8');
for(const term of ['https://integrate.api.nvidia.com/v1/chat/completions','NVIDIA_API_KEY','NVIDIA_MODELS','reasoning_effort','LOCAL_HOSTS','MYWAY_EXPERIMENTAL_RUNTIME'])if(!src.includes(term))fail('NVIDIA route guard missing '+term);
if(!src.includes('cfg.backend==="nvidia"?{}:{response_format:'))fail('NVIDIA JSON-mode compatibility drift');
// Reuse existing V3.7C.2.3 verifier and its full local+remote safety checks.
execFileSync(process.execPath,[at('scripts/sandbox/v37c23/verify-v37c23.mjs'),root,original,...(process.argv.includes('--remote')?['--remote']:[])],{stdio:'inherit'});
console.log('V3.7C.2.3.1 VERIFY PASS: fixed NVIDIA provider and all prior read-only gates verified.');
