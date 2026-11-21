/** Free structural smoke tests; no model calls, no local session writes. */
import assert from 'node:assert/strict';
import {stitchXPartial,checkReplacementSeams} from './s62bfix1r48-retry-helpers.mjs';
let count=0;
const test=(name,fn)=>{fn();console.log(`PASS ${++count} ${name}`);};
const beats=[{id:'b01',narration:'A clear explanation of the experiment has a useful outcome.'},{id:'b02',narration:'Try an example using a longer sentence with independent trials.'}];
const original={moments:beats.map((b,i)=>({beat_id:b.id,scene_description:'A detailed, coherent scene about example '+i+' in the learning room.',transition_from_previous:'from prior beat',cues:[{narration_quote:'example',on_screen_change:'Zoom to the board'}],accuracy_boundaries:'Only an example',possible_interaction:'Observe scene'}))};
const raw={visual_concept:'A conceptual learning room with two experiments',continuity_plan:'Camera shifts between the scenes',implementation_status:'textual_storyboard_only',limitations:'No visual rendering',moments:[{beat_id:'b01',scene_description:'The camera zooms into the richly illustrated experiment board.',transition_from_previous:'Smooth zoom',cues:[{anchor_id:'a00',on_screen_change:'Zoom into a vivid experiment board'}],accuracy_boundaries:'Conceptual illustration only',possible_interaction:'Select a detail'}]};
test('authored scene retained, missing scene reuses prior',()=>{const r=stitchXPartial(raw,beats,original);assert.equal(r.moments.length,2);assert.equal(r.report.new_x_authored_beat_ids[0],'b01');assert.equal(r.report.reused_prior_scene_beat_ids[0],'b02')});
test('missing cue is rebound to current B when needed',()=>{const prev=structuredClone(original);prev.moments[1].cues[0].narration_quote='Removed phrase';const r=stitchXPartial(raw,beats,prev);assert.equal(r.moments[1].cues[0].narration_quote,beats[1].narration)});
test('duplicate authored X moments rejected',()=>{assert.throws(()=>stitchXPartial({...raw,moments:[raw.moments[0],raw.moments[0]]},beats,original),/duplicate/)});
test('unknown authored X beat rejected',()=>{assert.throws(()=>stitchXPartial({...raw,moments:[{...raw.moments[0],beat_id:'b99'}]},beats,original),/unknown/)});
test('no authored scenes rejected',()=>{assert.throws(()=>stitchXPartial({...raw,moments:[]},beats,original),/no authored/)});
test('bad article in recombined B narration rejected',()=>{assert.throws(()=>checkReplacementSeams(null,{beats:[{id:'b01',narration:'This is an helper verb used in Spanish.'}]},[{beat_id:'b01'}]),/incorrect article/)});
test('missing word-boundary space rejected',()=>{assert.throws(()=>checkReplacementSeams(null,{beats:[{id:'b01',narration:'Is se showingIs se showing that?' }]},[{beat_id:'b01'}]),/boundary phrase/)});
test('valid simplified text accepted',()=>{assert.equal(checkReplacementSeams(null,{beats:[{id:'b01',narration:'This is an important helping verb.'}]},[{beat_id:'b01'}]),true)});
console.log(`PASS R4.8 retry structural selftests ${count} (zero API calls, zero session writes)`);
