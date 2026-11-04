#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]||process.cwd());
const at=p=>path.join(root,...p.split('/'));
const read=p=>fs.readFileSync(at(p),'utf8');
const require=createRequire(import.meta.url);
const ts=require(at('node_modules/typescript/lib/typescript.js'));
const modules=new Map();
function load(p){
 if(modules.has(p))return modules.get(p);
 const transpiled=ts.transpileModule(read(p),{fileName:p,reportDiagnostics:true,
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
 assert.equal((transpiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,'TS syntax '+p);
 const module={exports:{}};modules.set(p,module.exports);
 const stub=id=>{
  if(id==='server-only')return {};
  if(id==='./difficulty-identity')return load('sandbox/probe-lab/learning-space/difficulty-identity.ts');
  if(id==='./verifier-association-policy')return load('sandbox/probe-lab/learning-space/verifier-association-policy.ts');
  if(id==='node:crypto')return require(id);
  if(id.startsWith('@/')||id.startsWith('./'))return {};
  throw Error('Unexpected dynamic dependency: '+id);
 };
 new Function('require','module','exports',transpiled.outputText)(stub,module,module.exports);
 modules.set(p,module.exports);return module.exports;
}
const rootDir='sandbox/probe-lab/learning-space/';
const identity=load(rootDir+'difficulty-identity.ts');
const memory=load(rootDir+'topic-memory-preview.ts');
const approved=(id,root,more={})=>({event_id:id,root_problem:root,origin:'v37d2c_validated_assessment',...more});
const ids=['a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002'];
const prior='Learner struggles to understand why plants need sunlight to produce chemical energy.';
const old={myway_learning_evidence:[approved(ids[0],prior)]};
const empty=identity.classifyDifficulty({},prior);
assert.equal(empty.relation,'new_difficulty');
assert.equal(empty.difficultyId,null);
assert.equal(identity.eligibleDifficultyEvents({myway_learning_evidence:[approved(ids[0],prior,{origin:'unapproved_import'})]}).length,0);
assert.equal(identity.classifyDifficulty(old,'learner struggles to understand WHY plants need sunlight to produce chemical energy!').relation,'repeated_difficulty');
assert.equal(identity.classifyDifficulty(old,prior).difficultyId,ids[0]);
assert.equal(identity.classifyDifficulty({myway_learning_evidence:[approved(ids[1],prior,{difficulty_id:ids[0]})]},prior).difficultyId,ids[0]);
assert.equal(identity.classifyDifficulty(old,'The learner has no mental model for oxygen transport inside mammalian capillaries.').relation,'new_difficulty');
const near=identity.classifyDifficulty(old,'Learner struggles to understand why plants need sunlight to produce usable chemical energy.');
assert.equal(near.relation,'possible_refinement');
assert.equal(near.difficultyId,null,'Refinement must not merge without reviewed evidence');
assert.equal(near.relatedEventId,ids[0]);
const baseArgs={retrievalStatus:'semantic_pgvector',rows:[{topic_id:'p',topic_label:'Photosynthesis',diagnosis:'representation_gap',topic_json:{}}],
 topicName:'photosynthesis energy capture',rootProblem:'Learner cannot explain how sunlight powers photosynthesis',
 evidenceQuote:'how plants turn sunlight into energy',originalMessage:'I do not understand how plants turn sunlight into energy',currentMessage:'how plants turn sunlight into energy',rootConfidence:0.7};
const matched=memory.compareTopicMemory({...baseArgs,matches:[{topicId:'p',topicLabel:'Photosynthesis',similarity:0.694}]});
assert.equal(matched.action,'associate_existing');
assert.equal(matched.reasonCode,'reviewed_topic_new_difficulty');
assert.equal(matched.autoEligible,false);
assert.equal(matched.targetTopicId,'p');
const entangle=memory.compareTopicMemory({...baseArgs,rows:[{topic_id:'e',topic_label:'Entanglement',topic_json:{}}],topicName:'quantum entanglement correlations',
 matches:[{topicId:'e',topicLabel:'Entanglement',similarity:0.637}],rootConfidence:0.9});
assert.equal(entangle.reasonCode,'reviewed_topic_new_difficulty');
const noLabel=memory.compareTopicMemory({...baseArgs,topicName:'Electron Energy Levels',rootConfidence:0.9,
 matches:[{topicId:'p',topicLabel:'Photosynthesis',similarity:0.694}]});
assert.notEqual(noLabel.reasonCode,'reviewed_topic_new_difficulty','Rooted new subject must not route to unrelated topic');
const weak=memory.compareTopicMemory({...baseArgs,matches:[{topicId:'p',topicLabel:'Photosynthesis',similarity:0.599}]});
assert.notEqual(weak.reasonCode,'reviewed_topic_new_difficulty');
const ambiguous=memory.compareTopicMemory({...baseArgs,rows:[...baseArgs.rows,{topic_id:'p2',topic_label:'Photosynthesis',topic_json:{}}],
 matches:[{topicId:'p',topicLabel:'Photosynthesis',similarity:0.694},{topicId:'p2',topicLabel:'Photosynthesis',similarity:0.65}]});
assert.equal(ambiguous.action,'hold','Ambiguous exact-label matches must not authorize a write');
const newApprovals=load(rootDir+'topic-memory-approval.server.ts');
const evidence={preview:matched,topicName:baseArgs.topicName,rootProblem:baseArgs.rootProblem,evidenceQuote:baseArgs.evidenceQuote,
 originalMessage:baseArgs.originalMessage,currentMessage:baseArgs.currentMessage,snapshotDigest:'test',rootConfidence:0.7,confusion:6,insight:2};
const token=newApprovals.issueApproval(evidence);assert.match(token,/^[a-f0-9]{64}$/);
assert.equal(newApprovals.consumeApproval(token)?.preview.reasonCode,'reviewed_topic_new_difficulty');
assert.equal(newApprovals.consumeApproval(token),null);
const choice=read(rootDir+'learning-space-preview.tsx');
assert.ok(choice.includes('useState<ModelChoice>("openai:gpt-4.1-mini")'));
assert.ok(choice.includes('myway-learning-model-choices-v37d2c7a3'));
assert.ok(choice.includes('sessionStorage.setItem("myway-learning-model-choices-v37d2c7a3"'));
assert.ok(choice.includes('modelPreferencesReady'));
const route=read('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts');
const commit=read(rootDir+'topic-memory-commit.server.ts');
assert.ok(route.includes('classifyDifficulty(target.topic_json,x.rootProblem as string)'));
assert.ok(route.includes('issueApproval({preview:topicMemory'));
assert.ok(route.includes('p.preview.reasonCode!=="semantic_root_problem_match"'));
assert.ok(commit.includes('"reviewed_topic_new_difficulty"'));
assert.ok(commit.includes('myway_learning_evidence:events'));
assert.ok(commit.includes('difficulty_id:difficultyId'));
assert.ok(commit.includes('difficulty_identity_schema:"myway-difficulty-observation-v1"'));
assert.ok(commit.includes('memoryDigest(rows)!==p.snapshotDigest'));
assert.ok(!commit.includes('new topic history backfill'));
assert.ok(read(rootDir+'workbench.tsx').includes('Difficulty continuity (provisional)'));
assert.equal(JSON.parse(read('scripts/sandbox/current-local-release.json')).release,'v37d2c7a3');
console.log('V3.7D.2C.7A.3 TEST PASS: 20+ synthetic event identity, no-history manual routing, review-token, default/persistence and non-write assertions.');
