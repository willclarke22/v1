/** R4.9: remove only byte-identical duplicate X moments; never pick between conflicts. */
import {reconcileXCoverage} from './s62bfix1r47-x-coverage.mjs';
export function reconcileXStable(raw,b){
 const x=typeof raw==='string'?JSON.parse(raw):structuredClone(raw);
 if(!x||!Array.isArray(x.moments))throw Error('R49: Missing model X moments');
 const seen=new Map(),keep=[],dedup=[];
 for(const m of x.moments){
  if(!m||typeof m.beat_id!=='string')throw Error('R49: Malformed X beat');
  const prior=seen.get(m.beat_id);
  if(prior){if(JSON.stringify(prior)!==JSON.stringify(m))throw Error('R49: Conflicting duplicate X scenes for '+m.beat_id+'; manual review required');dedup.push(m.beat_id);}else{seen.set(m.beat_id,m);keep.push(m);}
 }
 const {output,report}=reconcileXCoverage({...x,moments:keep},b);
 return {output,report:{...report,collapsed_exact_identical_duplicate_beat_ids:dedup,duplicates_removed_without_changing_authored_scene:dedup.length>0,raw_paid_x_untouched:true}};
}
