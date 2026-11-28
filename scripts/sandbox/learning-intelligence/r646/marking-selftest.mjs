import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runTurn,emptyState,recordEvent} from './pipeline.mjs';
import {runRevision,markContext,C_PROMPT} from './revision.mjs';
import {fixtureCall,fixtureEmbed} from '../r62b/fixture.mjs';
import {workerFrame,legacyFrame} from './automatic.mjs';
const state=(await runTurn(emptyState('scope-test','fixture'),'Why does the switch matter?',{call:fixtureCall,embedFn:fixtureEmbed})).state;
const a=state.artifacts[state.turns[0].variants.bx],n=a.narration[0];
const mk=(scope,kind='point')=>({artifact_id:a.id,type:'feedback',cue_id:n.id,time:1,details:{reason:'I got bored',...(scope===undefined?{}:{feedback_scope:scope}),selection:{kind,artifact_id:a.id,cue_id:n.id,marked_time:1,...(kind==='region'?{points:[{x:.1,y:.1},{x:.4,y:.1},{x:.4,y:.3}],viewport:{width:960,height:540}}:{}),...(kind==='time_range'?{start:0,end:2}:{})},target_cue_ids:[n.id],note:'',scene_state_unverified:true}});
for(const [scope,kind] of [['visuals','region'],['explanation','time_range'],['both','point'],[undefined,'point']]){
 const e=recordEvent(state,mk(scope,kind));const expected=scope??'unspecified';
 assert.equal(markContext(state,e.id).e.details.feedback_scope,scope);
 const obs=state.observations.find(o=>o.id===e.id);assert.equal(obs.conditions.feedback_scope,expected);assert.equal(JSON.parse(obs.text).feedback_scope,expected);assert.equal(JSON.parse(obs.compact_index_text).feedback_scope,expected);assert.equal(obs.conditions.not_mastery,true);
 const r=await runRevision(state,e.id,{call:async p=>{assert.equal(p.role,'C');assert.equal(p.input.feedback.feedback_scope,expected);assert.equal(p.input.feedback.selection.kind,kind);assert.equal(p.input.feedback.frame_image,null);return {output:{diagnosis_hypotheses:['Uncertain'],uncertainty:'No exact image',route:'NO_CHANGE',target_cue_ids:[n.id],revision_direction:'None',runtime_speed:'none',reason:'Mock'}}}});
 assert.deepEqual(r.revision.call_roles,['C']);assert.equal(r.revision.artifact_id,null);
}
console.log('PASS explicit visual/explanation/both and historical unspecified scope preserved in C, observations and retrieval text');
assert.throws(()=>recordEvent(state,mk('invalid')),/Invalid feedback scope/);
assert(C_PROMPT.includes('not a causal diagnosis or mandatory route'));assert(C_PROMPT.includes('preserving the original narration'));
console.log('PASS invalid scope rejected; C is not forced into a route');
const next=await runTurn(state,'What changes when the switch opens?',{call:fixtureCall,embedFn:fixtureEmbed});const ai=next.calls.find(c=>c.role==='A').request.input;assert(ai.observations.some(o=>o.conditions?.feedback_scope==='both'));assert(ai.observations.some(o=>o.conditions?.feedback_scope==='explanation'));
console.log('PASS subsequent Model A receives explicit feedback scope as unscored evidence');
const worker=workerFrame(a,'a'.repeat(32)),legacy=legacyFrame(a,'b'.repeat(32));assert(worker.html.includes("send('mark_gesture'"));assert(legacy.html.includes("send('mark_gesture'"));assert(worker.csp.includes("connect-src 'none'"));assert(legacy.csp.includes("connect-src 'none'"));
const ui=fs.readFileSync(new URL('./player.js',import.meta.url),'utf8');assert(ui.includes("toggleAttribute('hidden',tool!=='region')"));assert(ui.includes("d.kind==='mark_gesture'"));assert(ui.includes("e.origin!=='null'"));
console.log('PASS double-click relays retained in isolated and reviewed scene bridges, existing origin and network restrictions retained');
console.log(JSON.stringify({marking_tests:4,paid_calls:0,database_writes:0}));
