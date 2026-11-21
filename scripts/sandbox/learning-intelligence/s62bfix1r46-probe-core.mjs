/** R4.6 optional first-class Model B probe proposal, reusable TEXT scene contracts.
 * The placeholder is NOT a physical simulation or proof of understanding.
 */
import crypto from 'node:crypto';
import {B_GOLD_SCHEMA as BASE_SCHEMA,B_GOLD_PROMPT as BASE_PROMPT,validateB} from './s62bfix1r43-goldloop-core-anchor-v1.mjs';
const str={type:'string'},list=items=>({type:'array',items}),obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const modalities=['none','choice','prediction','manipulate','sequence','match','construct','explain'];
const vars=obj({key:str,label:str,min:{type:'number'},max:{type:'number'},step:{type:'number'},initial:{type:'number'}});
export const PROBE_SCHEMA=obj({
 offer:{type:'boolean'},modality:{type:'string',enum:modalities},purpose:str,prompt:str,
 choices:list(str),items:list(str),targets:list(str),variables:list(vars),hint:str,
 scene_decision:{type:'string',enum:['none','reuse','adapt','new']},reuse_scene_id:str,scene_reason:str,
 novelty:{type:'string',enum:['none','rehearsal','diagnostic','transfer']}
});
export const B_R46_SCHEMA=obj({...BASE_SCHEMA.properties,probe_plan:PROBE_SCHEMA});
export const B_R46_PROMPT=BASE_PROMPT+`\n\nR4.6 OPTIONAL REUSABLE PROBE: In addition to the normal B fields, return a probe_plan that the learner can actually attempt in a plain browser placeholder. Choose offer=false, modality=none, scene_decision=none, empty strings and empty arrays if a probe would interrupt curiosity, the learner needs teaching first, the prior probe is unanswered, or there is no genuine educational benefit. Do NOT force a probe every turn. When offering, choose ONE modality appropriate to the specific uncertainty: choice (2-6 choices); prediction (prediction and rationale); manipulate (1-3 slider variables); sequence (2-7 items); match (2-6 items and 2-6 targets); construct (2-7 selectable building blocks); explain (open-ended). For predictions/manipulations you may provide 0-3 numeric variables with finite min/max/step/initial. For any modality, use a meaningful prompt and one optional hint. This placeholder does not execute physics, math simulations, or 3D; NEVER promise an animated, physical or objectively scored result.\n\nREUSABLE SCENE: The user already sees X's textual scene descriptions. Prefer scene_decision=reuse and reuse_scene_id from available_scene_catalog when the same narrative objects can support an appropriate probe. Choose adapt only for a specifically justified new interaction, or new when transfer to a different context is educationally useful or the old scene cannot support the probe. Explain scene_reason. Do not invent a scene ID; use the catalog. The same scene may be used to teach and probe even though this research UI currently represents its actions as buttons, sliders or text. Do not repeat a previously offered probe without reason. Independent probing is not compulsory; Model B alone decides when. Probe outcomes will later be assessed by A, not self-graded by B. No arbitrary answer keys; offer questions with an interpretable objective.\n`;
function boundedString(x,max=1800){return typeof x==='string'&&x.length<=max;}
export function validateBWithProbe(raw){
 const r=typeof raw==='string'?JSON.parse(raw):structuredClone(raw);const {probe_plan:probe,...base}=r;const b=validateB(base);
 if(!probe||typeof probe!=='object'||Array.isArray(probe)||Object.keys(probe).sort().join('|')!==Object.keys(PROBE_SCHEMA.properties).sort().join('|'))throw Error('R46: B must return probe_plan with exact fields');
 // B's educational answer must survive a malformed optional probe plan. Report the issue instead of failing an already-paid turn.
 let warning='';try{validateProbe(probe);}catch(e){warning=String(e.message);}
 return {...b,probe_plan:warning?{...emptyProbe(),disabled_reason:warning}:structuredClone(probe)};
}
export function emptyProbe(){return {offer:false,modality:'none',purpose:'',prompt:'',choices:[],items:[],targets:[],variables:[],hint:'',scene_decision:'none',reuse_scene_id:'',scene_reason:'',novelty:'none'};}
export function validateProbe(p){
 if(typeof p.offer!=='boolean'||!modalities.includes(p.modality)||!['none','reuse','adapt','new'].includes(p.scene_decision)||!['none','rehearsal','diagnostic','transfer'].includes(p.novelty))throw Error('Invalid probe enums');
 for(const k of ['purpose','prompt','hint','reuse_scene_id','scene_reason'])if(!boundedString(p[k],k==='prompt'?1500:800))throw Error('Invalid probe text '+k);
 for(const k of ['choices','items','targets'])if(!Array.isArray(p[k])||p[k].length>8||p[k].some(s=>!boundedString(s,180)||!s.trim()))throw Error('Invalid probe list '+k);
 if(!Array.isArray(p.variables)||p.variables.length>3)throw Error('Too many probe variables');
 for(const v of p.variables){if(!v||!boundedString(v.key,35)||!/^[a-z][a-z0-9_]{0,34}$/.test(v.key)||!boundedString(v.label,130)||![v.min,v.max,v.step,v.initial].every(Number.isFinite)||v.max<=v.min||v.step<=0||v.max-v.min>100000||v.initial<v.min||v.initial>v.max)throw Error('Unsupported numeric variable');}
 if(!p.offer){if(p.modality!=='none')throw Error('Un-offered probe needs modality none');return true;}
 if(p.modality==='none'||p.prompt.trim().length<8||p.purpose.trim().length<8)throw Error('Offered probe missing purpose or prompt');
 if(p.modality==='choice'&&(p.choices.length<2||p.choices.length>6))throw Error('Choice probe needs 2-6 choices');
 if(['sequence','construct','match'].includes(p.modality)&&(p.items.length<2||p.items.length>7))throw Error('Arrangement/construction probe needs 2-7 items');
 if(p.modality==='match'&&(p.targets.length<2||p.targets.length>7))throw Error('Match probe needs 2-7 targets');
 if(p.scene_decision==='none')throw Error('Offered probe must explain scene reuse or creation');
 return true;
}
export function sceneCatalog(state,topicId,{max=8}={}){
 const prior=state.scene_contracts??[];return prior.filter(s=>s.topic_id===topicId).slice(-max).map(s=>({scene_id:s.scene_id,title:s.visual_concept,from_turn:s.source_turn_id,objects_or_world:s.scene_descriptions.slice(0,2),text_storyboard_only:true}));
}
export function makeSceneContract(state,turnId,topic,b,x){
 const proposal=b.probe_plan??emptyProbe(),prior=(state.scene_contracts??[]).find(s=>s.scene_id===proposal.reuse_scene_id);
 const validReuse=prior&&prior.topic_id===topic.id&&['reuse','adapt'].includes(proposal.scene_decision);
 const sceneId=validReuse?prior.scene_id:`scene_${turnId}`;
 const decision=validReuse?proposal.scene_decision:'new';
 const scene={scene_id:sceneId,source_turn_id:turnId,original_scene_turn_id:validReuse?prior.original_scene_turn_id:turnId,topic_id:topic.id,visual_concept:x.visual_concept,continuity_plan:x.continuity_plan,scene_descriptions:x.moments.map(m=>m.scene_description),source:'Model X textual storyboard plus Model B proposed affordances',visuals_rendered:false,scene_reuse:decision,scene_reason:validReuse?proposal.scene_reason:(prior?'Invalid cross-topic or unknown scene target; created a new text scene':proposal.scene_reason),probe_capability:proposal.offer?{modality:proposal.modality,variables:proposal.variables.map(v=>({key:v.key,label:v.label}))}:null,contract_sha256:crypto.createHash('sha256').update(JSON.stringify({turnId,sceneId,x,proposal})).digest('hex')};
 return scene;
}
export function visibleProbeForTurn(turn){return turn.probe_plan??turn.B_output?.probe_plan??null;}
