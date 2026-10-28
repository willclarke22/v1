#!/usr/bin/env node
/** V3.7C.2 preflight: no source changes; optional GET-only sandbox DB check. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd());
const original=path.resolve(process.argv[3]||path.resolve(root,'../v1'));
const at=rel=>path.join(root,...rel.split('/'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fail=msg=>{throw Error('V3.7C.2 VERIFY BLOCK: '+msg)};
const git=(p,...args)=>execFileSync('git',['-C',p,...args],{encoding:'utf8'}).trim();
if(path.basename(root).toLowerCase()!=='v1-learning-experiment'||path.basename(original).toLowerCase()!=='v1')fail('Unexpected worktree');
const common=p=>path.resolve(p,git(p,'rev-parse','--git-common-dir')).toLowerCase();
if(common(root)!==common(original)||!git(root,'branch','--show-current').startsWith('myway/learning-sandbox-'))fail('Git boundary mismatch');
const marker=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37c2/installation.json'),'utf8'));
if(marker.schema!=='myway-v37c2-install-v1'||marker.database_writes!==false||marker.legacy_worker_enabled!==false)fail('Invalid patch marker');
const c1=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37c1/installation.json'),'utf8'));
if(c1.schema!=='myway-v37c1-install-v1'||c1.read_only!==true)fail('Read-only baseline marker missing');
const b3=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37b3/installation.json'),'utf8'));
for(const [rel,hash] of Object.entries({...marker.file_hashes,...b3.file_hashes})){
 if(!/^[a-zA-Z0-9_./-]+$/.test(rel)||rel.includes('..')||!fs.existsSync(at(rel))||sha(at(rel))!==hash)fail('Source drift: '+rel);
}
for(const [rel,hash] of Object.entries(c1.file_hashes))if(!fs.existsSync(at(rel))||sha(at(rel))!==hash)fail('Read-only source drift: '+rel);
const proxy=fs.readFileSync(at('proxy.ts'),'utf8');
for(const token of ['127.0.0.1:3001','/api/sandbox/probe-lab/learning-space/retrieve','/api/sandbox/probe-lab/local-assessment/openai','/api/sandbox/probe-lab/local-assessment/teaching','Route blocked in V3.7C.1'])if(!proxy.includes(token))fail('Proxy token missing: '+token);
if(!fs.readFileSync(at('scripts/local-dev/semantic-enrichment-worker.ps1'),'utf8').includes('V3.7B.3 WORKER BLOCK'))fail('Worker hard stop missing');
if(!fs.readFileSync(at('next.config.ts'),'utf8').includes('assertExperimentalStartupGate()'))fail('Next gate missing');
const previous=at('scripts/sandbox/v37c1/verify-preview.mjs');
if(process.argv.includes('--remote'))execFileSync(process.execPath,[previous,root,original,'--remote'],{stdio:'inherit'});
console.log('V3.7C.2 VERIFY PASS: local-only inference route whitelist, Supabase pin, source hashes, legacy-worker block.');
