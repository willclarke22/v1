#!/usr/bin/env node
/** Synthetic regression tests. No network, SQL, learner records or runtime writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
  throw Error('Unexpected dynamic dependency '+id);
 };
 new Function('require','module','exports',transpiled.outputText)(stub,module,module.exports);
 modules.set(p,module.exports);return module.exports;
}
const d='sandbox/probe-lab/learning-space/';
const identity=load(d+'difficulty-identity.ts');
const id1='be9b9f6a-9c0d-4408-97c8-9ee63a53cbe2';
const id2='a0000000-0000-4000-8000-000000000002';
const id3='a0000000-0000-4000-8000-000000000003';
const oldRoot='Uncertainty about the mechanism by which plants store energy from sunlight during photosynthesis';
const newRoot='Unclear how light energy absorbed by plants is transformed and stored as chemical energy during photosynthesis';
const event=(id,root,other={})=>({event_id:id,root_problem:root,origin:'v37d2c_validated_assessment',...other});
const old={myway_learning_evidence:[event(id1,oldRoot)]};
const context=(scores=[{topicId:'photos',eventId:id1,similarity:0.812}],other={})=>({
 approvedEventScores:scores,competingTopicSimilarity:-1,retrievalStatus:'semantic_pgvector',
 topicSimilarity:0.697,topicLabelFit:1,rootConfidence:0.8,...other});
assert.equal(identity.eligibleDifficultyEvents(old).length,1);
assert.equal(identity.classifyDifficulty({},newRoot,context()).relation,'new_difficulty');
assert.equal(identity.classifyDifficulty(old,oldRoot).relation,'repeated_difficulty');
assert.equal(identity.classifyDifficulty(old,oldRoot).difficultyId,id1);
const repeat=identity.classifyDifficulty(old,newRoot,context());
assert.equal(repeat.relation,'repeated_difficulty');
assert.equal(repeat.difficultyId,id1);
assert.equal(repeat.relatedEventId,id1);
assert.equal(repeat.matchMethod,'semantic_approved_event');
assert.equal(identity.resolveReviewedIdentity(old,newRoot,repeat,'reuse_existing').difficultyId,id1);
assert.deepEqual(identity.resolveReviewedIdentity(old,newRoot,repeat,'new_distinct'),
 {relation:'new_difficulty',difficultyId:null,relatedEventId:id1});
assert.equal(identity.resolveReviewedIdentity(old,newRoot,repeat,'forged'),null);
assert.equal(identity.resolveReviewedIdentity({},newRoot,repeat,'reuse_existing'),null);
assert.equal(identity.resolveReviewedIdentity(old,newRoot,{...repeat,difficultyId:id3},'reuse_existing'),null);
assert.equal(identity.resolveReviewedIdentity(old,newRoot,{...repeat,relatedEventId:id3},'reuse_existing'),null);
assert.equal(identity.classifyDifficulty(old,newRoot,context([],{})).relation,'new_difficulty');
assert.equal(identity.classifyDifficulty(old,newRoot,context([{topicId:'photos',eventId:id3,similarity:0.99}])).relation,'new_difficulty');
assert.equal(identity.classifyDifficulty({myway_learning_evidence:[event(id1,oldRoot,{origin:'unapproved_import'})]},newRoot,context()).relation,'new_difficulty');
assert.equal(identity.classifyDifficulty(old,newRoot,context(undefined,{rootConfidence:0.6})).relation,'uncertain');
assert.equal(identity.classifyDifficulty(old,newRoot,context(undefined,{topicSimilarity:0.1})).relation,'uncertain');
assert.equal(identity.classifyDifficulty(old,newRoot,context(undefined,{competingTopicSimilarity:0.79})).relation,'uncertain');
const two={myway_learning_evidence:[event(id1,oldRoot),event(id2,'How light energy is transformed into chemical bonds in photosynthesis')]};
const ambiguity=identity.classifyDifficulty(two,newRoot,context([{topicId:'photos',eventId:id1,similarity:0.85},{topicId:'photos',eventId:id2,similarity:0.84}]));
assert.equal(ambiguity.relation,'uncertain');
assert.equal(identity.resolveReviewedIdentity(two,newRoot,ambiguity,'reuse_existing'),null);
assert.equal(identity.resolveReviewedIdentity(two,newRoot,ambiguity,'new_distinct'),null);
const possible=identity.classifyDifficulty(old,newRoot,context([{topicId:'photos',eventId:id1,similarity:0.765}]));
assert.equal(possible.relation,'possible_refinement');
assert.equal(identity.resolveReviewedIdentity(old,newRoot,possible,'new_distinct'),null);
const distinct='The learner cannot explain how chlorophyll absorbs different wavelengths of visible light';
assert.equal(identity.classifyDifficulty(old,distinct,context([{topicId:'photos',eventId:id1,similarity:0.42}])).relation,'new_difficulty');
assert.equal(identity.resolveReviewedIdentity(old,distinct,identity.classifyDifficulty(old,distinct,context([])),'new_distinct').difficultyId,null);
const exact=identity.classifyDifficulty({myway_learning_evidence:[event(id2,oldRoot,{difficulty_id:id1}),event(id1,'Learner cannot explain energy storage through photosynthesis')]},oldRoot);
assert.equal(exact.difficultyId,id1);
const conflict={myway_learning_evidence:[event(id1,oldRoot),event(id2,oldRoot)]};
assert.equal(identity.classifyDifficulty(conflict,oldRoot).relation,'uncertain');
const first=identity.classifyDifficulty({myway_learning_evidence:[]},oldRoot);
assert.equal(first.relation,'new_difficulty');
assert.equal(first.difficultyId,null);
const approvals=load(d+'topic-memory-approval.server.ts');
const preview={schema:'myway-v37d1-memory-preview-v1',mode:'read_only',action:'associate_existing',retrievalStatus:'semantic_pgvector',
 targetTopicId:'photos',reasonCode:'semantic_root_problem_match',candidates:[],difficultyContinuity:repeat};
const data={preview,topicName:'Photosynthesis',rootProblem:newRoot,evidenceQuote:'energy',originalMessage:'energy',currentMessage:'energy',snapshotDigest:'test',rootConfidence:0.8,confusion:6,insight:2};
const token=approvals.issueApproval(data);
assert.match(token,/^[a-f0-9]{64}$/);
assert.equal(approvals.consumeApproval(token).preview.difficultyContinuity.difficultyId,id1);
assert.equal(approvals.consumeApproval(token),null);
const blocked=approvals.issueApproval({...data,preview:{...preview,action:'hold'}});
assert.equal(blocked,null);
const route=read('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts');
const commit=read(d+'topic-memory-commit.server.ts');
const workbench=read(d+'workbench.tsx'),space=read(d+'learning-space-preview.tsx');
assert.ok(route.includes('approvedEventSemanticMatches('));
assert.ok(route.includes('manual_difficulty_review_required'));
assert.ok(route.includes('verifier_review_retired'));
assert.ok(route.includes('difficulty_identity_review_needed'));
assert.ok(route.includes('topicMemory.autoEligible=false'));
assert.ok(route.includes('commitTopicMemory(approved,x.difficultyChoice)'));
assert.ok(!route.includes('issueReview(review)'));
assert.ok(commit.includes('memoryDigest(rows)!==p.snapshotDigest'));
assert.ok(commit.includes('resolveReviewedIdentity('));
assert.ok(commit.includes('difficulty_id:difficultyId'));
assert.ok(commit.includes('myway_learning_evidence:events'));
assert.ok(commit.includes('evidence.length!==prior.length+1'));
assert.ok(!workbench.includes('approveVerifierMatch'));
assert.ok(!workbench.includes('Approve reviewed association once'));
assert.ok(workbench.includes('difficultyChoice'));
assert.ok(space.includes('difficultyChoice'));
assert.ok(space.includes('myway-learning-model-choices-v37d2c7a3'));
assert.ok(space.includes('useState<ModelChoice>("openai:gpt-4.1-mini")'));
assert.equal(JSON.parse(read('scripts/sandbox/current-local-release.json')).release,'v37d2c7a3r');
for(const file of ['app/api/sandbox/probe-lab/learning-space/retrieve/route.ts',d+'root-problem-compare.server.ts',d+'topic-memory-commit.server.ts',d+'learning-space-preview.tsx',d+'workbench.tsx']){
 const output=ts.transpileModule(read(file),{fileName:file,reportDiagnostics:true,
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
 assert.equal((output.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,'TS syntax '+file);
}
console.log('7A.3R synthetic PASS: Photosynthesis paraphrase, stable ID, explicit reviewed choice, ambiguity, forged events, approval replay, UI and source guards.');
