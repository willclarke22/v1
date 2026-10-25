#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const target=process.argv[2];
if(!target) throw new Error('Missing experimental worktree path.');
const root=path.resolve(target);
const dir=path.join(root,'scripts','sandbox','v37b');
const mark=JSON.parse(fs.readFileSync(path.join(dir,'installation.json'),'utf8'));
const boundary=JSON.parse(fs.readFileSync(path.join(dir,'isolation-boundary.json'),'utf8'));
if(mark.schema!=='myway-v37b-install-v1'||boundary.schema!=='myway-v37b-boundary-v1')throw new Error('Invalid V3.7B markers');
if(path.resolve(boundary.worktree).toLowerCase()!==root.toLowerCase())throw new Error('Worktree boundary mismatch');
for(const [name,digest] of Object.entries(mark.file_hashes)){
 const file=path.join(root,...name.split('/'));
 if(!fs.existsSync(file))throw new Error(`Missing patched file: ${name}`);
 const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(actual!==digest)throw new Error(`Patched file drift: ${name}`);
}
const read=p=>fs.readFileSync(path.join(root,...p.split('/')),'utf8');
for(const p of ['lib/vector/qdrant.ts','lib/vector/query-topics.ts','lib/vector/sync-topic-to-qdrant.ts','scripts/qdrant/backfill-topic-state-to-qdrant.ts','scripts/qdrant/test-qdrant-topic-upsert.ts']){
 const content=read(p);
 if(/qdrant\.(?:query|upsert|delete)\(TOPIC_COLLECTION\s*,/.test(content))throw new Error(`Hardcoded Qdrant call remains: ${p}`);
}
if(!read('lib/supabase/server.ts').includes('assertExperimentSupabaseConfig(url, serviceRoleKey)'))throw new Error('Missing Supabase guard');
if(!read('lib/vector/qdrant.ts').includes('assertExperimentQdrantConfig(topicCollection, url, apiKey)'))throw new Error('Missing Qdrant guard');
console.log(`V3.7B VERIFY PASS: ${Object.keys(mark.file_hashes).length} exact source hashes, 2 runtime guards, 0 hardcoded main Qdrant calls.`);
console.log('V3.7B STATE: runtime remains DISABLED until independent experimental database and worker destinations are verified.');
