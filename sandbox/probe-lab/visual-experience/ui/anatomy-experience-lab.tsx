"use client";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode, Component } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { TrackballControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { AnatomySceneAsset, AnatomyExperiencePlan } from "../anatomy-experience/contract";

type Experience = {
  ok:boolean;model:string;plan:AnatomyExperiencePlan;assets:AnatomySceneAsset[];
  diagnostics: {selected_asset_count:number;candidate_count:number;cache_hit:boolean;semantic_snapshot_ready:boolean;additional_embedding_calls:number;model_duration_ms:number;assembly_ms:number;total_duration_ms:number;estimated_model_cost_usd:number|null;cost_note:string;tokens:{input_tokens:number|null;output_tokens:number|null;cached_input_tokens:number|null};[key:string]:unknown};
};
type ContextPreview = {
  ok: boolean; preview: true; focal_name: string; assets: AnatomySceneAsset[];
  diagnostics: {
    candidate_count?: number;selected_asset_count?: number;assembly_ms?: number;
    atlas_cache_hit?: boolean;cache_hit?: boolean;
    context_role_counts?: Record<string,number>;
    context_candidate_counts?: Record<string,number>;
    selected_evidence?: Array<{id:string;label:string;role:string;score:number;reasons:string[]}>;
    context_coverage_warnings?: string[];
  };
};
const colorBySystem:Record<string,string>={skeletal:'#e8d4af',muscular:'#bf6e66',digestive:'#d4988a',respiratory:'#a986b1',nervous:'#e3bd74',cardiovascular:'#b65a62',connective:'#9ca3af',integumentary:'#d19c83'};
const panel:React.CSSProperties={background:'linear-gradient(155deg,#14202e,#0b1523)',border:'1px solid #273649',borderRadius:14,padding:14};
const btn:React.CSSProperties={background:'#233348',border:'1px solid #35465c',borderRadius:9,padding:'8px 11px',color:'#ecf4ff',cursor:'pointer'};
const usd=(v:number|null)=>v===null?'Not available':`$${v.toFixed(v<0.01?5:3)} USD`;
function SceneMesh({asset,hot,dim,onSelect}:{asset:AnatomySceneAsset;hot:boolean;dim:boolean;onSelect:(id:string)=>void}){
 const gltf=useGLTF(asset.model_url);
 const {root,materials}=useMemo(()=>{
   const clone=gltf.scene.clone(true);const color=hot?'#fa5f61':colorBySystem[asset.system]??'#9facbc';
   const created:THREE.Material[]=[];
   clone.traverse(node=>{
     if(!(node instanceof THREE.Mesh))return;
     const material=new THREE.MeshStandardMaterial({color,roughness:0.72,metalness:0.02,transparent:dim,opacity:dim?0.13:1,depthWrite:!dim,emissive:hot?'#931b2c':'#000000',emissiveIntensity:hot?0.18:0});
     node.material=material;created.push(material);node.castShadow=false;node.receiveShadow=false;
   });
   return {root:clone,materials:created};
 },[gltf.scene,hot,dim,asset.system]);
 useEffect(()=>()=>{materials.forEach(m=>m.dispose())},[materials]);
 const t=asset.runtime_transform;
 return <group position={t.position} rotation={t.rotation} scale={t.scale} onClick={(e)=>{e.stopPropagation();onSelect(asset.asset_id)}}><primitive object={root}/></group>;
}
class SceneErrorBoundary extends Component<{children:ReactNode;label:string},{failed:boolean}>{
 state={failed:false}; static getDerivedStateFromError(){return {failed:true}};
 render(){return this.state.failed?null:this.props.children}
}
function FitCamera({sceneRef,resetKey,controlRef}:{sceneRef:React.RefObject<THREE.Group|null>;resetKey:string;controlRef:React.RefObject<any>}){
 const {camera}=useThree();const seen=useRef('');const frames=useRef(0);
 useEffect(()=>{seen.current='';frames.current=0},[resetKey]);
 useFrame(()=>{
  if(seen.current===resetKey||frames.current++>90||!sceneRef.current)return;
  const box=new THREE.Box3().setFromObject(sceneRef.current);
  if(box.isEmpty())return;
  const size=box.getSize(new THREE.Vector3());if(Math.max(size.x,size.y,size.z)<0.0001)return;
  const center=box.getCenter(new THREE.Vector3());const r=Math.max(size.x,size.y,size.z,0.035);
  camera.position.set(center.x+r*1.25,center.y+r*.48,center.z+r*1.65);
  camera.near=Math.max(0.0001,r/800);camera.far=Math.max(100,r*100);camera.lookAt(center);camera.updateProjectionMatrix();
  if(controlRef.current){controlRef.current.target.copy(center);controlRef.current.update()}
  seen.current=resetKey;
 });
 return null;
}
function AnatomyCanvas({assets,hot,hidden,resetKey,onSelect}:{assets:AnatomySceneAsset[];hot:Set<string>;hidden:Set<string>;resetKey:string;onSelect:(id:string)=>void}){
 const groupRef=useRef<THREE.Group>(null);const controlsRef=useRef<any>(null);
 const visible=assets.filter(a=>!hidden.has(a.asset_id));
 return <Canvas dpr={[1,1.7]} camera={{position:[0.5,0.3,0.8],near:0.0001,far:100,fov:42}} gl={{antialias:true,powerPreference:'high-performance'}} style={{height:'100%',minHeight:450,background:'#070d18'}}>
   <color attach="background" args={['#070d18']}/><ambientLight intensity={0.75}/><hemisphereLight intensity={0.65} color="#f6f0e6" groundColor="#30394a"/><directionalLight intensity={1.5} position={[4,5,7]}/><directionalLight intensity={0.6} position={[-5,2,-4]}/>
   <group ref={groupRef}>
    {visible.map(a=><SceneErrorBoundary key={a.asset_id} label={a.label}><Suspense fallback={null}><SceneMesh asset={a} hot={hot.has(a.asset_id)} dim={hot.size>0&&!hot.has(a.asset_id)} onSelect={onSelect}/></Suspense></SceneErrorBoundary>)}
   </group>
   <TrackballControls ref={controlsRef} noPan={false} rotateSpeed={3} zoomSpeed={1.2} minDistance={0.003} maxDistance={50}/>
   <FitCamera sceneRef={groupRef} controlRef={controlsRef} resetKey={resetKey}/>
 </Canvas>;
}
export function AnatomyExperienceLab(){
 const [question,setQuestion]=useState("I don't understand where the palatopharyngeus muscle is, or what it does when I swallow.");
 const [model,setModel]=useState<'gpt-6.1-sol'|'z-ai/glm-5.3'>('gpt-6.1-sol');
 const [useSemantic,setUseSemantic]=useState(false);
 const [experience,setExperience]=useState<Experience|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
 const [stepIndex,setStepIndex]=useState(0);const [reset,setReset]=useState(0);
 const [hidden,setHidden]=useState<Set<string>>(new Set());
 const [manualHot,setManualHot]=useState<string|null>(null);
 const [details,setDetails]=useState(false);
 const [contextPreview,setContextPreview]=useState<ContextPreview|null>(null);
 const [discoveryMode,setDiscoveryMode]=useState<"v2_context"|"full_catalog"|"search_assisted"|"multiscale_v2">("v2_context");
 const [discoveryPreview,setDiscoveryPreview]=useState<{
  diagnostics:Record<string,unknown>;
  sample:Array<{id:string;name:string;system:string}>;
 }|null>(null);
 const [previewBusy,setPreviewBusy]=useState(false);
 const [referenceNames,setReferenceNames]=useState('');
 const step=experience?.plan.steps[stepIndex];
 const activeAssets=useMemo(()=>experience?experience.assets.filter(a=>step?.visible_asset_ids.includes(a.asset_id)):[],[experience,step]);
 const hot=useMemo(()=>new Set(manualHot?[manualHot]:step?.highlighted_asset_ids??[]),[manualHot,step]);
 async function inspectContext(){
  setPreviewBusy(true);setError(null);
  try{
    const response=await fetch('/api/sandbox/probe-lab/visual-experience/anatomy-experience',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({learner_message:question,inspect_only:discoveryMode==="v2_context",inspect_discovery:discoveryMode!=="v2_context",discovery_mode:discoveryMode,reference_names:referenceNames.split(/[,\n]/).map(x=>x.trim()).filter(Boolean).slice(0,12)})});
    const json=await response.json() as ContextPreview&{error?:string;sample?:Array<{id:string;name:string;system:string}>};
    if(!response.ok||!json.ok||!json.preview)throw new Error(json.error??`HTTP ${response.status}`);
    if(discoveryMode==="v2_context"){setContextPreview(json);setDiscoveryPreview(null)}
    else {setDiscoveryPreview({diagnostics:json.diagnostics as Record<string,unknown>,sample:json.sample??[]});setContextPreview(null)}
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setPreviewBusy(false)}
 }
 async function generate(){
  setBusy(true);setError(null);setManualHot(null);
  try{
    const response=await fetch('/api/sandbox/probe-lab/visual-experience/anatomy-experience',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({learner_message:question,model,use_semantic:discoveryMode==="v2_context"&&useSemantic,discovery_mode:discoveryMode})});
    const parsed=await response.json() as Experience&{error?:string};
    if(!response.ok||!parsed.ok)throw new Error(parsed.error??`HTTP ${response.status}`);
    setExperience(parsed);setContextPreview(null);setDiscoveryPreview(null);setStepIndex(0);setHidden(new Set());setReset(v=>v+1);
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 const changes=(next:number)=>{setStepIndex(next);setManualHot(null);setHidden(new Set());setReset(x=>x+1)};
 const token=experience?.diagnostics.tokens;
 return <section className="myway-anat-experience" style={{border:'1px solid #26374d',borderRadius:18,background:'#080f1b',color:'#ecf1fa',overflow:'hidden'}}>
 <style>{`.myway-anat-experience .three-pane{display:grid;grid-template-columns:minmax(245px,290px) minmax(0,1fr) minmax(210px,255px);gap:10px;padding:10px;align-items:stretch}.myway-anat-experience .scene-large{position:relative;min-width:0;min-height:580px;border-radius:12px;overflow:hidden;border:1px solid #29394a}.myway-anat-experience .scroll-side{max-height:650px;overflow-y:auto}.myway-anat-experience .muted{color:#9aa9bb;font-size:12px;line-height:1.5}.myway-anat-experience button:disabled{opacity:.45;cursor:not-allowed}@media(max-width:1100px){.myway-anat-experience .three-pane{grid-template-columns:minmax(205px,260px) minmax(0,1fr)}.myway-anat-experience .right-pane{grid-column:1/-1;max-height:240px;overflow:auto}.myway-anat-experience .scene-large{min-height:520px}}@media(max-width:650px){.myway-anat-experience .three-pane{display:flex;flex-direction:column}.myway-anat-experience .scene-large{height:460px;min-height:460px}.myway-anat-experience .scroll-side{max-height:none}}`}</style>
 <div style={{padding:'13px 16px',borderBottom:'1px solid #223247',display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><div style={{color:'#79b9fc',fontSize:11,fontWeight:800,letterSpacing:'.07em'}}>VISUAL EXPERIENCE · ORCHESTRATION LAB</div><strong style={{fontSize:20}}>Explain with anatomy</strong></div><span className="muted">Verified BodyParts3D · One model call · GLM preserved</span></div>
 <div className="three-pane">
  <aside style={{...panel}} className="scroll-side"><h3 style={{margin:'0 0 6px'}}>What do you want to explore?</h3><p className="muted" style={{margin:'0 0 12px'}}>Describe what you don't understand.</p>
   <textarea style={{boxSizing:'border-box',width:'100%',minHeight:125,borderRadius:10,padding:11,background:'#1a2939',border:'1px solid #38506a',color:'#fff',resize:'vertical'}} value={question} maxLength={1000} onChange={e=>setQuestion(e.target.value)}/>
   <label style={{display:'grid',gap:6,fontSize:12,marginTop:12}}>Model<select aria-label="Anatomy experience model" value={model} onChange={e=>setModel(e.target.value as typeof model)} style={{color:'#e7f0ff',background:'#233548',padding:10,borderRadius:8,border:'1px solid #3c5267'}}><option value="gpt-6.1-sol">GPT-6.1 Sol · OpenAI (paid)</option><option value="z-ai/glm-5.3">GLM-5.3 · NVIDIA</option></select></label>
   <label style={{display:'grid',gap:6,fontSize:12,marginTop:12}}>Asset discovery mode<select aria-label="Asset discovery mode" value={discoveryMode} onChange={e=>{setDiscoveryMode(e.target.value as typeof discoveryMode);setContextPreview(null);setDiscoveryPreview(null)}} style={{color:'#e7f0ff',background:'#233548',padding:10,borderRadius:8,border:'1px solid #3c5267'}}><option value="v2_context">V2 baseline · MyWay selects 50</option><option value="full_catalog">Look &amp; Grab · complete atlas</option><option value="search_assisted">Look &amp; Grab · BM25 broad search</option><option value="multiscale_v2">Look &amp; Grab · multiscale V2 (experimental)</option></select></label>
   <p className="muted" style={{margin:'7px 0 3px'}}>{discoveryMode==='full_catalog'?'The model receives every eligible atlas mesh as a compact catalog; highest prompt cost.':discoveryMode==='search_assisted'?'The model selects from up to 250 BM25 candidates; lexical misses are expected on implicit questions.':discoveryMode==='multiscale_v2'?'The model chooses from up to 250 evidence-supported BM25 and distinct part-of/classification context candidates. Weak BM25 filler is discarded. Inspect warnings before generation.':'Existing 50-mesh anatomical context; kept unchanged for comparison.'}</p>
   {discoveryMode==='v2_context'?<label style={{display:'flex',gap:8,alignItems:'flex-start',fontSize:11,color:'#c3d3e6',marginTop:11}}><input type="checkbox" checked={useSemantic} onChange={e=>setUseSemantic(e.target.checked)}/>Use published V2 semantic vectors when available (3 additional paid embedding calls; cost not estimated)</label>:null}
   {discoveryMode!=='v2_context'?<label style={{display:'grid',gap:4,marginTop:10,fontSize:11,color:'#c4d4e5'}}>Optional no-model recall check (comma-separated names)
     <input aria-label="Reference asset names to check" placeholder="Enter known asset names for coverage testing" value={referenceNames} onChange={e=>setReferenceNames(e.target.value)} style={{color:'#e7f0ff',background:'#1a2939',border:'1px solid #38506a',padding:7,borderRadius:7}} />
   </label>:null}
   <button style={{...btn,width:'100%',background:'#176ff0',borderColor:'#287eea',marginTop:12,fontWeight:800}} onClick={()=>void generate()} disabled={busy||question.trim().length<8}>{busy?'Generating…':'Generate anatomy experience'}</button>
   <button style={{...btn,width:'100%',marginTop:8,fontSize:12}} onClick={()=>void inspectContext()} disabled={busy||previewBusy||question.trim().length<8}>{previewBusy?'Inspecting candidate anatomy…':discoveryMode==='v2_context'?'Inspect anatomy context · no model call':'Inspect discovery inventory · no model call'}</button>
   {discoveryPreview?<div style={{marginTop:11,padding:11,background:'#17283d',border:'1px solid #36516e',borderRadius:9}}>
     <strong style={{fontSize:13}}>Look &amp; Grab inventory preview</strong>
     <div className="muted">Eligible library: {String(discoveryPreview.diagnostics.eligible_library_count??'—')} · Shown to model: {String(discoveryPreview.diagnostics.provided_candidate_count??'—')} · Search: {(Number(discoveryPreview.diagnostics.assembly_ms??0)/1000).toFixed(2)}s</div>
     <div className="muted">Catalog characters: {String(discoveryPreview.diagnostics.inventory_characters??'—')} · Approx. input tokens (characters/4, not provider count): {String(discoveryPreview.diagnostics.inventory_approx_tokens??'—')}</div>
     {discoveryMode==='multiscale_v2' && discoveryPreview.diagnostics.multiscale_evidence ? <div style={{marginTop:8}}>
       <strong style={{fontSize:12}}>Multiscale retrieval evidence</strong>
       {(()=>{const ev=discoveryPreview.diagnostics.multiscale_evidence as {direct_anchors?:string[];query_count?:number;lexical_candidates?:number;graph_candidates?:number;context_candidates?:number;rejected_weak_lexical?:number;weak_anchor_count?:number;partof_candidates?:number;classification_candidates?:number;region_hints?:string[];parents?:Array<{name:string;depth:number;renderable:boolean;relationship?:string}>;warnings?:string[];sample?:Array<{id:string;name:string;channels:string[]}>};return <>
         <div className="muted">Queries: {ev.query_count??0} · Identity/tag BM25: {ev.lexical_candidates??0} · Graph-derived new: {ev.graph_candidates??0} · Context: {ev.context_candidates??0} · Weak BM25 discarded: {ev.rejected_weak_lexical??0}</div>
         <div className="muted">Anchor identities: {(ev.direct_anchors??[]).join(' · ')||'none'}</div>
         <div className="muted">Derived region hints: {(ev.region_hints??[]).join(' · ')||'none verified'} · is_a added: {ev.classification_candidates??0} · part_of added: {ev.partof_candidates??0}</div>
         {(ev.warnings??[]).map((w,i)=><div className="muted" key={i} style={{color:'#e5ba8d'}}>{w}</div>)}
         <details><summary style={{fontSize:12,cursor:'pointer'}}>Related regional context and candidate evidence</summary>
           <div className="muted">A concept's parent does not guarantee that a complete exterior or region mesh exists.</div>
           {(ev.parents??[]).map((x,i)=><div className="muted" key={i}>{x.name} · {x.relationship??'relationship'} depth {x.depth} · {x.renderable?'matched renderable asset':'concept only'}</div>)}
           {(ev.sample??[]).map(x=><div key={x.id} className="muted">{x.name}: {x.channels.join(' · ')}</div>)}
         </details>
       </>;})()}
     </div>:null}
     {Array.isArray(discoveryPreview.diagnostics.reference_checks) && discoveryPreview.diagnostics.reference_checks.length>0 ? <div style={{marginTop:8}}><strong style={{fontSize:12}}>Name-based retrieval coverage</strong>
       {(discoveryPreview.diagnostics.reference_checks as Array<{requested:string;library_matches:number;retrieved:number;note?:string;matches?:Array<{name:string;supplied:boolean}>}>).map((x,i)=><div className="muted" key={i} style={{color:x.library_matches>0 && x.retrieved===0?'#e5ba8d':undefined}}>{x.requested}: {x.retrieved}/{x.library_matches} matching library meshes supplied {x.note?` · ${x.note}`:''}</div>)}
       <div className="muted">Matches use normalized exact identity/alias, not semantic equivalence. User-entered checks are diagnostics only, never retrieval overrides.</div>
     </div>:null}
     <details style={{marginTop:8}}><summary style={{fontSize:12,cursor:'pointer'}}>First 30 catalog records</summary><div className="muted" style={{maxHeight:220,overflowY:'auto'}}>{discoveryPreview.sample.map(a=><div key={a.id}>{a.id} · {a.name} · {a.system}</div>)}</div></details>
     <div className="muted" style={{marginTop:6}}>Zero GPT/GLM or embedding calls; full inventory is sent only when Generate is pressed.</div>
   </div>:null}
   {contextPreview?<div style={{marginTop:11,padding:11,background:'#17283d',border:'1px solid #36516e',borderRadius:9}}>
     <strong style={{fontSize:13}}>V2 context preview · {contextPreview.assets.length} verified meshes</strong>
     <div className="muted">Candidates: {contextPreview.diagnostics.candidate_count??'—'} · Retrieval: {((contextPreview.diagnostics.assembly_ms??0)/1000).toFixed(2)}s · Atlas cache: {contextPreview.diagnostics.atlas_cache_hit?'hit':'miss'}</div>
     <div className="muted" style={{marginTop:5}}>{Object.entries(contextPreview.diagnostics.context_role_counts??{}).map(([role,n])=>`${role}: ${n}`).join(' · ')}</div>
     {(contextPreview.diagnostics.context_coverage_warnings??[]).map((warning,i)=><p key={i} className="muted" style={{color:'#e5ba8d',margin:'4px 0'}}>{warning}</p>)}
     <details style={{marginTop:8}}><summary style={{fontSize:12,cursor:'pointer'}}>View selected structures and retrieval evidence</summary>
       <div style={{maxHeight:280,overflowY:'auto',fontSize:11,paddingTop:6}}>{(contextPreview.diagnostics.selected_evidence??[]).map(a=><div key={a.id} style={{padding:'5px 0',borderBottom:'1px solid #2c4157'}}><strong>{a.label}</strong> <span className="muted">· {a.role} · score {a.score}</span><div className="muted">{a.reasons.join(' · ')}</div></div>)}</div>
     </details>
     <div className="muted" style={{marginTop:6}}>No GPT-6, GLM or embedding call. Retrieval metadata only; this is not a rendered scene.</div>
   </div>:null}
   {error?<p role="alert" style={{color:'#feb9b9',fontSize:12,overflowWrap:'anywhere'}}>{error}</p>:null}
   <div style={{borderTop:'1px solid #304156',marginTop:15,paddingTop:13}}><strong style={{fontSize:13}}>Generation report</strong>{experience?<>
    <div className="muted" style={{marginTop:8}}>Model: {experience.model} · Discovery: {String(experience.diagnostics.discovery_mode??'v2_context')}</div>
    {experience.diagnostics.discovery_mode?<div className="muted">Library: {String(experience.diagnostics.eligible_library_count??'—')} · Supplied: {String(experience.diagnostics.provided_candidate_count??'—')} · Selected: {String(experience.diagnostics.model_selected_count??'—')} · Catalog chars: {String(experience.diagnostics.inventory_characters??'—')}</div>:null}
    {Array.isArray(experience.diagnostics.unmet_visual_needs)&&experience.diagnostics.unmet_visual_needs.length?<details><summary className="muted">Unmet visual needs ({experience.diagnostics.unmet_visual_needs.length})</summary><pre style={{fontSize:10,whiteSpace:'pre-wrap'}}>{JSON.stringify(experience.diagnostics.unmet_visual_needs,null,2)}</pre></details>:null}<div className="muted">Total: {(experience.diagnostics.total_duration_ms/1000).toFixed(2)}s · Model: {(experience.diagnostics.model_duration_ms/1000).toFixed(2)}s</div><div className="muted">Asset grounding: {(experience.diagnostics.assembly_ms/1000).toFixed(2)}s · {experience.diagnostics.selected_asset_count} verified assets</div><div className="muted">BM25 cache: {experience.diagnostics.cache_hit?'hit':'miss'} · Semantic snapshot: {experience.diagnostics.semantic_snapshot_ready?'ready':'unavailable'}</div><div className="muted">Additional embedding calls: {experience.diagnostics.additional_embedding_calls}</div>
    <div style={{marginTop:10,fontSize:13,fontWeight:700}}>Estimated API model cost: {usd(experience.diagnostics.estimated_model_cost_usd)}</div><p className="muted">{experience.diagnostics.cost_note}</p>
    <button onClick={()=>setDetails(v=>!v)} style={{...btn,fontSize:11}}> {details?'Hide':'Show'} detailed model output</button>
    {details?<div style={{marginTop:9}}><div className="muted">Input tokens: {token?.input_tokens??'unreported'} · Cached: {token?.cached_input_tokens??'unreported'} · Output: {token?.output_tokens??'unreported'}</div><pre style={{fontSize:10,whiteSpace:'pre-wrap',wordBreak:'break-word',maxHeight:240,overflow:'auto'}}>{JSON.stringify({plan:experience.plan,diagnostics:experience.diagnostics},null,2)}</pre></div>:null}
    <p className="muted">{experience.plan.summary}</p>
   </>:<p className="muted">Run a model to see measured timings, token usage, and any available cost estimate.</p>}</div>
  </aside>
  <div className="scene-large"><div style={{position:'absolute',top:11,left:12,zIndex:2,background:'#091524db',border:'1px solid #34485f',padding:'8px 10px',borderRadius:8,fontSize:12}}>{experience?.plan.title??'3D scene · waiting for generation'}</div>
   {experience?<AnatomyCanvas assets={activeAssets} hot={hot} hidden={hidden} resetKey={`${reset}:${stepIndex}`} onSelect={setManualHot}/>:<div style={{height:'100%',display:'grid',placeItems:'center',background:'radial-gradient(circle at 50% 42%,#203047,#080d16 74%)',textAlign:'center',padding:20}}><div><div style={{fontSize:45}}>◉</div><h3>Real anatomy, directed by a model</h3><p className="muted">Generate an experience to assemble verified 3D BodyParts3D meshes.</p></div></div>}
   {experience?<div style={{position:'absolute',bottom:12,left:12,background:'#0a1526e8',borderRadius:9,padding:9,zIndex:2,display:'flex',gap:6,alignItems:'center'}}><button style={btn} onClick={()=>setReset(v=>v+1)}>Reset / focus</button><span className="muted">Drag to rotate · Scroll to zoom</span></div>:null}
  </div>
  <aside className="scroll-side right-pane" style={panel}><h3 style={{margin:'0 0 6px'}}>Scene content</h3><p className="muted">{activeAssets.length} meshes in the current view</p>
   {activeAssets.length?activeAssets.map(asset=><label key={asset.asset_id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:'1px solid #253345',fontSize:12}}><input type="checkbox" checked={!hidden.has(asset.asset_id)} onChange={e=>setHidden(old=>{const next=new Set(old);if(e.target.checked)next.delete(asset.asset_id);else next.add(asset.asset_id);return next})}/><span style={{width:8,height:8,borderRadius:'50%',background:hot.has(asset.asset_id)?'#ff6464':(colorBySystem[asset.system]??'#aaa')}}/><button onClick={()=>setManualHot(asset.asset_id)} style={{border:0,background:'none',color:hot.has(asset.asset_id)?'#ffb1a8':'#dce7f5',fontSize:12,textAlign:'left',padding:0,cursor:'pointer',flex:1}}>{asset.label}</button></label>):<p className="muted">Generated scene assets appear here.</p>}
   {manualHot?<button style={{...btn,marginTop:10,fontSize:11}} onClick={()=>setManualHot(null)}>Return to step highlights</button>:null}
   <p className="muted" style={{marginTop:12}}>Assets retain their original collection-space transforms. The model does not invent mesh geometry.</p>
  </aside>
 </div>
 {experience?<div style={{padding:'12px 15px 16px',borderTop:'1px solid #27374e'}}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}><strong>Learning sequence · {stepIndex+1} of {experience.plan.steps.length}</strong><span className="muted">Visual steps and highlights; no validated muscle deformation yet</span></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(165px,1fr))',gap:8}}>{experience.plan.steps.map((item,i)=><button key={i} onClick={()=>changes(i)} style={{...btn,background:stepIndex===i?'#174783':'#172538',borderColor:stepIndex===i?'#388cf6':'#344255',textAlign:'left',minHeight:62}}><span style={{color:'#90bdf4',fontSize:11}}>{i+1}</span><div style={{fontSize:12,fontWeight:750,marginTop:5}}>{item.title}</div></button>)}</div>
  <div style={{display:'flex',gap:12,alignItems:'start',marginTop:12,flexWrap:'wrap'}}><div style={{flex:1,minWidth:240}}><strong>{step?.title}</strong><p style={{color:'#c5d4e8',fontSize:13,lineHeight:1.55,margin:'6px 0'}}>{step?.narration}</p>{step?.motion_explanation?<p className="muted" style={{margin:'5px 0'}}>Function (explanation only): {step.motion_explanation}</p>:null}</div><div style={{display:'flex',gap:6}}><button style={btn} disabled={stepIndex===0} onClick={()=>changes(stepIndex-1)}>Previous</button><button style={btn} disabled={stepIndex===experience.plan.steps.length-1} onClick={()=>changes(stepIndex+1)}>Next</button></div></div>
 </div>:null}
 </section>;
}
