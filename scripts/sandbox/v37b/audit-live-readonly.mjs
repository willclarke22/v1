#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const original = process.argv[2];
const experiment = process.argv[3];
if (!original || !experiment) throw new Error('Usage: node audit-live-readonly.mjs ORIGINAL EXPERIMENT');
const output = path.join(experiment, 'scripts', 'sandbox', 'v37b', 'readonly-live-audit.json');

function parseEnv(filename){
  if (!fs.existsSync(filename)) return {};
  const result = {};
  for (const line of fs.readFileSync(filename,'utf8').split(/\r?\n/)){
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v=v.slice(1,-1);
    else v=v.replace(/\s+#.*$/,'');
    result[m[1]]=v.trim();
  }
  return result;
}
function requireHttps(url) {
  const target = new URL(url);
  if(target.protocol!=='https:' || target.username || target.password || target.search || target.hash) throw new Error('Endpoint must be HTTPS with no URL credentials, search or hash');
  return target;
}
function safeError(e) {
  const s = e instanceof Error ? e.message : String(e);
  if (s.includes('Endpoint must be HTTPS')) return 'non_https_endpoint';
  if (/timeout|aborted|TimeoutError/i.test(s)) return 'timeout';
  if (/ENOTFOUND|getaddrinfo/i.test(s)) return 'dns_error';
  if (/fetch failed|ECONNREFUSED|connection/i.test(s)) return 'connection_error';
  return 'request_failed';
}
async function tryGet(url, headers) {
  const response = await fetch(url, {method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(10000)});
  if (!response.ok) return {ok:false,status:response.status};
  const data = await response.json();
  return {ok:true,data};
}
const env = parseEnv(path.join(original,'.env.local'));
const report = {
  schema:'myway-v37b-live-audit-v1',
  created_at:new Date().toISOString(),
  requests:'GET_ONLY',
  credentials_in_report:false,
  original_project_not_mutated:true,
  experimental_project_not_mutated:true,
  supabase:{status:'not_checked',tables:[],columns_by_table:{},limitations:['PostgREST/OpenAPI does not reveal complete SQL schema, triggers, indexes, policies or functions']},
  qdrant:{status:'not_checked',collection:'myway-topics',vector_config:null,points_count:null},
  blockers:[]
};
try {
  const raw=env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw || !key) {
    report.supabase.status='missing_original_env';report.blockers.push('SUPABASE_ORIGINAL_ENV_UNAVAILABLE');
  } else {
    const target=requireHttps(raw);
    // This API endpoint returns schema metadata, not any table rows.
    if (!target.hostname.endsWith('.supabase.co')) {
      report.supabase.status='custom_domain_skipped';
      report.blockers.push('SUPABASE_CUSTOM_DOMAIN_REQUIRES_MANUAL_SCHEMA_EXPORT');
    } else {
      const response=await tryGet(new URL('/rest/v1/',target).toString(),{
        apikey:key,Authorization:`Bearer ${key}`,Accept:'application/openapi+json'
      });
      if (!response.ok) { report.supabase.status=`http_${response.status}`;report.blockers.push('SUPABASE_METADATA_REQUEST_FAILED'); }
      else {
        const definitions=response.data?.definitions ?? {};
        const names=Object.keys(definitions).filter(k=>k!=='Error' && !k.startsWith('_')).sort().slice(0,250);
        report.supabase.tables=names;
        for (const name of names) {
          report.supabase.columns_by_table[name]=Object.keys(definitions[name]?.properties ?? {}).sort().slice(0,250);
        }
        report.supabase.status=names.length?'partial_schema_success':'no_table_definitions';
        report.blockers.push('SUPABASE_SQL_SCHEMA_TRIGGERS_RLS_STILL_UNVERIFIED');
      }
    }
  }
} catch(e) {report.supabase.status=safeError(e);report.blockers.push('SUPABASE_METADATA_REQUEST_FAILED');}
try {
  if (!env.QDRANT_URL || !env.QDRANT_API_KEY) {
    report.qdrant.status='missing_original_env';report.blockers.push('QDRANT_ORIGINAL_ENV_UNAVAILABLE');
  } else {
    const url=new URL(env.QDRANT_URL);
    if (!(url.protocol==='https:' || (url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) {
      report.qdrant.status='insecure_endpoint_skipped';report.blockers.push('QDRANT_ENDPOINT_REQUIRES_HTTPS_OR_LOOPBACK');
    } else {
      const collection=env.QDRANT_TOPIC_COLLECTION || 'myway-topics';
      report.qdrant.collection=collection;
      const response=await tryGet(new URL(`/collections/${encodeURIComponent(collection)}`, url.origin).toString(),{'api-key':env.QDRANT_API_KEY});
      if (!response.ok) {report.qdrant.status=`http_${response.status}`;report.blockers.push('QDRANT_METADATA_REQUEST_FAILED');}
      else {
        const r=response.data?.result ?? {};
        const rawVectors=r.config?.params?.vectors ?? null;
        report.qdrant.vector_config=rawVectors && typeof rawVectors==='object'?JSON.parse(JSON.stringify(rawVectors)):null;
        report.qdrant.points_count=typeof r.points_count==='number'?r.points_count:null;
        report.qdrant.status='collection_metadata_success';
      }
    }
  }
} catch(e) {report.qdrant.status=safeError(e);report.blockers.push('QDRANT_METADATA_REQUEST_FAILED');}
report.blockers.push('EXPERIMENTAL_SUPABASE_PROJECT_NOT_PROVISIONED');
report.blockers.push('EXPERIMENTAL_QDRANT_COLLECTION_NOT_PROVISIONED');
report.blockers.push('WORKER_PORT_ISOLATION_NOT_VERIFIED');
fs.writeFileSync(output, JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(`V3.7B READ-ONLY: Supabase ${report.supabase.status}; Qdrant ${report.qdrant.status}.`);
console.log(`V3.7B READ-ONLY: Report saved to ${output}. No data mutations.`);
console.log(`V3.7B READ-ONLY: ${report.blockers.length} remaining checks/blockers.`);
