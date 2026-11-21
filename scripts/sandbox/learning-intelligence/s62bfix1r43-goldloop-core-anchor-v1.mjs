/** Research-only R4.3 X anchor-ID contract v1. All non-X model logic is re-exported unchanged.
 * Source text is always owned by B; X only chooses deterministic available anchor IDs.
 * Returned output is normalized to the existing read-only UI's cue display contract.
 */
import {
 X_GOLD_PROMPT as OLD_X_PROMPT,
 makeXInput as originalMakeXInput,
} from './s62bfix1r43-goldloop-core.mjs';
export * from './s62bfix1r43-goldloop-core.mjs';
const str={type:'string'};
const array=items=>({type:'array',items});
const obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
export const X_GOLD_SCHEMA=obj({
 visual_concept:str,
 continuity_plan:str,
 moments:array(obj({
  beat_id:str, scene_description:str, transition_from_previous:str,
  cues:array(obj({anchor_id:str,on_screen_change:str})),
  accuracy_boundaries:str,possible_interaction:str,
 })),
 implementation_status:{type:'string',enum:['textual_storyboard_only']},
 limitations:str,
});
const assert=(v,msg)=>{if(!v)throw Error('GOLDLOOP: '+msg);};
const keys=(actual,shape)=>actual&&typeof actual==='object'&&!Array.isArray(actual)&&
 Object.keys(actual).sort().join('|')===Object.keys(shape.properties).sort().join('|');
/** Exact original source slices. Commas and sentence ends become optional timed anchors.
 * a00 anchors the WHOLE beat. No model-generated quote can alter the narration.
 */
export function anchorsForBeat(beat){
 const text=beat.narration,anchors=[{anchor_id:'a00',narration_quote:text}];
 let start=0,parts=[];
 for(let i=0;i<text.length;i++){
  if(',;:.!?'.includes(text[i])&&(i===text.length-1||/\s/.test(text[i+1]))){
   const p=text.slice(start,i+1).trim();if(p.length>=3)parts.push(p);start=i+1;
  }
 }
 const last=text.slice(start).trim();if(last.length>=3)parts.push(last);
 // Bound catalog size, with a00 always available as a guaranteed fallback.
 if(parts.length<=18)for(const part of parts){
  if(part===text)continue;
  anchors.push({anchor_id:'a'+String(anchors.length).padStart(2,'0'),narration_quote:part});
 }
 return anchors;
}
export function makeXInput(b,teacherInput){
 const base=originalMakeXInput(b,teacherInput);
 return {...base,
  narration_anchor_catalog:b.beats.map(beat=>({beat_id:beat.id,anchors:anchorsForBeat(beat)})),
  instruction:'B owns all exact words. Use beat IDs and only anchor IDs from narration_anchor_catalog. Never copy, rewrite, or invent a narration quote. On-screen changes should correspond to the selected anchor; a00 is the full-beat fallback.',
 };
}
export const X_GOLD_PROMPT=OLD_X_PROMPT.split('STRICT ALIGNMENT:')[0]+`STRICT ALIGNMENT WITH DETERMINISTIC IDS: Each B beat has a catalog of exact narration anchors in the input. Produce exactly one moment per beat in B's order. For every cue, provide ONLY the anchor_id of an anchor in the catalog for THAT beat, and the on_screen_change. Never output a narration_quote or copy B text yourself. The HOST will resolve the anchor ID to the authoritative exact phrase from B. Prefer short phrase anchors for fine-grained visual timing; use a00 (the entire beat) if no smaller supplied anchor fits. Do not invent IDs. Preserve factual accuracy and coherent scene continuity. implementation_status must be textual_storyboard_only; no real rendering is connected.`;
export function validateX(raw,b){
 const x=typeof raw==='string'?JSON.parse(raw):structuredClone(raw);
 assert(keys(x,X_GOLD_SCHEMA),'X output fields invalid (anchor contract)');
 assert(x.implementation_status==='textual_storyboard_only','X cannot claim visual rendering');
 for(const k of ['visual_concept','continuity_plan','limitations'])assert(typeof x[k]==='string','X missing '+k);
 assert(Array.isArray(x.moments)&&x.moments.length===b.beats.length,'X must cover every B beat');
 const normalized=[];
 for(let i=0;i<x.moments.length;i++){
  const m=x.moments[i],beat=b.beats[i];
  assert(keys(m,X_GOLD_SCHEMA.properties.moments.items),'X moment fields mismatch');
  assert(m.beat_id===beat.id,'X beat alignment mismatch at '+i);
  for(const k of ['scene_description','transition_from_previous','accuracy_boundaries','possible_interaction'])assert(typeof m[k]==='string','X '+k+' must be a string');
  assert(m.scene_description.trim().length>=20,'X scene description missing');
  assert(Array.isArray(m.cues)&&m.cues.length>=1&&m.cues.length<=12,'X needs 1..12 cues per beat');
  const sourceAnchors=new Map(anchorsForBeat(beat).map(z=>[z.anchor_id,z.narration_quote]));
  const cues=m.cues.map(c=>{
   assert(keys(c,X_GOLD_SCHEMA.properties.moments.items.properties.cues.items),'X cue fields invalid');
   assert(typeof c.anchor_id==='string'&&sourceAnchors.has(c.anchor_id),'X unknown anchor for B '+beat.id+': '+c.anchor_id);
   assert(typeof c.on_screen_change==='string'&&c.on_screen_change.trim().length>=6,'X missing visual change');
   const quote=sourceAnchors.get(c.anchor_id);
   assert(beat.narration.includes(quote),'Host-generated narration anchor invalid');
   return {narration_quote:quote,on_screen_change:c.on_screen_change};
  });
  normalized.push({...m,cues});
 }
 return {...x,moments:normalized};
}
