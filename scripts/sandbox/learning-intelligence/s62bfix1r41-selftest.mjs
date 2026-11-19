#!/usr/bin/env node
/** R4.1 free regression. No live embeddings, model calls, DB, or educational answer keys. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run,parseArgs} from './s62bfix1r41-journey.mjs';
import {promptForR41,PROMPT_SET_VERSION} from './s62bfix1r41-prompts.mjs';
import {frozenPairs,parseArgs as compareArgs,compare} from './s62bfix1r41-compare.mjs';
import {A_SCHEMA,B_SCHEMA,L_SCHEMA} from './s62b-core.mjs';
import {TRANSLATOR_SCHEMA} from './s62bfix1-experience.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const dir=path.join(root,'.myway-patch-backups','learning-intelligence-reports');
const id=String(process.pid),runs=[];
const embed=async texts=>texts.map(t=>{const s=String(t),v=Array(64).fill(0);for(let i=0;i<s.length;i++)v[(s.charCodeAt(i)+17*i)%64]++;return v;});
assert.equal(PROMPT_SET_VERSION,'r41_consolidated_v1');
assert.throws(()=>parseArgs(['--mode','model','--episodes','2']),/Paid mode requires/);
assert.throws(()=>parseArgs(['--mode','offline','--retrieval','lexical']),/Invalid S62B configuration/);
assert.throws(()=>compareArgs(['--mode','model','--run-id','cost']),/Paid comparison requires/);
for(const role of ['A','B','X','L']){const str=promptForR41(role,{});assert(str.length>500);assert(!/fix1r2|r4_addendum/i.test(str));}
assert.match(promptForR41('A'),/memory_decisions: \[\]/);
assert.match(promptForR41('B'),/DO NOT limit/);
assert.match(promptForR41('X'),/THIS CALL targets a temporary symbolic research adapter/);
assert.match(promptForR41('L',{opening_request:true}),/selected_actions=\[\]/);
assert.match(promptForR41('L',{conversation_reply_request:true}),/no executable activity/);
assert(A_SCHEMA.properties.memory_decisions && B_SCHEMA.properties.experience_proposal && L_SCHEMA.properties.selected_actions && TRANSLATOR_SCHEMA.properties.stages);
try{
 const a='selftest_r41a_'+id,b='selftest_r41b_'+id;runs.push(['s62bfix1r41',a],['s62bfix1r41',b]);
 const r=await run({mode:'offline',method:'semantic',episodes:2,runId:a},{embedFn:embed,suppressHtml:true});
 assert.equal(r.trace.complete,true,JSON.stringify(r.trace.failure));
 assert.equal(r.trace.timeline.length,2);assert.equal(r.trace.prompt_set_version,PROMPT_SET_VERSION);
 assert(r.trace.timeline.every(e=>e.pre_a?.valid&&e.post_a?.valid));
 assert(r.trace.timeline.every(e=>e.b_request?.messages?.[0]?.content===promptForR41('B')));
 assert(r.trace.timeline.every(e=>e.pre_a?.request?.messages?.[0]?.content===promptForR41('A')));
 assert.equal(r.trace.cost.calls,0);assert.equal(r.trace.summary.db_writes,0);
 const z=await run({mode:'offline',method:'semantic',episodes:4,runId:b,resumeFrom:a},{embedFn:embed,suppressHtml:true});
 assert.equal(z.trace.complete,true,JSON.stringify(z.trace.failure));
 assert.deepEqual(z.trace.timeline.map(e=>e.step),[3,4,5,6]);
 assert.equal(z.trace.state.last_completed_episode,6);
 assert.equal(z.trace.state.semantic_index.provider,'injected_test_only');
 assert(z.trace.state.observations.some(x=>x.id==='NORA-01-IN'));
 assert(z.trace.state.observations.some(x=>x.id==='NORA-06-OUT'));
 assert.equal(z.trace.cost.calls,0);
 // Controlled frozen-request comparator: fake a completed R4 trace using original request shapes;
 // the comparator must not change input content, schema or original prompt within each pair.
 const source='selftest_r41source_'+id;runs.push(['s62bfix1r4',source]);
 const srcPath=path.join(dir,'s62bfix1r4',source);fs.mkdirSync(srcPath,{recursive:true});
 const schema={A:A_SCHEMA,B:B_SCHEMA,X:TRANSLATOR_SCHEMA,L:L_SCHEMA};
 const req=(role,variant)=>({model:'gpt-4.1-mini',store:false,max_tokens:100,messages:[{role:'system',content:'original R4 '+role+' '+variant},{role:'user',content:JSON.stringify({kind:variant,opening_request:variant==='opening',current:{id:'E1'}})}],response_format:{type:'json_schema',json_schema:{name:'test',strict:true,schema:schema[role]}}});
 const sourceTrace={stage:'S62B-FIX1R4',complete:true,timeline:[{pre_a:{request:req('A','pre')},post_a:{request:req('A','post')},b_request:req('B','teach'),translator_request:req('X','implement'),opening_L_request:req('L','opening'),phases:[{model_l_request:req('L','interact')}]}]};
 fs.writeFileSync(path.join(srcPath,'TRACE.json'),JSON.stringify(sourceTrace));
 const pairs=frozenPairs(sourceTrace);assert.equal(pairs.length,6);
 assert(pairs.every(x=>x.oldPromptSha256!==x.newPromptSha256));
 const cmp='selftest_r41compare_'+id;runs.push(['s62bfix1r41/prompt-comparisons',cmp]);
 const result=await compare({mode:'offline',sourceRun:source,runId:cmp});
 assert.equal(result.report.complete,true);assert.equal(result.report.model_calls,0);
 assert.equal(result.report.results.length,0);assert.equal(result.plan.pairs.length,6);
 assert.equal(result.report.scientific_scoring,false);
 console.log('S62B-FIX1R4.1 SELFTEST PASS | single role prompts, schema continuity, 2+4 offline journey, cached semantic retrieval, frozen six-case comparison, zero API/DB');
}finally{
 for(const [stage,run] of runs){const p=path.join(dir,stage,run);if(fs.existsSync(p))fs.rmSync(p,{recursive:true,force:true});}
}
