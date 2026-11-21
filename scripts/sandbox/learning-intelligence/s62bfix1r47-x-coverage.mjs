/** R4.7 X coverage reconciliation: preserve all X-authored moments, fill ONLY a small
 * number of missing B beats with conspicuous, host-authored hold-scene placeholders.
 * Never attribute a host placeholder to Model X or claim visual rendering.
 * Original paid Model X raw output remains in the call trace.
 */
import {validateX} from './s62bfix1r43-goldloop-core-anchor-v1.mjs';
const fail=s=>{throw Error('GOLDLOOP: '+s);};
function fallbackMoment(beat,isFirst){return {
 beat_id:beat.id,
 scene_description:isFirst
  ? 'VISUAL GAP — Model X supplied no scene for this narration beat. Show a neutral empty storyboard panel while Model B’s original narration continues.'
  : 'VISUAL GAP — Model X supplied no new scene for this narration beat. Hold the preceding scene unchanged while Model B’s original narration continues.',
 transition_from_previous:'Host-only fallback; not a Model X storyboard direction.',
 cues:[{anchor_id:'a00',on_screen_change:'Host fallback: hold the existing visual or display a neutral placeholder; X supplied no cue.'}],
 accuracy_boundaries:'No substantive visual claim generated. This is a deterministic host placeholder and is not evidence of model X quality.',
 possible_interaction:'None; Model X did not propose a visual interaction for this beat.',
};}
export function reconcileXCoverage(raw,b){
 const x=typeof raw==='string'?JSON.parse(raw):structuredClone(raw);
 if(!b||!Array.isArray(b.beats)||!b.beats.length)fail('Missing validated B narration');
 if(!x||!Array.isArray(x.moments))fail('X output has no moments array');
 const expected=b.beats.map(z=>z.id),allowed=new Set(expected),provided=new Map();
 for(const m of x.moments){
  if(!m||typeof m.beat_id!=='string'||!allowed.has(m.beat_id))fail('X returned an unknown or malformed beat ID');
  if(provided.has(m.beat_id))fail('X returned duplicate beat '+m.beat_id);
  provided.set(m.beat_id,m);
 }
 const missing=expected.filter(id=>!provided.has(id));
 // Never pass off a mostly absent storyboard as a complete visual experience.
 if(missing.length>Math.max(2,Math.ceil(expected.length/3))||!provided.size)fail('X coverage gap too large for deterministic placeholder; manual review required');
 const repaired=structuredClone(x);repaired.moments=b.beats.map((beat,i)=>provided.get(beat.id)??fallbackMoment(beat,i===0));
 // Original strict validator still validates every X-authored cue/anchor/scene.
 const output=validateX(repaired,b);
 const originalOrder=x.moments.map(m=>m.beat_id);
 const reordered=!missing.length&&originalOrder.some((id,i)=>id!==expected[i]);
 const report={status:missing.length?'partial_with_host_visual_gap_placeholders':reordered?'reordered_by_exact_beat_id':'complete',
  authored_x_moments:provided.size,expected_b_beats:expected.length,missing_beat_ids:missing,
  repaired_only_missing_beat_ids:missing,original_x_moment_ids:originalOrder,
  placeholder_source:'host_generated_not_model_x',preserved_b_narration:true,
  raw_x_response_preserved_in_paid_trace:true,visuals_rendered:false};
 return {output,report};
}
