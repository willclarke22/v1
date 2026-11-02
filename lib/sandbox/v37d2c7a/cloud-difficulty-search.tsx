"use client";
/** V3.7D.2C.7A — owner-only, explicit opt-in root-problem pilot.
 * Protected event text is received only after owner auth; browser MiniLM is local.
 * SQL embedding installation is MANUAL; this component performs zero cloud writes.
 */
import {useEffect,useMemo,useRef,useState} from "react";
import {createClient} from "@supabase/supabase-js";
import {DIFFICULTY_WORKER_SOURCE} from "@/lib/sandbox/v37d2c7a/cloud-difficulty-worker-source";

const MODEL='Xenova/all-MiniLM-L6-v2@transformers-4.3.1-q8-wasm';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/;
type Difficulty={event_id:string;topic_id:string;topic_label:string;root_problem:string;root_sha256:string};
type Match={event_id:string;topic_id:string;topic_label:string;root_problem:string;source_model:string;similarity:number};
type Summary={total_events:number;indexed_events:number;last_refreshed:string|null};
type WorkerMsg={id:number;type:string;message?:string;error?:string;vectors?:number[][];model?:string};
function validVector(v:unknown):v is number[]{
 if(!Array.isArray(v)||v.length!==384||!v.every(x=>typeof x==="number"&&Number.isFinite(x)))return false;
 const norm=v.reduce((sum,n)=>sum+n*n,0);return norm>.94&&norm<1.06;
}
function validDifficulty(d:Difficulty){return typeof d.event_id==="string"&&UUID.test(d.event_id)&&
 typeof d.topic_id==="string"&&d.topic_id.length<=80&&typeof d.topic_label==="string"&&
 d.topic_label.length>0&&d.topic_label.length<=140&&typeof d.root_problem==="string"&&
 d.root_problem.trim().length>=15&&d.root_problem.length<=500&&typeof d.root_sha256==="string"&&SHA.test(d.root_sha256);}
export default function CloudDifficultySearch(){
 const [query,setQuery]=useState("I think quantum entanglement lets one particle send a message instantly to another.");
 const [status,setStatus]=useState("7A requires manual sandbox SQL installation and sign-in. No evidence or vectors load automatically.");
 const [summary,setSummary]=useState<Summary|null>(null),[rows,setRows]=useState<Match[]|null>(null);
 const [seedSQL,setSeedSQL]=useState(""),[busy,setBusy]=useState(false);
 const nextId=useRef(0),workerRef=useRef<Worker|null>(null),blobRef=useRef<string|null>(null);
 const cancelRef=useRef<((reason:Error)=>void)|null>(null), mounted=useRef(true);
 const client=useMemo(()=>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return null;
  try{if(new URL(url).protocol!=="https:")return null;
   return createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,
    storageKey:"myway-experiment-v37d2c5a-auth"}});
  }catch{return null;}
 },[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;nextId.current++;
  cancelRef.current?.(Error("Panel closed"));workerRef.current?.terminate();
  if(blobRef.current)URL.revokeObjectURL(blobRef.current);};},[]);
 async function verifyOwner(){
  if(!client)throw Error("Sandbox Auth is not configured.");
  const {data,error}=await client.auth.getUser();
  if(error||!data.user)throw Error("Sign in to the sandbox owner account first.");
 }
 async function rpc<T>(name:string,args?:Record<string,unknown>):Promise<T>{
  await verifyOwner();
  const {data,error}=await client!.rpc(name,args);
  if(error)throw Error("Protected 7A RPC failed or access denied: "+error.message.slice(0,150));
  return data as T;
 }
 async function embed(texts:string[]):Promise<number[][]>{
  const id=++nextId.current;
  if(!blobRef.current)blobRef.current=URL.createObjectURL(new Blob([DIFFICULTY_WORKER_SOURCE],{type:"text/javascript"}));
  if(!workerRef.current)workerRef.current=new Worker(blobRef.current,{type:"module",name:"myway-v37d2c7a-local-difficulties"});
  const worker=workerRef.current;
  return await new Promise<number[][]>((resolve,reject)=>{
   cancelRef.current=reject;
   worker.onmessage=(event:MessageEvent<WorkerMsg>)=>{
    const msg=event.data;if(msg?.id!==id)return;
    if(msg.type==="progress"&&mounted.current)setStatus(msg.message??"Computing local embeddings...");
    if(msg.type==="error")reject(Error(msg.error??"Embedding failed"));
    if(msg.type==="complete"){
     if(msg.model!==MODEL||!Array.isArray(msg.vectors)||msg.vectors.length!==texts.length||!msg.vectors.every(validVector))
      reject(Error("Unexpected model identity or invalid normalized vectors."));
     else resolve(msg.vectors);
    }
   };
   worker.onerror=()=>reject(Error("Browser embedding worker could not load."));
   worker.postMessage({id,type:texts.length===1?"query":"batch",texts});
  }).finally(()=>{cancelRef.current=null;worker.onmessage=null;worker.onerror=null;});
 }
 async function loadCatalog(){
  if(busy)return;setBusy(true);setRows(null);setSeedSQL("");
  try{const data=await rpc<Summary[]>("myway_cloud_difficulty_catalog_v37d2c7a");
   if(!Array.isArray(data)||data.length>1)throw Error("Invalid owner catalog.");
   const record=data[0]??null;
   if(record&&(!Number.isSafeInteger(Number(record.total_events))||!Number.isSafeInteger(Number(record.indexed_events))||
     Number(record.total_events)>100||Number(record.indexed_events)>Number(record.total_events)))throw Error("Bad catalog values.");
   setSummary(record);setStatus(record?"Owner difficulty catalog loaded. Historical scores are diagnostic only.":"No authorized owner record.");
  }catch(e){setStatus(e instanceof Error?e.message:"Catalog unavailable.");}finally{setBusy(false);}
 }
 async function prepare(){
  if(busy)return;setBusy(true);setSeedSQL("");setRows(null);
  try{const source=await rpc<Difficulty[]>("myway_cloud_difficulty_export_v37d2c7a");
   if(!Array.isArray(source)||source.length<1||source.length>100||!source.every(validDifficulty)||
     new Set(source.map(x=>x.event_id.toLowerCase())).size!==source.length)throw Error("No eligible events or invalid event catalog. Run manual refresh first.");
   // Explicit user action; texts exist in worker memory only and are never uploaded to model provider.
   const vectors:number[][]=[];
   // Chunk to bound peak WASM usage. Single-item worker request is also acceptable.
   for(let i=0;i<source.length;i+=12){
    const next=await embed(source.slice(i,i+12).map(x=>x.root_problem));vectors.push(...next);
   }
   // No learner wording or evidence is included in this generated SQL, only UUID, revision SHA and 384-D vectors.
   const statements=source.map((d,i)=>{
    const values=vectors[i].map(x=>Number(x.toPrecision(9)));
    if(!validVector(values))throw Error("Precision loss: vector normalization check failed.");
    return "SELECT myway_sync_private.apply_difficulty_vector_v37d2c7a('"+d.event_id.toLowerCase()+"'::uuid,'"+
     d.root_sha256+"','"+MODEL+"','"+JSON.stringify(values)+"'::jsonb);";
   });
   setSeedSQL(["-- MANUAL ONLY: REVIEW and RUN in the myway_sandbox SQL Editor. Do not commit this file.",
    "-- Event revisions are checked: stale/missing event -> entire transaction rolls back.","BEGIN;",...statements,"COMMIT;"].join("\n"));
   setStatus("Prepared "+source.length+" event vectors in browser (WASM q8); copy the generated SQL into the sandbox SQL Editor MANUALLY. No database changes occurred here.");
  }catch(e){setStatus(e instanceof Error?e.message:"Vector preparation failed.");}finally{setBusy(false);}
 }
 async function search(){
  if(busy||query.trim().length<15||query.length>500)return;
  setBusy(true);setRows(null);setSeedSQL("");const start=performance.now();
  try{await verifyOwner();const vectors=await embed([query.trim()]);
   const matches=await rpc<Match[]>("myway_cloud_match_difficulties_v37d2c7a",{p_query:vectors[0],p_model:MODEL,p_limit:8});
   if(!Array.isArray(matches)||matches.length>8||!matches.every(x=>UUID.test(x.event_id)&&
    typeof x.topic_id==="string"&&x.topic_id.length<=80&&typeof x.topic_label==="string"&&x.topic_label.length<=140&&
    typeof x.root_problem==="string"&&x.root_problem.length<=500&&x.source_model===MODEL&&
    typeof x.similarity==="number"&&Number.isFinite(x.similarity)&&x.similarity>=-1.01&&x.similarity<=1.01))
    throw Error("Unexpected match response.");
   setRows(matches);setStatus("Read-only search finished in "+Math.round(performance.now()-start)+" ms. Similarity is NOT a probability or memory-decision threshold.");
  }catch(e){setStatus(e instanceof Error?e.message:"Search unavailable.");}finally{setBusy(false);}
 }
 async function copySQL(){
  if(!seedSQL)return;try{await navigator.clipboard.writeText(seedSQL);setStatus("Vector-only SQL copied. Review and execute manually in myway_sandbox; the browser has NOT written data.");}
  catch{setStatus("Clipboard blocked: select all text in the SQL box and copy manually.");}
 }
 function cancel(){nextId.current++;cancelRef.current?.(Error("Cancelled"));workerRef.current?.terminate();workerRef.current=null;
  setBusy(false);setStatus("Cancelled locally; any already-sent read-only RPC may still complete.");}
 return <section className="relative z-10 mx-auto mt-5 max-w-5xl px-5 sm:px-10" aria-label="Owner historical difficulty retrieval diagnostic">
  <div className="rounded-2xl border border-amber-400/30 bg-slate-900/95 p-5 text-slate-100">
   <h2 className="text-lg font-semibold">V3.7D.2C.7A · Historical root-problem retrieval (pilot)</h2>
   <p className="mt-2 text-xs text-slate-300">Separately retrieves previously approved difficulty events, not topic-label vectors or 42 topic message centroids. The protected database holds the root text; its owner-only export is fetched on explicit action solely for local browser embedding. No cloud teaching, auto-association, memory write, or cron is enabled.</p>
   <p className="mt-2 text-xs text-amber-200">Security/privacy: an explicit vector preparation temporarily loads your own previously saved root-problem summaries into this browser. Pinned Transformers.js and MiniLM model files download from third-party hosts. Embedding inference stays in the browser. Use a trusted device. Paste the generated vector-only SQL manually into the isolated sandbox SQL Editor.</p>
   <div className="mt-3 flex flex-wrap items-center gap-2">
    <button type="button" onClick={()=>void loadCatalog()} disabled={busy} className="rounded border border-amber-500/50 px-3 py-2 text-xs disabled:opacity-40">1. Load owner catalog</button>
    <button type="button" onClick={()=>void prepare()} disabled={busy} className="rounded border border-amber-500/50 px-3 py-2 text-xs disabled:opacity-40">2. Prepare manual vector SQL</button>
    {summary&&<span className="text-xs text-slate-300">{summary.total_events} history events · {summary.indexed_events} indexed vectors</span>}
   </div>
   {seedSQL&&<div className="mt-3">
    <p className="mb-2 text-xs text-amber-200">The SQL below is not executed automatically. After manual execution, load the catalog again.</p>
    <button type="button" onClick={()=>void copySQL()} className="mb-2 rounded bg-amber-800 px-3 py-2 text-xs">Copy manual SQL</button>
    <textarea aria-label="Manually reviewed difficulty vector SQL" readOnly value={seedSQL} rows={6}
     className="w-full rounded border border-slate-600 bg-slate-950 p-2 font-mono text-xs" />
   </div>}
   <label className="mt-4 block text-sm">Synthetic root-problem query (15–500 characters)
    <textarea rows={2} value={query} maxLength={500} onChange={e=>setQuery(e.target.value)}
     className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2 text-sm text-white" />
   </label>
   <div className="mt-2 flex flex-wrap gap-2">
    <button type="button" onClick={()=>void search()} disabled={busy||query.trim().length<15}
     className="rounded bg-amber-700 px-3 py-2 text-xs disabled:opacity-40">3. Search historical difficulties (read-only)</button>
    {busy&&<button type="button" onClick={cancel} className="rounded border px-3 py-2 text-xs">Cancel worker</button>}
   </div>
   <p role="status" className="mt-3 text-xs text-slate-300">{status}</p>
   {rows!==null&&<div className="mt-3 text-xs">
    <p className="text-amber-200">{rows.length} indexed historical matches. Do not infer that a match is the same learning difficulty without validation.</p>
    <ol className="mt-2 list-decimal space-y-2 pl-5">{rows.map(r=><li key={r.event_id}>
     <strong>{r.topic_label}</strong> · cosine {r.similarity.toFixed(4)}
     <p className="text-slate-300">Previously recorded difficulty: {r.root_problem}</p>
    </li>)}</ol>
   </div>}
  </div>
 </section>;
}
