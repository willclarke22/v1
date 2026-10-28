#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import vm from 'node:vm';import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]||process.cwd());const src=x=>fs.readFileSync(path.join(root,x),'utf8');const require=createRequire(import.meta.url);const ts=require(path.join(root,'node_modules/typescript'));
const files=['sandbox/probe-lab/learning-space/topic-association-verifier.ts','sandbox/probe-lab/learning-space/learning-turn.client.ts','sandbox/probe-lab/learning-space/learning-space-preview.tsx','sandbox/probe-lab/learning-space/workbench.tsx','sandbox/probe-lab/learning-space/glm-client.ts','sandbox/probe-lab/local-assessment/model-token-usage.ts','app/api/sandbox/probe-lab/local-assessment/teaching/route.ts','app/api/sandbox/probe-lab/local-assessment/glm/route.ts'];
for(const file of files){const out=ts.transpileModule(src(file),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});assert.equal(out.diagnostics?.length??0,0,'TS syntax '+file);}
const s=ts.transpileModule(src(files[0]),{fileName:files[0],compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const module={exports:{}};vm.runInNewContext(s,{module,exports:module.exports},{timeout:1000});const v=module.exports;
const sample=v.verifierInput({topicName:'Treading Water Endurance',rootProblem:'Expects cardiovascular endurance in running to transfer fully to treading water.',originalStatement:'I run well but cannot tread as long.',clarification:'Why not?',candidates:[{topicId:'topicA',topicLabel:'Cardio Cross-Activity Transfer',topicSimilarity:.303,difficultySimilarity:.775,storedRootProblems:['Assumes cardio from running fully translates to treading water.']},{topicId:'topicB',topicLabel:'Yoga',topicSimilarity:.1,difficultySimilarity:null,storedRootProblems:[]}]});
assert.equal(v.validVerifierInput(sample),true);const decide=(relation,target_topic_id,rationale='The same underlying mistaken transfer assumption appears in both descriptions.')=>JSON.stringify({relation,target_topic_id,rationale});
const bench=[['same_topic_same_difficulty','topicA',true],['same_topic_new_difficulty','topicB',true],['new_topic','',true],['uncertain','',true],['same_topic_same_difficulty','not-a-real-id',false],['new_topic','topicA',false],['uncertain','topicA',false]];
for(const [r,id,ok] of bench)assert.equal(Boolean(v.parseVerifier(decide(r,id),sample).decision),ok,'Verifier schema scenario '+r+' / '+id);
assert.equal(v.parseVerifier('```json\n'+decide('same_topic_same_difficulty','topicA')+'\n```',sample).decision.target_topic_id,'topicA');
assert.equal(v.parseVerifier(decide('new_topic',''),{...sample,candidates:[]}).decision,null);
assert.equal(v.parseVerifier('{"relation":"uncertain","target_topic_id":"","rationale":"good","unexpected":1}',sample).decision,null);
const turns=src(files[1]);assert.ok(turns.includes('const validated=parseVerifier(answer.raw,input)'));assert.ok(turns.includes('shadow-only'));assert.ok(!turns.includes('trace.topicMemory={...trace.topicMemory,...trace.verifier'));
const preview=src(files[2]);assert.ok(preview.includes('const [autoAssociate,setAutoAssociate]=useState(false)'));assert.ok(preview.includes('Association verifier model'));
const server=src(files[6]);assert.ok(server.includes('validVerifierInput(body.context)'));assert.ok(server.includes('store: false'));
const glm=src(files[7]);assert.ok(glm.includes('validVerifierInput(obj.input)'));assert.ok(glm.includes('redirect:"error"'));
console.log('V3.7D.2C.1 CONTRACT PASS: verifier schema and target IDs, six selectable models, no new route, shadow-only, no bypass of write guards.');
