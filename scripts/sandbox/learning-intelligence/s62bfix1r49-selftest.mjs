#!/usr/bin/env node
/** Free isolated R4.9 contract regression checks. No file writes, API or MiniLM calls. */
import assert from 'node:assert/strict';
import {normalizeBBeats} from './s62bfix1r49-b-beats.mjs';
import {reconcileXStable} from './s62bfix1r49-x-coverage.mjs';
import {emptyProbe} from './s62bfix1r46-probe-core.mjs';
import {teacherText} from './s62bfix1r43-goldloop-core.mjs';
let number=0;
function test(name,fn){fn();console.log(`PASS ${++number} ${name}`);}
const sample=(n=10)=>({teaching_mode:'explanation',teaching_intent:'Ground a learner understanding',beats:Array.from({length:n},(_,i)=>({id:`b${String(i+1).padStart(2,'0')}`,narration:`One useful explanation for point ${i+1}: imagine how a learner notices one specific pattern and tests it with an example.`,educational_purpose:'Explain specific mechanism with concrete example '+i,visual_opportunity:'A simple corresponding visual object',learner_action:''})),probe_plan:emptyProbe()});
const mom=(id,description='A carefully authored visual moment shows the relevant concept with a clear animated object')=>({beat_id:id,scene_description:description,transition_from_previous:'The prior visual object stays in view.',cues:[{anchor_id:'a00',on_screen_change:'The object responds exactly to this narrated beat'}],accuracy_boundaries:'Visuals are only proposals.',possible_interaction:'No interaction executed.'});
const sx=(ids)=>({visual_concept:'A connected illustrated learning journey',continuity_plan:'Keep a single stable world with a clear sequence.',moments:ids.map(id=>mom(id)),implementation_status:'textual_storyboard_only',limitations:'Storyboard text only; nothing rendered.'});
test('one to eight B beats remain unmodified',()=>{for(const n of [1,2,6,8]){const b=sample(n);const r=normalizeBBeats(b);assert.equal(r.output.beats.length,n);assert.equal(teacherText(r.output),b.beats.map(x=>x.narration).join('\n\n'));assert.equal(r.report.status,'no_grouping');}});
test('ten B beats grouped to eight with all words retained',()=>{const b=sample(10),r=normalizeBBeats(b);assert.equal(r.output.beats.length,8);assert.equal(teacherText(r.output),b.beats.map(x=>x.narration).join('\n\n'));assert.equal(r.report.source_beat_mapping.flatMap(g=>g.original_ids).join(','),b.beats.map(x=>x.id).join(','));});
test('sixteen short B beats grouped to eight losslessly',()=>{const b=sample(16),r=normalizeBBeats(b);assert.equal(r.output.beats.length,8);assert.equal(teacherText(r.output),b.beats.map(x=>x.narration).join('\n\n'));});
test('seventeen B beats still refuse rather than discard any',()=>assert.throws(()=>normalizeBBeats(sample(17)),/over 16/));
test('malformed nonsequential B IDs refused',()=>{const b=sample(9);b.beats[2].id='b20';assert.throws(()=>normalizeBBeats(b),/Malformed/);});
test('oversized individual B beat refused',()=>{const b=sample(10);b.beats[3].narration='a'.repeat(1200);assert.throws(()=>normalizeBBeats(b),/Malformed/);});
test('grouping refuses if no adjoining beats can fit length cap',()=>{const b=sample(10);for(const z of b.beats)z.narration='a'.repeat(800);assert.throws(()=>normalizeBBeats(b),/Cannot losslessly/);});
test('optional unoffered probe preserved',()=>{const b=sample(10),r=normalizeBBeats(b);assert.deepEqual(r.output.probe_plan,b.probe_plan);});
test('X complete ordered sequence retains authored moments',()=>{const b=normalizeBBeats(sample(3)).output,x=sx(['b01','b02','b03']);const r=reconcileXStable(x,b);assert.equal(r.output.moments.length,3);assert.equal(r.report.collapsed_exact_identical_duplicate_beat_ids.length,0);});
test('X exact duplicate collapses without altering authored content',()=>{const b=normalizeBBeats(sample(3)).output,x=sx(['b01','b02','b03']);x.moments.push(structuredClone(x.moments[1]));const r=reconcileXStable(x,b);assert.equal(r.output.moments.length,3);assert.deepEqual(r.report.collapsed_exact_identical_duplicate_beat_ids,['b02']);});
test('X conflicting duplicate refused for manual review',()=>{const b=normalizeBBeats(sample(3)).output,x=sx(['b01','b02','b03']);x.moments.push(mom('b02','A different model-authored scene described for the same narration beat'));assert.throws(()=>reconcileXStable(x,b),/Conflicting duplicate/);});
test('X small missing beat explicitly labelled host placeholder',()=>{const b=normalizeBBeats(sample(3)).output,x=sx(['b01','b03']);const r=reconcileXStable(x,b);assert.equal(r.output.moments.length,3);assert.deepEqual(r.report.missing_beat_ids,['b02']);assert.match(r.output.moments[1].scene_description,/VISUAL GAP/);});
test('X largely missing storyboard still refused',()=>{const b=normalizeBBeats(sample(8)).output,x=sx(['b01']);assert.throws(()=>reconcileXStable(x,b),/coverage gap too large/i);});
test('X unknown beat ID refused',()=>{const b=normalizeBBeats(sample(2)).output,x=sx(['b01','b99']);assert.throws(()=>reconcileXStable(x,b),/unknown/i);});
console.log(`PASS R4.9 contract checks ${number} — no provider calls and no session writes`);
