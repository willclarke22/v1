import assert from 'node:assert/strict';
import {selectReviewedMoments} from './s62bfix1r47v3-reviewed-x-select.mjs';
const beats=['b01','b02','b03','b04','b05'].map(id=>({id}));
const mk=(id,scene)=>({beat_id:id,scene_description:scene,cues:[{anchor_id:'a00',on_screen_change:'Change the scene'}]});
const v={moments:[mk('b01','Open intro'),mk('b02','Explain reflexive se'),mk('b03','Explain haber'),mk('b04','Order blocks'),mk('b05',"In a cozy flowchart scene, labeled: 'Is "),mk('b02','Explain reflexive se'),mk('b03','Explain haber'),mk('b04','Order blocks'),mk('b05',"In a cozy flowchart scene, labeled: 'Is se reflexive? This flowchart helps you decide.'")]};
const fail=(x,msg)=>assert.throws(()=>selectReviewedMoments(x,{beats}),/RECOVERY REFUSED/,msg);
let tests=0;
const pass=msg=>{console.log('PASS '+(++tests)+' '+msg)};
const {selected,report}=selectReviewedMoments(v,{beats});
assert.deepEqual(selected.moments.map(m=>m.beat_id),beats.map(b=>b.id));assert.equal(report.raw_x_moments,9);assert.equal(report.selected_x_moments,5);assert.equal(report.host_authored_scenes,0);pass('nine moments become five original authored moments');
assert.equal(selected.moments[4].scene_description,v.moments[8].scene_description);assert.equal(v.moments.length,9);pass('complete b05 retained; raw X untouched');
{const c=structuredClone(v);c.moments[5].scene_description+=' extra';fail(c,'different repeated b02');pass('non-identical b02 refuses');}
{const c=structuredClone(v);c.moments[4].scene_description='a different scene';fail(c,'not a prefix');pass('unrelated b05 alternatives refuse');}
{const c=structuredClone(v);c.moments[8].scene_description='truncated';fail(c,'missing full scene');pass('second b05 must complete first');}
{const c=structuredClone(v);c.moments[7].beat_id='b05';fail(c,'bad order');pass('unexpected X moment order refuses');}
{const c=structuredClone(v);c.moments.pop();fail(c,'missing moment');pass('fewer moments refuse');}
{const c=structuredClone(v);c.moments.push(mk('b02','another'));fail(c,'extra moment');pass('extra moments refuse');}
{const c=structuredClone(v);const bad={beats:beats.slice(0,-1)};assert.throws(()=>selectReviewedMoments(c,bad),/RECOVERY REFUSED/);pass('changed B beat layout refuses');}
console.log('PASS R4.7v3 reviewed selection selftests '+tests+' (synthetic, no API calls or session writes)');
