import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const req=createRequire(import.meta.url);
const ts=req("typescript");
const root=process.cwd();
function source(p){const f=path.join(root,p);assert(fs.existsSync(f),`Missing ${p}`);return fs.readFileSync(f,"utf8")}
const prefix="sandbox/probe-lab/visual-experience/";
const files=["anatomy-assemblies/contract.ts","anatomy-assemblies/build.ts","anatomy-assemblies/storage.server.ts","routes/anatomy-assemblies.ts","ui/orchestration-assembly-studio.tsx","ui/orchestration-lab.tsx","ui/orchestration-anatomy-atlas-viewer.tsx"];
for(const f of files){const text=source(prefix+f),diag=ts.transpileModule(text,{fileName:f,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true}).diagnostics??[];assert(!diag.filter(d=>d.category===ts.DiagnosticCategory.Error).length,`Syntax error in ${f}`)}
function moduleFromTS(p,loader){const output=ts.transpileModule(source(prefix+p),{fileName:p,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function("require","module","exports",output)(loader,m,m.exports);return m.exports}
const contract=moduleFromTS("anatomy-assemblies/contract.ts",req);
const build=moduleFromTS("anatomy-assemblies/build.ts",name=>name==="./contract"?contract:req(name));
assert.equal(contract.ASSEMBLY_PROFILES.length,11);
const fake=(asset_id,label,position)=>({asset_id,member_id:asset_id,label,system:"muscular",group_tags:[],runtime_transform:{position}});
const atlas=[fake("l","left quadriceps",[0,.1,0]),fake("r","right quadriceps",[1,.1,0]),fake("u","quadriceps fascia",[.7,.2,0]),fake("h","skull",[.5,1,0]),fake("n","neck muscle",[.5,.78,0])];
const fingerprint=build.atlasFingerprint(atlas);
const base=build.proposedAssemblies(atlas,{},fingerprint);
const left=base.find(a=>a.profile.id==="lower_left");const right=base.find(a=>a.profile.id==="lower_right");
assert(left.asset_ids.includes("l"));assert(!left.asset_ids.includes("r"));assert(right.asset_ids.includes("r"));assert(!right.asset_ids.includes("l"));
assert(left.unknown_side_candidates>=1,"Unspecified laterality must be surfaced and never guessed");
assert(base.every(a=>a.status==="candidate"),"Never auto-approve proposed assemblies");
const review=contract.emptyReview("lower_left",fingerprint);review.exclude_asset_ids=["l"];review.add_asset_ids=["r"];
const overridden=build.proposedAssemblies(atlas,{lower_left:review},fingerprint).find(a=>a.profile.id==="lower_left");
assert(!overridden.asset_ids.includes("l"));assert(overridden.asset_ids.includes("r"));
review.reviewed=true;review.checks.inventory="pass";review.checks.anatomical_coverage="pass";review.checks.visual_coverage="pass";
assert.equal(build.proposedAssemblies(atlas,{lower_left:review},fingerprint).find(a=>a.profile.id==="lower_left").status,"reviewed");
review.source_fingerprint="old atlas";
assert.equal(build.proposedAssemblies(atlas,{lower_left:review},fingerprint).find(a=>a.profile.id==="lower_left").status,"stale_review");
const route=source(prefix+"routes/anatomy-assemblies.ts"),storage=source(prefix+"anatomy-assemblies/storage.server.ts"),ui=source(prefix+"ui/orchestration-assembly-studio.tsx"),view=source(prefix+"ui/orchestration-anatomy-atlas-viewer.tsx"),orchestration=source(prefix+"ui/orchestration-lab.tsx");
for(const marker of ['verifiedAssets','expected_revision','atlas_fingerprint','asset_id','readAssemblyReviews','writeAssemblyReviews'])assert(route.includes(marker),`Route missing ${marker}`);
assert(storage.includes('process.env.VERCEL')&&storage.includes('writeCloudJson'));
for(const marker of ['Membership editor','Completeness review','Review notes','assemblyPreview','Save review and membership'])assert(ui.includes(marker),`UI missing ${marker}`);
assert(view.includes('if (assemblyPreview && manifest)')&&view.includes('assemblyPreview ? [] : manifest?.assets.slice('));
assert(orchestration.includes('<OrchestrationAssemblyStudio />')&&orchestration.includes('<AnatomyExperienceLab />'));
assert(source('app/api/sandbox/probe-lab/visual-experience/anatomy-assemblies/route.ts').includes('export { GET, POST }'));
console.log('PASS: Assembly Studio V1 contract, lateralization, provenance, explicit reviews, stale source invalidation, route and UI integration.');
