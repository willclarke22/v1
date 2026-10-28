#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import vm from 'node:vm';
const root=path.resolve(process.argv[2]||process.cwd()), at=r=>path.join(root,...r.split('/'));
const ts=createRequire(path.join(root,'package.json'))('typescript');
const src=r=>fs.readFileSync(at(r),'utf8');
const files=['app/api/sandbox/probe-lab/learning-space/retrieve/route.ts','sandbox/probe-lab/learning-space/learning-turn.client.ts',
 'sandbox/probe-lab/local-assessment/learning-plan.ts','sandbox/probe-lab/learning-space/assessment-core.ts','sandbox/probe-lab/learning-space/topic-memory-preview.ts',
 'sandbox/probe-lab/learning-space/topic-memory-commit.server.ts','sandbox/probe-lab/learning-space/workbench.tsx'];
for(const file of files){const result=ts.transpileModule(src(file),{fileName:file,reportDiagnostics:true,
 compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
 assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,`TS syntax ${file}`);}
const mod={exports:{}};
const compiled=ts.transpileModule(src('sandbox/probe-lab/learning-space/topic-memory-preview.ts'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(compiled,{module:mod,exports:mod.exports});
const compare=mod.exports.compareTopicMemory;
const rootEvidence='Learner is unsure how arm and leg coordination influences water endurance.';
const props={retrievalStatus:'semantic_pgvector',matches:[],rows:[],topicName:'Treading Water',
 rootProblem:rootEvidence,evidenceQuote:'I struggle with treading water',originalMessage:'I struggle with treading water even though I can run.',
 currentMessage:'Could technique matter?',rootConfidence:0.90};
const row=(id,label,problem=null)=>({topic_id:id,topic_label:label,diagnosis:null,topic_json:problem?{root_problem:problem}:{}});
const legacy=compare({...props,rows:[row('a','Treading Water')],matches:[{topicId:'a',topicLabel:'Treading Water',similarity:0.89}]});
assert.equal(legacy.action,'associate_existing');assert.equal(legacy.reasonCode,'strong_topic_level_match');
assert.equal(legacy.candidates[0].comparison,'label_only');assert.equal(legacy.candidates[0].rootProblemOverlap,null);
assert.equal(compare({...props,rootConfidence:0.6,rows:[row('a','Treading Water')],matches:[{topicId:'a',topicLabel:'Treading Water',similarity:0.9}]}).action,'hold');
assert.equal(compare({...props,retrievalStatus:'lexical_fallback',rows:[row('a','Treading Water')],matches:[{topicId:'a',topicLabel:'Treading Water',similarity:0}]}).action,'hold');
assert.equal(compare({...props,retrievalStatus:'unavailable'}).action,'hold');
const novel=compare({...props,rows:[row('b','Arm Wrestling')],matches:[{topicId:'b',topicLabel:'Arm Wrestling',similarity:0.34}]});
assert.equal(novel.action,'propose_new');assert.equal(novel.reasonCode,'no_close_semantic_candidate');
assert.equal(compare({...props,rootConfidence:0.9}).action,'propose_new');
const weak=compare({...props,rows:[row('b','Arm Wrestling')],matches:[{topicId:'b',topicLabel:'Arm Wrestling',similarity:0.7}]});
assert.equal(weak.action,'hold');
assert.equal(compare({...props,evidenceQuote:'This was not said'}).action,'hold');
assert.ok(compare({...props,rootConfidence:0.60}).reasonCode==='insufficient_assessment');
const q=src('sandbox/probe-lab/learning-space/learning-turn.client.ts');
assert.match(q,/searchText:buildContextualTopicQuery/);assert.match(q,/originalMessage===message\?"":message/);
assert.match(q,/trace\.reply=learnerFacingTeachingReply\(result\.plan\.teaching_strategy\)/);
assert.doesNotMatch(q,/trace\.reply=\[result\.plan\.learner_reflection/);
const route=src('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts');
assert.match(route,/querySemanticTopicCandidatesWithEmbedding\(embeddingQuery,5\)/);
assert.match(route,/currentMessage:x\.message as string/);
assert.match(route,/commit_topic_memory/);assert.match(route,/I_APPROVE_ONE_TOPIC_MEMORY_WRITE/);assert.match(route,/origin!==ownOrigin/);
assert.match(src('sandbox/probe-lab/learning-space/topic-memory-commit.server.ts'),/strong_topic_level_match/);
const tp=src('sandbox/probe-lab/local-assessment/learning-plan.ts');
assert.match(tp,/ONLY learner-facing reply/);assert.match(tp,/INTERNAL ONLY/);
assert.match(src('sandbox/probe-lab/learning-space/assessment-core.ts'),/Treading Water Endurance/);
assert.match(src('sandbox/probe-lab/learning-space/workbench.tsx'),/Assessed topic label/);
assert.match(src('sandbox/probe-lab/learning-space/workbench.tsx'),/calculateTurnCost/);
console.log('V3.7D.2A.1 CONTRACT PASS: legacy topic association, hold safety, novel topic proposal, verified evidence, contextual query, direct reply, approval and cost preserved.');
