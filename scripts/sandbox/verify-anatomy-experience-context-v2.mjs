import { existsSync,readFileSync,mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const read=p=>{const target=join(process.cwd(),p);assert(existsSync(target),`Missing ${p}`);return readFileSync(target,'utf8')};
const assemble=read('sandbox/probe-lab/visual-experience/anatomy-experience/assemble.server.ts');
const select=read('sandbox/probe-lab/visual-experience/anatomy-experience/context-selection.ts');
const generate=read('sandbox/probe-lab/visual-experience/anatomy-experience/generate.server.ts');
const contract=read('sandbox/probe-lab/visual-experience/anatomy-experience/contract.ts');
const route=read('sandbox/probe-lab/visual-experience/routes/anatomy-experience.ts');
const view=read('sandbox/probe-lab/visual-experience/ui/anatomy-experience-lab.tsx');
for(const marker of ['chooseBalancedAnatomyContext','breadthFirstParents','specific ontology sibling','atlas_cache_hit','context_role_counts','selected_evidence','spatial_quality','runSemanticAssetSearchServingV2','safe_to_use_in_sandbox','getPreparedAssetSearchCorpus'])assert(assemble.includes(marker),`V2 retrieval missing ${marker}`);
for(const marker of ['context_role:a.context_role','OPENAI_API_KEY','z-ai/glm-5.3','Keep useful landmarks'])assert(generate.includes(marker),`Generation bridge changed unexpectedly: ${marker}`);
assert(contract.includes('context_role?: "focal"'), 'Context role typing missing');
assert(route.includes('inspect_only===true')&&route.includes('assembleAnatomyContext(question,false)'), 'Preview must avoid model and embedding calls');
for(const marker of ['Inspect anatomy context · no model call','contextPreview','selected_evidence','atlas_cache_hit','Generate anatomy experience','gpt-6.1-sol','z-ai/glm-5.3'])assert(view.includes(marker),`Context UI missing ${marker}`);
assert(!view.includes('new Function('),'Model-authored JS execution forbidden');
// Run the actual pure selection implementation against adversarial and diverse fixtures.
const require=createRequire(import.meta.url);
let ts;
try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const compile=ts.transpileModule(select,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert(!(compile.diagnostics??[]).length,'Context selector TS parse diagnostics');
const dir=mkdtempSync(join(os.tmpdir(),'myway-v2-test-'));
try {
 const temp=join(dir,'selection.cjs');writeFileSync(temp,compile.outputText);
 const {chooseBalancedAnatomyContext}=require(temp);
 const sample=[...Array.from({length:40},(_,i)=>({asset_id:`muscle-${i}`,label:'Related muscle',system:'muscular',score:90-i,reasons:['bm25'],focal:i===0})),...Array.from({length:16},(_,i)=>({asset_id:`bone-${i}`,label:'Landmark',system:'skeletal',score:32-i,reasons:['location'],focal:false})),...Array.from({length:13},(_,i)=>({asset_id:`soft-${i}`,label:'Tissue',system:'connective',score:18-i,reasons:['context'],focal:false}))];
 const first=chooseBalancedAnatomyContext(sample,50);
 assert.equal(first.selected.length,50);assert.equal(first.selected[0].asset_id,'muscle-0');
 assert(first.selected_counts.orientation>=14,'Must reserve landmarks despite high-score muscle dominance');
 assert(first.selected_counts.environment>=12,'Must reserve environment candidates');
 assert.equal(new Set(first.selected.map(a=>a.asset_id)).size,50,'No repeated assets');
 const same=chooseBalancedAnatomyContext([...sample].reverse(),50);
 assert.deepEqual(same.selected.map(a=>a.asset_id),first.selected.map(a=>a.asset_id),'Results must be order-independent');
 const small=chooseBalancedAnatomyContext(sample.filter(a=>a.system==='muscular'),20);
 assert.equal(small.selected.length,20,'Must gracefully fill missing role quotas');
 assert.equal(small.selected_counts.orientation,0);
}finally{rmSync(dir,{recursive:true,force:true})}
console.log('PASS: V2 balanced selection, no-model preview, verified asset grounding, and GPT-6/GLM compatibility');
