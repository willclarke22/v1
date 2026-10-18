import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import os from 'node:os';
const require=createRequire(import.meta.url);
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const file='sandbox/probe-lab/assets/search/asset-multiscale-context.ts';
const read=f=>readFileSync(join(process.cwd(),f),'utf8');
const code=read(file),discovery=read('sandbox/probe-lab/visual-experience/anatomy-experience/asset-discovery.server.ts');
const route=read('sandbox/probe-lab/visual-experience/routes/anatomy-experience.ts');
const ui=read('sandbox/probe-lab/visual-experience/ui/anatomy-experience-lab.tsx');
const generator=read('sandbox/probe-lab/visual-experience/anatomy-experience/generate.server.ts');
for(const [source,checks] of [
 [code,['isa_relations','partof_relations','rejected_weak_lexical','shared source ontology class','intentionally NO fill']],
 [discovery,['multiscale_v2','discoverMultiscaleCandidates','reference_checks','rejected_weak_lexical']],
 [route,['multiscale_v2','inspect_discovery','reference_names']],
 [ui,['Weak BM25 discarded','Multiscale retrieval evidence','Reference asset names to check']],
 [generator,['lookGrabSystem','selected_asset_ids','model_calls:1']],
])for(const check of checks)assert(source.includes(check),`Missing contract marker: ${check}`);
for(const [name,source] of [['module',code],['discovery',discovery],['route',route],['ui',ui],['generator',generator]]){
 const t=ts.transpileModule(source,{fileName:name==='ui'?'anatomy-lab.tsx':`${name}.ts`,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
 assert.deepEqual(t.diagnostics??[],[],`TypeScript transpile failure: ${name}`);
}
const tmp=mkdtempSync(join(os.tmpdir(),'myway-multiscale-v2-1-'));
try{
 const compiled=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const cjs=join(tmp,'multiscale.cjs');writeFileSync(cjs,compiled);
 const {Module}=require('node:module');const mod=new Module(cjs);mod.filename=cjs;
 mod.require=id=>id.includes('asset-lexical-search')?{
  normalizeAssetSearchText:value=>value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),
  tokenizeAssetSearchText:value=>value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean)
 }:{};
 mod._compile(compiled,cjs);
 const {discoverMultiscaleCandidates}=mod.exports;
 const doc=(id,name,concept,options={})=>({asset_id:id,canonical_identity:name,display_name:name,
  concept_ids:[concept],concept_names:[name],aliases:[],ontology_1hop_terms:[],semantic_tags:[],...options});
 const docs=[
  doc('left','left palatopharyngeus','palato'),doc('right','right palatopharyngeus','palato'),
  doc('constrictor','left pharyngeal constrictor','constrictor',{ontology_1hop_terms:['muscle of pharynx']}),
  doc('head','pharynx','pharynx'),doc('thyroid','thyroid cartilage','thyroid'),doc('eso','esophagus','eso'),
  doc('shoulder','left infraspinatus muscle','shoulder'),doc('chest','external intercostal muscle','chest')
 ];
 const catalog={concepts:[{concept_id:'palato',name:'palatopharyngeus'},{concept_id:'constrictor',name:'pharyngeal constrictor'},
  {concept_id:'class',name:'muscle of pharynx'},{concept_id:'pharynx',name:'pharynx'}],
  isa_relations:[{child_id:'palato',parent_id:'class',parent_name:'muscle of pharynx'},
    {child_id:'constrictor',parent_id:'class',parent_name:'muscle of pharynx'}],partof_relations:[]};
 const query=(q,n)=>[{asset_id:'left'},{asset_id:'right'},{asset_id:'shoulder'},{asset_id:'chest'},
  {asset_id:'constrictor'},{asset_id:'thyroid'},{asset_id:'eso'}].slice(0,n);
 const result=discoverMultiscaleCandidates({question:'How does palatopharyngeus work during swallowing?',documents:docs,catalog,search:query,limit:250});
 const selected=new Set(result.candidates.map(x=>x.asset_id));
 assert(selected.has('left')&&selected.has('right'),'named anchors must be supplied');
 assert(selected.has('constrictor'),'specific is_a parent should introduce related anatomy');
 assert(selected.has('head'),'derived region name should expose verified region identity');
 assert(!selected.has('shoulder')&&!selected.has('chest'),'unrelated BM25 muscle filler must be excluded');
 assert(!selected.has('thyroid')&&!selected.has('eso'),'benchmark references must not be silently added');
 assert(result.rejected_weak_lexical>=4,'weak BM25 candidates must be reported');
 assert(result.graph_candidates>=1,'graph count must exclude focal anchors');
 assert(result.parent_concepts.some(x=>x.relationship==='is_a classification ancestor'), 'classification must be explicitly labeled');
 assert(result.warnings.some(x=>x.includes('No verified renderable enclosing-region')), 'classification must not become a fake exterior');
 assert(result.candidates.length<250,'unused candidate slots must remain unfilled');
 // Prove true part-of containment remains discoverable, with no hardcoded toe rule.
 const footDocs=[doc('toe','left distal phalanx of great toe','toe'),doc('foot','foot skeleton overview','foot'),doc('neighbor','proximal phalanx of great toe','neighbor')];
 const footCatalog={concepts:[{concept_id:'toe',name:'distal phalanx'},{concept_id:'foot',name:'foot skeleton'},
  {concept_id:'neighbor',name:'proximal phalanx'}],isa_relations:[],partof_relations:[
    {child_id:'toe',parent_id:'foot',parent_name:'foot skeleton'},
    {child_id:'neighbor',parent_id:'foot',parent_name:'foot skeleton'}]};
 const foot=discoverMultiscaleCandidates({question:'Where is the distal phalanx of great toe?',documents:footDocs,catalog:footCatalog,
  search:()=>[{asset_id:'toe'}],limit:10});
 assert(foot.candidates.some(x=>x.asset_id==='foot'),'true enclosing renderable asset should be offered');
 assert(foot.candidates.some(x=>x.asset_id==='neighbor'),'verified part-of siblings should be available');
 assert(foot.parent_concepts.some(x=>x.relationship==='part_of ancestor'&&x.renderable));
 const weak=discoverMultiscaleCandidates({question:'why does that bend?',documents:docs,catalog:null,search:()=>[{asset_id:'shoulder'}],limit:10});
 assert(weak.candidates.length===0,'weak implicit request must not hallucinate confident matches');
 assert(weak.warnings.some(x=>x.includes('intent unresolved')));
}finally{rmSync(tmp,{recursive:true,force:true})}
console.log('PASS: multiscale V2.1 evidence gating, is_a vs part_of, no BM25 filler, true region identity, unmatched implicit query, source-contract/syntax checks');
