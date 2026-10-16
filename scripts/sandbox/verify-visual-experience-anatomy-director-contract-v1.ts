import { strict as assert } from "node:assert";
import { parseAnatomyDirectorProgram, sampleKeyframes, lerpNumber } from "../../sandbox/probe-lab/visual-experience/anatomy-director/contract";

const valid = {
  schema_version: "myway_anatomy_director_v1", duration_s: 10,
  camera_keyframes: [
    {t:0, position:[0,0.2,2.8], target:[0,0,0]},
    {t:10, position:[2.8,0.5,1.3], target:[0,0,0]},
  ],
  object_keyframes: [
    {t:0, position:[0,0,0], rotation_deg:[0,0,0], scale:1, opacity:1},
    {t:10, position:[0,0,0], rotation_deg:[0,45,0], scale:1, opacity:1},
  ],
};
const parsed=parseAnatomyDirectorProgram(JSON.stringify(valid));
assert.equal(parsed.duration_s,10);
assert.equal(parseAnatomyDirectorProgram('```json\n'+JSON.stringify(valid)+'\n```').duration_s,10);
assert.throws(()=>parseAnatomyDirectorProgram(JSON.stringify({...valid,duration_s:50})),/duration_s/);
assert.throws(()=>parseAnatomyDirectorProgram(JSON.stringify({...valid,object_keyframes:[valid.object_keyframes[0],{...valid.object_keyframes[1],scale:100}]})),/bounded/);
assert.throws(()=>parseAnatomyDirectorProgram(JSON.stringify({...valid,camera_keyframes:[valid.camera_keyframes[0],valid.camera_keyframes[0]]})),/strictly increasing/);
assert.throws(()=>parseAnatomyDirectorProgram('not-json'),/not a single valid JSON/);
const s=sampleKeyframes([{t:0,v:0},{t:10,v:100}],5,(a,b,f)=>({t:5,v:lerpNumber(a.v,b.v,f)}));
assert.equal(s.v,50);
console.log("PASS: anatomy timeline parser, bounded invalidation, fenced JSON, interpolation.");
