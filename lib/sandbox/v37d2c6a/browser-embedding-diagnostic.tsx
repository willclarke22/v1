"use client";
/** V3.7D.2C.6A: voluntary MiniLM browser-only diagnostic, not a retrieval or learning endpoint. */
import { useEffect, useRef, useState } from "react";
import { EMBEDDING_WORKER_SOURCE } from "./embedding-worker-source";

type Match = {label:string;similarity:number};
type Result = { model:string;backend:string;dimensions:number;normalized:boolean;libraryMs:number;loadMs:number;inferenceMs:number;totalMs:number;reused:boolean;fixtureCount:number;topicRank:Match[];rootRank:Match[];preview:number[] };
type WorkerReply = {type:"progress"|"result"|"error";id:number;message?:string;error?:string;result?:Result};
export default function BrowserEmbeddingDiagnostic(){
 const [topic,setTopic]=useState("Why does a light bulb need a closed loop?");
 const [root,setRoot]=useState("I think electricity flows out of the battery without needing to return.");
 const [backend,setBackend]=useState<"wasm"|"webgpu">("wasm");
 const [status,setStatus]=useState("No model loaded. Inference starts only when you click Run.");
 const [running,setRunning]=useState(false);
 const [result,setResult]=useState<Result|null>(null);
 const workerRef=useRef<Worker|null>(null),urlRef=useRef<string|null>(null),seq=useRef(0),active=useRef(false);
 useEffect(()=>()=>{active.current=false;workerRef.current?.terminate();if(urlRef.current)URL.revokeObjectURL(urlRef.current)},[]);
 function ensureWorker(){
  if(workerRef.current)return workerRef.current;
  const url=URL.createObjectURL(new Blob([EMBEDDING_WORKER_SOURCE],{type:"text/javascript"}));
  try{
   const worker=new Worker(url,{type:"module",name:"myway-minilm-v37d2c6a"});
   worker.onmessage=(e:MessageEvent<WorkerReply>)=>{
    const m=e.data;if(!m||m.id!==seq.current)return;
    if(m.type==="progress")setStatus(m.message??"Working...");
    if(m.type==="result"){active.current=false;setRunning(false);setResult(m.result??null);setStatus("Local embedding completed. No topic associations or database writes were performed.");}
    if(m.type==="error"){active.current=false;setRunning(false);setResult(null);setStatus("Embedding failed: "+(m.error??"unknown error"));}
   };
   worker.onerror=()=>{active.current=false;setRunning(false);setResult(null);setStatus("Worker failed (possibly browser CSP or blocked model download). No data was written.");workerRef.current?.terminate();workerRef.current=null;if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null;}};
   workerRef.current=worker;urlRef.current=url;return worker;
  }catch(error){URL.revokeObjectURL(url);throw error;}
 }
 function run(){
  if(running||!topic.trim()||topic.length>500||root.length>2500)return;
  try{const worker=ensureWorker();seq.current+=1;active.current=true;setRunning(true);setResult(null);setStatus("Starting browser worker...");worker.postMessage({type:"run",id:seq.current,backend,topic,rootProblem:root});}
  catch(error){setRunning(false);setStatus("Could not create browser worker: "+(error instanceof Error?error.message:String(error)));}
 }
 function cancel(){if(!running)return;seq.current+=1;workerRef.current?.terminate();workerRef.current=null;if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null;}active.current=false;setRunning(false);setResult(null);setStatus("Cancelled. Run again to reload MiniLM.");}
 function rankings(matches:Match[]){return <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">{matches.slice(0,5).map(x=><li key={x.label}><span className="text-slate-200">{x.label}</span> <span className="font-mono text-cyan-200">{x.similarity.toFixed(3)}</span></li>)}</ol>}
 return <section className="relative z-10 mx-auto max-w-5xl px-5 pt-5 sm:px-10" aria-labelledby="cloud-embedding-heading">
  <div className="rounded-2xl border border-indigo-400/25 bg-slate-900/95 p-5 text-slate-100 shadow-xl">
   <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="cloud-embedding-heading" className="text-lg font-semibold">V3.7D.2C.6A · Browser MiniLM benchmark</h2><span className="rounded-full border border-indigo-300/30 px-3 py-1 text-xs text-indigo-200">LOCAL INFERENCE · NO DATABASE RETRIEVAL</span></div>
   <p className="mt-2 text-sm text-slate-300">Generates 384-D embeddings with MiniLM and compares them with six fictional examples. Topic similarity and learning-difficulty similarity are ranked separately. This is a diagnostic—not topic matching, evaluation, teaching or persistence.</p>
   <p className="mt-2 text-xs text-amber-200">Clicking Run downloads inference code from jsDelivr and model files from the Hugging Face model host. Use synthetic test wording only; the text is processed locally, but third-party resource requests occur. The first run may require a large download.</p>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <label className="flex flex-col gap-1 text-xs">Sample learner topic / message<input className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white" maxLength={500} value={topic} onChange={e=>setTopic(e.target.value)}/></label>
    <label className="flex flex-col gap-1 text-xs">Hypothesized root problem (optional)<textarea className="min-h-20 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white" maxLength={2500} value={root} onChange={e=>setRoot(e.target.value)}/></label>
   </div>
   <div className="mt-3 flex flex-wrap items-center gap-3"><label className="text-sm">Backend <select value={backend} disabled={running} onChange={e=>setBackend(e.target.value as "wasm"|"webgpu")} className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"><option value="wasm">WASM / CPU</option><option value="webgpu">WebGPU</option></select></label>
   <button type="button" disabled={running||!topic.trim()} onClick={run} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold disabled:opacity-50">{running?"Computing...":"Run browser embeddings"}</button>
   {running&&<button type="button" onClick={cancel} className="rounded-lg border border-slate-500 px-3 py-2 text-sm">Cancel</button>}</div>
   <p className="mt-3 text-xs text-slate-300" role="status" aria-live="polite">{status}</p>
   {result&&<div className="mt-4 rounded-xl border border-slate-700 p-4 text-sm">
    <p className="font-semibold">{result.model} · {result.backend.toUpperCase()} · {result.dimensions}-D · {result.normalized?"normalized":"unnormalized"} · {result.reused?"warm model":"new model load"}</p>
    <p className="mt-2 font-mono text-xs text-slate-300">Library {Math.round(result.libraryMs)}ms · Load {Math.round(result.loadMs)}ms · Embedding {Math.round(result.inferenceMs)}ms · Total {Math.round(result.totalMs)}ms</p>
    <div className="mt-3 grid gap-4 sm:grid-cols-2"><div><p className="font-semibold">Closest topic labels (fictional)</p>{rankings(result.topicRank)}</div><div><p className="font-semibold">Closest root problems (fictional)</p>{result.rootRank.length?rankings(result.rootRank):<p className="mt-2 text-xs text-slate-400">No root problem supplied.</p>}</div></div>
    <p className="mt-3 text-xs text-slate-400">Query vector preview: [{result.preview.join(", ")}, ...]. Similarity is not evidence of the same difficulty or permission to attach a topic.</p>
   </div>}
  </div>
 </section>;
}
