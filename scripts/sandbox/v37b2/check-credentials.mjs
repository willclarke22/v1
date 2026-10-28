#!/usr/bin/env node
/* Read-only network preflight for a candidate sandbox project; secrets from env only */
import fs from 'node:fs';import path from 'node:path';
import {parseEnv,checkDifferent,supabaseUrl,key,verifyTargetSchema,request,loadBoundary,sha} from './live-utilities.mjs';
const [root,orig]=process.argv.slice(2);
if(!root||!orig)throw new Error('Usage: check-credentials ROOT ORIGINAL');
const boundary=loadBoundary(root);
const original=parseEnv(path.join(orig,'.env.local'));
const sandbox={NEXT_PUBLIC_SUPABASE_URL:process.env.MYWAY_SETUP_SUPABASE_URL||'',SUPABASE_SERVICE_ROLE_KEY:process.env.MYWAY_SETUP_SERVICE_KEY||''};
checkDifferent(original,sandbox);
if(sha(supabaseUrl(original))!==boundary.original_supabase_url_sha256||sha(key(original))!==boundary.original_supabase_service_key_sha256){
 throw new Error('Original credentials changed since V3.7B.0 audit; refusing setup');
}
await verifyTargetSchema(supabaseUrl(sandbox),key(sandbox));
for(const t of ['topic_state','topic_vectors','runs','attempts']){
 const field=['runs','attempts'].includes(t)?'id':'topic_id';
 const {data}=await request(supabaseUrl(sandbox),key(sandbox),`/rest/v1/${t}?select=${field}&limit=1`);
 if(!Array.isArray(data)||data.length)throw new Error(`Expected empty experimental ${t} table; not creating .env.local`);
}
console.log('V3.7B.2 DESTINATION PREFLIGHT PASS: different Supabase project, correct schema/RPC, four empty tables.');
