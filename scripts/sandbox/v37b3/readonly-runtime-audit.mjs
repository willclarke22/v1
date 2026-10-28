#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {parseEnv, supabaseUrl, key, assertDestinationPin, request, loadBoundary} from '../v37b2/live-utilities.mjs';
const fail=(m)=>{throw Error('V3.7B.3 READ-ONLY BLOCK: '+m)};
const root=path.resolve(process.argv[2]||process.cwd());
const orig=path.join(path.dirname(root),'v1');
if(path.basename(root).toLowerCase()!=='v1-learning-experiment')fail('Wrong working directory');
const git=(r,...args)=>execFileSync('git',['-C',r,...args],{encoding:'utf8'}).trim();
const common=(r)=>path.resolve(r,git(r,'rev-parse','--git-common-dir')).toLowerCase();
if(common(root)!==common(orig))fail('Original/experimental worktrees do not share Git source history');
if(!git(root,'branch','--show-current').startsWith('myway/learning-sandbox-'))fail('Wrong experiment branch');
const src=parseEnv(path.join(orig,'.env.local'));
const dst=parseEnv(path.join(root,'.env.local'));
assertDestinationPin(root,src,dst);
const boundary=loadBoundary(root);
if(dst.MYWAY_EXPERIMENTAL_RUNTIME!=='v37b'||dst.MYWAY_TOPIC_VECTOR_BACKEND!=='supabase')fail('Backend flags mismatch');
for(const name of ['QDRANT_URL','QDRANT_API_KEY','QDRANT_TOPIC_COLLECTION']) {
  if(dst[name])fail(`Experimental .env.local contains ${name}; no Qdrant is permitted`);
}
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const next=read('next.config.ts');
const worker=read('scripts/local-dev/semantic-enrichment-worker.ps1');
if(!next.includes('assertExperimentalStartupGate()'))fail('Experimental Next.js startup gate missing');
if(!worker.includes('V3.7B.3 WORKER BLOCK'))fail('Legacy background worker stop missing');
const installation=JSON.parse(read('scripts/sandbox/v37b3/installation.json'));
if(installation.schema!=='myway-v37b3-install-v1')fail('V3.7B.3 installer marker missing');
const seed=JSON.parse(read('scripts/sandbox/v37b2/topic-seed-report.json'));
if(seed.schema!=='myway-v37b2-topic-seed-v1'||seed.self_match!==true||!Number.isInteger(seed.topics_copied))fail('Verified topic-seed report is missing');
const endpoint=supabaseUrl(dst), secret=key(dst);
const counts={};
for(const [table,col] of [['topic_state','topic_id'],['topic_vectors','topic_id'],['runs','id'],['attempts','id']]){
  let count=0;
  for(let offset=0;offset<100000;offset+=200){
    // Only query record identifiers. No text, embeddings, learner data or credentials are logged.
    const response=await request(endpoint,secret,`/rest/v1/${table}?select=${col}&order=${col}.asc&limit=200&offset=${offset}`);
    if(!Array.isArray(response.data))fail(`Unexpected ${table} response`);
    count+=response.data.length;
    if(response.data.length<200)break;
    if(offset+200>=100000)fail(`Excessive ${table} count`);
  }
  counts[table]=count;
}
if(counts.topic_state!==seed.topics_copied)fail(`Topic count drift: expected ${seed.topics_copied}, got ${counts.topic_state}`);
if(counts.topic_vectors!==seed.indexed_vectors)fail(`Vector count drift: expected ${seed.indexed_vectors}, got ${counts.topic_vectors}`);
if(counts.runs!==0||counts.attempts!==0)fail('Unexpected historical learning writes; inspect before runtime');
const report={schema:'myway-v37b3-runtime-audit-v1',audited_utc:new Date().toISOString(),
  mode:'READ_ONLY_GET_REQUESTS',original_database_queries:0,original_database_writes:0,
  experimental_database_writes:0,source_worktree_unchanged:true,git_branch:git(root,'branch','--show-current'),
  counts,expected:{topics:seed.topics_copied,vectors:seed.indexed_vectors},
  sandbox_destination_pin_verified:true,app_start_allowed:false,legacy_worker_start_allowed:false,
  next_required:'V3.7C route audit plus sandbox-only app/worker launchers'};
const dir=path.join(os.homedir(),'Documents','MyWayDumps');fs.mkdirSync(dir,{recursive:true});
const filename=path.join(dir,'myway-v37b3-readonly-runtime-audit.json');
fs.writeFileSync(filename,JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(`V3.7B.3 READ-ONLY PASS: ${counts.topic_state} topics, ${counts.topic_vectors} vectors; original database untouched.`);
console.log('CHECK: Next.js remains guarded; legacy experimental worker refuses to run.');
console.log('AUDIT REPORT: '+filename);
