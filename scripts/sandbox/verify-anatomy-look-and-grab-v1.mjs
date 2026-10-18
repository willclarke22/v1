import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import os from 'node:os';
const req=createRequire(import.meta.url);
let ts;try{ts=req('typescript')}catch{ts=req('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const read=p=>readFileSync(join(process.cwd(),p),'utf8');
const file='sandbox/probe-lab/visual-experience/anatomy-experience/asset-discovery.server.ts';
const source=read(file);
const lexical=read('sandbox/probe-lab/assets/search/asset-lexical-search.ts');
const generator=read('sandbox/probe-lab/visual-experience/anatomy-experience/generate.server.ts');
const route=read('sandbox/probe-lab/visual-experience/routes/anatomy-experience.ts');
const ui=read('sandbox/probe-lab/visual-experience/ui/anatomy-experience-lab.tsx');
for(const [s,markers] of [[source,['getPreparedAssetSearchCorpus','getAssetBrowserRegistrySnapshot','LOOK_GRAB_SEARCH_LIMIT = 250','compactLookGrabRecord','validateLookGrabSelection','reportUnmetLookGrabNeeds','safe_to_use_in_sandbox']],[generator,['discoveryMode','prepareLookGrabDiscovery','selected_asset_ids','validateLookGrabSelection','unmet_visual_needs','model_calls:1','z-ai/glm-5.3','gpt-6.1-sol']],[route,['inspect_discovery','discovery_mode','inspect_only===true']],[ui,['full_catalog','search_assisted','Inspect discovery inventory · no model call','contextPreview','gpt-6.1-sol','z-ai/glm-5.3']],[lexical,['maxResults = 20','Math.min(300, Math.round(maxResults), Math.round(limit))']]])for(const x of markers)assert(s.includes(x),`Missing integration marker: ${x}`);
// Regression guard for the failed V1 installation: JSX referenced two undeclared React state hooks.
assert.match(ui,/const\s*\[discoveryMode\s*,\s*setDiscoveryMode\]\s*=\s*useState\s*</, 'Discovery mode state must be declared');
assert.match(ui,/const\s*\[discoveryPreview\s*,\s*setDiscoveryPreview\]\s*=\s*useState\s*</, 'Discovery preview state must be declared');
assert.match(ui,/sample\s*:\s*Array\s*<\s*\{\s*id\s*:\s*string\s*;\s*name\s*:\s*string\s*;\s*system\s*:\s*string/, 'Discovery sample must be typed to avoid an implicit-any map callback');
for(const [name,s] of [['discovery',source],['search',lexical],['generate',generator],['route',route],['ui',ui]]){
 const result=ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
 assert.equal(result.diagnostics?.length??0,0,`Syntax error in ${name}`);
}
// Execute the pure selection functions through a CommonJS module with substituted imports.
const dir=mkdtempSync(join(os.tmpdir(),'myway-lookgrab-'));
try{
 const transpiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const cjs=join(dir,'discovery.cjs');writeFileSync(cjs,transpiled);
 const Module=req('node:module');const module=new Module(cjs);
 module.filename=cjs;module.paths=[];
 module.require=(id)=>{
  if(id.includes('bodyparts3d-slp-pilot'))return {BODYPARTS3D_FULL_COLLECTION_ID:'bodyparts3d_4_0_full_atlas',bodyParts3dSystemFromGroupTags:()=> 'muscular'};
  if(id.includes('asset-lexical-search'))return {normalizeAssetSearchText:(x)=>x.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()};
  return {};
 };
 module._compile(transpiled,cjs);
 const {makeLookGrabEntries,compactLookGrabRecord,validateLookGrabSelection,reportUnmetLookGrabNeeds,isLookGrabAtlasAsset}=module.exports;
 const fake=(id,name)=>({asset_id:id,canonical_label:name,display_name:name,asset_type:'glb',status:'ready',public_path:'https://example.com/file.glb',scene_review_status:'approved',semantic_review_status:'approved',safe_to_use_in_sandbox:true,collection_membership:{collection_id:'bodyparts3d_4_0_full_atlas',runtime_collection_space:'glb_y_up_meters',group_tags:['system:muscular'],member_id:id,concept_name:name,runtime_transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}}});
 const assets=[fake('c','Soft palate'),fake('a','Left palatopharyngeus'),fake('b','Right palatopharyngeus')];
 const records=makeLookGrabEntries(assets,[]);
 assert.deepEqual(records.map(a=>a.asset_id),['a','b','c']);
 assert.deepEqual(records.map(a=>a.short_id),['A0001','A0002','A0003']);
 assert.deepEqual(compactLookGrabRecord(records[0]).slice(0,2),['A0001','Left palatopharyngeus']);
 const output={selected_asset_ids:['A0001','A0003'],unmet_visual_needs:['Right palatopharyngeus','unavailable valve'],steps:[{visible_asset_ids:['A0001','A0003'],highlighted_asset_ids:['A0001'],title:'show'}]};
 const actual=validateLookGrabSelection(output,records);
 assert.deepEqual(actual.selected_ids,['a','c']);
 assert.deepEqual(actual.plan_raw.steps[0].visible_asset_ids,['a','c']);
 assert.equal(actual.plan_raw.steps[0].highlighted_asset_ids[0],'a');
 const gaps=reportUnmetLookGrabNeeds(actual.unmet_visual_needs,records,new Set(['a','c']));
 assert.equal(gaps[0].status,'not_retrieved');assert.equal(gaps[1].status,'no_exact_name_match_not_proof_of_absence');
 assert.throws(()=>validateLookGrabSelection({...output,selected_asset_ids:['fake']},records),/invalid/);
 assert.throws(()=>validateLookGrabSelection({...output,steps:[{visible_asset_ids:['A0002'],highlighted_asset_ids:[]}]},records),/unselected/);
 assert.throws(()=>validateLookGrabSelection({...output,selected_asset_ids:Array(101).fill('A0001')},records),/1–100/);
 assert.equal(isLookGrabAtlasAsset(assets[0]),true);
 assert.equal(isLookGrabAtlasAsset({...assets[0],semantic_review_status:'mismatch'}),false);
 assert.equal(isLookGrabAtlasAsset({...assets[0],safe_to_use_in_sandbox:false}),false);
}finally{rmSync(dir,{recursive:true,force:true})}
console.log('PASS: Look-and-Grab stable IDs, inventory format, strict binding, gap diagnostics, no-model preview, one-call integration, syntax');
