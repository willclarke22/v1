"use client";
/** Explicit opt-in cloud semantic search over the owner's *topic labels only*.
 * Vector generation + cosine are inside browser MiniLM worker. No topic/memory writes.
 * Deliberately not presented as root-problem equivalence or pgvector retrieval.
 */
import {useEffect,useMemo,useRef,useState} from "react";
import {createClient} from "@supabase/supabase-js";
import {EMBEDDING_WORKER_SOURCE} from "@/lib/sandbox/v37d2c6a/embedding-worker-source";
type Candidate={id:string;label:string;similarity:number};
type RankResult={rank:Candidate[];model:string;scanned:number;backend:string;loadMs:number;inferenceMs:number;totalMs:number;dimensions:number;reused:boolean};
type Msg={type:string;id:number;result?:RankResult;message?:string;error?:string};
export default function CloudOwnerTopicSearch(){
 const [query,setQuery]=useState("Why does a bulb need a closed circuit?");
 const [backend,setBackend]=useState<"wasm"|"webgpu">("wasm");
 const [status,setStatus]=useState("Sign in to search your synced topic labels. This does not run Model A/C.");
 const [result,setResult]=useState<RankResult|null>(null);
 const [busy,setBusy]=useState(false);
 const worker=useRef<Worker|null>(null),blobUrl=useRef<string|null>(null),seq=useRef(0);
 const client=useMemo(()=>{
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
   if(!url||!key||!url.startsWith("https://"))return null;
   return createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,
     storageKey:"myway-experiment-v37d2c5a-auth"}});
 },[]);
 useEffect(()=>()=>{worker.current?.terminate();if(blobUrl.current)URL.revokeObjectURL(blobUrl.current);},[]);
 async function run(){
  if(busy||!client||!query.trim()||query.length>500)return;
  setBusy(true);setResult(null);setStatus("Verifying authenticated sandbox owner...");
  try{
   const {data,error}=await client.auth.getUser();
   if(error||!data.user)throw Error("Sign in through Workbench first.");
   const {data:rows,error:readError}=await client.from("myway_cloud_topic_snapshot")
     .select("topic_id,topic_label").eq("owner_uid",data.user.id).order("topic_label").limit(200);
   if(readError)throw Error("Owner-scoped topic SELECT denied.");
   if(!rows?.length)throw Error("No private snapshot topics found.");
   const labels=rows.map(r=>({id:String(r.topic_id),label:String(r.topic_label)}));
   if(!labels.every(x=>x.id.length<=80&&x.label.length<=140))throw Error("Invalid topic snapshot values.");
   const url=blobUrl.current??URL.createObjectURL(new Blob([EMBEDDING_WORKER_SOURCE],{type:"text/javascript"}));
   blobUrl.current=url;
   if(!worker.current){
     const w=new Worker(url,{type:"module",name:"myway-cloud-owner-topic-search"});
     w.onmessage=(ev:MessageEvent<Msg>)=>{
       const m=ev.data;if(!m||m.id!==seq.current)return;
       if(m.type==="progress")setStatus(m.message??"Embedding...");
       if(m.type==="search-result"){
         setResult(m.result??null);setStatus("Ranked owner-scoped topic labels locally. No association or writes.");setBusy(false);
       }
       if(m.type==="error"){setStatus("Embedding failed: "+(m.error??"Unknown"));setBusy(false);}
     };
     w.onerror=()=>{setBusy(false);setStatus("Browser embedding worker unavailable. No writes.");w.terminate();worker.current=null;};
     worker.current=w;
   }
   seq.current++;
   worker.current.postMessage({type:"search",id:seq.current,backend,topic:query.trim(),rootProblem:"",labels});
  }catch(e){setStatus(e instanceof Error?e.message:"Search failed");setBusy(false);}
 }
 function cancel(){if(!busy)return;seq.current++;worker.current?.terminate();worker.current=null;setBusy(false);setStatus("Cancelled.");}
 return <section className="relative z-10 mx-auto mt-5 max-w-5xl px-5 sm:px-10" aria-labelledby="owner-search-heading">
  <div className="rounded-2xl border border-sky-400/25 bg-slate-900/95 p-5 text-slate-100">
   <h2 id="owner-search-heading" className="text-lg font-semibold">V3.7D.2C.6B · Private topic-label semantic search</h2>
   <p className="mt-2 text-xs text-slate-300">Uses your authenticated RLS-protected snapshot and MiniLM in this browser. Finds similar topic <strong>labels</strong>, not equivalent learner difficulties. Experimental 200-topic cap; no pgvector, persistence, Model C or cloud writes.</p>
   <p className="mt-1 text-xs text-amber-200">Opting in downloads model assets from third-party hosts. Use synthetic wording for this diagnostic; no user messages are saved by MyWay.</p>
   <label className="mt-3 block text-sm">Synthetic query
     <input value={query} maxLength={500} onChange={e=>setQuery(e.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white"/>
   </label>
   <div className="mt-3 flex items-center gap-2"><select value={backend} disabled={busy} onChange={e=>setBackend(e.target.value as "wasm"|"webgpu")} className="rounded bg-slate-800 p-2 text-sm"><option value="wasm">WASM</option><option value="webgpu">WebGPU</option></select>
    <button disabled={busy||!query.trim()} onClick={()=>void run()} className="rounded bg-sky-600 px-3 py-2 text-sm disabled:opacity-50">Search private labels</button>
    {busy&&<button type="button" onClick={cancel} className="rounded border border-slate-600 px-3 py-2 text-sm">Cancel</button>}</div>
   <p role="status" className="mt-2 text-xs text-slate-300">{status}</p>
   {result&&<div className="mt-3 text-sm"><p className="text-xs text-cyan-200">{result.model} · {result.dimensions}D · {result.scanned} labels · load {Math.round(result.loadMs)}ms · embedding {Math.round(result.inferenceMs)}ms · total {Math.round(result.totalMs)}ms</p>
     <ol className="mt-2 list-decimal pl-6">{result.rank.map(r=><li key={r.id} className="py-1">{r.label}: <span className="font-mono text-cyan-200">{r.similarity.toFixed(3)}</span></li>)}</ol>
    </div>}
  </div></section>;
}
