#!/usr/bin/env node
// Safe source/config audit: reads code and *names* of available .env keys only. No HTTP and no DB writes.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const original=path.resolve(process.argv[2]||'C:/Users/willc/projects/MyWay/v1');
const target=path.resolve(process.argv[3]||path.join(path.dirname(original),path.basename(original)+'-learning-experiment'));
const rel=(root,p)=>path.join(root,...p.split('/'));
const read=(root,p)=>{try{return fs.readFileSync(rel(root,p),'utf8');}catch{return '';}};
const files=['lib/vector/qdrant.ts','lib/vector/query-topics.ts','lib/vector/sync-topic-to-qdrant.ts','lib/supabase/server.ts','lib/persistence/read.ts','app/api/semantic-layout/recompute-pending/route.ts','app/api/semantic-layout/commit-pending/route.ts','scripts/local-dev/semantic-enrichment-worker.ps1'];
const report={schema:'myway-v37a-source-audit-v1',created_at:new Date().toISOString(),original,experimental:target,mode:'SOURCE-ONLY-NO-NETWORK',source_integrity:{},qdrant:{},supabase:{},workers:{},blockers:[],notes:[]};
for(const p of files)report.source_integrity[p]={original_exists:fs.existsSync(rel(original,p)),experimental_exists:fs.existsSync(rel(target,p))};
const q=read(target,'lib/vector/qdrant.ts'),search=read(target,'lib/vector/query-topics.ts'),sync=read(target,'lib/vector/sync-topic-to-qdrant.ts');
report.qdrant.config_mentions_collection_env=q.includes('QDRANT_TOPIC_COLLECTION');
report.qdrant.search_uses_hardcoded_collection=/qdrant\.query\(\s*TOPIC_COLLECTION/.test(search);
report.qdrant.upsert_uses_hardcoded_collection=/qdrant\.upsert\(\s*TOPIC_COLLECTION/.test(sync);
if(report.qdrant.search_uses_hardcoded_collection||report.qdrant.upsert_uses_hardcoded_collection)report.blockers.push('QDRANT_WRITE_ROUTING: collection selection must be fixed in experimental branch BEFORE enabling runtime/writes.');
const envFiles=['.env.local','.env.development.local','.env'];
const patterns=['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','QDRANT_URL','QDRANT_API_KEY','QDRANT_TOPIC_COLLECTION','MYWAY_WORKER_RUNTIME_MODE'];
for(const name of envFiles){const loc=rel(original,name);if(!fs.existsSync(loc))continue;let lines;try{lines=fs.readFileSync(loc,'utf8').split(/\r?\n/);}catch{continue;}
const keys=new Set(lines.map(x=>x.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1]).filter(Boolean));
report.supabase['original_'+name+'_exists']=true;
report.supabase['original_'+name+'_key_presence']=Object.fromEntries(patterns.map(k=>[k,keys.has(k)]));
}
report.supabase.experimental_credentials_copied=false;
report.workers.original_worker_mentions_port_3000=/3000/.test(read(target,'scripts/local-dev/semantic-enrichment-worker.ps1'));
report.workers.experimental_worker_started=false;
report.blockers.push('SUPABASE_SCHEMA: authoritative live SQL schema/migrations and separate experimental project not yet verified.');
report.blockers.push('QDRANT_COLLECTION: actual production vector configuration and sandbox collection not yet inspected.');
report.blockers.push('WORKERS: experimental worker routing/ports not yet isolated.');
report.notes.push('The experimental worktree must NOT be started with production .env files or globally inherited production credentials.');
report.notes.push('A Git worktree isolates source edits; it does not isolate external services by itself.');
report.notes.push('The attached source dump cannot prove live schema, Qdrant collection dimensions, or installed environment credentials.');
const output=rel(target,'scripts/sandbox/v37a/readonly-audit.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log('SOURCE AUDIT: '+output);console.log('BLOCKERS: '+report.blockers.length+' (expected before V3.7B). No network used.');
