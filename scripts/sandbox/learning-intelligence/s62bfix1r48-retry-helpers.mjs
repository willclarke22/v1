/** R4.8 retry validators. Offline structural checks only; do not imply semantic accuracy. */
import {validateX} from './s62bfix1r43-goldloop-core-anchor-v1.mjs';
export function checkReplacementSeams(original,updated,spans){
 for(const beat of updated.beats){
  const selected=spans.filter(s=>s.beat_id===beat.id);if(!selected.length)continue;
  const t=beat.narration;
  if(/\ban\s+(?:helper|helping|simple|basic|clear|useful)\s+verb\b/i.test(t))throw Error('R48: B retry created an incorrect article near a selected span; invalid response archived for review');
  if(/(?:showingIs|showingis|saidNow|thatWhen)/.test(t))throw Error('R48: B retry duplicated a boundary phrase; invalid response archived for review');
  if(/([?!.,:;])(?:[A-Z][a-z])/.test(t))throw Error('R48: B retry created a sentence boundary without whitespace; invalid response archived for review');
 }
 return true;
}
export function stitchXPartial(raw,affectedBeats,previousX){
 if(!raw||!Array.isArray(raw.moments)||!Array.isArray(affectedBeats)||affectedBeats.length===0)throw Error('R48: X retry malformed');
 const expected=new Map(affectedBeats.map(b=>[b.id,b]));
 const present=new Map();
 for(const m of raw.moments){
  if(!m||!expected.has(m.beat_id))throw Error('R48: X retry has unknown beat');
  if(present.has(m.beat_id))throw Error('R48: X retry has duplicate beat '+m.beat_id);
  present.set(m.beat_id,m);
 }
 if(!present.size)throw Error('R48: X retry returned no authored moments');
 const ordered=affectedBeats.filter(b=>present.has(b.id));
 const normalized=validateX({...raw,moments:ordered.map(b=>present.get(b.id))},{beats:ordered});
 const normById=new Map(normalized.moments.map(m=>[m.beat_id,m]));
 const hold=[];
 const moments=affectedBeats.map(beat=>{
  if(normById.has(beat.id))return normById.get(beat.id);
  const prev=previousX.moments.find(m=>m.beat_id===beat.id);
  if(!prev||typeof prev.scene_description!=='string'||prev.scene_description.length<20)throw Error('R48: No credible previous scene for omitted beat '+beat.id);
  const copy=structuredClone(prev);
  copy.cues=copy.cues.map(c=>({...c,narration_quote:beat.narration.includes(c.narration_quote)?c.narration_quote:beat.narration}));
  hold.push(beat.id);
  return copy;
 });
 for(const m of moments){const beat=expected.get(m.beat_id);if(!m.cues?.every(c=>beat.narration.includes(c.narration_quote)))throw Error('R48: Composite X cue mismatches B '+m.beat_id);}
 return {moments,report:{expected_affected_beat_ids:affectedBeats.map(b=>b.id),new_x_authored_beat_ids:[...normById.keys()],reused_prior_scene_beat_ids:hold,prior_scenes_reused_without_new_visual_generation:true,host_reanchored_cues:hold.filter(id=>{const orig=previousX.moments.find(m=>m.beat_id===id);const next=moments.find(m=>m.beat_id===id);return JSON.stringify(orig.cues)!==JSON.stringify(next.cues)}),note:'X authored only the listed new scene moments. Omitted moments reuse previous X-authored scenes, which may not visually reflect the revised wording. This is not a complete X redesign; user review recommended.'}};
}
