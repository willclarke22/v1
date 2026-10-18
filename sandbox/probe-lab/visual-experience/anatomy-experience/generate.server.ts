import { callVisualOrchestrationCalibrationModel } from "../model-provider.server";
import { assembleAnatomyContext } from "./assemble.server";
import { validateAnatomyExperiencePlan, ANATOMY_EXPERIENCE_SCHEMA } from "./contract";
import { prepareLookGrabDiscovery, validateLookGrabSelection, reportUnmetLookGrabNeeds, type LookGrabMode } from "./asset-discovery.server";

export type AnatomyExperienceModel = "gpt-6.1-sol" | "z-ai/glm-5.3";
const MODEL_PRICING:Record<string,{input:number;cached_input:number;output:number}> = {
  "gpt-6.1-sol": {input:2,cached_input:0.1,output:10},
}; // USD / million, Standard API published October 2026; excludes cache write/tool surcharges.
function outputText(raw:Record<string,unknown>):string{
  const output=Array.isArray(raw.output)?raw.output:[];
  return output.flatMap(item=>{
    if(!item || typeof item!=="object")return [];
    const content=Array.isArray((item as {content?:unknown}).content)?(item as {content:unknown[]}).content:[];
    return content.map(part=>part&&typeof part==="object" && 'text' in part?String((part as {text:unknown}).text):'');
  }).join('').trim();
}
function parseObject(raw:string){
  try{return JSON.parse(raw) as unknown;}catch{}
  const first=raw.indexOf('{');const last=raw.lastIndexOf('}');
  if(first<0||last<=first)throw new Error('Model returned no JSON scene plan.');
  return JSON.parse(raw.slice(first,last+1)) as unknown;
}
export async function generateAnatomyExperience(learnerMessage:string,model:AnatomyExperienceModel,useSemantic:boolean, discoveryMode:"v2_context"|LookGrabMode="v2_context"){
  const started=performance.now();
  const discovered=discoveryMode==="v2_context"?null:await prepareLookGrabDiscovery(learnerMessage,discoveryMode);
  const assembled=discovered?{assets:discovered.verified_assets,focal_name:learnerMessage,diagnostics:discovered.diagnostics}:await assembleAnatomyContext(learnerMessage,useSemantic);
  if(!assembled.assets.length)throw new Error('No verified BodyParts3D anatomy could be grounded for this question. Try naming a specific anatomical structure.');
  const knowledge={
    focal_concept:assembled.focal_name,
    verified_assets:assembled.assets.map(a=>({id:a.asset_id,name:a.label,system:a.system,why_retrieved:a.reason,context_role:a.context_role,dimensions_m:a.dimensions_m,position_m:a.runtime_transform.position})),
    constraints:{only_use_supplied_asset_ids:true,mesh_deformation_available:false,animation_type:'camera, visibility, highlighting and explanatory staging only',all_asset_transforms_in_shared_collection_space:true}
  };
  const historicalSystem=[
    'You are an anatomical education experience director. Return ONLY a JSON object.',
    `Required schema_version: ${ANATOMY_EXPERIENCE_SCHEMA}.`,
    'Fields: title, learning_objective, summary, steps (3–6).',
    'Each step fields: title, narration, visible_asset_ids (1–24 from supplied IDs), highlighted_asset_ids (subset of visible), motion_explanation.',
    'Prioritize anatomical orientation: when verified bone/landmark/environment meshes are supplied, start with recognizable location context before isolating focal muscles. Then reveal their neighbours and functional relationships.',
    'context_role tells you WHY an asset was selected: focal, functional, orientation, or environment. It is not a verified anatomical functional claim.',
    'Keep useful landmarks throughout multiple steps when legible; do not isolate a muscle against an empty background when context assets are available.',
    'A structure missing from the supplied candidate list is NOT proof it is absent from the entire MyWay atlas. Say only it is not supplied for this experience.',
    'Keep focal and supporting structures visually legible. Use at most 24 objects in a step.',
    'Never invent a mesh or anatomical identity. If focal anatomy is not present, state limitations explicitly.',
    'This renderer does NOT support mesh contraction, deformation or true anatomy motion yet. Do not claim it will animate contraction.',
    'motion_explanation should describe physiology in text and clearly distinguish explanation from executed animation.',
    'Avoid claiming exact biomechanics or muscle insertions without evidence. No executable JS or code.',
  ].join('\n');
  const lookGrabSystem=[
    'You are an anatomical education experience director. Return ONLY one JSON object.',
    `Required schema_version: ${ANATOMY_EXPERIENCE_SCHEMA}.`,
    'The supplied catalog is a verified inventory of available meshes, not a recommendation or relevance ranking.',
    'Each catalog row is [short_id, verified_name, system, laterality, optional_aliases].',
    'LOOK AND GRAB: independently select the most useful available assets for the learner question; do not assume the top of the search results is correct.',
    'Required output: title, learning_objective, summary, selected_asset_ids (1–80 SHORT IDs from catalog), and steps (3–6).',
    'Each step: title, narration, visible_asset_ids (1–24 SHORT IDs from selected_asset_ids), highlighted_asset_ids (subset of visible), motion_explanation.',
    'Choose as many or as few assets as useful, without system quotas; favour a coherent visual explanation.',
    ...(discoveryMode==='multiscale_v2'?[
      'When appropriate, establish a recognizable larger-scale location before focusing on details. Use only truly available contextual meshes, then progressively reveal or isolate the subject; do not assume a complete exterior model exists.',
      'Context evidence suggests options, not mandates. You decide what to include. If adequate regional geometry is missing, describe that limitation; do not invent it.',
    ]:[]),
    'Anatomy meshes share atlas coordinates. MyWay, not you, resolves actual asset transforms and model URLs.',
    'Optional unmet_visual_needs: brief names of useful structures missing from the provided inventory. This is diagnostic only; never place a missing asset in a step.',
    'Do not invent IDs. Do not claim that an asset absent from these search results is absent from the entire library.',
    'Renderer supports mesh visibility and highlights, not actual muscular deformation. Describe physiology in text only.',
    'No executable code, no unsupported biomechanical claims. Use only the listed SHORT IDs.',
  ].join('\n');
  const system=discovered?lookGrabSystem:historicalSystem;
  const user=discovered?JSON.stringify({learner_question:learnerMessage,discovery_mode:discoveryMode,available_assets:JSON.parse(discovered.compact_catalog)}):JSON.stringify({learner_question:learnerMessage,knowledge});
  const callStart=performance.now();
  let responseText='';
  let usage:{input_tokens:number|null;output_tokens:number|null;cached_input_tokens:number|null;cache_write_tokens:number|null}={input_tokens:null,output_tokens:null,cached_input_tokens:null,cache_write_tokens:null};
  if(model==='gpt-6.1-sol'){
    const key=process.env.MYWAY_OPENAI_API_KEY??process.env.OPENAI_API_KEY;
    if(!key)throw new Error('Missing OpenAI API key (MYWAY_OPENAI_API_KEY or OPENAI_API_KEY).');
    const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),110_000);
    try{
      const res=await fetch(`${(process.env.OPENAI_BASE_URL??'https://api.openai.com/v1').replace(/\/$/,'')}/responses`,{
        method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:ctrl.signal,cache:'no-store',
        body:JSON.stringify({model,input:[{role:'system',content:system},{role:'user',content:user}],reasoning:{effort:'medium'},max_output_tokens:6500,text:{format:{type:'json_object'}},store:false}),
      });
      if(!res.ok)throw new Error(`OpenAI API HTTP ${res.status}: ${(await res.text()).slice(0,350)}`);
      const j=(await res.json()) as Record<string,unknown>;
      responseText=outputText(j);
      const u=(j.usage??{}) as Record<string,unknown>;
      const d=(u.input_tokens_details??{}) as Record<string,unknown>;
      usage={input_tokens:typeof u.input_tokens==='number'?u.input_tokens:null,output_tokens:typeof u.output_tokens==='number'?u.output_tokens:null,cached_input_tokens:typeof d.cached_tokens==='number'?d.cached_tokens:null,cache_write_tokens:typeof d.cache_write_tokens==='number'?d.cache_write_tokens:null};
      if(!responseText)throw new Error(`OpenAI returned no final text (status: ${String(j.status??'unknown')}).`);
    }finally{clearTimeout(timer);}
  }else{
    const called=await callVisualOrchestrationCalibrationModel({messages:[{role:'system',content:system},{role:'user',content:user}],model:'z-ai/glm-5.3',reasoning_effort:'low',max_tokens:4000,timeout_ms:110000,temperature:0.1,top_p:1});
    if(!called.ok)throw new Error(`GLM-5.3: ${called.error}`);
    responseText=called.raw_text;
  }
  const modelMs=Math.round(performance.now()-callStart);
  const modelObject=parseObject(responseText);
  const picked=discovered?validateLookGrabSelection(modelObject,discovered.entries):null;
  const selectedAssets=picked?assembled.assets.filter(a=>picked.selected_ids.includes(a.asset_id)):assembled.assets;
  const plan=validateAnatomyExperiencePlan(picked?picked.plan_raw:modelObject,selectedAssets);
  const gaps=picked&&discovered?reportUnmetLookGrabNeeds(picked.unmet_visual_needs,discovered.all_entries,new Set(discovered.entries.map(a=>a.asset_id))):[];
  const rate=MODEL_PRICING[model];
  const uncached=usage.input_tokens===null?null:Math.max(0,usage.input_tokens-(usage.cached_input_tokens??0));
  const cost=rate&&uncached!==null&&usage.output_tokens!==null?Number(((uncached*rate.input+(usage.cached_input_tokens??0)*rate.cached_input+usage.output_tokens*rate.output)/1_000_000).toFixed(6)):null;
  return {ok:true as const,schema_version:ANATOMY_EXPERIENCE_SCHEMA,model,plan,assets:selectedAssets,diagnostics:{...assembled.diagnostics,selected_asset_count:selectedAssets.length,model_selected_count:picked?.selected_ids.length??null,unmet_visual_needs:gaps,model_duration_ms:modelMs,total_duration_ms:Math.round(performance.now()-started),tokens:usage,estimated_model_cost_usd:cost,cost_note:model==='gpt-6.1-sol'?'Standard published text-token rates; excludes cache-write/processing surcharges and any other billed operations.':'GLM NVIDIA usage/cost unavailable through this adapter; no estimate.',model_calls:1,additional_embedding_calls:assembled.diagnostics.embedding_calls??0}};
}
