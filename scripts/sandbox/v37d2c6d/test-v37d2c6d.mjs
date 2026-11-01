#!/usr/bin/env node
// V3.7D.2C.6D regression: synthetic only; no network, model, DB or learner data.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||process.cwd());
const abs=rel=>path.join(root,...rel.split('/'));
const read=rel=>fs.readFileSync(abs(rel),'utf8');
const ts=await import(pathToFileURL(abs('node_modules/typescript/lib/typescript.js')).href);
async function pureModule(rel){
 const src=read(rel);
 const output=ts.transpileModule(src,{fileName:rel,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
 const js=output.outputText;
 assert.ok(!/from ["']@\//.test(js),'Pure test fixture unexpectedly imported application/server code: '+rel);
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
const {compareTopicMemory}=await pureModule('sandbox/probe-lab/learning-space/topic-memory-preview.ts');
const {normalizeTopicLabel}=await pureModule('sandbox/probe-lab/learning-space/topic-label-normalization.ts');
const costs=await pureModule('sandbox/probe-lab/local-assessment/model-token-usage.ts');
const cases=[];
const evidence='I do not understand how the valve closes during swallowing';
const base={retrievalStatus:'semantic_pgvector',matches:[],rows:[],topicName:'Swallowing and Valves',rootProblem:'Learner does not understand how a valve closes during swallowing',evidenceQuote:evidence,originalMessage:evidence,currentMessage:evidence,rootConfidence:0.81,confusion:6,insight:1};
function t(name,partial,expectedAction,reason){
 const preview=compareTopicMemory({...base,...partial});
 assert.equal(preview.action,expectedAction,`${name} action; got ${preview.action} (${preview.reasonCode})`);
 if(reason)assert.equal(preview.reasonCode,reason,`${name} reason`);
 cases.push({scenario:name,action:preview.action,reason:preview.reasonCode});
}
const row=(id,label,json={})=>({topic_id:id,topic_label:label,topic_json:json,diagnosis:'representation_gap'});
const match=(id,label,similarity)=>({topicId:id,topicLabel:label,similarity});
t('Empty semantic results',{},'hold','semantic_candidates_empty');
t('Unavailable search',{retrievalStatus:'unavailable'},'hold','retrieval_unavailable');
t('Lexical fallback',{retrievalStatus:'lexical_fallback',matches:[match('a','Other Subject',0)],rows:[row('a','Other Subject')]},'hold','lexical_only_uncertain');
t('Missing grounded quotation',{evidenceQuote:'Text the learner never said',matches:[match('a','Other Subject',0.1)],rows:[row('a','Other Subject')]},'hold','ungrounded_evidence');
t('Insufficient confidence',{rootConfidence:0.5,matches:[match('a','Other Subject',0.1)],rows:[row('a','Other Subject')]},'hold','insufficient_assessment');
t('Low-match topic proposal',{matches:[match('a','Other Subject',0.12)],rows:[row('a','Other Subject')]},'propose_new','no_close_semantic_candidate');
t('Exact label with misleadingly low embedding',{matches:[match('a','Swallowing and Valves',0.13)],rows:[row('a','Swallowing and Valves')]},'hold','existing_label_needs_review');
t('Uncertain moderate match',{matches:[match('a','Other Subject',0.60)],rows:[row('a','Other Subject')]},'hold','distinct_difficulty_uncertain');
t('High-confidence subject match',{matches:[match('a','Swallowing and Valves',0.95)],rows:[row('a','Swallowing and Valves')]},'associate_existing','strong_topic_level_match');
t('Historic difficulty match',{matches:[match('a','Swallowing and Valves',0.73)],rows:[row('a','Swallowing and Valves',{root_problem:base.rootProblem})]},'associate_existing','historical_root_problem_match');
t('Conflicting subject labels',{matches:[match('a','Swallowing and Valves',0.4),match('b','Other Subject',0.4)],rows:[row('a','Swallowing and Valves'),row('b','Other Subject')]},'hold','existing_label_needs_review');
assert.equal(normalizeTopicLabel('drinking with cleft palate'),'Drinking with Cleft Palate');
assert.equal(normalizeTopicLabel('MRI and swallowing'),'MRI and Swallowing');
assert.equal(normalizeTopicLabel(''), '');
const goodUsage={promptTokens:1000,completionTokens:200,totalTokens:1200,cachedTokens:200};
const billed=costs.calculateStageCost({provider:'openai',model:'gpt-4.1-mini-2025-04-14',usage:goodUsage,called:true});
assert.equal(billed.status,'estimated');
assert.ok(Math.abs(billed.estimatedUsd-0.00066)<1e-12,'Reported-token pricing mismatch');
assert.equal(costs.calculateStageCost({provider:'glm',model:'glm-5.3',usage:goodUsage,called:true}).status,'unpriced');
assert.equal(costs.calculateStageCost({provider:'openai',model:'gpt-4.1-mini',called:true}).status,'missing_usage');
assert.equal(costs.calculateStageCost({provider:'edge',model:'MiniLM',called:true}).status,'on_device');
const parse=costs.readOpenAIUsage({usage:{prompt_tokens:1000,completion_tokens:200,total_tokens:1200,prompt_tokens_details:{cached_tokens:200}}});
assert.deepEqual(parse,goodUsage);
const bad=costs.readOpenAIUsage({usage:{prompt_tokens:12,completion_tokens:1,prompt_tokens_details:{cached_tokens:13}}});
assert.equal(bad,null,'Invalid cached tokens were accepted');
// Inspect only the literal system prompt AST nodes; never infer billed tokens
// from these character counts. Actual provider usage comes from a real turn.
function systemPromptChars(rel,constant){
 const parsed=ts.createSourceFile(rel,read(rel),ts.ScriptTarget.ES2022,true);
 let result=null;
 function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(parsed)===constant){
   const initializer=node.initializer;
   if(initializer && ts.isNoSubstitutionTemplateLiteral(initializer))result=initializer.text.length;
  }
  ts.forEachChild(node,visit);
 }
 visit(parsed);assert.ok(typeof result==='number'&&result>50,'System prompt literal missing: '+constant);
 return result;
}
const promptCharacters={
 assessment:systemPromptChars('sandbox/probe-lab/learning-space/assessment-core.ts','ASSESSMENT_SYSTEM_PROMPT'),
 teaching:systemPromptChars('sandbox/probe-lab/local-assessment/compact-teaching.ts','COMPACT_TEACH_SYSTEM_PROMPT'),
 verifier:systemPromptChars('sandbox/probe-lab/learning-space/topic-association-verifier.ts','VERIFIER_SYSTEM_PROMPT')
};
const report={schema:'myway-v37d2c6d-quality-regression-v1',fixture:'synthetic_only',source:'current_uncommitted_worktree',regression_cases:cases.length,passed:cases.length,cases,cost_check:{provider_reported_tokens_only:true,known_cost_usd:billed.estimatedUsd,unknown_glm:'unpriced',missing_openai_usage:'missing_usage'},system_prompt_characters:promptCharacters};
console.log('V3.7D.2C.6D QUALITY CONTRACT PASS: '+cases.length+' synthetic retrieval cases, naming checks, cost accounting guards, no model calls or data writes.');
console.log(JSON.stringify(report,null,2));
