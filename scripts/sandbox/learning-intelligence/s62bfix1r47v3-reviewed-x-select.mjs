/** Reviewed t0006 selection: never use this to silently repair arbitrary X outputs.
 * The invoking recovery pins the entire real provider response hash and B hash.
 * The exact moment order/pattern below was inspected against the actual export.
 */
const refuse=(message)=>{throw Error('RECOVERY REFUSED: '+message);};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ORIGINAL_IDS=['b01','b02','b03','b04','b05','b02','b03','b04','b05'];
const KEEP=[0,1,2,3,8];
export function selectReviewedMoments(raw,b){
 if(!raw||!Array.isArray(raw.moments)||raw.moments.length!==9)refuse('Not reviewed nine-moment response');
 if(!eq(raw.moments.map(m=>m?.beat_id),ORIGINAL_IDS))refuse('Original X beat IDs/order differs from reviewed response');
 if(!b||!Array.isArray(b.beats)||!eq(b.beats.map(m=>m.id),['b01','b02','b03','b04','b05']))refuse('B beat IDs changed');
 for(const [a,d] of [[1,5],[2,6],[3,7]]){
  if(!eq(raw.moments[a],raw.moments[d]))refuse('Repeated X moments are not identical; a different review is needed');
 }
 const short=raw.moments[4]?.scene_description,long=raw.moments[8]?.scene_description;
 if(typeof short!=='string'||typeof long!=='string'||!long.startsWith(short)||short.length>=long.length||!short.endsWith("'Is ")||!long.includes('flowchart'))refuse('b05 scenes are not the reviewed truncated-prefix/full-scene pair');
 const selected=structuredClone(raw);selected.moments=KEEP.map(i=>structuredClone(raw.moments[i]));
 const report={status:'reviewed_offline_duplicate_reconciliation',expected_b_beats:5,raw_x_moments:9,selected_x_moments:5,missing_beat_ids:[],original_x_moment_ids:ORIGINAL_IDS,kept_original_indices:KEEP,removed_original_indices:[4,5,6,7],duplicate_identical_beat_ids:['b02','b03','b04'],b05_review:'Original index 4 scene description is truncated mid-phrase; retained original index 8, a complete X-authored scene and valid narration anchor.',host_authored_scenes:0,original_raw_x_preserved:true,preserved_b_narration:true,visuals_rendered:false,review_scope:'This exact model response only; conflicting duplicates in other responses require separate review.'};
 return {selected,report};
}
