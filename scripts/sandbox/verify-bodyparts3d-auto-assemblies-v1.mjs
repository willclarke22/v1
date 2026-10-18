import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const ts=require('typescript');
const root=process.cwd();
const base=path.join(root,'sandbox/probe-lab/visual-experience/anatomy-assemblies');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'myway-spatial-auto-test-'));
try {
 for (const name of ['contract','spatial-discovery','automatic-spatial']) {
  const input=path.join(base,`${name}.ts`);
  const transformed=ts.transpileModule(fs.readFileSync(input,'utf8'),{
   fileName:input,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,strict:true},
  });
  assert.equal(transformed.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0,name+' syntax errors');
  fs.writeFileSync(path.join(temp,`${name}.js`),transformed.outputText);
 }
 const {generateAutomaticAssemblies}=require(path.join(temp,'automatic-spatial.js'));
 const entries=[];
 const push=(member_id,label,x,y,z,w=.05,h=.1,d=.05)=>entries.push({
  asset_id:`atlas_${member_id.toLowerCase()}`,member_id,label,system:'skeletal',group_tags:[],
  dimensions_m:[w,h,d],runtime_transform:{position:[x,y,z],scale:[1,1,1],rotation:[0,0,0]},
 });
 push('FJ3200','frontal bone',0,1.61,0,.16,.13,.16);push('FJ3289','mandible',0,1.40,.08,.15,.09,.13);
 push('FJ3176','atlas',0,1.29,0);push('FJ3172','seventh cervical vertebra',0,1.07,0);
 push('T01','left first rib',-.16,1.03,0);push('T02','right first rib',.16,1.03,0);
 push('T03','left twelfth rib',-.14,.78,0);push('T04','right twelfth rib',.14,.78,0);
 push('A01','first lumbar vertebra',0,.72,0);push('A02','fifth lumbar vertebra',0,.59,0);
 push('P01','left hip',-.12,.56,0);push('P02','right hip',.12,.56,0);push('P03','sacrum',0,.52,-.05);
 for(const [side,sign] of [['left',-1],['right',1]]){
  const prefix=side==='left'?'L':'R';
  push(prefix+'1',`${side} humerus`,sign*.34,1.00,0,.06,.27,.07);
  push(prefix+'2',`${side} radius`,sign*.41,.75,0,.05,.26,.05);
  push(prefix+'3',`${side} fifth metacarpal bone`,sign*.43,.58,0,.05,.09,.07);
  push(prefix+'4',`${side} femur`,sign*.15,.32,0,.09,.26,.09);
  push(prefix+'5',`${side} tibia`,sign*.16,.13,0,.07,.21,.08);
  push(prefix+'6',`${side} calcaneus`,sign*.16,.035,.03,.08,.09,.1);
 }
 push('FJ2808','thyroid cartilage',0,1.21,.055,.09,.07,.08);
 push('FJ2787','left vocal ligament',-.04,1.215,.055,.02,.01,.04);
 push('FJ333333','unrelated geometry',1.95,1.9,1.7,.02,.03,.02);
 const report=generateAutomaticAssemblies(entries,'fixture_fingerprint');
 assert.equal(report.schema_version,'myway_bodyparts3d_spatial_assemblies_v1');
 assert.equal(report.eligible_count,entries.length);assert.equal(report.bounds_unavailable,0);
 assert.equal(report.assemblies.length,11);
 assert.equal(report.assemblies.every(a=>a.assets.length>0),true,'all 11 regions must have landmarks');
 const byId=new Map(report.assemblies.map(a=>[a.assembly_id,a]));
 for(const a of report.assemblies){
  assert.equal(a.asset_count,a.asset_ids.length);
  assert.deepEqual(a.asset_ids,a.assets.map(e=>e.asset_id));
  assert.equal(new Set(a.asset_ids).size,a.asset_ids.length);
  for(const id of a.asset_ids)assert.ok(entries.some(e=>e.asset_id===id),'no invented member '+id);
  if(a.parent_id){const parent=new Set(byId.get(a.parent_id).asset_ids);for(const id of a.asset_ids)assert.ok(parent.has(id),'child not in parent '+a.assembly_id+' '+id)}
 }
 for(const id of ['upper_left','lower_left'])assert.equal(byId.get(id).assets.some(e=>e.label.startsWith('right ')),false,id+' wrong side');
 for(const id of ['upper_right','lower_right'])assert.equal(byId.get(id).assets.some(e=>e.label.startsWith('left ')),false,id+' wrong side');
 assert.ok(byId.get('head_neck').asset_ids.includes('atlas_fj2808'),'known thyroid cartilage missed');
 assert.ok(!byId.get('head').asset_ids.includes('atlas_fj333333'),'unrelated geometry erroneously included');
 assert.ok(report.unassigned_asset_ids.includes('atlas_fj333333'));
 const noBounds=structuredClone(entries);noBounds[0].dimensions_m=null;
 assert.equal(generateAutomaticAssemblies(noBounds,'fixture').bounds_unavailable,1);
 const ui=fs.readFileSync(path.join(root,'sandbox/probe-lab/visual-experience/ui/orchestration-assembly-studio.tsx'),'utf8');
 const viewer=fs.readFileSync(path.join(root,'sandbox/probe-lab/visual-experience/ui/orchestration-anatomy-atlas-viewer.tsx'),'utf8');
 const route=fs.readFileSync(path.join(root,'sandbox/probe-lab/visual-experience/routes/anatomy-assemblies.ts'),'utf8');
 assert.ok(ui.includes('Copy JSON')&&ui.includes('Download all 11 assemblies'));
 assert.ok(ui.includes('asset_ids:selected.asset_ids')&&ui.includes('assets:selected.assets'));
 assert.ok(viewer.includes('const assemblyTotal = assemblyPreview?.asset_ids.length ?? 0'));
 assert.ok(viewer.includes('const members = manifest.assets.filter(asset => wanted.has(asset.asset_id));'));
 assert.ok(viewer.includes('return members.slice(0, assemblyMountCount)'));
 assert.ok(route.includes('generateAutomaticAssemblies(assets,fingerprint)'));
 console.log('PASS: 11 automatic spatial assemblies, source IDs, parent unions, laterality, AABB gaps and exact manifest/viewer membership.');
} finally {fs.rmSync(temp,{recursive:true,force:true})}
