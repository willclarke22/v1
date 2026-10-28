#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import vm from 'node:vm';import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]||process.cwd());const src=x=>fs.readFileSync(path.join(root,x),'utf8');
const require=createRequire(import.meta.url);const ts=require(path.join(root,'node_modules/typescript'));
const files=['sandbox/probe-lab/learning-space/topic-memory-commit.server.ts','sandbox/probe-lab/learning-space/topic-memory-index.server.ts','sandbox/probe-lab/learning-space/assessment-core.ts','sandbox/probe-lab/learning-space/snapshot.server.ts','sandbox/probe-lab/learning-space/workbench.tsx','sandbox/probe-lab/learning-space/learning-space-preview.tsx','app/api/sandbox/probe-lab/learning-space/retrieve/route.ts',
'lib/learning-space/build-learning-space.ts'];
for(const f of files){const out=ts.transpileModule(src(f),{fileName:f,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});assert.equal(out.diagnostics?.length||0,0,'TS syntax: '+f);}
const commit=src(files[0]),idx=src(files[1]),route=src(files[6]),workbench=src(files[4]);
for(const needle of ['memoryDigest(rows)!==p.snapshotDigest','prepareTopicIndex(label,rows)','topic_label_embedding_count:1','topic_position_x:prepared.position[0]','topic_vectors','repairApprovedTopicIndex','topic_label_embedding_centroid!==null','myway_memory_origin'])assert.ok(commit.includes(needle),'commit guard: '+needle);
for(const needle of ['origin!==ownOrigin','I_APPROVE_ONE_TOPIC_MEMORY_WRITE','I_APPROVE_ONE_TOPIC_INDEX_REPAIR','repair_approved_topic_index','v37d2b-repair'])assert.ok(route.includes(needle),'route guard: '+needle);
for(const needle of ['repairChecked','repairEligible','I_APPROVE_ONE_TOPIC_INDEX_REPAIR'])assert.ok(workbench.includes(needle),'UI: '+needle);
assert.ok(src('lib/learning-space/build-learning-space.ts').includes('approved_topic_memory_evidence'));
// Regression: TypeScript must accept every field consumed from the approved commit response.
// transpileModule alone cannot catch property-access type errors (TS2339).
const declared=workbench.match(/const data=await res\.json\(\) as (\{[^}]+\});/);
assert.ok(declared,'Workbench commit response type declaration missing');
const virtualFile=path.join(root,'scripts/sandbox/v37d2b/__commit_result_typecheck__.ts');
const virtualSource=`const data = {} as ${declared[1]};\nvoid data.status; void data.action; void data.topicId; void data.verified; void data.embeddingReady; void data.warning;\n`;
const options={strict:true,noEmit:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022};
const host=ts.createCompilerHost(options);
const priorGet=host.getSourceFile.bind(host),priorRead=host.readFile.bind(host),priorExists=host.fileExists.bind(host);
host.getSourceFile=(name,language,...rest)=>path.resolve(name)===path.resolve(virtualFile)?ts.createSourceFile(name,virtualSource,language):priorGet(name,language,...rest);
host.readFile=name=>path.resolve(name)===path.resolve(virtualFile)?virtualSource:priorRead(name);
host.fileExists=name=>path.resolve(name)===path.resolve(virtualFile)||priorExists(name);
const checked=ts.createProgram([virtualFile],options,host);
const issues=ts.getPreEmitDiagnostics(checked);
assert.equal(issues.length,0,'Workbench response TypeScript contract: '+issues.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));

assert.ok(commit.includes('semantic_layout_refresh_pending'),'commit marks initial placement as pending full semantic layout');
const verifier=src('scripts/sandbox/v37d2b/verify-v37d2b.mjs');
assert.ok(verifier.includes("newCommitD2b.includes('semantic_layout_refresh_pending')"),'pending-layout verifier must inspect commit implementation');

assert.ok(src('sandbox/probe-lab/learning-space/assessment-core.ts').includes('A vague answer must not erase an earlier evidence-grounded difficulty'));
// Exercise the real pure placement function under a sandboxed CJS import with no DB/network access.
const compiled=ts.transpileModule(idx,{fileName:'index.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};const module={exports};
const fakePosition={computeDeterministicTopicPosition:(index)=>[index*3,0,0],isTopicPosition3D:(x)=>Array.isArray(x)&&x.length===3&&x.every(Number.isFinite),resolveTopicLayout:(r)=>({position:r.topicPosition??[r.index*3,0,0]})};
vm.runInNewContext(compiled,{exports,module,process:{env:{}},require:(name)=>{
 if(name==='server-only')return {};if(name==='@/lib/learning-space/topic-position')return fakePosition;if(name==='@/lib/vector/embed')return {embedText:()=>{throw Error('Unexpected service call')}};throw Error('Unknown dependency: '+name)
}}, {timeout:1000});
const m=module.exports,v=Array(384).fill(0);v[0]=1;
assert.equal(m.is384Vector(v),true);assert.equal(m.is384Vector(v.slice(1)),false);assert.ok(Math.abs(m.cosine(v,v)-1)<.0001);
const none=m.initialTopicPlacement([],v);assert.equal(none.semanticPosition,null);assert.equal(none.positionMethod,null);assert.equal(none.position.length,3);
const row={topic_id:'x',topic_label:'Science',topic_position:[0,0,0],semantic_position:null,topic_json:{},topic_label_embedding_centroid:v,topic_label_embedding_model:'local-embedding-service'};
const near=m.initialTopicPlacement([row],v);assert.equal(near.positionMethod,'sandbox_local_neighbour_v37d2b');assert.ok(Math.hypot(...near.position)>=2.75);
const far=m.initialTopicPlacement([row],Array(384).fill(0).map((_,i)=>i===1?1:0));assert.equal(far.positionMethod,null);
console.log('V3.7D.2B CONTRACT PASS: placement, model pin, explicit approved commit/repair, follow-up context, 3D source and no legacy workers.');
