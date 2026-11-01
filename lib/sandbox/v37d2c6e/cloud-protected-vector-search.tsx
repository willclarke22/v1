"use client";
/** V3.7D.2C.6E — opt-in experimental browser MiniLM -> authenticated owner-scoped pgvector RPC.
 * No service-role keys, MyWay API routes, learner messages, memory decisions or writes.
 * Model identity and ranking quality are NOT assumed compatible with historical Python vectors.
 */
import {useEffect,useMemo,useRef,useState} from "react";
import {createClient} from "@supabase/supabase-js";
import {EMBEDDING_WORKER_SOURCE} from "@/lib/sandbox/v37d2c6a/embedding-worker-source";

type CatalogRow={source_model:string;indexed_topics:number;last_synced_at:string|null};
type MatchRow={topic_id:string;topic_label:string;source_model:string;similarity:number};
type LocalRank={id:string;label:string;similarity:number};
type VectorResult={vector:number[];model:string;backend:"wasm"|"webgpu";dimensions:number;loadMs:number;inferenceMs:number;totalMs:number;reused:boolean;comparison:LocalRank[];comparedLabels:number};
type WorkerMsg={type:string;id:number;result?:VectorResult;message?:string;error?:string};
type Report={rows:MatchRow[];vector:Omit<VectorResult,"vector">;rpcMs:number;totalMs:number;sourceModel:string;overlap:number|null};

const QUERY_LIMIT=500;
function validVector(v:unknown):v is number[]{
 if(!Array.isArray(v)||v.length!==384||!v.every(n=>typeof n==="number"&&Number.isFinite(n)))return false;
 const n=v.reduce((acc,x)=>acc+x*x,0);return n>.94&&n<1.06;
}
export default function CloudProtectedVectorSearch(){
 const [query,setQuery]=useState("Why does an electrical circuit require a closed loop?");
 const [backend,setBackend]=useState<"wasm"|"webgpu">("wasm");
 const [models,setModels]=useState<CatalogRow[]>([]);
 const [model,setModel]=useState("");
 const [status,setStatus]=useState("Signed-in account required. Install the 6E SQL projection separately before using this diagnostic.");
 const [busy,setBusy]=useState(false),[report,setReport]=useState<Report|null>(null);
 const generation=useRef(0),worker=useRef<Worker|null>(null),blob=useRef<string|null>(null);
 const pendingReject=useRef<((error:Error)=>void)|null>(null);
 const client=useMemo(()=>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return null;
  try{if(new URL(url).protocol!=="https:")return null;
   return createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,
    storageKey:"myway-experiment-v37d2c5a-auth"}});
  }catch{return null;}
 },[]);
 useEffect(()=>{
  return()=>{generation.current++;pendingReject.current?.(Error("Panel closed"));worker.current?.terminate();if(blob.current)URL.revokeObjectURL(blob.current);};
 },[]);
 async function verifyOwner(){
  if(!client)throw Error("Sandbox Supabase Auth is not configured.");
  const {data,error}=await client.auth.getUser();
  if(error||!data.user)throw Error("Sign in to the sandbox Workbench first.");
  return data.user.id;
 }
 async function loadCatalog(){
  if(busy)return;
  const op=++generation.current;setStatus("Verifying sandbox identity and protected vector RPC...");setReport(null);
  try{
   await verifyOwner();
   const {data,error}=await client!.rpc("myway_cloud_vector_catalog_v37d2c6e");
   if(error)throw Error("Vector RPC unavailable or denied. Install the 6E SQL manually in myway_sandbox, then verify privileges.");
   if(op!==generation.current)return;
   const parsed=(data??[]) as CatalogRow[];
   if(!Array.isArray(parsed)||parsed.length>12||!parsed.every(x=>typeof x.source_model==="string"&&
    x.source_model.length<=128&&Number.isSafeInteger(Number(x.indexed_topics))&&Number(x.indexed_topics)>=0))
    throw Error("Unexpected vector catalog response.");
   setModels(parsed);setModel(old=>parsed.some(x=>x.source_model===old)?old:(parsed[0]?.source_model??""));
   setStatus(parsed.length?"Owner-scoped pgvector catalog loaded. Rankings are diagnostic until model compatibility is validated.":
    "No indexed label vectors yet. Run the manual refresh and check source model IDs.");
  }catch(e){if(op===generation.current){setModels([]);setModel("");setStatus(e instanceof Error?e.message:"Vector catalog failed.");}}
 }
 async function embed(id:number,labels:{id:string;label:string}[]):Promise<VectorResult>{
  if(!blob.current)blob.current=URL.createObjectURL(new Blob([EMBEDDING_WORKER_SOURCE],{type:"text/javascript"}));
  if(!worker.current)worker.current=new Worker(blob.current,{type:"module",name:"myway-private-vector-query"});
  const w=worker.current;
  return new Promise<VectorResult>((resolve,reject)=>{
   pendingReject.current=reject;
   w.onmessage=(ev:MessageEvent<WorkerMsg>)=>{
    const m=ev.data;if(m?.id!==id)return;
    if(m.type==="progress")setStatus(m.message??"Computing MiniLM embedding...");
    if(m.type==="error")reject(Error("MiniLM worker: "+(m.error??"unknown")));
    if(m.type==="vector-query-result"&&m.result)resolve(m.result);
   };
   w.onerror=()=>reject(Error("Browser MiniLM worker failed."));
   w.postMessage({type:"vector-query",id,backend,topic:query.trim(),rootProblem:"",labels});
  }).finally(()=>{pendingReject.current=null;w.onmessage=null;w.onerror=null;});
 }
 async function run(){
  if(busy||!model||!query.trim()||query.length>QUERY_LIMIT)return;
  const op=++generation.current,started=performance.now();setBusy(true);setReport(null);
  setStatus("Checking the current signed-in owner before semantic search...");
  try{
   const owner=await verifyOwner();
   // Bounded label-only benchmark is separate from full pgvector RPC; no raw vectors selected.
   const check=await client!.from("myway_cloud_topic_snapshot").select("topic_id,topic_label")
    .eq("owner_uid",owner).order("topic_label").limit(200);
   if(check.error)throw Error("Owner-scoped snapshot read denied.");
   const labels=(check.data??[]).map(x=>({id:String(x.topic_id),label:String(x.topic_label)}));
   if(!labels.every(x=>x.id.length<=80&&x.label.length>0&&x.label.length<=140))throw Error("Unexpected snapshot labels.");
   if(op!==generation.current)return;
   const result=await embed(op,labels);
   if(!validVector(result.vector)||result.model!=="Xenova/all-MiniLM-L6-v2")throw Error("Unsupported browser embedding model or vector.");
   if(op!==generation.current)return;
   setStatus("Searching authenticated pgvector projection; raw stored vectors remain private...");
   const rpcStart=performance.now();
   const {data,error}=await client!.rpc("myway_cloud_match_topics_v37d2c6e",{
    p_query:result.vector,p_model:model,p_limit:10
   });
   const rpcMs=performance.now()-rpcStart;
   if(error)throw Error("Protected vector search failed or access was denied: "+error.message.slice(0,140));
   const matches=(data??[]) as MatchRow[];
   if(!Array.isArray(matches)||matches.length>10||!matches.every(r=>typeof r.topic_id==="string"&&
     r.topic_id.length<=80&&typeof r.topic_label==="string"&&r.topic_label.length<=140&&
     r.source_model===model&&typeof r.similarity==="number"&&Number.isFinite(r.similarity)&&r.similarity>=-1.01&&r.similarity<=1.01))
    throw Error("Invalid server-side match response.");
   if(op!==generation.current)return;
   const sample=new Set(result.comparison.slice(0,5).map(x=>x.id));
   const overlap=result.comparedLabels>0?matches.slice(0,5).filter(r=>sample.has(r.topic_id)).length:null;
   const {vector:unused,...timing}=result;void unused;
   setReport({rows:matches,vector:timing,rpcMs,totalMs:performance.now()-started,sourceModel:model,overlap});
   setStatus("Read-only pgvector search complete. Results MUST NOT be used for automated topic decisions yet.");
  }catch(e){if(op===generation.current)setStatus(e instanceof Error?e.message:"Vector search failed.");}
  finally{if(op===generation.current)setBusy(false);}
 }
 function cancel(){generation.current++;pendingReject.current?.(Error("Cancelled"));worker.current?.terminate();worker.current=null;setBusy(false);setStatus("Cancelled; any in-flight read-only RPC may finish at Supabase.");}
 return <section className="relative z-10 mx-auto mt-5 max-w-5xl px-5 sm:px-10" aria-label="Protected cloud pgvector search diagnostic">
  <div className="rounded-2xl border border-emerald-400/25 bg-slate-900/95 p-5 text-slate-100">
   <h2 className="text-lg font-semibold">V3.7D.2C.6E · Protected cloud pgvector retrieval</h2>
   <p className="mt-2 text-xs text-slate-300">Browser MiniLM embeds an explicitly supplied synthetic query, then sends its 384-D vector to an authenticated, owner-bound Supabase RPC. The database returns only topic labels, IDs and similarity; original topic_vectors and raw cloud vectors are never exposed to the browser.</p>
   <p className="mt-2 text-xs text-amber-200">Pilot only: stored model identity may be an alias (e.g. local-embedding-service) and browser quantization may differ from the original Python embedding. Agreement/quality must be measured before using these ranks for association or Auto-create. No root-problem comparisons yet, no persistence and no model API calls. Third-party model files download on first search.</p>
   <div className="mt-3 flex flex-wrap items-center gap-2">
    <button type="button" disabled={busy} onClick={()=>void loadCatalog()} className="rounded border border-emerald-500/50 bg-emerald-950/40 px-3 py-2 text-xs disabled:opacity-50">Load protected vector catalog</button>
    <span className="text-xs text-slate-400">{models.reduce((s,m)=>s+Number(m.indexed_topics),0)} owner-indexed labels across {models.length} source-model IDs</span>
   </div>
   <label className="mt-3 block text-sm">Synthetic question
    <input value={query} maxLength={QUERY_LIMIT} onChange={e=>setQuery(e.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white" />
   </label>
   <div className="mt-3 flex flex-wrap items-center gap-2">
    <select aria-label="Stored source vector model" disabled={busy||!models.length} value={model} onChange={e=>setModel(e.target.value)} className="rounded bg-slate-800 p-2 text-xs">
     {models.length===0?<option value="">Load catalog</option>:models.map(m=><option key={m.source_model} value={m.source_model}>{m.source_model} ({m.indexed_topics})</option>)}
    </select>
    <select aria-label="MiniLM backend" disabled={busy} value={backend} onChange={e=>setBackend(e.target.value as "wasm"|"webgpu")} className="rounded bg-slate-800 p-2 text-xs"><option value="wasm">WASM</option><option value="webgpu">WebGPU</option></select>
    <button type="button" disabled={busy||!model||!query.trim()} onClick={()=>void run()} className="rounded bg-emerald-700 px-3 py-2 text-xs disabled:opacity-40">Search owner vectors (read-only)</button>
    {busy&&<button type="button" onClick={cancel} className="rounded border border-slate-600 px-3 py-2 text-xs">Cancel</button>}
   </div>
   <p role="status" className="mt-3 text-xs text-slate-300">{status}</p>
   {report&&<div className="mt-4 space-y-2 text-xs">
    <p className="text-emerald-200">Stored model: {report.sourceModel} · Browser: {report.vector.model} · dimensions {report.vector.dimensions} · WASM/WebGPU: {report.vector.backend}</p>
    <p>Model load {Math.round(report.vector.loadMs)} ms · browser inference {Math.round(report.vector.inferenceMs)} ms · pgvector RPC {Math.round(report.rpcMs)} ms · end-to-end {Math.round(report.totalMs)} ms</p>
    <p className="text-amber-200">Top-five overlap vs browser label-only comparison: {report.overlap===null?"not measured":`${report.overlap}/5`} (sample of {report.vector.comparedLabels} labels; not a validated compatibility score)</p>
    <ol className="list-decimal space-y-1 pl-6">{report.rows.map(r=><li key={r.topic_id}>{r.topic_label} — cosine similarity {r.similarity.toFixed(4)}</li>)}</ol>
    <p className="text-slate-400">Browser MiniLM incurs no per-token model API cost. Supabase/database infrastructure and third-party downloads are not priced by this diagnostic.</p>
   </div>}
  </div>
 </section>;
}
