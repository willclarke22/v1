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
 const step=experience?.plan.steps[stepIndex];
 const activeAssets=useMemo(()=>experience?experience.assets.filter(a=>step?.visible_asset_ids.includes(a.asset_id)):[],[experience,step]);
 const hot=useMemo(()=>new Set(manualHot?[manualHot]:step?.highlighted_asset_ids??[]),[manualHot,step]);
 async function generate(){
  setBusy(true);setError(null);setManualHot(null);
  try{
    const response=await fetch('/api/sandbox/probe-lab/visual-experience/anatomy-experience',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({learner_message:question,model,use_semantic:useSemantic})});
    const parsed=await response.json() as Experience&{error?:string};
    if(!response.ok||!parsed.ok)throw new Error(parsed.error??`HTTP ${response.status}`);
    setExperience(parsed);setStepIndex(0);setHidden(new Set());setReset(v=>v+1);
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
   <label style={{display:'flex',gap:8,alignItems:'flex-start',fontSize:11,color:'#c3d3e6',marginTop:11}}><input type="checkbox" checked={useSemantic} onChange={e=>setUseSemantic(e.target.checked)}/>Use published V2 semantic vectors when available (3 additional paid embedding calls; cost not estimated)</label>
   <button style={{...btn,width:'100%',background:'#176ff0',borderColor:'#287eea',marginTop:12,fontWeight:800}} onClick={()=>void generate()} disabled={busy||question.trim().length<8}>{busy?'Generating…':'Generate anatomy experience'}</button>
   {error?<p role="alert" style={{color:'#feb9b9',fontSize:12,overflowWrap:'anywhere'}}>{error}</p>:null}
   <div style={{borderTop:'1px solid #304156',marginTop:15,paddingTop:13}}><strong style={{fontSize:13}}>Generation report</strong>{experience?<>
    <div className="muted" style={{marginTop:8}}>Model: {experience.model}</div><div className="muted">Total: {(experience.diagnostics.total_duration_ms/1000).toFixed(2)}s · Model: {(experience.diagnostics.model_duration_ms/1000).toFixed(2)}s</div><div className="muted">Asset grounding: {(experience.diagnostics.assembly_ms/1000).toFixed(2)}s · {experience.diagnostics.selected_asset_count} verified assets</div><div className="muted">BM25 cache: {experience.diagnostics.cache_hit?'hit':'miss'} · Semantic snapshot: {experience.diagnostics.semantic_snapshot_ready?'ready':'unavailable'}</div><div className="muted">Additional embedding calls: {experience.diagnostics.additional_embedding_calls}</div>
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
