"use client";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { AnatomyDirectorPlayer } from "./anatomy-director-player";
import { type DirectorAsset, type AnatomyDirectorProgram } from "../anatomy-director/contract";
import { DEFAULT_ANATOMY_SYSTEM_PROMPT, DEFAULT_ANATOMY_USER_PROMPT } from "../anatomy-director/prompts";

type Manifest = { ok:boolean; assets: DirectorAsset[]; error?:string };
type Result = {
  ok:boolean; phase?:string; error?:string|null; model?:string; raw_text?:string;
  program?:AnatomyDirectorProgram|null; duration_ms?:number; diagnostics?:unknown;
  request_messages?:Array<{role:string;content:string}>;request_body?:unknown; attempts?:unknown;
};
const panel:CSSProperties = {background:"#0f172ad9",border:"1px solid #344158",borderRadius:16,padding:16,minWidth:0};
const field:CSSProperties = {width:"100%",boxSizing:"border-box",color:"#f8fafc",background:"#071221",border:"1px solid #3b4960",borderRadius:10,padding:11,fontFamily:"inherit"};
const label:CSSProperties = {fontWeight:650,fontSize:13,color:"#e2e8f0"};

export function AnatomyDirectorLab() {
  const [assets,setAssets] = useState<DirectorAsset[]>([]);
  const [search,setSearch] = useState("femur");
  const [assetId,setAssetId] = useState("");
  const [systemPrompt,setSystemPrompt] = useState(DEFAULT_ANATOMY_SYSTEM_PROMPT);
  const [userPrompt,setUserPrompt] = useState(DEFAULT_ANATOMY_USER_PROMPT);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [raw,setRaw] = useState("");
  const [result,setResult] = useState<Result|null>(null);
  const [plan,setPlan] = useState<AnatomyDirectorProgram|null>(null);
  const [playing,setPlaying] = useState(false);
  const [time,setTime] = useState(0);
  useEffect(() => {
    let live=true;
    fetch("/api/sandbox/probe-lab/visual-experience/anatomy-atlas",{cache:"no-store"})
      .then(async (res) => {
        const json = await res.json() as Manifest;
        if (!res.ok || !json.ok || !Array.isArray(json.assets)) throw new Error(json.error || "Failed to load anatomy manifest.");
        if (live) {setAssets(json.assets); const preferred = json.assets.find(a=>/femur/i.test(a.label)) ?? json.assets[0]; setAssetId(preferred?.asset_id ?? "");}
      }).catch((caught:unknown) => {if(live)setError(caught instanceof Error?caught.message:String(caught));});
    return ()=>{live=false};
  },[]);
  const selected = useMemo(()=>assets.find(a=>a.asset_id===assetId)??null,[assets,assetId]);
  const results = useMemo(()=>assets.filter(a=>`${a.label} ${a.display_name} ${a.system}`.toLowerCase().includes(search.toLowerCase())).slice(0,120),[assets,search]);
  const changeAsset = (value:string) => {setAssetId(value);setPlan(null);setResult(null);setRaw("");setTime(0);setPlaying(false);setError("");};
  const generate = async () => {
    if(!selected)return;
    setBusy(true);setError("");setResult(null);setRaw("");setPlan(null);setPlaying(false);setTime(0);
    try {
      const response=await fetch("/api/sandbox/probe-lab/visual-experience/anatomy-director",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({asset_id:selected.asset_id,system_prompt:systemPrompt,user_prompt:userPrompt}),
      });
      const data=await response.json() as Result;
      setResult(data);setRaw(data.raw_text??"");
      if(!response.ok||!data.ok||!data.program)throw new Error(data.error||`Request failed (${response.status}).`);
      setPlan(data.program);
    }catch(caught){setError(caught instanceof Error?caught.message:String(caught));}
    finally{setBusy(false);}
  };
  const onTime=useCallback((value:number)=>{setTime(value);},[]);
  const onViewerError=useCallback((message:string)=>{setError(`3D viewer: ${message}`);setPlaying(false);},[]);
  return <section style={{display:"grid",gap:14,color:"#fff"}}>
    <header><h1 style={{fontSize:30,margin:"0 0 4px"}}>Anatomy Director</h1><p style={{color:"#94a3b8",margin:0,fontSize:14}}>One real BodyParts3D asset · One GLM-5.3 call · Inspect the generated animation</p></header>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,440px),1fr))",gap:16,alignItems:"start"}}>
      <section style={{...panel,display:"grid",gap:13,maxHeight:"calc(100vh - 156px)",overflowY:"auto"}}>
        <div style={{display:"grid",gap:6}}><label style={label} htmlFor="director-asset-search">Search atlas assets ({assets.length})</label>
          <input id="director-asset-search" style={field} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Femur, skull, tibia…"/>
          <select aria-label="Selected anatomy asset" style={field} value={results.some(a=>a.asset_id===assetId)?assetId:""} onChange={e=>changeAsset(e.target.value)}>
            <option value="" disabled>Select an asset from results</option>
            {results.map(a=><option key={a.asset_id} value={a.asset_id}>{a.label} ({a.system})</option>)}
          </select>
          {selected&&!results.some(a=>a.asset_id===selected.asset_id)&&<small style={{color:"#fbbf24"}}>Selected: {selected.label}. Update your search to view it in the list.</small>}
        </div>
        <div style={{display:"grid",gap:5}}><label style={label} htmlFor="director-system-prompt">System prompt — editable</label>
          <textarea id="director-system-prompt" spellCheck={false} value={systemPrompt} onChange={e=>setSystemPrompt(e.target.value)} style={{...field,resize:"vertical",minHeight:180,fontFamily:"ui-monospace,monospace",fontSize:12}}/>
        </div>
        <div style={{display:"grid",gap:5}}><label style={label} htmlFor="director-user-prompt">User prompt — editable</label>
          <textarea id="director-user-prompt" value={userPrompt} onChange={e=>setUserPrompt(e.target.value)} style={{...field,minHeight:110,resize:"vertical",fontSize:13}}/>
        </div>
        <button type="button" disabled={busy||!selected} onClick={generate} style={{...field,cursor:busy?"wait":"pointer",fontWeight:700,background:"#2563eb",border:"none",opacity: busy || !selected ? 0.6 : 1}}>{busy?"Generating one animation…":"Generate animation"}</button>
        {error&&<div role="alert" style={{color:"#fecaca",background:"#7f1d1d54",padding:10,borderRadius:10}}>{error}</div>}
        <div style={{display:"grid",gap:6}}><label style={label}>Raw GLM output (not modified)</label>
          <pre style={{margin:0,whiteSpace:"pre-wrap",overflowWrap:"anywhere",background:"#020617",borderRadius:10,padding:12,maxHeight:260,overflowY:"auto",fontSize:11,color:"#b8d4f3"}}>{raw||"Model response will appear here."}</pre>
        </div>
        {result&&<details><summary style={{cursor:"pointer",color:"#93c5fd"}}>Full request, validation and provider diagnostics</summary>
          <pre style={{fontSize:11,whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:450,overflowY:"auto"}}>{JSON.stringify({phase:result.phase,model:result.model,error:result.error,duration_ms:result.duration_ms,request_messages:result.request_messages,request_body:result.request_body,diagnostics:result.diagnostics,attempts:result.attempts},null,2)}</pre>
        </details>}
      </section>
      <section style={{...panel,display:"grid",gap:11}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}><h2 style={{margin:0,fontSize:17}}>3D visual output</h2><small style={{color:"#94a3b8"}}>Three.js · {selected?.label??"No asset"}</small></div>
        <div style={{borderRadius:12,overflow:"hidden",border:"1px solid #334155"}}>
          <AnatomyDirectorPlayer key={selected?.asset_id??"none"} asset={selected} program={plan} playing={playing} time={time} onTime={onTime} onError={onViewerError}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
          <button type="button" disabled={!plan} style={{...field,width:"auto",cursor:"pointer"}} onClick={()=>{if(plan&&time>=plan.duration_s)setTime(0);setPlaying(!playing);}}>{playing?"Pause":"Play"}</button>
          <button type="button" style={{...field,width:"auto",cursor:"pointer"}} onClick={()=>{setPlaying(false);setTime(0);}}>Reset</button>
          <input aria-label="Animation timeline" type="range" min={0} max={plan?.duration_s??1} step={0.01} disabled={!plan} value={Math.min(time,plan?.duration_s??1)} onChange={e=>{setPlaying(false);setTime(Number(e.target.value));}} style={{flex:1,minWidth:100}}/>
          <small style={{color:"#94a3b8"}}>{time.toFixed(1)} / {(plan?.duration_s??0).toFixed(1)}s</small>
        </div>
        <div style={{fontSize:12,color:"#94a3b8"}}>{plan?"Validated animation plan. Pausing enables mouse orbit. Use Reset to return to the beginning.":"Preview the selected real GLB now; generate an animation to test GLM choreography."}</div>
        {selected&&<details><summary style={{cursor:"pointer",fontSize:12,color:"#93c5fd"}}>Asset identity and atlas transform</summary><pre style={{fontSize:11,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(selected,null,2)}</pre></details>}
      </section>
    </div>
  </section>;
}
