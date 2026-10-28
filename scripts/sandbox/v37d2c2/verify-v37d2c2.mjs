#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd());const at=x=>path.join(root,...x.split('/'));
const stop=x=>{throw Error('V3.7D.2C.2 VERIFY STOP: '+x)};
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const canonical=f=>crypto.createHash('sha256').update(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/\n+$/,'')+'\n').digest('hex');
if(path.basename(root)!=='v1-learning-experiment'||!fs.existsSync(at('scripts/sandbox/v37d2c1hotfix/installation.json')))stop('Experiment worktree and client-directive hotfix required');
const original=path.resolve(root,'../v1');const git=(r,...args)=>execFileSync('git',['-C',r,...args],{encoding:'utf8'}).trim();
const common=r=>path.resolve(r,git(r,'rev-parse','--git-common-dir')).toLowerCase();
if(!git(root,'branch','--show-current').startsWith('myway/learning-sandbox-')||common(root)!==common(original))stop('Git worktree isolation failed');
const marker=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37d2c2/installation.json'),'utf8'));
if(marker.schema!=='myway-v37d2c2-install-v1'||marker.database_writes!==false||marker.original_checkout_modified!==false||marker.auto_model_writes!==false||marker.legacy_worker_enabled!==false)stop('Unsafe installation marker');
for(const [rel,hash] of Object.entries(marker.file_hashes||{})){
 if(!/^[a-zA-Z0-9_./-]+$/.test(rel)||rel.includes('..')||!fs.existsSync(at(rel))||sha(at(rel))!==hash)stop('Source/payload hash drift: '+rel);
}
const previous=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37d2c1/installation.json'),'utf8'));
if(previous.schema!=='myway-v37d2c1-install-v1'||previous.write_policy!=='shadow_verifier_no_new_write_authority'||previous.original_checkout_modified!==false)stop('D2C1 predecessor marker invalid');
for(const [rel,hash] of Object.entries(previous.file_hashes||{})){
 if(rel in (marker.file_hashes||{}))continue;
 if(!fs.existsSync(at(rel))||sha(at(rel))!==hash)stop('Prior released source changed unexpectedly: '+rel);
}
const hotfix=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37d2c1hotfix/installation.json'),'utf8'));
if(hotfix.schema!=='myway-v37d2c1-client-directive-hotfix-install-v1'||hotfix.database_writes!==false)stop('Hotfix marker mismatch');
for(const [rel,hash] of Object.entries(hotfix.helper_hashes||{}))if(!fs.existsSync(at(rel))||sha(at(rel))!==hash)stop('Hotfix helper altered: '+rel);
const c23=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37c23/installation.json'),'utf8'));
if(sha(at('proxy.ts'))!==c23.file_hashes['proxy.ts'])stop('Proxy changed');
const protectedHashes={'next.config.ts':'dc644ee3610c1562277d976e164b57dc0da39e3744ade87ad77b25c4d20337eb','scripts/local-dev/semantic-enrichment-worker.ps1':'0597c3cc5763a0f648549393048d9adec95473a85707397562bcdda4d3d8ab01'};
for(const [file,hash] of Object.entries(protectedHashes))if(canonical(at(file))!==hash)stop('Protected startup/worker drift: '+file);
for(const file of ['sandbox/probe-lab/learning-space/score-observations.server.ts','sandbox/probe-lab/learning-space/topic-memory-approval.server.ts','sandbox/probe-lab/learning-space/topic-memory-commit.server.ts'])if(!fs.readFileSync(at(file),'utf8').includes('import "server-only"'))stop('Server authority boundary missing');
const route=fs.readFileSync(at('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts'),'utf8');
for(const token of ['origin!==ownOrigin','I_APPROVE_ONE_TOPIC_MEMORY_WRITE','v37d2c2-human-review','I_REVIEWED_AND_APPROVE_EXISTING_TOPIC_ASSOCIATION','v37d2c2-observation','consumeReview','observationIsValid'])if(!route.includes(token))stop('Missing commit/observation guard: '+token);
if(fs.readFileSync(at('scripts/sandbox/v37d2c2/MIGRATION_APPLY_ONLY_TO_MYWAY_SANDBOX.sql'),'utf8').includes('drop table'))stop('Migration is destructive');
const {parseEnv,assertDestinationPin}=await import('../v37b2/live-utilities.mjs');
const sourceEnv=parseEnv(path.join(original,'.env.local')),destEnv=parseEnv(at('.env.local'));
assertDestinationPin(root,sourceEnv,destEnv);
if(destEnv.MYWAY_EXPERIMENTAL_RUNTIME!=='v37b'||destEnv.MYWAY_TOPIC_VECTOR_BACKEND!=='supabase')stop('Sandbox env not pinned');
for(const key of ['QDRANT_URL','QDRANT_API_KEY','QDRANT_TOPIC_COLLECTION'])if(destEnv[key]||process.env[key])stop('Qdrant enabled');
if(process.argv.includes('--remote')){
 const {request,supabaseUrl,key}=await import('../v37b2/live-utilities.mjs');
 const r=await request(supabaseUrl(destEnv),key(destEnv),'/rest/v1/topic_state?select=topic_id&limit=1');
 if(!Array.isArray(r.data))stop('Sandbox topic_state read unavailable');
 console.log('V3.7D.2C.2 PINNED SANDBOX READ PASS (no topic-count assumption).');
}
console.log('V3.7D.2C.2 VERIFY PASS: isolated worktree, source integrity, pinned Supabase, protected proxy/worker, manual verifier review, no automatic Model C writes.');
