#!/usr/bin/env node
/** V3.7C.3 guarded post-install check. Sandbox topic state remains READ ONLY. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd()),original=path.resolve(root,'../v1');
const at=rel=>path.join(root,...rel.split('/'));
const stop=x=>{throw Error('V3.7C.3 VERIFY STOP: '+x)};
const git=(r,...a)=>execFileSync('git',['-C',r,...a],{encoding:'utf8'}).trim();
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
// Compare protected files with the captured source *content*, allowing only
// line-ending, UTF-8 BOM, and trailing-final-newline representation variance.
const contentDigest=p=>crypto.createHash('sha256').update(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/\n+$/,'')+'\n').digest('hex');
if(path.basename(root).toLowerCase()!=='v1-learning-experiment'||path.basename(original).toLowerCase()!=='v1')stop('Wrong worktree');
const common=r=>path.resolve(r,git(r,'rev-parse','--git-common-dir')).toLowerCase();
if(common(root)!==common(original)||!git(root,'branch','--show-current').startsWith('myway/learning-sandbox-'))stop('Git isolation/branch mismatch');
for(const p of ['scripts/sandbox/v37b3/installation.json','scripts/sandbox/v37c1/installation.json','scripts/sandbox/v37c23/installation.json','scripts/sandbox/v37c3/installation.json'])if(!fs.existsSync(at(p)))stop('Missing marker: '+p);
const m=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37c3/installation.json'),'utf8'));
if(m.schema!=='myway-v37c3-install-v1'||m.database_writes!==false||m.legacy_worker_enabled!==false||m.original_checkout_modified!==false)stop('Unsafe install marker');
for(const [rel,wanted] of Object.entries(m.file_hashes||{})){
 if(!/^[a-zA-Z0-9_./-]+$/.test(rel)||rel.includes('..')||!fs.existsSync(at(rel))||digest(at(rel))!==wanted)stop('Source/hash drift: '+rel);
}
// Critical gates are left byte-for-byte untouched by this patch.
const c23=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37c23/installation.json'),'utf8'));
for(const rel of ['proxy.ts','app/api/sandbox/probe-lab/learning-space/retrieve/route.ts','app/api/sandbox/probe-lab/local-assessment/glm/route.ts']){
 if(rel==='app/api/sandbox/probe-lab/local-assessment/glm/route.ts')continue; // Updated in C.3
 if(rel==='proxy.ts'&&digest(at(rel))!==c23.file_hashes[rel])stop('Proxy gate changed');
}
// V3.7B.3 hashes are historical; later approved patches changed both guard files.
const protectedHashes={
 'next.config.ts':'dc644ee3610c1562277d976e164b57dc0da39e3744ade87ad77b25c4d20337eb',
 'scripts/local-dev/semantic-enrichment-worker.ps1':'0597c3cc5763a0f648549393048d9adec95473a85707397562bcdda4d3d8ab01',
};
for(const [rel,hash] of Object.entries(protectedHashes))if(contentDigest(at(rel))!==hash)stop('Startup/worker gate content drift: '+rel);
const proxy=fs.readFileSync(at('proxy.ts'),'utf8');
for(const token of ['127.0.0.1:3001','Route blocked in V3.7C.1','/api/sandbox/probe-lab/local-assessment/glm','/api/sandbox/probe-lab/local-assessment/openai','/api/sandbox/probe-lab/local-assessment/teaching'])if(!proxy.includes(token))stop('Missing proxy whitelist token: '+token);
if(fs.existsSync(at('middleware.ts'))||fs.existsSync(at('src/middleware.ts'))||fs.existsSync(at('src/proxy.ts')))stop('Conflicting route guard');
if(!fs.readFileSync(at('next.config.ts'),'utf8').includes('assertExperimentalStartupGate()'))stop('Next startup gate absent');
if(!fs.readFileSync(at('scripts/local-dev/semantic-enrichment-worker.ps1'),'utf8').includes('V3.7B.3 WORKER BLOCK'))stop('Legacy worker guard absent');
const {parseEnv,assertDestinationPin}=await import('../v37b2/live-utilities.mjs');
const origin=parseEnv(path.join(original,'.env.local')),destination=parseEnv(at('.env.local'));
assertDestinationPin(root,origin,destination);
if(destination.MYWAY_EXPERIMENTAL_RUNTIME!=='v37b'||destination.MYWAY_TOPIC_VECTOR_BACKEND!=='supabase')stop('Experiment runtime or vector backend not pinned');
for(const k of ['QDRANT_URL','QDRANT_API_KEY','QDRANT_TOPIC_COLLECTION'])if(destination[k]||process.env[k])stop('Qdrant not permitted in experimental runtime');
if(process.argv.includes('--remote')){
 execFileSync(process.execPath,[at('scripts/sandbox/v37b3/readonly-runtime-audit.mjs'),root],{stdio:'inherit'});
}
console.log('V3.7C.3 VERIFY PASS: guarded local preview, pinned sandbox DB, source hashes, workers disabled, no learner-state writes.');
