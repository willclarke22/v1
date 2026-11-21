#!/usr/bin/env node
import assert from 'node:assert/strict';
import {X_GOLD_SCHEMA,X_GOLD_PROMPT,anchorsForBeat,makeXInput,validateX,validateB} from './s62bfix1r43-goldloop-core-anchor-v1.mjs';
const b=validateB({teaching_mode:'conversation',teaching_intent:'Example demonstration',beats:[
 {id:'b01',narration:'Imagine three swimmers at the same pool. One gets tired, but the others keep floating.',educational_purpose:'Contrast',visual_opportunity:'Same swimming pool',learner_action:''},
 {id:'b02',narration:'Your cardio matters. Technique can matter too!',educational_purpose:'Contrast two causes',visual_opportunity:'Underwater view',learner_action:''},
]});
const input=makeXInput(b,{topic:{id:'t1',title:'Swimming'},learner_brief_for_B:'None',provisional_retrieved_memory:[]});
assert.equal(input.narration_anchor_catalog.length,2);
assert.equal(input.narration_anchor_catalog[0].anchors[0].narration_quote,b.beats[0].narration);
assert.ok(X_GOLD_PROMPT.includes('Never output a narration_quote'));
assert.deepEqual(Object.keys(X_GOLD_SCHEMA.properties.moments.items.properties.cues.items.properties),['anchor_id','on_screen_change']);
const raw={visual_concept:'An underwater continuous world',continuity_plan:'Same swimmers stay visible',moments:b.beats.map((beat,i)=>({beat_id:beat.id,scene_description:'Keep one camera view and animate underwater movement for this beat.',transition_from_previous:'Hold the current pool view',cues:[{anchor_id:i?'a00':'a01',on_screen_change:'Reveal supportive swimming motions'}],accuracy_boundaries:'An illustrative sequence, not a medical diagnosis',possible_interaction:''})),implementation_status:'textual_storyboard_only',limitations:'Description only'};
const result=validateX(raw,b);
assert.equal(result.moments.length,2);
assert.ok(b.beats[0].narration.includes(result.moments[0].cues[0].narration_quote));
assert.equal(result.moments[1].cues[0].narration_quote,b.beats[1].narration);
assert.ok(!('anchor_id' in result.moments[0].cues[0]));
assert.throws(()=>validateX({...raw,moments:[{...raw.moments[0],cues:[{anchor_id:'a999',on_screen_change:'Incorrect reference'}]},raw.moments[1]]},b),/unknown anchor/);
assert.throws(()=>validateX({...raw,moments:raw.moments.slice(0,1)},b),/cover every B beat/);
assert.equal(anchorsForBeat(b.beats[0])[0].anchor_id,'a00');
console.log('PASS anchor v1: deterministic B quotations, strictly bounded X IDs, no real rendering/API usage');
