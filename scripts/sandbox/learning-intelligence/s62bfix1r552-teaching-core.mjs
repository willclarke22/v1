/** R5.5.2 minimal pedagogical transport contract: no prescribed learning modality,
 * fixed number of moments, or fixed story. Models choose natural narration moments.
 * Host owns the authoritative spoken-to-learner words and assigns indices.
 */
import {validateActivity} from './s62bfix1r55-creative-core.mjs';
const S={type:'string'};
const moments={type:'array',items:S};
const obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
export const B_TEACH_SCHEMA=obj({teaching_intent:S,narration:moments,visual_direction:S,evidence_opportunity:S});
export const B_ONLY_R552_SCHEMA=obj({title:S,narration:moments,html_fragment:S,evidence_notes:S,limitations:S,visual_storyboard:S,moment_visuals:moments});
export const X_R552_SCHEMA=obj({title:S,html_fragment:S,evidence_notes:S,limitations:S,visual_storyboard:S,moment_visuals:moments});
export function validateNarration(value){
 if(!Array.isArray(value)||!value.length||value.length>12)throw Error('Teaching requires 1..12 naturally sized narration moments');
 for(const line of value)if(typeof line!=='string'||!line.trim()||line.length>2400)throw Error('Invalid learner-facing narration moment');
 return value;
}
export function validateBTeaching(v){
 if(!v||typeof v!=='object'||typeof v.teaching_intent!=='string'||typeof v.visual_direction!=='string'||typeof v.evidence_opportunity!=='string')throw Error('B learner-facing design fields missing');
 validateNarration(v.narration);
 if(v.teaching_intent.length>3500||v.visual_direction.length>5000||v.evidence_opportunity.length>2500)throw Error('B text contract is too large');
 return v;
}
export function validateR552Activity(v,{needsNarration=false}={}){
 if(!v||typeof v!=='object')throw Error('Missing creative activity');
 validateActivity({title:v.title,html_fragment:v.html_fragment,evidence_notes:v.evidence_notes,limitations:v.limitations});
 if(typeof v.visual_storyboard!=='string'||v.visual_storyboard.length>5000)throw Error('Visual story intent must be text');
 if(!Array.isArray(v.moment_visuals)||v.moment_visuals.length>12||v.moment_visuals.some(x=>typeof x!=='string'||x.length>700))throw Error('Invalid moment descriptions');
 if(needsNarration)validateNarration(v.narration);
 return v;
}
/** An audit, not a failure condition: an already-paid return is preserved even
 * when its visual HTML does not implement every cue. No automatic re-generation.
 */
export function inspectMomentCoverage(html,narration){
 const wanted=narration.length;
 const seen=[...String(html).matchAll(/data-myway-moment\s*=\s*["'](\d{1,2})["']/gi)].map(m=>Number(m[1]));
 const indexes=[...new Set(seen)].sort((a,b)=>a-b);
 const missing=Array.from({length:wanted},(_,i)=>i).filter(i=>!indexes.includes(i));
 return {schema:'r552_visual_moment_coverage_v1',narration_count:wanted,static_moment_indices:indexes,missing_indices:missing,static_markers_complete:missing.length===0,real_visual_behavior_verified:false,model_report_not_independent_proof:true};
}
