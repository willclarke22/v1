#!/usr/bin/env node
/** Offline, synthetic-only regression contracts; does not call models, DB or mutate memory. */
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
function load(rel){
 if(modules.has(rel))return modules.get(rel);
 const source=read(rel);
 const output=ts.transpileModule(source,{fileName:rel,reportDiagnostics:true,
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
 assert.equal((output.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,'TypeScript syntax '+rel);
 const mod={exports:{}};modules.set(rel,mod.exports);
 const stub=id=>{
  if(id==='server-only')return {};
  if(id==='node:crypto')return require(id);
  if(id==='./verifier-association-policy')return load('sandbox/probe-lab/learning-space/verifier-association-policy.ts');
  if(id.startsWith('@/')||id.startsWith('./'))return {};
  throw Error('Unexpected dependency '+id+' in '+rel);
 };
 new Function('require','module','exports',output.outputText)(stub,mod,mod.exports);
 modules.set(rel,mod.exports);
 return mod.exports;
}
const policy=load('sandbox/probe-lab/learning-space/verifier-association-policy.ts');
const memory=load('sandbox/probe-lab/learning-space/topic-memory-preview.ts');
const explain=load('sandbox/probe-lab/learning-space/topic-decision-explanation.ts');
const approvals=load('sandbox/probe-lab/learning-space/topic-memory-approval.server.ts');
const candidate=(id,similarity,hasHistory=true)=>({topicId:id,topicLabel:'Atomic Structure and Solidity',
 similarity:0.303,rootProblemSemanticSimilarity:similarity,storedRootProblems:hasHistory?['Existing solid-matter difficulty']:[],comparison:hasHistory?'historical_evidence':'label_only'});
const mkPreview=(s,action='propose_new',status='semantic_pgvector')=>({schema:'myway-v37d1-memory-preview-v1',mode:'read_only',action,
 reasonCode:action==='propose_new'?'no_close_semantic_candidate':'semantic_root_problem_match',
 retrievalStatus:status,candidates:[candidate('atomic',s)],targetTopicId:action==='associate_existing'?'atomic':null});
const evidence={topicName:'Electron Energy Levels',rootProblem:'Learner cannot explain electron energies',
 evidenceQuote:'why electrons have energy levels',originalMessage:'why electrons have energy levels',
 currentMessage:'why electrons have energy levels',snapshotDigest:'a',confusion:6,insight:2,rootConfidence:0.9};
const short=mkPreview(0.198);
assert.deepEqual(policy.validateReviewedAssociation(short,'atomic','same_topic_new_difficulty',0.9),{ok:false,reason:'low_semantic_evidence'});
assert.equal(approvals.issueReview({...evidence,preview:short}),null,
 'A Model C claim must not issue an approval capability when historical evidence fails');
assert.equal(explain.topicDecisionExplanation(short).includes('specifically named topic'),true);
assert.ok(explain.verifierComparisonExplanation(short,{relation:'same_topic_new_difficulty',target_topic_id:'atomic',rationale:'test'},
 policy.validateReviewedAssociation(short,'atomic','same_topic_new_difficulty',0.9)).includes('does not support manual association'));
const good=mkPreview(0.881,'associate_existing');
assert.equal(policy.validateReviewedAssociation(good,'atomic','same_topic_same_difficulty',0.9).ok,true);
const token=approvals.issueReview({...evidence,preview:good});
assert.match(token,/^[0-9a-f]{64}$/);
assert.ok(approvals.consumeReview(token));
assert.equal(approvals.consumeReview(token),null,'One-use reviewed tokens must remain one-use');
assert.equal(approvals.issueReview({...evidence,preview:mkPreview(0.881,'associate_existing','lexical_fallback')}),null);
assert.equal(approvals.issueReview({...evidence,rootConfidence:0.6,preview:good}),null);
assert.equal(approvals.issueReview({...evidence,preview:{...good,candidates:[candidate('atomic',0.881,false)]}}),null);
assert.equal(approvals.issueReview({...evidence,preview:{...good,candidates:[candidate('atomic',0.881),candidate('rival',0.87)]}}),null);
assert.ok(explain.topicDecisionExplanation({...good,reasonCode:'strong_topic_level_match'}).includes('NEW difficulty'));
assert.ok(explain.topicDecisionExplanation({...good,action:'hold',reasonCode:'existing_label_needs_review'}).includes('duplicate'));
const duplicate=memory.compareTopicMemory({retrievalStatus:'semantic_pgvector',
 matches:[{topicId:'other',topicLabel:'Chemistry',similarity:0.18}],
 rows:[{topic_id:'other',topic_label:'Chemistry',topic_json:{}},
       {topic_id:'hidden',topic_label:'Electron Energy Levels',topic_json:{}}],
 topicName:'electron energy levels',rootProblem:'Learner cannot explain why electron energy levels are discrete',
 evidenceQuote:'why electron energy levels are discrete',originalMessage:'why electron energy levels are discrete',
 currentMessage:'why electron energy levels are discrete',rootConfidence:0.9});
assert.equal(duplicate.action,'hold','Unretrieved exact-label topics must never be duplicated');
assert.equal(duplicate.reasonCode,'existing_label_needs_review');

assert.ok(explain.verifierComparisonExplanation(good,{relation:'same_topic_same_difficulty',target_topic_id:'atomic',rationale:'test'},
 {ok:true,reason:'manual_review_supported'}).includes('same topic'));
const preview=read('sandbox/probe-lab/learning-space/learning-space-preview.tsx');
const sidebar=read('ui/learning-space/shell/sidebar.tsx');
const workbench=read('sandbox/probe-lab/learning-space/workbench.tsx');
assert.ok(preview.includes('liveTopicPreview={liveTopicPreview}')&&preview.includes('setTab("myway");setLeftOpen(true)'));
assert.ok(!preview.includes('<section aria-label="Live topic search bubbles"'),
 'The transient bubble overlay must not remain centered over the 3D space');
assert.ok(sidebar.includes('aria-label="Live topic search bubbles"')&&sidebar.includes('MyWay Response'));
assert.ok(sidebar.includes('onSelectLiveTopic?.(match.topicId)')&&sidebar.includes('Existing topic previews only'));
assert.ok(workbench.includes('offerVerifierReview')&&workbench.includes('reviewEligibility?.ok'));
assert.ok(workbench.includes('topicDecisionExplanation(trace.topicMemory)'));
assert.ok(workbench.includes('verifierComparisonExplanation(trace.topicMemory,verifierDecision,reviewEligibility)'));
assert.ok(!read('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts').includes('v37d2c7a2'),
 'No new API route authority in this patch');
const pointer=JSON.parse(read('scripts/sandbox/current-local-release.json'));
assert.equal(pointer.release,'v37d2c7a2');
console.log('V3.7D.2C.7A.2 TEST PASS: 26 synthetic policy, review capability, sidebar placement and non-write assertions.');
