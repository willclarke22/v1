import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const sha=(v)=>crypto.createHash('sha256').update(v).digest('hex');
export const norm=(v)=>v.trim().replace(/\/+$/,'').toLowerCase();
export function parseEnv(file){
  if(!fs.existsSync(file))throw new Error(`Missing local .env file: ${file}`);
  const out={};
  for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const m=raw.match(/^\s*(?:export\s+)?([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*)$/);if(!m)continue;
    let v=m[2].trim();
    if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);
    else v=v.replace(/\s+#.*$/,'');
    out[m[1]]=v;
  }
  return out;
}
export function supabaseUrl(env){return norm(env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL||'');}
export function key(env){return (env.SUPABASE_SERVICE_ROLE_KEY||'').trim();}
export function checkDifferent(srcEnv,dstEnv){
  const a=supabaseUrl(srcEnv), b=supabaseUrl(dstEnv), ka=key(srcEnv),kb=key(dstEnv);
  if(!a||!b||!ka||!kb)throw new Error('Original/sandbox Supabase URL or server key missing.');
  if(a===b || ka===kb)throw new Error('BLOCK: sandbox project URL or credential matches original.');
  for(const v of [a,b]){
    const u=new URL(v);
    if(u.protocol!=='https:'||!/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname)||u.pathname!=='/'){
      throw new Error('BLOCK: only direct https://<project-ref>.supabase.co/ URLs are allowed.');
    }
  }
}
export function loadBoundary(target){
  const b=JSON.parse(fs.readFileSync(path.join(target,'scripts/sandbox/v37b/isolation-boundary.json'),'utf8'));
  if(b.schema!=='myway-v37b-boundary-v1'||path.resolve(b.worktree).toLowerCase()!==path.resolve(target).toLowerCase()){
    throw new Error('BLOCK: invalid V3.7B worktree boundary.');
  }
  return b;
}
export function assertDestinationPin(target,originalEnv,sandboxEnv){
  checkDifferent(originalEnv,sandboxEnv);
  const b=loadBoundary(target);
  if(sha(supabaseUrl(originalEnv))!==b.original_supabase_url_sha256 ||
     sha(key(originalEnv))!==b.original_supabase_service_key_sha256){
    throw new Error('BLOCK: original credentials changed since isolation baseline; re-audit required.');
  }
  const p=path.join(target,'scripts/sandbox/v37b2/sandbox-destination.json');
  const pin=JSON.parse(fs.readFileSync(p,'utf8'));
  if(pin.schema!=='myway-v37b2-destination-v1'||pin.ready!==true||
     pin.url_sha256!==sha(supabaseUrl(sandboxEnv))||pin.service_key_sha256!==sha(key(sandboxEnv))){
    throw new Error('BLOCK: experimental project credentials differ from pinned destination.');
  }
}
export async function request(url,apiKey,relative,{method='GET',body,headers={}}={}){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const r=await fetch(url+relative,{method,headers:{apikey:apiKey,Authorization:`Bearer ${apiKey}`,
      ...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
    const responseText=await r.text();
    if(!r.ok)throw new Error(`${method} ${relative.split('?')[0]} returned HTTP ${r.status} (no response payload exposed)`);
    if(!responseText)return {data:null,status:r.status,headers:r.headers};
    let data;try{data=JSON.parse(responseText)}catch{throw new Error(`Unexpected non-JSON response from ${relative.split('?')[0]}`)}
    return {data,status:r.status,headers:r.headers};
  }finally{clearTimeout(timeout)}
}
export async function verifyTargetSchema(url,keyValue){
  for(const table of ['runs','attempts','topic_state','topic_vectors']){
    const col=['runs','attempts'].includes(table)?'id':'topic_id';
    const result=await request(url,keyValue,`/rest/v1/${table}?select=${col}&limit=0`);
    if(!Array.isArray(result.data))throw new Error(`Invalid REST schema for ${table}`);
  }
  const q=new Array(384).fill(0);q[0]=1;
  const rpc=await request(url,keyValue,'/rest/v1/rpc/myway_match_topics',{method:'POST',body:{
    p_query:q,p_kind:'label',p_model:'v37b2_schema_probe_no_match',p_limit:1,p_min_similarity:-1
  }});
  if(!Array.isArray(rpc.data))throw new Error('Invalid search RPC schema/permissions');
}
export async function topicRows(url,keyValue,{limit=200}={}){
  const all=[];
  for(let offset=0;offset<100000;offset+=limit){
    const p=`/rest/v1/topic_state?select=*&order=topic_id.asc&limit=${limit}&offset=${offset}`;
    const r=await request(url,keyValue,p);
    if(!Array.isArray(r.data))throw new Error('Source topic_state must be an array');
    all.push(...r.data);
    if(r.data.length<limit)return all;
  }
  throw new Error('Refusing topic export exceeding 100000 rows');
}
export function summarize(rows){
  const stats={topics:rows.length,label_valid:0,message_valid:0,model_labels:{},model_messages:{},last_run_links:0};
  for(const r of rows){
    if(r.last_run_id)stats.last_run_links++;
    for(const kind of ['label','message']){
      const v=r[`topic_${kind}_embedding_centroid`];const model=r[`topic_${kind}_embedding_model`];
      if(Array.isArray(v)&&v.length===384&&v.every(x=>typeof x==='number'&&Number.isFinite(x))&&typeof model==='string'&&model.trim()){
        stats[`${kind}_valid`]++;
        const k=kind==='label'?'model_labels':'model_messages';stats[k][model]=(stats[k][model]||0)+1;
      }
    }
  }
  return stats;
}
