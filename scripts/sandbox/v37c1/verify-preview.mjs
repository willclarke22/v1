#!/usr/bin/env node
/** V3.7C.1: read-only preflight. May call prior V3.7B.3 GET-only audit. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd());
const original=path.resolve(process.argv[3]||path.join(root,'..','v1'));
const remote=process.argv.includes('--remote');
const die=(x)=>{throw new Error('V3.7C.1 PREVIEW BLOCK: '+x)};
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const at=p=>path.join(root,...p.split('/'));
const git=(r,...args)=>execFileSync('git',['-C',r,...args],{encoding:'utf8'}).trim();
if(path.basename(root).toLowerCase()!=='v1-learning-experiment'||path.basename(original).toLowerCase()!=='v1')die('Wrong worktree names');
const common=r=>path.resolve(r,git(r,'rev-parse','--git-common-dir')).toLowerCase();
if(common(root)!==common(original))die('Original/experiment are not linked Git worktrees');
if(!git(root,'branch','--show-current').startsWith('myway/learning-sandbox-'))die('Wrong Git branch');
const marker=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37c1/installation.json'),'utf8'));
if(marker.schema!=='myway-v37c1-install-v1'||marker.read_only!==true)die('Installation marker invalid');
for(const [rel,expected] of Object.entries(marker.file_hashes)){
 if(rel.includes('..')||rel.startsWith('/')||!/^[a-zA-Z0-9_./-]+$/.test(rel))die('Unsafe path in marker');
 if(!fs.existsSync(at(rel))||sha(at(rel))!==expected)die('Source drift: '+rel);
}
const b3=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37b3/installation.json'),'utf8'));
if(b3.schema!=='myway-v37b3-install-v1')die('V3.7B.3 marker missing');
for(const rel of ['next.config.ts','scripts/local-dev/semantic-enrichment-worker.ps1']) {
 if(sha(at(rel))!==b3.file_hashes[rel])die('V3.7B.3 fail-closed source drift: '+rel);
}
const next=fs.readFileSync(at('next.config.ts'),'utf8');
if(!next.includes('assertExperimentalStartupGate()'))die('Startup gate missing');
const proxy=fs.readFileSync(at('proxy.ts'),'utf8');
for(const token of ['export function proxy','/api/sandbox/probe-lab/learning-space/readonly','Route blocked in V3.7C.1','127.0.0.1:3001'])if(!proxy.includes(token))die('Missing proxy boundary '+token);
if(fs.existsSync(at('middleware.ts'))||fs.existsSync(at('src/middleware.ts'))||fs.existsSync(at('src/proxy.ts')))die('Additional middleware/proxy detected');
for(const [rel,token] of [
 ['app/api/sandbox/probe-lab/learning-space/readonly/route.ts','export async function GET()'],
 ['sandbox/probe-lab/learning-space/snapshot.server.ts','getLatestTopicState()'],
 ['sandbox/probe-lab/learning-space/learning-space-preview.tsx','SpaceCanvas'],
 ['sandbox/probe-lab/learning-space/workbench.tsx','WorkbenchSnapshot']
])if(!fs.readFileSync(at(rel),'utf8').includes(token))die('Missing read-only entry point '+rel);
const {parseEnv,assertDestinationPin} = await import('../v37b2/live-utilities.mjs');
const src=parseEnv(path.join(original,'.env.local'));
const dst=parseEnv(at('.env.local'));
assertDestinationPin(root,src,dst);
if(dst.MYWAY_EXPERIMENTAL_RUNTIME!=='v37b'||dst.MYWAY_TOPIC_VECTOR_BACKEND!=='supabase')die('Experimental Supabase-only flags missing');
for(const k of ['QDRANT_URL','QDRANT_API_KEY','QDRANT_TOPIC_COLLECTION'])if(dst[k]||process.env[k])die('Qdrant environment detected: '+k);
const seed=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37b2/topic-seed-report.json'),'utf8'));
if(seed.schema!=='myway-v37b2-topic-seed-v1'||seed.self_match!==true||seed.topics_copied<1)die('Baseline topic seed unverified');
if(remote) {
 const checker=at('scripts/sandbox/v37b3/readonly-runtime-audit.mjs');
 execFileSync(process.execPath,[checker,root],{stdio:'inherit'}); // GET-only network reads
}
console.log('V3.7C.1 READ-ONLY VERIFY PASS: original checkout untouched; sandbox project pinned; legacy routes blocked.');
console.log('NEXT: run .\\scripts\\sandbox\\v37c1\\run-readonly-preview.ps1 from the experimental terminal.');
