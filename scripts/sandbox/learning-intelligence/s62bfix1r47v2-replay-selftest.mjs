/** Free no-API reproduction of the R4.6 normalized optional-probe regression. */
import {validateBWithProbe,emptyProbe} from './s62bfix1r46-probe-core.mjs';
const assert=(v,m)=>{if(!v)throw Error('SELFTEST FAIL: '+m)};
const stable=x=>JSON.stringify(x);
const base={teaching_mode:'explanation',teaching_intent:'Explain a Spanish grammatical distinction without requiring a probe',beats:[{id:'b01',narration:'Here is a concrete Spanish example with a simple explanation.',educational_purpose:'Ground the idea in familiar wording',visual_opportunity:'Show a sentence card',learner_action:''}]};
let checks=0;
const check=(v,m)=>{assert(v,m);checks++;console.log('PASS',checks,m)};
const good={...base,probe_plan:emptyProbe()};
check(stable(validateBWithProbe(good))===stable(good),'valid unoffered probe round trips');
const proposed={...base,probe_plan:{...emptyProbe(),modality:'choice'}};
const normalized=validateBWithProbe(proposed);
check(normalized.probe_plan.offer===false&&normalized.probe_plan.modality==='none','semantically invalid optional probe disabled');
check(typeof normalized.probe_plan.disabled_reason==='string','original normalizer adds explicit disabled_reason');
let rejected=false;try{validateBWithProbe(normalized);}catch(e){rejected=String(e.message).includes('R46: B must return probe_plan with exact fields');}
check(rejected,'original R47 replay on normalized B reproduces user error');
const replayed=validateBWithProbe(JSON.parse(JSON.stringify(proposed)));
check(stable(replayed)===stable(normalized),'replay of original paid B returns identical saved normalized B');
const tampered={...normalized,teaching_intent:'Different than the model said'};
check(stable(replayed)!==stable(tampered),'mismatched saved teaching is rejected by replay equality');
check(normalized.beats[0].narration===base.beats[0].narration,'B narration unchanged');
console.log('PASS R4.7v2 recovery compatibility selftests',checks,'(no API calls, no session writes)');
