import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const root=process.cwd();
const prefix='sandbox/probe-lab/visual-experience/';
function src(relative){return fs.readFileSync(path.join(root,relative),'utf8')}
function compiled(relative){const text=src(prefix+relative);const result=ts.transpileModule(text,{fileName:relative,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});const errors=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);assert.equal(errors.length,0,`Syntax diagnostics in ${relative}: ${errors.map(d=>d.messageText)}`);return result.outputText}
function load(relative,imports){const module={exports:{}};new Function('require','module','exports',compiled(relative))((name)=>imports[name]??require(name),module,module.exports);return module.exports}
// Prevent the relative-import regression: transpileModule erases type-only imports,
// so fixture tests alone cannot detect a broken TypeScript dependency path.
for (const rel of [
 'anatomy-assemblies/build.ts',
 'anatomy-assemblies/contract.ts',
 'routes/anatomy-assemblies.ts',
 'ui/orchestration-assembly-studio.tsx',
 'ui/orchestration-anatomy-atlas-viewer.tsx',
]) {
 const fromFile=path.join(root,prefix,rel);
 const source=fs.readFileSync(fromFile,'utf8');
 for(const match of source.matchAll(/\bfrom\s*["'](\.[^"']+)["']/g)) {
  const stem=path.resolve(path.dirname(fromFile),match[1]);
  assert(
   [stem+'.ts',stem+'.tsx',stem+'.js',stem+'.mjs',path.join(stem,'index.ts'),path.join(stem,'index.tsx')]
    .some(candidate=>fs.existsSync(candidate)),
   `Unresolved relative import in ${rel}: ${match[1]}`,
  );
 }
}
const contract=load('anatomy-assemblies/contract.ts',{});
const build=load('anatomy-assemblies/build.ts',{'./contract':contract});
for(const part of ['routes/anatomy-assemblies.ts','ui/orchestration-assembly-studio.tsx','ui/orchestration-anatomy-atlas-viewer.tsx'])compiled(part);
assert.equal(contract.ASSEMBLY_PROFILES.length,11);
const concept=(concept_id,name,element_ids=[])=>({concept_id,name,element_ids,tree_sources:['part_of'],representation_id:null});
const rel=(parent_id,child_id)=>({parent_id,child_id,parent_name:'',child_name:''});
const catalog={schema_version:'myway_bodyparts3d_full_catalog_v1',elements:[],concepts:[
 concept('head','Head'),concept('neck','Neck'),concept('leg','Lower limb'),concept('ll','Left lower limb'),concept('rl','Right lower limb'),
 concept('kneeL','Patella of left lower limb',['FJ0001']),concept('kneeR','Patella of right lower limb',['FJ0002']),
 concept('unnamedL','Patellar tendon',['FJ0003']),concept('unk','Tendon',['FJ0004']),concept('headChild','Cranial bone',['FJ0005']),concept('neckChild','Larynx',['FJ0006']),
 concept('skeletal','Skeletal system'),concept('misclassified','Bone',['FJ0007'])],
 partof_relations:[rel('leg','ll'),rel('leg','rl'),rel('ll','kneeL'),rel('rl','kneeR'),rel('ll','unnamedL'),rel('leg','unk'),rel('head','headChild'),rel('neck','neckChild')],
 isa_relations:[rel('head','misclassified')]
};
const asset=(member_id,label)=>({asset_id:member_id,member_id,label,system:'skeletal',group_tags:[],runtime_transform:{position:[0,0,0]}});
const assets=[asset('FJ0001','patella'),asset('FJ0002','patella'),asset('FJ0003','tendon'),asset('FJ0004','tendon'),asset('FJ0005','bone'),asset('FJ0006','larynx'),asset('FJ0007','skeletal element'),asset('FJ0008','unmapped')];
const f=build.atlasFingerprint(assets,catalog);let assemblies=build.proposedAssemblies(assets,{},catalog,f);
const get=(id)=>assemblies.find(a=>a.profile.id===id);
assert(get('head_neck').asset_ids.includes('FJ0005')&&get('head_neck').asset_ids.includes('FJ0006'));
assert(!get('head').asset_ids.includes('FJ0007'),'is-a classification must not become regional membership');
assert.deepEqual(get('lower_left').asset_ids.sort(),['FJ0001','FJ0003']);
assert.deepEqual(get('lower_right').asset_ids,['FJ0002']);
assert.equal(get('lower_left').unknown_side_candidates,1);
assert.equal(get('lower_right').unknown_side_candidates,1);
assert(!get('lower_left').asset_ids.includes('FJ0002'));
assert(get('lower_left').inventory.evidence.FJ0003.includes('Patellar tendon'));
assert(!get('head_neck').asset_ids.includes('FJ0008'));
assert(assemblies.every(a=>a.status==='candidate'));
const review=contract.emptyReview('lower_left',f);review.checks.inventory='pass';review.checks.anatomical_coverage='pass';review.checks.visual_coverage='pass';review.reviewed=true;
assemblies=build.proposedAssemblies(assets,{lower_left:review},catalog,f);
assert.equal(assemblies.find(a=>a.profile.id==='lower_left').status,'reviewed');
let changed=structuredClone(catalog);changed.partof_relations.push(rel('head','misclassified'));
const next=build.atlasFingerprint(assets,changed);assert.notEqual(f,next);
assert.equal(build.proposedAssemblies(assets,{lower_left:review},changed,next).find(a=>a.profile.id==='lower_left').status,'stale_review');
assert.equal(build.proposedAssemblies(assets,{lower_left:review},changed,next).find(a=>a.profile.id==='lower_left').review.checks.inventory,'unreviewed');
assert(build.proposedAssemblies(assets,{},null).every(a=>a.inventory.ontology_unavailable&&a.asset_ids.length===0),'Never fall back to coordinate guesses when ontology missing');
const route=src(prefix+'routes/anatomy-assemblies.ts'),ui=src(prefix+'ui/orchestration-assembly-studio.tsx'),viewer=src(prefix+'ui/orchestration-anatomy-atlas-viewer.tsx');
for(const marker of ['readBodyParts3dFullCatalog','unassigned_asset_ids','atlasFingerprint(assets,catalog)','expected_revision'])assert(route.includes(marker),`Route missing ${marker}`);
for(const marker of ['Assembly Studio','role="tablist"','Membership','coverage','review','OrchestrationAnatomyAtlasViewer'])assert(ui.includes(marker),`UI missing ${marker}`);
for(const marker of ['assemblySampleLimited','Load all {assemblyTotal} members','assemblyPreview ? "minmax(0, 1fr)"'])assert(viewer.includes(marker),`Viewer missing ${marker}`);
assert(src(prefix+'ui/orchestration-lab.tsx').includes('<OrchestrationAssemblyStudio />'));
console.log('PASS V2: ontology part-of membership, classification exclusion, inherited laterality, unassigned audit, stale reviews, missing ontology safety, simplified UI and full-loading control.');
