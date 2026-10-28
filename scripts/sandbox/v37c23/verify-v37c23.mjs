#!/usr/bin/env node
/** Verify the existing guarded launch + V3.7C.2.3 GLM route before starting any service. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd());
const original=path.resolve(process.argv[3]||path.resolve(root,'../v1'));
const fail=s=>{throw Error('V3.7C.2.3 VERIFY STOP: '+s)};
const at=p=>path.join(root,...p.split('/'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(at(p))).digest('hex');
const git=(p,...a)=>execFileSync('git',['-C',p,...a],{encoding:'utf8'}).trim();
if(path.basename(root).toLowerCase()!=='v1-learning-experiment'||path.basename(original).toLowerCase()!=='v1')fail('Path mismatch');
const common=p=>path.resolve(p,git(p,'rev-parse','--git-common-dir')).toLowerCase();
if(common(root)!==common(original)||!git(root,'branch','--show-current').startsWith('myway/learning-sandbox-'))fail('Git isolation mismatch');
const expected={
 'scripts/sandbox/v37b3/installation.json':'myway-v37b3-install-v1',
 'scripts/sandbox/v37c1/installation.json':'myway-v37c1-install-v1',
 'scripts/sandbox/v37c2/installation.json':'myway-v37c2-install-v1',
 'scripts/sandbox/v37c21/installation.json':'myway-v37c21-install-v1',
 'scripts/sandbox/v37c22/installation.json':'myway-v37c22-install-v1',
 'scripts/sandbox/v37c23/installation.json':'myway-v37c23-install-v1',
};
const markers=[];
for(const [p,schema]of Object.entries(expected)){
 if(!fs.existsSync(at(p)))fail('Missing '+p);
 const m=JSON.parse(fs.readFileSync(at(p),'utf8'));if(m.schema!==schema)fail('Unexpected marker '+p);
 if('database_writes'in m&&m.database_writes!==false)fail('Writes are not disabled');
 for(const [rel,digest]of Object.entries(m.file_hashes||{})){
  if(!/^[A-Za-z0-9_./-]+$/.test(rel)||rel.includes('..')||!fs.existsSync(at(rel))||hash(rel)!==digest)fail('Hash drift '+rel);
 }
 markers.push(m);
}
const c23=markers.at(-1);
if(c23.database_writes!==false||c23.original_checkout_modified!==false||c23.legacy_worker_enabled!==false)fail('Unsafe stage metadata');
const prox=fs.readFileSync(at('proxy.ts'),'utf8');
for(const text of ['/api/sandbox/probe-lab/local-assessment/glm','/api/sandbox/probe-lab/local-assessment/openai',
 '/api/sandbox/probe-lab/local-assessment/teaching','/api/sandbox/probe-lab/learning-space/readonly',
 '/api/sandbox/probe-lab/learning-space/retrieve','Route blocked in V3.7C.1','127.0.0.1:3001'])
 if(!prox.includes(text))fail('Proxy route whitelist drift');
if(!fs.readFileSync(at('next.config.ts'),'utf8').includes('assertExperimentalStartupGate()'))fail('Startup guard missing');
if(!fs.readFileSync(at('scripts/local-dev/semantic-enrichment-worker.ps1'),'utf8').includes('V3.7B.3 WORKER BLOCK'))fail('Worker guard missing');
const glm=fs.readFileSync(at('app/api/sandbox/probe-lab/local-assessment/glm/route.ts'),'utf8');
if(!glm.includes('https://api.z.ai/api/paas/v4/chat/completions')||!glm.includes('https://openrouter.ai/api/v1/chat/completions')||!glm.includes('MYWAY_EXPERIMENTAL_RUNTIME')||!glm.includes('LOCAL_HOSTS'))fail('GLM route safety drift');
// Reuse existing V3.7C.2 verification, including remote sandbox read-only checks when requested.
const old=at('scripts/sandbox/v37c2/verify-v37c2.mjs');
execFileSync(process.execPath,[old,root,original,...(process.argv.includes('--remote')?['--remote']:[])],{stdio:'inherit'});
console.log('V3.7C.2.3 VERIFY PASS: GLM route confined to local preview, prior startup and worker guards intact.');
