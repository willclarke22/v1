#!/usr/bin/env node
/* V3.7B.2: guarded, explicit, memory-only copy of topic_state rows.
 * GET source. POST ONLY to separately pinned experimental Supabase project.
 * No original write endpoints. No student/learner content written to logs.
 */
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv,supabaseUrl,key,request,assertDestinationPin,verifyTargetSchema,topicRows,summarize} from './live-utilities.mjs';
const [targetArg,mode='--check',confirmation='']=process.argv.slice(2);
if(!targetArg)throw new Error('Usage: node seed-and-verify.mjs <experiment-root> [--check|--apply <confirmation>]');
const target=path.resolve(targetArg),original=path.resolve(target,'..','v1');
function die(s){throw new Error('V3.7B.2 BLOCK: '+s)}
const reportPath=path.join(target,'scripts/sandbox/v37b2/topic-seed-report.json');
const expectedConfirm='APPLY-MYWAY-SANDBOX-TOPICS-V37B2';
if(mode!=='--check'&&mode!=='--apply')die('Unrecognized mode');
if(mode==='--apply'&&confirmation!==expectedConfirm)die('Exact confirmation required; no writes made');
if(!target.endsWith('v1-learning-experiment')||!fs.existsSync(path.join(original,'.git')))die('Wrong worktree destination');
if(!fs.existsSync(path.join(target,'scripts/sandbox/v37b2/sandbox-destination.json')))die('Destination not configured');
if(!fs.existsSync(path.join(target,'scripts/sandbox/v37b2/installation.json')))die('V3.7B.2 source patch missing');
const src=parseEnv(path.join(original,'.env.local'));
const dst=parseEnv(path.join(target,'.env.local'));
assertDestinationPin(target,src,dst);
if(dst.MYWAY_EXPERIMENTAL_RUNTIME!=='v37b'||dst.MYWAY_TOPIC_VECTOR_BACKEND!=='supabase')die('Experimental runtime/backend flags missing');
const srcUrl=supabaseUrl(src),srcKey=key(src),dstUrl=supabaseUrl(dst),dstKey=key(dst);
await verifyTargetSchema(dstUrl,dstKey);
const emptyCheck=await request(dstUrl,dstKey,'/rest/v1/topic_state?select=topic_id&limit=1');
if(!Array.isArray(emptyCheck.data)||emptyCheck.data.length!==0)die('Destination contains topic rows. Refusing overwrite/duplicate import');
const existingVectors=await request(dstUrl,dstKey,'/rest/v1/topic_vectors?select=topic_id&limit=1');
if(!Array.isArray(existingVectors.data)||existingVectors.data.length!==0)die('Destination already has vectors');
const existingRuns=await request(dstUrl,dstKey,'/rest/v1/runs?select=id&limit=1');
const existingAttempts=await request(dstUrl,dstKey,'/rest/v1/attempts?select=id&limit=1');
if(existingRuns.data?.length||existingAttempts.data?.length)die('Destination contains prior runs/attempts; must import into fresh sandbox');
const sourceRows=await topicRows(srcUrl,srcKey);
const before=summarize(sourceRows);
for(const r of sourceRows){
  if(!r||typeof r.topic_id!=='string'||!r.topic_id||typeof r.topic_label!=='string'||!r.topic_label)die('Source record missing required topic ID/label');
}
if(new Set(sourceRows.map(r=>r.topic_id)).size!==sourceRows.length)die('Duplicate source topic IDs');
console.log('V3.7B.2 READ-ONLY PREFLIGHT PASS: projects distinct; destination schema verified and empty.');
console.log(`Source topics: ${before.topics}. 384-d label vectors: ${before.label_valid}; message vectors: ${before.message_valid}.`);
console.log(`Foreign-key links to historical runs to clear: ${before.last_run_links}.`);
console.log('Source embedding-model counts:',JSON.stringify({label:before.model_labels,message:before.model_messages}));
if(mode==='--check'){
  console.log('DRY RUN ONLY: No rows imported. Use explicit --apply after reviewing the result.');
  process.exit(0);
}
if(sourceRows.length===0)die('Source topic_state is empty; no import to perform');
const safeRows=sourceRows.map(row=>({...row,last_run_id:null}));
let copied=0;
try{
  // Limited batches. No upsert/overwrite: duplicate or drift errors fail closed.
  for(let i=0;i<safeRows.length;i+=20){
    const chunk=safeRows.slice(i,i+20);
    await request(dstUrl,dstKey,'/rest/v1/topic_state',{method:'POST',body:chunk,headers:{Prefer:'return=minimal'}});
    copied+=chunk.length;
    console.log(`Copied ${copied}/${safeRows.length} topic rows to experimental Supabase.`);
  }
  const indexed=await topicRows(dstUrl,dstKey);
  if(indexed.length!==sourceRows.length)die('Post-copy topic count mismatch');
  const after=summarize(indexed);
  const vectors=[];
  for(let offset=0;offset<100000;offset+=200){
    const r=await request(dstUrl,dstKey,`/rest/v1/topic_vectors?select=topic_id,kind,embedding_model&order=topic_id.asc,kind.asc&limit=200&offset=${offset}`);
    vectors.push(...r.data);
    if(r.data.length<200)break;
  }
  const expected=before.label_valid+before.message_valid;
  if(vectors.length!==expected)die(`Vector sync mismatch: expected ${expected} indexed vectors, found ${vectors.length}`);
  let selfMatch=null;
  const example=sourceRows.find(r=>Array.isArray(r.topic_label_embedding_centroid)&&r.topic_label_embedding_centroid.length===384&&r.topic_label_embedding_model);
  if(example){
    const test=await request(dstUrl,dstKey,'/rest/v1/rpc/myway_match_topics',{method:'POST',body:{
      p_query:example.topic_label_embedding_centroid,p_kind:'label',p_model:example.topic_label_embedding_model,
      p_limit:100,p_min_similarity:0.9999
    }});
    selfMatch=Array.isArray(test.data)&&test.data.some(row=>row.topic_id===example.topic_id&&row.similarity>=0.9999);
    if(!selfMatch)die('Self-match test failed; check vector conversion/model identity');
  }
  const report={schema:'myway-v37b2-topic-seed-v1',time:new Date().toISOString(),topics_copied:copied,
    indexed_vectors:vectors.length,expected_vectors:expected,label_vectors:before.label_valid,
    message_vectors:before.message_valid,cleared_historical_last_run_links:before.last_run_links,
    self_match:selfMatch,source_model_counts:{label:before.model_labels,message:before.model_messages},
    runs_or_attempts_imported:false,original_project_writes:false};
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('V3.7B.2 SEED VERIFY PASS: topic counts, indexed vector count and self-match checked.');
  console.log('REPORT: '+reportPath);
}catch(error){
  // Failed imports may have partially committed batches; NEVER auto-delete records.
  console.error('V3.7B.2 IMPORT STOPPED; destination may contain partial copy. DO NOT rerun blindly.');
  console.error(`Successfully submitted topic rows before failure: ${copied}. Original database was not modified.`);
  throw error;
}
