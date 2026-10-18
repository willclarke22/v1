"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { OrchestrationAnatomyAtlasViewer } from "./orchestration-anatomy-atlas-viewer";
import type { AutomaticAssembly, AutomaticAssemblyReport } from "../anatomy-assemblies/automatic-spatial";

const API = "/api/sandbox/probe-lab/visual-experience/anatomy-assemblies";
type Response = {ok:boolean;generated?:AutomaticAssemblyReport;error?:string};
const panel:CSSProperties={background:"rgba(15,23,42,.65)",border:"1px solid rgba(148,163,184,.17)",borderRadius:14,minWidth:0};
const button:CSSProperties={border:"1px solid rgba(148,163,184,.24)",borderRadius:9,padding:"8px 12px",background:"rgba(30,41,59,.8)",color:"#e2e8f0",cursor:"pointer",fontWeight:650};
const small:CSSProperties={fontSize:12,color:"#94a3b8"};
const GROUPS=[
 {name:"Head & neck",ids:["head_neck","head","neck"]},
 {name:"Trunk",ids:["torso","thorax","abdomen","pelvis"]},
 {name:"Limbs",ids:["upper_left","upper_right","lower_left","lower_right"]},
];
function download(name:string,text:string){
 const file=new Blob([text],{type:"application/json"});
 const url=URL.createObjectURL(file);const link=document.createElement("a");link.href=url;link.download=name;
 document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),20000);
}
export function OrchestrationAssemblyStudio(){
 const [data,setData]=useState<AutomaticAssemblyReport|null>(null);
 const [active,setActive]=useState("head_neck");
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [copied,setCopied]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);setError(null);
  try{
   const res=await fetch(API,{cache:"no-store"});
   const body=await res.json() as Response;
   if(!res.ok||!body.ok||!body.generated)throw new Error(body.error??`Assembly generation HTTP ${res.status}`);
   if(body.generated.schema_version!=="myway_bodyparts3d_spatial_assemblies_v1")throw new Error("Unrecognized spatial generator response.");
   setData(body.generated);
  }catch(e){setError(e instanceof Error?e.message:String(e));setData(null)}finally{setLoading(false)}
 },[]);
 useEffect(()=>{void load()},[load]);
 const selected=data?.assemblies.find(a=>a.assembly_id===active)??null;
 // The export and the viewer consume the exact same asset_ids supplied by the server.
 const manifest=useMemo(()=>selected&&data?{
   schema_version:data.schema_version,atlas_fingerprint:data.atlas_fingerprint,generator:data.generator,
   coordinate_space:data.coordinate_space,assembly_id:selected.assembly_id,assembly_label:selected.label,
   asset_count:selected.asset_count,asset_ids:selected.asset_ids,assets:selected.assets,
   region_volumes:selected.region_volumes,warnings:selected.warnings,
   audit:{eligible_count:data.eligible_count,bounds_available:data.bounds_available,
    bounds_unavailable:data.bounds_unavailable,unassigned_asset_count:data.unassigned_asset_ids.length},
   notes:data.notes,
 }:null,[selected,data]);
 const json=useMemo(()=>manifest?JSON.stringify(manifest,null,2):"",[manifest]);
 const preview=useMemo(()=>selected?{id:selected.assembly_id,label:selected.label,asset_ids:selected.asset_ids}:undefined,[selected]);
 async function copy(){
  if(!json)return;
  try{await navigator.clipboard.writeText(json);setCopied(true);window.setTimeout(()=>setCopied(false),2000)}
  catch{setError("Clipboard access was denied. Use Download JSON instead.")}
 }
 return (
  <section style={{display:"grid",gap:14,color:"#e2e8f0"}}>
   <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
    <div>
     <div style={{fontSize:11,fontWeight:800,letterSpacing:1.2,color:"#7dd3fc"}}>BODYPARTS3D · SPATIAL ASSEMBLIES</div>
     <h2 style={{margin:"5px 0",fontSize:23}}>Anatomy Assembly Studio</h2>
     <p style={{margin:0,...small}}>Automatically generated regions. No staging, coordinates or individual asset review required.</p>
    </div>
    <button type="button" style={button} onClick={()=>void load()} disabled={loading}>{loading?"Generating…":"Regenerate"}</button>
   </header>
   {error?<div role="alert" style={{...panel,padding:14,color:"#fecaca"}}>{error}</div>:null}
   {data?<div style={{display:"flex",flexWrap:"wrap",gap:15,...small}}>
    <span>Atlas: <strong style={{color:"#e2e8f0"}}>{data.eligible_count.toLocaleString()}</strong> meshes</span>
    <span>Spatial bounds: <strong style={{color:"#e2e8f0"}}>{data.bounds_available.toLocaleString()}</strong></span>
    <span>Assigned somewhere: <strong style={{color:"#e2e8f0"}}>{data.assigned_unique_count.toLocaleString()}</strong></span>
    <span>Not assigned: <strong style={{color:"#e2e8f0"}}>{data.unassigned_asset_ids.length.toLocaleString()}</strong></span>
    {data.bounds_unavailable?<strong style={{color:"#fbbf24"}}>Missing bounds: {data.bounds_unavailable}</strong>:null}
   </div>:null}
   <div style={{display:"grid",gridTemplateColumns:"minmax(160px,.75fr) minmax(0,2.8fr) minmax(270px,1.4fr)",gap:12,alignItems:"start"}}>
    <nav aria-label="Anatomical regions" style={{...panel,padding:12,display:"grid",gap:12}}>
     {GROUPS.map(group=><div key={group.name} style={{display:"grid",gap:4}}>
      <div style={{color:"#94a3b8",fontWeight:750,fontSize:11,margin:"0 0 3px"}}>{group.name}</div>
      {group.ids.map(id=>{
       const assembly=data?.assemblies.find(a=>a.assembly_id===id);
       return <button key={id} type="button" aria-current={active===id?"page":undefined} onClick={()=>setActive(id)} style={{
        ...button,textAlign:"left",padding:"9px 10px",fontSize:12,fontWeight:active===id?750:500,
        borderColor:active===id?"rgba(56,189,248,.48)":"transparent",
        background:active===id?"rgba(14,165,233,.19)":"transparent",display:"flex",justifyContent:"space-between",gap:6,
       }}><span>{assembly?.label??id.replaceAll("_"," ")}</span><span style={{color:"#94a3b8"}}>{assembly?.asset_count??"—"}</span></button>
      })}
     </div>)}
    </nav>
    <div style={{...panel,overflow:"hidden"}}>
     <div style={{padding:"12px 15px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
      <div><strong>{selected?.label??"Assembly"}</strong><div style={{...small,marginTop:3}}>{selected?`${selected.asset_count} included meshes · ${selected.warnings.length?"Landmark warning":"Automatically assembled"}`:"Loading generator…"}</div></div>
      <span style={{fontSize:11,color:"#94a3b8"}}>Orbit · zoom · select</span>
     </div>
     {selected && preview ? <OrchestrationAnatomyAtlasViewer assemblyPreview={preview}/> :
      <div style={{minHeight:420,display:"grid",placeItems:"center",...small}}>{loading?"Generating assemblies…":"No generated assembly available."}</div>}
     {selected?.warnings.length?<div style={{padding:"10px 14px",fontSize:12,color:"#fbbf24"}}>{selected.warnings.join("; ")}</div>:null}
    </div>
    <aside style={{...panel,padding:12,display:"grid",gap:10}}>
     <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,flexWrap:"wrap"}}>
      <strong style={{fontSize:14}}>Assembly JSON</strong>
      <span style={{...small,fontSize:11}}>{selected?.asset_count??0} assets</span>
     </div>
     <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
      <button type="button" disabled={!json} onClick={()=>void copy()} style={button}>{copied?"Copied":"Copy JSON"}</button>
      <button type="button" disabled={!json} onClick={()=>download(`myway_${active}_generated_assembly.json`,json+"\n")} style={button}>Download JSON</button>
     </div>
     <pre aria-label="Complete generated assembly JSON" style={{margin:0,padding:12,background:"rgba(2,6,23,.85)",borderRadius:10,
      whiteSpace:"pre",wordBreak:"normal",overflow:"auto",maxHeight:760,minHeight:340,fontSize:10,lineHeight:1.55,color:"#bae6fd"}}>{json||"Waiting for automatic assembly…"}</pre>
     <p style={{margin:0,...small,fontSize:11,lineHeight:1.55}}>Includes every generated mesh ID, spatial evidence and region definition. Copy this JSON into ChatGPT for an independent atlas comparison. Spatial inclusion is not a claim of anatomical completeness.</p>
     {data?<button type="button" style={{...button,fontSize:11}} onClick={()=>download("myway_all_generated_assemblies.json",JSON.stringify(data,null,2)+"\n")}>Download all 11 assemblies + coverage audit</button>:null}
    </aside>
   </div>
  </section>
 );
}
