#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import vm from 'node:vm';
const root=path.resolve(process.argv[2]||process.cwd());const at=r=>path.join(root,...r.split('/'));
const ts=createRequire(path.join(root,'package.json'))('typescript');
const src=r=>fs.readFileSync(at(r),'utf8');
const files=['sandbox/probe-lab/learning-space/assessment-core.ts','sandbox/probe-lab/learning-space/learning-turn.client.ts',
 'sandbox/probe-lab/learning-space/glm-client.ts','sandbox/probe-lab/learning-space/workbench.tsx',
 'sandbox/probe-lab/local-assessment/cloud-teaching-client.ts','sandbox/probe-lab/local-assessment/compact-teaching.ts',
 'app/api/sandbox/probe-lab/local-assessment/teaching/route.ts','app/api/sandbox/probe-lab/local-assessment/glm/route.ts'];
for(const file of files){const r=ts.transpileModule(src(file),{fileName:file,reportDiagnostics:true,
 compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
 assert.equal((r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,`Syntax: ${file}`);}
const compiled=ts.transpileModule(src('sandbox/probe-lab/local-assessment/compact-teaching.ts'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(compiled,{module,exports:module.exports,require:(s)=>{
 if(s==='./parse-model-json')return {parseModelJson:JSON.parse};throw Error('Unexpected runtime dependency: '+s);
}});
const c=module.exports;
const input={topic:'Treading Water Endurance',root_problem:'Expects running cardio to predict water endurance',
 evidence_quote:'Why can another person tread longer?',original_statement:'Why can another person tread longer?',clarification_answer:'Could technique be important?'};
assert.equal(c.validCompactTeachingInput(input),true);
assert.equal(c.validCompactTeachingInput({...input,secret:'unknown'}),false);
assert.equal(c.validCompactTeachingInput({...input,original_statement:''}),false);
const model=JSON.stringify({teaching_strategy:'Running endurance helps, but water technique can reduce the energy used to stay afloat.',
 next_step:'Compare what makes an efficient treading-water movement.',visual_intent:'Show two swimming styles with an efficiency comparison.'});
const valid=c.validateCompactTeaching(model);assert.ok(valid.plan);
assert.equal(valid.plan.use_interest,'do_not_use');assert.equal(valid.plan.chosen_interest,'');
assert.equal(valid.plan.learner_reflection,'');assert.equal(valid.plan.teaching_strategy.startsWith('Running endurance'),true);
assert.equal(c.validateCompactTeaching(JSON.stringify({...JSON.parse(model),learner_reflection:'echo'})).plan,undefined);
assert.equal(c.validateCompactTeaching('{not json').plan,undefined);
assert.equal(c.validateCompactTeaching(JSON.stringify({...JSON.parse(model),next_step:''})).plan,undefined);
assert.doesNotMatch(src('sandbox/probe-lab/learning-space/assessment-core.ts'),/For questions about why endurance differs between running and treading water/);
const turn=src('sandbox/probe-lab/learning-space/learning-turn.client.ts');
for(const needle of ['COMPACT_TEACHING_FORMAT','validateCompactTeaching(answer.raw)','trace.reply=learnerFacingTeachingReply(result.plan.teaching_strategy)','buildContextualTopicQuery','calculateTurnCost'])assert.ok(turn.includes(needle),needle);
assert.doesNotMatch(turn,/makeTeachingInput|candidate\.learner_reflection|noInterestInstruction/);
const teaching=src('app/api/sandbox/probe-lab/local-assessment/teaching/route.ts');
assert.match(teaching,/compact\?COMPACT_TEACH_SYSTEM_PROMPT:TEACH_SYSTEM_PROMPT/);
assert.match(teaching,/compact\?COMPACT_TEACH_SCHEMA:TEACH_SCHEMA/);
assert.match(teaching,/readOpenAIUsage/);assert.match(teaching,/checkOrigin\(request\)/);
const glm=src('app/api/sandbox/probe-lab/local-assessment/glm/route.ts');
assert.match(glm,/validCompactTeachingInput/);assert.match(glm,/COMPACT_TEACH_SYSTEM_PROMPT/);
const prior=src('sandbox/probe-lab/local-assessment/learning-plan.ts');assert.match(prior,/learner_reflection/);
const commit=src('sandbox/probe-lab/learning-space/topic-memory-commit.server.ts');
for(const guard of ['memoryDigest(rows)!==p.snapshotDigest','strong_topic_level_match','explicit_user_approval','createServerSupabaseClient','.eq("updated_at",target.updated_at)']){
 assert.ok(commit.includes(guard),guard);}
console.log('V3.7D.2A.2 CONTRACT PASS: compact 3-field teaching, original lab compatibility, precise diagnosis, frozen handoff, token usage and explicit-write gates.');
