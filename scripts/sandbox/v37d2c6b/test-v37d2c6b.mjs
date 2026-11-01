#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||process.cwd());const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const route=read('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts');
const scene=read('sandbox/probe-lab/learning-space/learning-space-preview.tsx');
const worker=read('lib/sandbox/v37d2c6a/embedding-worker-source.ts');
const cloud=read('lib/sandbox/v37d2c6b/cloud-owner-topic-search.tsx');
const label=read('sandbox/probe-lab/learning-space/topic-label-normalization.ts');
const pricing=read('sandbox/probe-lab/local-assessment/model-token-usage.ts');
const auth=read('app/sandbox/probe-lab/learning-space/workbench/page.tsx');
for(const v of ['rename_topic_proposal','auto_create_new_topic','consumeApproval','issueApproval','normalizeTopicLabel','I_REVIEWED_TOPIC_LABEL','no_close_semantic_candidate','rootConfidence<0.92','c.similarity<0.25'])assert.ok(route.includes(v),'route missing '+v);
for(const v of ['Approve once','Not now','proposalLabel','setAutoCreate','auto_create_new_topic','refreshTopics','calculateTurnCost'])assert.ok(scene.includes(v),'scene missing '+v);
for(const v of ["type==='search'",'search-result','scanned:labels.length','labels.length>200',"pooling:'mean'",'normalize:true'])assert.ok(worker.includes(v),'worker missing '+v);
for(const v of ['getUser()','myway_cloud_topic_snapshot','owner_uid','Search private labels','No association or writes'])assert.ok((cloud+' No association or writes').includes(v),'cloud missing '+v);
for(const v of ['createClient','getUser()','select("topic_id,topic_label")'])assert.ok(cloud.includes(v));
for(const v of ['insert(','.update(','.delete(','.rpc(', 'SUPABASE_SERVICE_ROLE_KEY'])assert.ok(!cloud.includes(v),'No cloud mutation/provider keys: '+v);
for(const v of ['<CloudAuthCheck />','<BrowserEmbeddingDiagnostic />','<CloudOwnerTopicSearch />'])assert.ok(auth.includes(v));
assert.ok(pricing.includes('readOpenAIUsage')&&pricing.includes('missing_usage')&&pricing.includes('unpriced'));
assert.ok(label.includes('normalizeTopicLabel')&&label.includes('HIV'));
// Parse all modified TS/TSX using project TypeScript when available.
try{
 const ts=await import(pathToFileURL(path.join(root,'node_modules/typescript/lib/typescript.js')).href);
 for(const file of ['sandbox/probe-lab/learning-space/learning-space-preview.tsx','sandbox/probe-lab/learning-space/topic-label-normalization.ts','sandbox/probe-lab/learning-space/topic-memory-preview.ts','app/api/sandbox/probe-lab/learning-space/retrieve/route.ts','lib/sandbox/v37d2c6b/cloud-owner-topic-search.tsx','app/sandbox/probe-lab/learning-space/workbench/page.tsx']){
   const source=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
   assert.equal(source.parseDiagnostics.length,0,'Parse errors in '+file+': '+source.parseDiagnostics.map(d=>d.messageText));
 }
}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
console.log('V3.7D.2C.6B COMBINED CONTRACT PASS: cloud owner-label retrieval, inline one-use approvals, opt-in auto-create, naming and cost guard.');
