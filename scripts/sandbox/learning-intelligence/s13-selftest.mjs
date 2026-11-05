#!/usr/bin/env node
/** Offline tests of S1.3 response contract, challenge selection and mocked paid accounting. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadS13,parseFlags,loadCases,selectCases,expectedIdentity,expectedInterpretation,risk,metrics,localS13Adjudicate,evaluate} from './s13-evaluator.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../');
const core=loadS13(root),cases=loadCases();
assert.equal(cases.length,59);assert.equal(selectCases(cases,parseFlags([])).length,23);
assert.equal(selectCases(cases,parseFlags(['--selection','ambiguity','--limit','7'])).length,7);
assert.equal(selectCases(cases,parseFlags(['--case','A10-competing','--limit','1']))[0].id,'A10-competing');
assert.equal(cases.find(c=>c.id==='A10-competing').referenceStatus,'contested_original_label_excluded_from_scoring');
for(const opts of [['--mode','model'],['--mode','model','--allow-spend'],['--mode','model','--allow-spend','--budget-usd','2.01'],['--mode','model','--allow-spend','--budget-usd','0.10','--limit','11'],['--mode','fixture','--allow-spend'],['--mode','semantic','--compare-s12-live']])assert.throws(()=>parseFlags(opts));
const permitted=parseFlags(['--mode','model','--allow-spend','--budget-usd','0.10','--compare-s12-live','--limit','1']);
assert.equal(permitted.limit,1);
const c=cases.find(x=>x.id==='Q01-same');
const input=core.s13Input({topic_label:c.topicLabel,learner_statement:c.message,proposed_root_problem:c.root,historical_observations:c.approved.map(x=>({event_id:x.event_id,root_problem:x.root_problem})),max_similarity:0.92});
assert.ok(core.validS13Input(input));assert.equal(Object.hasOwn(input,'semanticLabel'),false);
assert.ok(!JSON.stringify(input).includes('goldRationale'));
const base={identity:'same',interpretation:'retain',anchor_event_id:c.approved[0].event_id,identity_rationale:'Both discuss chlorophyll absorption of a photon.',
 interpretation_rationale:'Only incidental sequence detail is added.',evidence_basis:'Historical and current statements ask about chlorophyll photon absorption.',proposed_hypothesis:'',missing_evidence:''};
const parse=x=>core.parseS13(JSON.stringify(x),input);
assert.equal(parse(base).decision?.interpretation,'retain');
assert.equal(parse({...base,identity:'distinct',interpretation:'not_applicable',anchor_event_id:''}).decision?.identity,'distinct');
assert.equal(parse({...base,identity:'uncertain',interpretation:'not_applicable',anchor_event_id:'',missing_evidence:'Need details to identify the obstacle.'}).decision?.identity,'uncertain');
assert.equal(parse({...base,interpretation:'refine',proposed_hypothesis:'How pigment photochemistry initiates excitation before energy transfer'}).decision?.interpretation,'refine');
for(const invalid of [
 {...base,anchor_event_id:'00000000-0000-0000-0000-000000000000'},
 {...base,identity:'uncertain',anchor_event_id:'',interpretation:'not_applicable',missing_evidence:''},
 {...base,identity:'distinct',anchor_event_id:'',interpretation:'retain'},
 {...base,identity:'same',interpretation:'not_applicable'},
 {...base,interpretation:'refine'},
 {...base,proposed_hypothesis:'Unauthorized interpretation'},
 {...base,unexpected_field:'bad'},
]) assert.equal(parse(invalid).decision,null,JSON.stringify(invalid));
const noHistory=core.s13Input({...input,historical_observations:[],max_similarity:null});
assert.equal(core.parseS13(JSON.stringify(base),noHistory).decision,null);
assert.equal(core.parseS13(JSON.stringify({...base,identity:'uncertain',interpretation:'not_applicable',anchor_event_id:'',missing_evidence:'Need historical event descriptions.'}),noHistory).decision?.identity,'uncertain');
assert.equal(expectedIdentity('refinement'),'same');assert.equal(expectedInterpretation('refinement'),'refine');
assert.equal(risk('distinct','same'),'potential_false_merge');assert.equal(risk('same','distinct'),'potential_duplicate_identity');
assert.equal(metrics([{id:'A10-competing',scorable:false,label:'ambiguous',expectedIdentity:'uncertain',baselineIdentity:'distinct',s13Identity:'distinct'},
 {id:'Q01-same',scorable:true,label:'same',expectedIdentity:'same',expectedInterpretation:'retain',baselineIdentity:'same',s13Identity:'same',s13Interpretation:'retain'}]).scored,1);
let called=0;
const fakeFetch=async(url,opts)=>{called++;assert.ok(url.endsWith('memory-adjudicator-s13'));assert.equal(opts.headers.Origin,'http://127.0.0.1:3001');
 const req=JSON.parse(opts.body);assert.deepEqual(Object.keys(req).sort(),['format','input','model']);assert.equal(req.format,'myway_s13_two_stage_memory_v1');assert.ok(!JSON.stringify(req.input).includes('semanticLabel'));
 return {ok:true,status:200,json:async()=>({raw:JSON.stringify(base),model:'gpt-4.1-mini',usage:{promptTokens:550,completionTokens:150,cachedTokens:0,totalTokens:700}})};};
assert.equal(core.parseS13((await localS13Adjudicate(input,'gpt-4.1-mini',fakeFetch)).raw,input).decision?.identity,'same');assert.equal(called,1);
const s12raw=JSON.stringify({relation:'same_difficulty',anchor_event_id:c.approved[0].event_id,evidence_basis:'Both are concerned with chlorophyll absorbing photons.',rationale:'The core obstacle is unchanged after rephrasing.',missing_evidence:''});
const folder=path.join(root,'.myway-patch-backups/learning-intelligence-reports/s13-selftest-temp');
if(fs.existsSync(folder))throw Error('Preexisting S13 selftest report destination');
try{
 const flags=parseFlags(['--mode','model','--case','Q01-same','--limit','1','--allow-spend','--budget-usd','0.05','--compare-s12-live','--report-dir',folder]);
 const result=await evaluate(flags,{embed:async c=>c.fixtureScores,
  requestS13:async()=>({raw:JSON.stringify(base),model:'gpt-4.1-mini',usage:{promptTokens:550,completionTokens:150,cachedTokens:0,totalTokens:700}}),
  requestS12:async()=>({raw:s12raw,model:'gpt-4.1-mini',usage:{promptTokens:400,completionTokens:100,cachedTokens:0,totalTokens:500}})});
 assert.equal(result.report.modelCost.attemptedCalls,2);assert.ok(result.report.modelCost.knownEstimatedUsd>0);
 assert.equal(result.rows[0].s13Identity,'same');assert.equal(result.rows[0].s12Identity,'same');assert.equal(result.rows[0].s13Interpretation,'retain');
 assert.ok(fs.existsSync(path.join(folder,'cost-ledger.json')));
}finally{fs.rmSync(folder,{recursive:true,force:true});}
const badRoute=fs.readFileSync(path.join(root,'app/api/sandbox/probe-lab/local-assessment/memory-adjudicator-s13/route.ts'),'utf8');
for(const phrase of ["NODE_ENV!=='development'","MYWAY_EXPERIMENTAL_RUNTIME!=='v37b'","process.env.VERCEL==='1'","request.headers.get('origin')",'S13_FORMAT'])assert.ok(badRoute.includes(phrase));
for(const forbidden of ['createServerSupabaseClient','topic_state','commitTopicMemory','supabase.from','upsert(', 'insert('])assert.ok(!badRoute.includes(forbidden),'Write-capable code in S13 route: '+forbidden);
const ts=fs.readFileSync(path.join(root,'sandbox/probe-lab/learning-space/memory-adjudication-s13.ts'),'utf8');
assert.ok(ts.includes('STAGE A'));assert.ok(ts.includes('STAGE B'));assert.ok(!ts.includes('myway_learning_evidence:'));
for(const opts of [['--mode','model'],['--mode','fixture','--allow-spend'],['--mode','model','--allow-spend','--budget-usd','3.00']]){
 const p=spawnSync(process.execPath,[path.join(here,'s13-evaluator.mjs'),...opts],{encoding:'utf8',timeout:20000});assert.notEqual(p.status,0,'Spend gate missed '+opts.join(' '));
}
console.log('7A.3S1.3 SELFTEST PASS: 59 cases, two-stage anchors and interpretation guards, blind labels, contested exclusions, mock S12/S13 pairing and cost accounting.');
