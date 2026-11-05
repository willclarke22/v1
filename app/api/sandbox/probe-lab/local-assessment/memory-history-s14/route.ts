/** S1.4 research-only SELECT of approved event roots. Zero mutation or approval authority. */
import {getLatestTopicState} from '@/lib/persistence/read';
import {eligibleDifficultyEvents} from '@/sandbox/probe-lab/learning-space/difficulty-identity';
export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(status:number,error:string)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
function localOnly(request:Request):boolean {
 if(process.env.NODE_ENV!=='development'||process.env.MYWAY_EXPERIMENTAL_RUNTIME!=='v37b'||
    process.env.MYWAY_TOPIC_VECTOR_BACKEND!=='supabase'||process.env.VERCEL==='1')return false;
 const u=new URL(request.url);if(!['127.0.0.1','localhost'].includes(u.hostname))return false;
 const host=(request.headers.get('host')??'').toLowerCase();if(!['127.0.0.1:3001','localhost:3001'].includes(host))return false;
 const origin=request.headers.get('origin');if(!origin)return false;
 try {const o=new URL(origin);return !o.username&&!o.password&&o.origin===`http://${host}`;}catch{return false;}
}
export async function POST(request:Request){
 if(!localOnly(request))return fail(403,'Pinned loopback development runtime required.');
 if(!request.headers.get('content-type')?.includes('application/json'))return fail(415,'JSON required.');
 if(Number(request.headers.get('content-length')||0)>1600)return fail(413,'Oversized input.');
 let parsed:unknown;try{parsed=await request.json();}catch{return fail(400,'Invalid JSON.');}
 const v=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};
 if(Object.keys(v).sort().join('|')!=='format|topic_ids'||v.format!=='myway_s14_history_readonly_v1'||
  !Array.isArray(v.topic_ids)||!v.topic_ids.length||v.topic_ids.length>3||
  v.topic_ids.some(id=>typeof id!=='string'||!UUID.test(id))||new Set(v.topic_ids).size!==v.topic_ids.length)
  return fail(400,'Invalid topic ID request.');
 try{
  const rows=await getLatestTopicState();
  const result=v.topic_ids.map(id=>{
   const row=rows.find(r=>r.topic_id===id);
   if(!row)return {topic_id:id,topic_label:null,events:[]};
   const events=eligibleDifficultyEvents(row.topic_json).slice(-8).map(e=>({event_id:String(e.event_id),root_problem:String(e.root_problem)}));
   return {topic_id:id,topic_label:(row.topic_label||'').slice(0,110),events};
  });
  return Response.json({schema:'myway_s14_approved_history_readonly_v1',topics:result},{headers:{'Cache-Control':'no-store','X-MyWay-Mode':'s14-readonly-shadow'}});
 }catch{return fail(503,'Sandbox approved-history SELECT unavailable.');}
}
