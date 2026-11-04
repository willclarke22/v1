#!/usr/bin/env node
/** Offline behavioral contracts — no database, remote inference, writes or secrets. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]||process.cwd());
const at=p=>path.join(root,...p.split('/'));
const read=p=>fs.readFileSync(at(p),'utf8');
const require=createRequire(import.meta.url);
const ts=require(at('node_modules/typescript/lib/typescript.js'));
function load(rel){
  const code=ts.transpileModule(read(rel),{
    fileName:rel,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  });
  assert.equal((code.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,`TS parse: ${rel}`);
  const mod={exports:{}};
  const stub=id=>{
    if(id==='@/sandbox/probe-lab/local-assessment/parse-model-json')return {parseModelJson:JSON.parse};
    if(id.startsWith('@/') || id.startsWith('./'))return {};
    // This release deliberately retains compatible pure-module imports for the 6D test.
    throw Error(`Unexpected runtime import ${id} from ${rel}`);
  };
  new Function('require','module','exports',code.outputText)(stub,mod,mod.exports);
  return mod.exports;
}
const preview=load('sandbox/probe-lab/learning-space/topic-memory-preview.ts');
const assessment=load('sandbox/probe-lab/learning-space/assessment-core.ts');
const client=load('sandbox/probe-lab/learning-space/learning-turn.client.ts');
const {compareTopicMemory}=preview;
const goodRoot='Learner does not understand how the valve closes during swallowing';
const sentence='I do not understand how the valve closes during swallowing';
const uid='af77627d-44a5-4398-9536-a9d217871291';
const base={retrievalStatus:'semantic_pgvector',matches:[{topicId:'a',topicLabel:'Swallowing and Valves',similarity:0.62}],
 topicName:'Swallowing and Valves',rootProblem:goodRoot,evidenceQuote:sentence,
 originalMessage:sentence,currentMessage:sentence,rootConfidence:0.79,confusion:6,insight:1};
const row=json=>({topic_id:'a',topic_label:'Swallowing and Valves',topic_json:json,diagnosis:'representation_gap'});
const ev=(origin,event_id=uid)=>({origin,event_id,root_problem:goodRoot});
function candidates(json){return compareTopicMemory({...base,rows:[row(json)]}).candidates[0];}
assert.deepEqual(candidates({myway_learning_evidence:[ev('unapproved_import')]}).storedRootProblems,[]);
assert.deepEqual(candidates({myway_learning_evidence:[ev('v37d2a_explicit_user_approval')]}).storedRootProblems,[]);
assert.deepEqual(candidates({myway_learning_evidence:[ev('v37d2c_validated_assessment','bad-id')]}).storedRootProblems,[]);
assert.deepEqual(candidates({myway_learning_evidence:[ev('v37d2c_validated_assessment')]}).storedRootProblems,[goodRoot]);
assert.deepEqual(candidates({myway_memory_origin:'v37d2a_explicit_user_approval',myway_learning_evidence:[ev('v37d2a_explicit_user_approval')]}).storedRootProblems,[goodRoot]);
assert.deepEqual(candidates({myway_learning_evidence:[ev('v37d2c_validated_assessment'),ev('v37d2c_validated_assessment')]}).storedRootProblems,[goodRoot]);
assert.deepEqual(candidates({root_problem:goodRoot,myway_learning_evidence:[ev('unapproved_import')]}).storedRootProblems,[goodRoot],
 'Pre-existing legacy summaries must remain intact');
const earlier='I understand that atoms are mostly empty space, but cannot understand why electron energies are discrete';
const newer='I do not understand why electrons cannot have intermediate energies';
const query=client.buildContextualTopicQuery('Atomic Energy Levels',
 'Learner does not understand why electron energy levels are quantized',earlier,newer);
assert.ok(query.includes('Atomic Energy Levels')&&query.includes('quantized'));
assert.ok(!query.includes('mostly empty space')&&!query.includes('I understand')&&!query.includes('intermediate energies'),
 'Search query must not indiscriminately embed learner statement or clarification');
assert.ok(client.buildContextualTopicQuery('Atomic Energy Levels','',earlier,newer).includes('intermediate energies'),
 'The no-root diagnostic fallback must remain usable');
assert.ok(assessment.ASSESSMENT_SYSTEM_PROMPT.includes('ONLY the unresolved gap'));
assert.ok(assessment.ASSESSMENT_SYSTEM_PROMPT.includes('exact learner words'));
const raw={topic_name:'Atomic Energy Levels',evidence_quote:'why electron energies are discrete',
 root_problem:'Learner cannot explain discrete electron energy levels',confusion:6,insight:1,next_action:'proceed',
 clarifying_question:'',root_problem_confidence:0.8};
const valid=assessment.validateAssessment(JSON.stringify(raw),earlier);
assert.equal(valid.assessment?.root_problem,raw.root_problem);
const invalid=assessment.validateAssessment(JSON.stringify({...raw,evidence_quote:'words the learner did not say'}),earlier);
assert.equal(invalid.assessment?.root_problem,'');
assert.equal(invalid.assessment?.next_action,'clarify');
assert.equal(assessment.resolveAssessmentRoute(valid.assessment,null),'proceed');
const compare=read('sandbox/probe-lab/learning-space/root-problem-compare.server.ts');
for(const token of ['v37d2c_validated_assessment','v37d2a_explicit_user_approval','myway_memory_origin','validId','slice(-4)'])
 assert.ok(compare.includes(token),`Semantic comparison lost provenance/budget guard: ${token}`);
for(const token of ['v37d2c_validated_assessment','v37d2a_explicit_user_approval','myway_memory_origin','validId'])
 assert.ok(read('sandbox/probe-lab/learning-space/topic-memory-preview.ts').includes(token));
const route=read('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts');
for(const token of ['localhost:3001','consumeApproval','commitTopicMemory','x-myway-approval','querySemanticTopicCandidatesWithEmbedding','caller_supplied_search_text'])
 assert.ok(route.includes(token),`Existing guarded route changed: ${token}`);
const pointer=JSON.parse(read('scripts/sandbox/current-local-release.json'));
assert.equal(pointer.release,'v37d2c7a1');
console.log('V3.7D.2C.7A.1 TEST PASS: 14 synthetic behavioral/security assertions, correct query focus, approved provenance, existing gate retained.');
