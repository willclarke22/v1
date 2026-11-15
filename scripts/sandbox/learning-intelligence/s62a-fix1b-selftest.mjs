#!/usr/bin/env node
/** No API calls, embedding calls or database interaction. */
import assert from 'node:assert/strict';
import {LEARNER_FIRST_SCHEMA,LEARNER_FIRST_PROMPT,parseLearnerFirst,toLegacyAssessment,evidenceBuckets,classifyActionConflicts} from './s62a-fix1b-core.mjs';
import {makeRequestPair,planCases,parseOpts} from './s62a-fix1b-compare.mjs';
import {parseArgs,runJourney} from './s62a-fix1b-journey.mjs';
import {scriptedMock} from './s16b59-lean-core.mjs';
const sample=(id,rootId=null)=>({
 current_understanding:{presenting_question:'Test what was actually demonstrated',demonstrated:[{claim:'Learner articulates an example',observation_ids:[id]}],task_conditions:'Prior tutor hints may be present',not_yet_demonstrated:['Independent novel transfer'],uncertainty:'medium'},
 learner_model_delta:{observations:[{kind:'progress',claim:'A possibly improved explanation',observation_ids:[id],confounds:['Recent teaching']}],underlying_cause_hypotheses:[{claim:'Possible learner-specific lexical mapping heuristic',support_ids:rootId?[]:[id],counter_ids:rootId?[id]:[],alternatives:['Possibly a one-off question'],uncertainty:'high'}],memory_actions:[{kind:'root',existing_id:rootId,action:rootId?'refine':'propose',reason:rootId?'New explanation counters old active root':'Initial provisional hypothesis',evidence_roles:[{id,role:rootId?'counter':'support'}],contexts:[],learner_pattern:'',alternatives:['Context-specific wording']}],explicit_instructions:[]},
 next_teaching:{advisory:'Respond naturally and probe only if justified',next_probe:{purpose:null,probe_type:null,separates_hypotheses:[]},request_more_context:{scope:null,why:null}}
});
const id='T-TEST-1',raw=sample(id),parsed=parseLearnerFirst(JSON.stringify(raw),[id]);
assert.deepEqual(parsed,raw);assert.equal(Object.keys(LEARNER_FIRST_SCHEMA.properties).length,3);
assert(LEARNER_FIRST_PROMPT.includes('strengths')&&LEARNER_FIRST_PROMPT.includes('historical'));
const old=toLegacyAssessment(parsed);assert.equal(old.root_actions[0].action,'propose');
assert.deepEqual(evidenceBuckets(old.root_actions[0]),{support:[id],counter:[],context:[]});
const corrected=toLegacyAssessment(sample(id,'R1'));
assert.deepEqual(evidenceBuckets(corrected.root_actions[0]),{support:[],counter:[id],context:[]});
assert.equal(classifyActionConflicts(sample(id,'R1')).length,0);
const confused=sample(id,'R1');confused.learner_model_delta.memory_actions[0].evidence_roles[0].role='support';
assert.equal(classifyActionConflicts(confused).length,1);
assert.throws(()=>parseLearnerFirst(sample('INVALID_ID'),[id]),/invalid demonstrated/);
assert.throws(()=>parseOpts(['--frozen','x','--run','--budget-usd','1']),/requires --allow-spend/);
const syntheticInput={research_only:true,role:'A',learner_message:'I can explain it but I want another example',latest_observation_id:id,topic_id:'X',context:{role:'A',observations:[{id,text:'Synthetic',topic_id:'X'}],roots:[],relationships:[]},allowed_observation_ids:[id]};
const one={case_id:'TEST-0123456-STEP1',input:syntheticInput};
const pair=makeRequestPair(one,'gpt-4.1-mini');
assert.equal(pair.baseline.messages[1].content,pair.learnerFirst.messages[1].content);
assert.notEqual(pair.baseline.response_format.json_schema.name,pair.learnerFirst.response_format.json_schema.name);
assert.equal(planCases([one],'gpt-4.1-mini').length,2);
// Dry-run plumbing through existing engine. This mode uses only scripted placeholders.
const offline=parseArgs(['--mode','offline','--learner','ELLI','--visits','1','--turns-per-visit','2','--retrieval','lexical','--explore','off','--c','off']);
const dry=await runJourney(offline);
assert.equal(dry.summary.steps,2);assert.equal(dry.cost.calls,0);assert.equal(dry.database_writes,0);
// Mock-provider test exercises the NEW schema, semantic evidence roles, model-B continuity and reducer.
const model=parseArgs(['--mode','model','--learner','ELLI','--visits','1','--turns-per-visit','2','--retrieval','lexical','--explore','off','--c','off','--allow-spend','--budget-usd','2.00']);
const seen=[];const fake=await runJourney(model,{invoke:async(role,data,request)=>{
 seen.push(role);
 let value;
 if(role==='A'){
  assert.equal(request.response_format.json_schema.name,'myway_s62afix1b_learner_first');
  const rid=data.context.roots[0]?.id??null;
  value=sample(data.latest_observation_id,rid);
 }else value=scriptedMock(role,data);
 return {raw:JSON.stringify(value),usage:{prompt_tokens:100,completion_tokens:50,prompt_tokens_details:{cached_tokens:0}},model:'FAKE_LOCAL_NO_PROVIDER_CALL'};
}});
assert.equal(fake.summary.steps,2);assert.equal(fake.summary.model_calls,5);
assert.equal(fake.learner_histories.ELLI.roots.length,1);
const root=fake.learner_histories.ELLI.roots[0];
assert.equal(root.revisions.length,2);
assert(root.support_ids.includes(fake.timeline[0].observed_evidence_id));
assert(root.counter_ids.includes(fake.timeline[1].observed_evidence_id));
assert(!root.support_ids.includes(fake.timeline[1].observed_evidence_id),'Refine must not turn correct counterevidence into root support');
assert.equal(fake.learner_histories.ELLI.learner_model_events.length,2);
assert(fake.timeline.every(x=>x.learner_first_assessment!==null));
assert(fake.cost.known_estimated_usd>0&&fake.database_writes===0);
assert(seen.includes('A')&&seen.includes('B')&&seen.includes('L'));
console.log('S62A-FIX1B SELFTEST PASS | 3-part learner-first schema, evidence polarity, matched-input planner, mocked journey, 0 real provider/embedding/DB calls');
