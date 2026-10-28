#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd());const at=p=>path.join(root,...p.split('/'));
const fail=s=>{throw Error('V3.7D.2C.3 VERIFY STOP: '+s)};
const sha=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const parseEnv=txt=>Object.fromEntries(txt.split(/\r?\n/).flatMap(line=>{const m=line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*)$/);if(!m)return [];return [[m[1],m[2].trim().replace(/^(["'])(.*)\1$/,'$2')]];}));
if(path.basename(root)!=='v1-learning-experiment')fail('Wrong local worktree');
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();
const original=path.resolve(root,'../v1');
if(!git(root,'branch','--show-current').startsWith('myway/learning-sandbox-')||
 path.resolve(root,git(root,'rev-parse','--git-common-dir'))!==path.resolve(original,git(original,'rev-parse','--git-common-dir')))fail('Not the separate experimental Git worktree');
const marker=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37d2c3/installation.json'),'utf8'));
const identity=JSON.parse(fs.readFileSync(at('lib/sandbox/v37d2c3/cloud-identity.json'),'utf8'));
if(marker.schema!=='myway-v37d2c3-local-install-v1'||marker.cloud_database_writes!==false||marker.original_modified!==false||marker.source_baseline!=='90391dd')fail('Invalid local install marker');
if(identity.schema!=='myway-v37d2c3-cloud-identity-v1'||identity.mode!=='readonly_shell'||identity.branch!=='myway/learning-sandbox-v3_7a')fail('Invalid cloud identity');
for(const [p,hash] of Object.entries(marker.hashes||{}))if(!fs.existsSync(at(p))||sha(at(p))!==hash)fail('Source drift: '+p);
for(const p of ['lib/sandbox/v37d2c3/cloud-policy.ts','lib/sandbox/v37d2c3/cloud-gate.ts','lib/sandbox/v37d2c3/cloud-view.tsx','proxy.ts','next.config.ts'])if(!fs.existsSync(at(p)))fail('Missing file: '+p);
const env=parseEnv(fs.readFileSync(at('.env.local'),'utf8'));
const pin=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37b2/sandbox-destination.json'),'utf8'));
const b=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37b/isolation-boundary.json'),'utf8'));
const url=String(env.NEXT_PUBLIC_SUPABASE_URL||'').trim().replace(/\/+$/,'').toLowerCase();
const key=String(env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
if(pin.ready!==true||pin.schema!=='myway-v37b2-destination-v1'||b.schema!=='myway-v37b-boundary-v1'||!url||!key||crypto.createHash('sha256').update(url).digest('hex')!==pin.url_sha256||crypto.createHash('sha256').update(key).digest('hex')!==pin.service_key_sha256||pin.url_sha256===b.original_supabase_url_sha256||pin.service_key_sha256===b.original_supabase_service_key_sha256)fail('Local pinned sandbox changed');
if(new URL(url).hostname!==identity.sandbox_host)fail('Cloud sandbox hostname drifted');
if(process.argv.includes('--remote')){
  const {request,supabaseUrl,key:serviceKey}=await import('../v37b2/live-utilities.mjs');
  const r=await request(supabaseUrl(env),serviceKey(env),'/rest/v1/topic_state?select=topic_id&limit=1');
  if(!Array.isArray(r.data))fail('Pinned sandbox read failed');
}
console.log('V3.7D.2C.3 LOCAL VERIFY PASS: source integrity, isolated Supabase pin, original worktree and readonly cloud identity.');
