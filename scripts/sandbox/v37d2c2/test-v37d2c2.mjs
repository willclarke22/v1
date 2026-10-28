#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import vm from 'node:vm';
import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]||process.cwd());const read=x=>fs.readFileSync(path.join(root,x),'utf8');
const require=createRequire(import.meta.url);const ts=require(path.join(root,'node_modules/typescript'));
const files=['sandbox/probe-lab/learning-space/score-observations.server.ts','sandbox/probe-lab/learning-space/topic-memory-approval.server.ts','sandbox/probe-lab/learning-space/topic-memory-commit.server.ts','sandbox/probe-lab/learning-space/verifier-association-policy.ts','sandbox/probe-lab/learning-space/topic-memory-preview.ts','sandbox/probe-lab/learning-space/learning-turn.client.ts','sandbox/probe-lab/learning-space/learning-space-preview.tsx','sandbox/probe-lab/learning-space/workbench.tsx','app/api/sandbox/probe-lab/learning-space/retrieve/route.ts'];
for(const file of files){
 const src=read(file);const output=ts.transpileModule(src,{fileName:file,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
 const errors=(output.diagnostics??[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0,'TS parser: '+file);
 if(src.includes('"use client"')){const ast=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 assert.ok(ts.isExpressionStatement(ast.statements[0])&&ts.isStringLiteral(ast.statements[0].expression)&&ast.statements[0].expression.text==='use client','Next.js use client must be first: '+file);}
}
function load(file,modules={}){
 const source=ts.transpileModule(read(file),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,require:(name)=>modules[name]??(()=>{throw Error('Unexpected import '+name)})()},{timeout:1500});return module.exports;
}
const policy=load('sandbox/probe-lab/learning-space/verifier-association-policy.ts');
const sample={retrievalStatus:'semantic_pgvector',candidates:[{topicId:'cardio',topicLabel:'Cardio Cross-Activity Transfer',comparison:'historical_evidence',storedRootProblems:['Assumes running cardio transfers fully to treading water.'],rootProblemSemanticSimilarity:0.766},{topicId:'yoga',topicLabel:'Yoga',comparison:'label_only',storedRootProblems:[],rootProblemSemanticSimilarity:null}]};
assert.equal(policy.validateReviewedAssociation(sample,'cardio','same_topic_same_difficulty',0.90).ok,true,'Known recurrence should permit manual review');
assert.equal(policy.validateReviewedAssociation(sample,'cardio','new_topic',0.90).ok,false,'No model-guided creation');
assert.equal(policy.validateReviewedAssociation(sample,'yoga','same_topic_same_difficulty',0.90).ok,false,'Label-only legacy history insufficient');
assert.equal(policy.validateReviewedAssociation(sample,'unknown','same_topic_same_difficulty',0.90).ok,false,'Unknown topic ID');
assert.equal(policy.validateReviewedAssociation(sample,'cardio','same_topic_same_difficulty',0.60).ok,false,'Poor confidence');
assert.equal(policy.validateReviewedAssociation({...sample,retrievalStatus:'lexical_fallback'},'cardio','same_topic_same_difficulty',0.90).ok,false,'No semantic proof');
assert.equal(policy.validateReviewedAssociation({...sample,candidates:[sample.candidates[0],{...sample.candidates[0],topicId:'rival',rootProblemSemanticSimilarity:0.75}]},'cardio','same_topic_same_difficulty',0.9).ok,false,'Ambiguous multiple candidates');
const rubric=load('sandbox/probe-lab/learning-space/topic-memory-scores.ts');
const observation=load('sandbox/probe-lab/learning-space/score-observations.server.ts',{'server-only':{},'@/lib/supabase/server':{createServerSupabaseClient:()=>{throw Error('no db in tests');}},'./topic-memory-scores':rubric});
const input={operation:'record_scored_observation',eventId:'f73fddfc-8c08-49ca-b019-692f553bb3e2',topicName:'Cardio transfer',rootProblem:'Assumes running cardio transfers fully to treading water.',evidenceQuote:'running cardio',originalMessage:'My running cardio seems better than my friends',currentMessage:'But running cardio fails to predict swimming endurance',confusion:5,insight:2,rootConfidence:0.9};
assert.equal(observation.observationIsValid(input),true,'Valid scores and grounded evidence');
assert.equal(observation.observationIsValid({...input,evidenceQuote:'fabricated evidence'}),false,'Reject invented evidence');
assert.equal(observation.observationIsValid({...input,confusion:11}),false,'Reject invalid rubric');
assert.equal(observation.observationIsValid({...input,confusion:-1,insight:-1}),false,'Reject completely unscored');
assert.equal(observation.observationIsValid({...input,eventId:'not-a-uuid'}),false,'Reject replay identity not UUID');
assert.equal(observation.observationIsValid({...input,extra:'bad'}),false,'Reject extra client parameters');
const route=read('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts');
for(const key of ['record_scored_observation','approve_verifier_existing','I_REVIEWED_AND_APPROVE_EXISTING_TOPIC_ASSOCIATION','session-opt-in','consumeReview','memoryDigest'])assert.ok(route.includes(key),'Write guard '+key);
assert.ok(!route.includes('auto_create_topic')&&!route.includes('auto_verifier_associate'),'Model C never auto-commits');
const commit=read('sandbox/probe-lab/learning-space/topic-memory-commit.server.ts');
for(const key of ['memoryDigest(rows)!==p.snapshotDigest','model_verifier_manual_review','.eq("updated_at",target.updated_at)'])assert.ok(commit.includes(key),'CAS/policy '+key);
const preview=read('sandbox/probe-lab/learning-space/learning-space-preview.tsx');
for(const key of ['xl:right-[380px]','xl:left-[290px]','xl:left-[310px]','Save score observations','saveObservations,setSaveObservations]=useState(false)'])assert.ok(preview.includes(key),'Layout/opt-in '+key);
const sql=read('scripts/sandbox/v37d2c2/MIGRATION_APPLY_ONLY_TO_MYWAY_SANDBOX.sql');
assert.ok(sql.includes('enable row level security')&&sql.includes('revoke all')&&sql.includes('event_id uuid primary key'));
console.log('V3.7D.2C.2 CONTRACT PASS: seven association benchmark cases, observation validation, Next client directive, session opt-in, no auto creation or mastery writes, central UI bounds.');
