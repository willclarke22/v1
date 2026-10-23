"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { OrchestrationAnatomyAtlasViewer } from "./orchestration-anatomy-atlas-viewer";
import type { AutomaticAssemblyReport } from "../anatomy-assemblies/automatic-spatial";
import {
 ANATOMY_BOUNDARY_SCHEMA, DEFAULT_CONTEXT_OPACITY, DEFAULT_BOUNDARY_OPACITY,
 assemblySeedRoles, effectiveAssemblyRole,
 type AnatomyBoundaryMode, type AnatomyBoundaryPresentation, type AnatomyBoundaryRole,
} from "./assembly-boundary-presentation";

const API = "/api/sandbox/probe-lab/visual-experience/anatomy-assemblies";
const EXPECTED_SCHEMA = "myway_bodyparts3d_spatial_assemblies_v1";
type CatalogAsset = {asset_id:string;member_id:string;label:string;system:string};
type Response = {ok:boolean;generated?:AutomaticAssemblyReport;assets?:CatalogAsset[];error?:string};
type ManualOverride = {fingerprint:string;asset_ids:string[];json:string;revision:number};
type Draft = {fingerprint:string;text:string};
type AssemblyEditorInput = {schema_version?:unknown;atlas_fingerprint?:unknown;assembly_id?:unknown;asset_ids?:unknown;assets?:unknown;presentation?:unknown;[key:string]:unknown};
type IncomingEvidence = {asset_id:string;evidence?:unknown;crossing?:unknown;spatial_overlap_ratio?:unknown};
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
function clampOpacity(value:unknown, fallback:number):number {
 return typeof value === "number" && Number.isFinite(value) && value>=0.05 && value<=1
  ? Math.round(value*100)/100 : fallback;
}
function normalizedPresentation(input:unknown,active:string,ids:readonly string[]):AnatomyBoundaryPresentation {
 const raw=objectValue(input)?input:null;
 if (raw && raw.schema_version!==ANATOMY_BOUNDARY_SCHEMA) throw new Error(`Unknown presentation.schema_version: ${String(raw.schema_version)}`);
 const knownIds=new Set(ids);
 const roles=raw?.roles!==undefined?{} as Record<string,AnatomyBoundaryRole>:assemblySeedRoles(active,ids);
 if(raw && raw.roles!==undefined){
  if(!objectValue(raw.roles))throw new Error("presentation.roles must be an object of asset IDs to role names.");
  for(const [id,role] of Object.entries(raw.roles)){
   if(!knownIds.has(id))throw new Error(`Presentation role for asset not included in the assembly: ${id}`);
   if(role!=="core"&&role!=="context"&&role!=="boundary")throw new Error(`Unknown role for ${id}: ${String(role)}`);
   if(role==="core")delete roles[id]; else roles[id]=role;
  }
 }
 return {schema_version:ANATOMY_BOUNDARY_SCHEMA,roles,
  context_opacity:clampOpacity(raw?.context_opacity,DEFAULT_CONTEXT_OPACITY),
  boundary_opacity:clampOpacity(raw?.boundary_opacity,DEFAULT_BOUNDARY_OPACITY)};
}
function objectValue(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value)}
/** asset_ids is authoritative; all metadata/counts are rebuilt from the verified atlas. */
function validateAndNormalize(
 text:string,active:string,data:AutomaticAssemblyReport,known:Map<string,CatalogAsset>,generated:Record<string,unknown>,
):{asset_ids:string[];json:string}{
 let raw:unknown;
 try{raw=JSON.parse(text)}catch(e){throw new Error(`Invalid JSON: ${e instanceof Error?e.message:String(e)}`)}
 if(!objectValue(raw))throw new Error("The editor must contain a JSON object.");
 const incoming=raw as AssemblyEditorInput;
 if(incoming.schema_version!==EXPECTED_SCHEMA)throw new Error(`Expected schema_version ${EXPECTED_SCHEMA}.`);
 if(incoming.assembly_id!==active)throw new Error(`This JSON is for ${String(incoming.assembly_id)}. Select that assembly before applying it.`);
 if(incoming.atlas_fingerprint!==data.atlas_fingerprint)throw new Error("The atlas fingerprint differs from the currently loaded catalog. Regenerate and review before applying.");
 if(!Array.isArray(incoming.asset_ids))throw new Error("asset_ids must be an array of asset IDs. Edit this array to control the viewer.");
 if(incoming.asset_ids.length>data.eligible_count)throw new Error(`Too many asset IDs for the current atlas (${data.eligible_count}).`);
 const ids:string[]=[];const seen=new Set<string>();
 for(const rawId of incoming.asset_ids){
  if(typeof rawId!=="string"||!rawId.trim()||rawId!==rawId.trim())throw new Error("Every asset_ids item must be a nonempty, unpadded string.");
  if(seen.has(rawId))throw new Error(`Duplicate asset ID: ${rawId}`);
  if(!known.has(rawId))throw new Error(`Unknown asset ID in this atlas: ${rawId}`);
  seen.add(rawId);ids.push(rawId);
 }
 const prior=new Map<string,IncomingEvidence>();
 for(const entry of Array.isArray(incoming.assets)?incoming.assets:[]){
  if(objectValue(entry)&&typeof entry.asset_id==="string")prior.set(entry.asset_id,entry as IncomingEvidence);
 }
 const entries=ids.map(assetId=>{
  const authoritative=known.get(assetId)!;
  const e=prior.get(assetId);
  const evidence=typeof e?.evidence==="string"?e.evidence:"manual_selection";
  const crossing=typeof e?.crossing==="boolean"?e.crossing:null;
  const fraction=typeof e?.spatial_overlap_ratio==="number"&&Number.isFinite(e.spatial_overlap_ratio)?e.spatial_overlap_ratio:null;
  return {...authoritative,evidence,crossing,spatial_overlap_ratio:fraction};
 });
 const presentation=normalizedPresentation(incoming.presentation,active,ids);
 const clean={
  ...generated,
  asset_count:ids.length,asset_ids:ids,assets:entries,presentation,
  selection_mode:"manual_override",
  manual_edit:{authority:"asset_ids",atlas_verified:true,automatically_generated:false},
 };
 return {asset_ids:ids,json:JSON.stringify(clean,null,2)};
}
export function OrchestrationAssemblyStudio(){
 const [data,setData]=useState<AutomaticAssemblyReport|null>(null);
 const [catalogAssets,setCatalogAssets]=useState<CatalogAsset[]>([]);
 const [active,setActive]=useState("head_neck");
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [editorError,setEditorError]=useState<string|null>(null);
 const [editorInfo,setEditorInfo]=useState<string|null>(null);
 const [copied,setCopied]=useState(false);
 const [boundaryMode,setBoundaryMode]=useState<AnatomyBoundaryMode>("contextual");
 const [inspectedAsset,setInspectedAsset]=useState<string|null>(null);
 const [roleQuery,setRoleQuery]=useState("");
 // Per-assembly edits live in this browser session. They do not mutate atlas reviews or auto-generator storage.
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [overrides,setOverrides]=useState<Record<string,ManualOverride>>({});
 const load=useCallback(async()=>{
  setLoading(true);setError(null);
  try{
   const res=await fetch(API,{cache:"no-store"});
   const body=await res.json() as Response;
   if(!res.ok||!body.ok||!body.generated)throw new Error(body.error??`Assembly generation HTTP ${res.status}`);
   if(body.generated.schema_version!==EXPECTED_SCHEMA)throw new Error("Unrecognized spatial generator response.");
   if(!Array.isArray(body.assets)||body.assets.length!==body.generated.eligible_count)throw new Error("Verified atlas asset registry is unavailable or incomplete.");
   const ids=new Set(body.assets.map(a=>a.asset_id));
   if(ids.size!==body.assets.length)throw new Error("Atlas registry contains duplicate IDs; editor disabled.");
   setCatalogAssets(body.assets);
   setData(body.generated);
   setEditorError(null);setEditorInfo(null);
  }catch(e){setError(e instanceof Error?e.message:String(e));setData(null);setCatalogAssets([])}finally{setLoading(false)}
 },[]);
 useEffect(()=>{void load()},[load]);
 const known=useMemo(()=>new Map(catalogAssets.map(a=>[a.asset_id,a])),[catalogAssets]);
 const selected=data?.assemblies.find(a=>a.assembly_id===active)??null;
 const generatedManifest=useMemo(()=>selected&&data?{
   schema_version:data.schema_version,atlas_fingerprint:data.atlas_fingerprint,generator:data.generator,
   coordinate_space:data.coordinate_space,assembly_id:selected.assembly_id,assembly_label:selected.label,
   asset_count:selected.asset_count,asset_ids:selected.asset_ids,assets:selected.assets,
   region_volumes:selected.region_volumes,warnings:selected.warnings,
   audit:{eligible_count:data.eligible_count,bounds_available:data.bounds_available,
    bounds_unavailable:data.bounds_unavailable,unassigned_asset_count:data.unassigned_asset_ids.length},
   notes:data.notes,
   presentation:normalizedPresentation(undefined,selected.assembly_id,selected.asset_ids),
 }:null,[selected,data]);
 const autoJson=useMemo(()=>generatedManifest?JSON.stringify(generatedManifest,null,2):"",[generatedManifest]);
 const override=data&&overrides[active]?.fingerprint===data.atlas_fingerprint?overrides[active]:undefined;
 const appliedJson=override?.json??autoJson;
 const appliedPresentation=useMemo(()=>{
  if(!selected || !appliedJson)return null;
  try {const raw=JSON.parse(appliedJson) as AssemblyEditorInput;
   return normalizedPresentation(raw.presentation,active,Array.isArray(raw.asset_ids)?raw.asset_ids as string[]:selected.asset_ids);
  }catch{return null}
 },[appliedJson,active,selected]);
 const appliedIds=override?.asset_ids??selected?.asset_ids??[];
 const draft=data&&drafts[active]?.fingerprint===data.atlas_fingerprint?drafts[active]?.text:undefined;
 const editorText=draft??appliedJson;
 const pending=editorText!==appliedJson;
 const preview=useMemo(()=>selected?{id:selected.assembly_id,label:selected.label,asset_ids:appliedIds,
  presentation:appliedPresentation??undefined, boundaryMode}:undefined,[selected,appliedIds,appliedPresentation,boundaryMode]);
 const roleMatches=useMemo(()=>appliedIds.filter(id=>{
  const asset=known.get(id); const query=roleQuery.trim().toLowerCase();
  return !query||id.toLowerCase().includes(query)||asset?.label.toLowerCase().includes(query);
 }),[appliedIds,known,roleQuery]);
 const roleCounts=useMemo(()=>({
  core:appliedIds.filter(id=>effectiveAssemblyRole(appliedPresentation?.roles??{},id)==="core").length,
  context:appliedIds.filter(id=>effectiveAssemblyRole(appliedPresentation?.roles??{},id)==="context").length,
  boundary:appliedIds.filter(id=>effectiveAssemblyRole(appliedPresentation?.roles??{},id)==="boundary").length,
 }),[appliedIds,appliedPresentation]);
 const viewerKey=`${active}:${appliedIds.join(",")}:${data?.atlas_fingerprint??"none"}`;
 function changeActive(next:string){setActive(next);setInspectedAsset(null);setRoleQuery("");setEditorError(null);setEditorInfo(null);setCopied(false)}
 function edit(text:string){if(!data)return;setDrafts(old=>({...old,[active]:{fingerprint:data.atlas_fingerprint,text}}));setEditorInfo(null);setEditorError(null)}
 function apply(){
  if(!data||!generatedManifest||!selected)return;
  try{
   const normalized=validateAndNormalize(editorText,active,data,known,generatedManifest);
   const next={fingerprint:data.atlas_fingerprint,asset_ids:normalized.asset_ids,json:normalized.json,revision:Date.now()};
   setOverrides(old=>({...old,[active]:next}));
   setDrafts(old=>({...old,[active]:{fingerprint:data.atlas_fingerprint,text:normalized.json}}));
   setEditorError(null);setEditorInfo(`Applied ${normalized.asset_ids.length} verified mesh IDs to the viewer. No server data was changed.`);
  }catch(e){setEditorInfo(null);setEditorError(e instanceof Error?e.message:String(e))}
 }
 function updatePresentation(update:(presentation:AnatomyBoundaryPresentation)=>AnatomyBoundaryPresentation){
  if(!data||!generatedManifest||!selected||!appliedJson||pending)return;
  try{
   const raw=JSON.parse(appliedJson) as Record<string,unknown>;
   const presentation=normalizedPresentation(raw.presentation,active,appliedIds);
   raw.presentation=update(presentation);
   const normalized=validateAndNormalize(JSON.stringify(raw),active,data,known,generatedManifest);
   setOverrides(old=>({...old,[active]:{fingerprint:data.atlas_fingerprint,asset_ids:normalized.asset_ids,json:normalized.json,revision:Date.now()}}));
   setDrafts(old=>({...old,[active]:{fingerprint:data.atlas_fingerprint,text:normalized.json}}));
   setEditorError(null);setEditorInfo("Updated presentation roles; source meshes and atlas remain unchanged.");
  }catch(e){setEditorError(e instanceof Error?e.message:String(e))}
 }
 function setRole(id:string,role:AnatomyBoundaryRole){
  updatePresentation(p=>{const roles={...p.roles}; if(role==="core")delete roles[id];else roles[id]=role;return {...p,roles}});
 }
 function reset(){
  setOverrides(old=>{const next={...old};delete next[active];return next});
  setDrafts(old=>{const next={...old};delete next[active];return next});
  setEditorError(null);setEditorInfo("Restored this assembly's automatic selection.");
 }
 async function copy(){
  if(!appliedJson)return;
  try{await navigator.clipboard.writeText(appliedJson);setCopied(true);window.setTimeout(()=>setCopied(false),2000)}
  catch{setEditorError("Clipboard access was denied. Use Download Applied JSON instead.")}
 }
 return (
  <section style={{display:"grid",gap:14,color:"#e2e8f0"}}>
   <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
    <div>
     <div style={{fontSize:11,fontWeight:800,letterSpacing:1.2,color:"#7dd3fc"}}>BODYPARTS3D · SPATIAL ASSEMBLIES</div>
     <h2 style={{margin:"5px 0",fontSize:23}}>Anatomy Assembly Studio</h2>
     <p style={{margin:0,...small}}>Automatic regions with optional editable, catalog-verified JSON overrides. No changes to source assets or saved reviews.</p>
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
       const custom=data&&overrides[id]?.fingerprint===data.atlas_fingerprint?overrides[id]:undefined;
       return <button key={id} type="button" aria-current={active===id?"page":undefined} onClick={()=>changeActive(id)} style={{
        ...button,textAlign:"left",padding:"9px 10px",fontSize:12,fontWeight:active===id?750:500,
        borderColor:active===id?"rgba(56,189,248,.48)":"transparent",
        background:active===id?"rgba(14,165,233,.19)":"transparent",display:"flex",justifyContent:"space-between",gap:6,
       }}><span>{assembly?.label??id.replaceAll("_"," ")}{custom?" · edited":""}</span><span style={{color:"#94a3b8"}}>{custom?.asset_ids.length??assembly?.asset_count??"—"}</span></button>
      })}
     </div>)}
    </nav>
    <div style={{...panel,overflow:"hidden"}}>
     <div style={{padding:"12px 15px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
      <div><strong>{selected?.label??"Assembly"}</strong><div style={{...small,marginTop:3}}>{selected?`${appliedIds.length} included meshes · ${override?"Edited selection":"Automatically assembled"}`:"Loading generator…"}</div></div>
      <span style={{fontSize:11,color:"#94a3b8"}}>Orbit · zoom · select</span>
     </div>
     {selected&&preview?<OrchestrationAnatomyAtlasViewer key={viewerKey} assemblyPreview={preview} onAssemblySelectAsset={(id)=>{setInspectedAsset(id);setRoleQuery(known.get(id)?.label??id)}}/>:
      <div style={{minHeight:420,display:"grid",placeItems:"center",...small}}>{loading?"Generating assemblies…":"No generated assembly available."}</div>}
     {selected?.warnings.length?<div style={{padding:"10px 14px",fontSize:12,color:"#fbbf24"}}>{selected.warnings.join("; ")}</div>:null}
    </div>
    <aside style={{...panel,padding:12,display:"grid",gap:10}}>
     <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,flexWrap:"wrap"}}>
      <strong style={{fontSize:14}}>Assembly JSON editor</strong>
      <span style={{...small,fontSize:11}}>{appliedIds.length} applied assets{pending?" · unapplied changes":""}</span>
     </div>
     <p style={{...small,lineHeight:1.5,margin:0}}>Paste corrected JSON, or edit the <code>asset_ids</code> array. Click <strong>Apply to Viewer</strong> to render that exact selection. Counts and asset metadata are rebuilt from the verified atlas.</p>
     <textarea aria-label="Editable assembly JSON" spellCheck={false} value={editorText} onChange={(event:{target:{value:string}})=>edit(event.target.value)}
      style={{boxSizing:"border-box",width:"100%",minHeight:420,maxHeight:760,resize:"vertical",padding:12,background:"rgba(2,6,23,.85)",border:"1px solid rgba(148,163,184,.24)",borderRadius:10,color:"#bae6fd",fontFamily:"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",fontSize:10,lineHeight:1.55}}/>
     {editorError?<div role="alert" style={{color:"#fecaca",fontSize:12}}>{editorError}</div>:null}
     {editorInfo?<div role="status" style={{color:"#86efac",fontSize:12}}>{editorInfo}</div>:null}

     {selected && appliedPresentation ? <div style={{border:"1px solid rgba(56,189,248,.25)",borderRadius:12,padding:10,display:"grid",gap:9,background:"rgba(14,165,233,.045)"}}>
      <strong style={{fontSize:13}}>Boundary presentation · {roleCounts.core} core / {roleCounts.context} context / {roleCounts.boundary} boundary</strong>
      <p style={{...small,margin:0,lineHeight:1.5}}>All structures remain anatomically intact. Context and boundary roles are transparent for clarity. Isolated hides those whole meshes; Full shows everything opaque. These are display roles, not anatomical cuts.</p>
      <div role="group" aria-label="Boundary display mode" style={{display:"flex",flexWrap:"wrap",gap:5}}>
       {(["contextual","isolated","full"] as AnatomyBoundaryMode[]).map(mode=><button type="button" key={mode} onClick={()=>setBoundaryMode(mode)}
        style={{...button,padding:"6px 9px",fontSize:11,borderColor:boundaryMode===mode?"#38bdf8":"rgba(148,163,184,.24)"}}>{mode==="contextual"?"Contextual":mode==="isolated"?"Isolated":"Full"}</button>)}
      </div>
      <label style={{...small}}>Context opacity · {Math.round(appliedPresentation.context_opacity*100)}%
       <input aria-label="Context opacity" type="range" min="0.05" max="0.6" step="0.05" disabled={pending} value={appliedPresentation.context_opacity}
        onChange={e=>updatePresentation(p=>({...p,context_opacity:Number(e.currentTarget.value)}))} style={{width:"100%"}} />
      </label>
      <label style={{...small}}>Boundary opacity · {Math.round(appliedPresentation.boundary_opacity*100)}%
       <input aria-label="Boundary opacity" type="range" min="0.1" max="0.8" step="0.05" disabled={pending} value={appliedPresentation.boundary_opacity}
        onChange={e=>updatePresentation(p=>({...p,boundary_opacity:Number(e.currentTarget.value)}))} style={{width:"100%"}} />
      </label>
      <label style={{...small}}>Find / select a mesh to change its role
       <input aria-label="Find assembly mesh for role" value={roleQuery} onChange={e=>setRoleQuery(e.target.value)} placeholder="Search femur, hip, psoas…"
        style={{boxSizing:"border-box",width:"100%",background:"#020617",border:"1px solid #475569",borderRadius:7,padding:8,color:"#e2e8f0",marginTop:4}} />
      </label>
      <div style={{maxHeight:190,overflowY:"auto",display:"grid",gap:4}}>
       {roleMatches.map(id=><div key={id} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 92px",gap:5,alignItems:"center",background:inspectedAsset===id?"rgba(56,189,248,.15)":"rgba(2,6,23,.45)",padding:"5px 6px",borderRadius:7}}>
        <button type="button" onClick={()=>setInspectedAsset(id)} title={id} style={{border:0,background:"transparent",textAlign:"left",color:inspectedAsset===id?"#7dd3fc":"#cbd5e1",cursor:"pointer",fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{known.get(id)?.label??id}</button>
        <select aria-label={`Role for ${known.get(id)?.label??id}`} disabled={pending} value={effectiveAssemblyRole(appliedPresentation.roles,id)}
         onChange={e=>setRole(id,e.currentTarget.value as AnatomyBoundaryRole)} style={{background:"#0f172a",color:"#e2e8f0",border:"1px solid #475569",padding:5,borderRadius:6,fontSize:11}}>
         <option value="core">Core</option><option value="context">Context</option><option value="boundary">Boundary</option>
        </select>
       </div>)}
      </div>
      <p style={{...small,margin:0}}>Clicking a mesh in the 3D viewer identifies it here. Role changes update the applied JSON; download that file to preserve your work. If you have unapplied JSON edits, apply them before changing roles.</p>
     </div>:null}
     <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
      <button type="button" disabled={!data||!generatedManifest||!catalogAssets.length||!pending} onClick={apply} style={{...button,borderColor:"#38bdf8"}}>Apply to Viewer</button>
      <button type="button" disabled={!selected} onClick={reset} style={button}>Reset to generated</button>
      <button type="button" disabled={!appliedJson} onClick={()=>void copy()} style={button}>{copied?"Copied":"Copy JSON"}</button>
      <button type="button" disabled={!appliedJson} onClick={()=>download(`myway_${active}_${override?"edited":"generated"}_assembly.json`,appliedJson+"\n")} style={button}>Download Applied JSON</button>
     </div>
     <p style={{...small,fontSize:11,lineHeight:1.55}}>Manual edits only affect this browser session and this assembly; they do not alter the atlas or automatic generator. Download applied JSON before leaving the page. Atlas fingerprint and every asset ID are verified on Apply. Additional meshes absent from the atlas cannot be created by editing JSON.</p>
     {data?<button type="button" style={{...button,fontSize:11}} onClick={()=>download("myway_all_automatic_assemblies.json",JSON.stringify(data,null,2)+"\n")}>Download all 11 assemblies (automatic report)</button>:null}
    </aside>
   </div>
  </section>
 );
}
