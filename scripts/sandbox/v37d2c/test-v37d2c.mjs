#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import vm from 'node:vm';import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]||process.cwd());const src=x=>fs.readFileSync(path.join(root,x),'utf8');const require=createRequire(import.meta.url);
const ts=require(path.join(root,'node_modules/typescript'));
const paths=['sandbox/probe-lab/learning-space/topic-memory-preview.ts','sandbox/probe-lab/learning-space/root-problem-compare.server.ts','sandbox/probe-lab/learning-space/topic-memory-scores.ts','sandbox/probe-lab/learning-space/topic-memory-approval.server.ts','sandbox/probe-lab/learning-space/topic-memory-commit.server.ts','sandbox/probe-lab/learning-space/learning-turn.client.ts','sandbox/probe-lab/learning-space/learning-space-preview.tsx','sandbox/probe-lab/learning-space/workbench.tsx','sandbox/probe-lab/learning-space/snapshot.server.ts','app/api/sandbox/probe-lab/learning-space/retrieve/route.ts'];
for(const file of paths){const compiled=ts.transpileModule(src(file),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});assert.equal(compiled.diagnostics?.length||0,0,'TS parsing failed '+file);}
function execute(file){const out=ts.transpileModule(src(file),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;let exports={};const module={exports};vm.runInNewContext(out,{module,exports,require:(n)=>{throw Error('Unexpected dependency '+n);}}, {timeout:500});return exports;}
const score=execute(paths[2]);assert.equal(score.isRubricScore(-1),true);assert.equal(score.isRubricScore(10),true);assert.equal(score.isRubricScore(10.5),false);assert.equal(score.isRubricScore(11),false);
const s=score.scoreSummary([{confusion:5,insight:2},{confusion:7,insight:3},{confusion:null,insight:-1}]);assert.equal(s.confusion,0.6);assert.equal(s.insight,0.25);assert.equal(s.confusionCount,2);assert.equal(s.insightCount,2);assert.equal(score.scoreSummary([]).confusion,null);
const p=execute(paths[0]);
const old='Assumes cardiovascular fitness from running should directly and fully translate to endurance in treading water, causing confusion when observed otherwise.';
const fresh='Expects running cardio fitness to directly predict treading water duration but does not understand other factors influencing treading water ability.';
const row={topic_id:'topicA',topic_label:'Cardio Cross-Activity Transfer',topic_json:{root_problem:old},diagnosis:null};
const args={retrievalStatus:'semantic_pgvector',matches:[{topicId:'topicA',topicLabel:row.topic_label,similarity:.222},{topicId:'topicB',topicLabel:'Karate',similarity:.13}],rows:[row],topicName:'Treading Water Endurance',rootProblem:fresh,evidenceQuote:'worse running cardio',originalMessage:'I am confused how someone with worse running cardio can tread water longer than I can',currentMessage:'I do not understand why',rootConfidence:.8,confusion:5,insight:2,rootSemanticMatches:{topicA:.94}};
const match=p.compareTopicMemory(args);assert.equal(match.action,'associate_existing');assert.equal(match.reasonCode,'semantic_root_problem_match');assert.equal(match.targetTopicId,'topicA');assert.equal(match.autoEligible,true);
const ambiguous=p.compareTopicMemory({...args,rootSemanticMatches:{topicA:.65}});assert.notEqual(ambiguous.action,'propose_new','Plausible duplicate must block topic creation');
const low=p.compareTopicMemory({...args,rootConfidence:.5});assert.equal(low.action,'hold');
const noService=p.compareTopicMemory({...args,retrievalStatus:'lexical_fallback',rootSemanticMatches:{}});assert.equal(noService.autoEligible,undefined);
const noAuto=p.compareTopicMemory({...args,rootSemanticMatches:{topicA:.84}});assert.equal(noAuto.autoEligible,false);
const route=src(paths[9]),commit=src(paths[4]),client=src(paths[6]);
for(const needle of ['auto_associate_existing','I_ENABLED_AUTO_ASSOCIATION_THIS_SESSION','consumeApproval','p.preview.autoEligible!==true','p.preview.action!=="associate_existing"'])assert.ok(route.includes(needle),'auto route guard '+needle);
for(const needle of ['.eq("updated_at",target.updated_at)','memoryDigest(rows)!==p.snapshotDigest','sandboxOwned','learning_score:null','scoreSummary','myway_scored_observation_summary'])assert.ok(commit.includes(needle),'score/persistence guard '+needle);
assert.ok(client.includes('setAutoAssociate]=useState(false)')); // Default disabled, explicit per-tab click required.
// Regression: TypeScript semantic type checking must include the REAL snapshot inspector expression.
// Transpilation alone doesn't catch undefined variables (e.g. the old `json` TS2552).
const snapshot=src(paths[8]);
const inspectStart=snapshot.indexOf('const inspect = rows.map((row, i) => ({');
assert.ok(inspectStart>=0,'Snapshot inspector map not found');
const inspectEnd=snapshot.indexOf('  }));',inspectStart);
assert.ok(inspectEnd>inspectStart,'Snapshot inspector map end not found');
const inspectExpression=snapshot.slice(inspectStart,inspectEnd+'  }));'.length);
const virtualFile=path.join(root,'scripts/sandbox/v37d2c/__snapshot_inspect_semantic_typecheck__.ts');
const virtualSource=`declare const rows: Record<string,any>[];
declare const topics: Record<string,any>[];
declare function object(x:unknown):Record<string,any>;
declare function jsonOrigin(x:unknown):string|null;
declare function isValidEmbedding(x:unknown):boolean;
${inspectExpression}
`;
const options={strict:true,noEmit:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022};
const host=ts.createCompilerHost(options);
const priorGet=host.getSourceFile.bind(host),priorRead=host.readFile.bind(host),priorExists=host.fileExists.bind(host);
host.getSourceFile=(name,language,...rest)=>path.resolve(name)===path.resolve(virtualFile)?ts.createSourceFile(name,virtualSource,language):priorGet(name,language,...rest);
host.readFile=name=>path.resolve(name)===path.resolve(virtualFile)?virtualSource:priorRead(name);
host.fileExists=name=>path.resolve(name)===path.resolve(virtualFile)||priorExists(name);
const checked=ts.createProgram([virtualFile],options,host);
const issues=ts.getPreEmitDiagnostics(checked);
assert.equal(issues.length,0,'Snapshot inspector semantic TypeScript: '+issues.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
assert.ok(snapshot.includes('scoredObservations: object(object(row.topic_json).myway_scored_observation_summary)'),
  'Scored-observation summary must come from this inspector row, not an unbound json variable');


console.log('V3.7D.2C CONTRACT PASS: same difficulty, ambiguity blocking, opt-in only, rubric scores, no mastery writes.');
