/** Consistent, provenance-explicit structural normalization shared by normal turns and retries.
 * No model-authored words altered; no invented teacher or learner evidence. */
import {normalizeBBeats} from './s62bfix1r49-b-beats.mjs';
import {reconcileXStable} from './s62bfix1r49-x-coverage.mjs';
import {stitchXPartial} from './s62bfix1r48-retry-helpers.mjs';
export function normalizeTeachingR50(raw){return normalizeBBeats(raw);}
export function normalizeVisualR50(raw,b){return reconcileXStable(raw,b);}
export function normalizeRetryVisualR50(raw,affected,previous){
 if(!raw||!Array.isArray(raw.moments))throw Error('R50: Retry X response missing moments');
 const seen=new Map(),unique=[],collapsed=[];
 for(const m of raw.moments){
  if(!m||typeof m.beat_id!=='string')throw Error('R50: Retry X invalid beat');
  if(seen.has(m.beat_id)){
   if(JSON.stringify(seen.get(m.beat_id))!==JSON.stringify(m))throw Error('R50: Retry X conflicting duplicate '+m.beat_id+' needs manual review');
   collapsed.push(m.beat_id);
  }else{seen.set(m.beat_id,m);unique.push(m);}
 }
 const stitched=stitchXPartial({...raw,moments:unique},affected,previous);
 return {...stitched,report:{...stitched.report,collapsed_identical_duplicates:collapsed,raw_X_preserved_in_paid_trace:true,unselected_B_and_X_moments_immutable:true}};
}
