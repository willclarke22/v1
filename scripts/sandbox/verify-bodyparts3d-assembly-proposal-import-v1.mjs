import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = process.cwd();
const sourcePath = path.join(root, "sandbox/probe-lab/visual-experience/anatomy-assemblies/assembly-proposal.ts");
const studioPath = path.join(root, "sandbox/probe-lab/visual-experience/ui/orchestration-assembly-studio.tsx");
const routePath = path.join(root, "sandbox/probe-lab/visual-experience/routes/anatomy-assemblies.ts");
for (const f of [sourcePath,studioPath,routePath]) assert(fs.existsSync(f), `Missing required source: ${f}`);
const source=fs.readFileSync(sourcePath,"utf8"),studio=fs.readFileSync(studioPath,"utf8"),route=fs.readFileSync(routePath,"utf8");
for(const key of ["validateAssemblyProposal", "stageAssets", "stageExclusion", "Import proposal JSON", "Export atlas JSON", "Export this assembly + all unselected assets", "Save membership & review", "classification_supported", "name_review"])
 assert(studio.includes(key)||source.includes(key),`Missing UI/contract behavior ${key}`);
assert(route.includes('body.action!=="save_review"'),"Proposed corrections must reuse the guarded save_review API; no new unreviewed server write action.");
assert(!studio.includes('fetch("/api/sandbox/probe-lab/visual-experience/anatomy-assemblies",{method:"POST"') || studio.includes('action:"save_review"'),"Unexpected API write.");
const {outputText,diagnostics}=ts.transpileModule(source,{fileName:sourcePath,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}});
assert(!diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error),"Proposal parser has TypeScript errors.");
const module={exports:{}};
new Function("module","exports","require",outputText)(module,module.exports,require);
const {validateAssemblyProposal,ASSEMBLY_PROPOSAL_SCHEMA}=module.exports;
assert.equal(ASSEMBLY_PROPOSAL_SCHEMA,"myway_bodyparts3d_assembly_membership_proposal_v1");
const assets=[{asset_id:"mesh_alpha",member_id:"FJ0001"},{asset_id:"mesh_beta",member_id:"FJ0002"}];
const good={schema_version:ASSEMBLY_PROPOSAL_SCHEMA,generated_from:{atlas_fingerprint:"fingerprint",eligible_element_count:2,catalog_sha256:"a".repeat(64)},
 proposals:[{assembly_id:"neck",assembly_label:"Neck",baseline_member_count:1,recommended_additions:[{asset_id:"mesh_beta",member_id:"FJ0002",label:"vocalis",system:"muscular",confidence:"classification_supported",evidence_type:"bodyparts3d_is_a_regional_class",evidence:"muscle of neck (FMA9617)",human_review_required:true}],proposed_exclusions:[]}]};
function validate(value){return validateAssemblyProposal(value,"fingerprint",assets,["neck"])}
assert.equal(validate(good).proposals[0].recommended_additions[0].asset_id,"mesh_beta");
assert.throws(()=>validate({...good,generated_from:{...good.generated_from,atlas_fingerprint:"stale"}}),/fingerprint/);
assert.throws(()=>validate({...good,proposals:[{...good.proposals[0],recommended_additions:[{...good.proposals[0].recommended_additions[0],member_id:"FJ9999"}]}]}),/mismatched/);
assert.throws(()=>validate({...good,proposals:[{...good.proposals[0],recommended_additions:[...good.proposals[0].recommended_additions,...good.proposals[0].recommended_additions]}]}),/duplicate/);
assert.throws(()=>validate({...good,proposals:[{...good.proposals[0],proposed_exclusions:["mesh_beta"]}]}),/contradictory/);
assert.throws(()=>validate({...good,proposals:[{...good.proposals[0],recommended_additions:[{...good.proposals[0].recommended_additions[0],confidence:"certainty"}]}]}),/evidence/);
assert.throws(()=>validate({...good,proposals:[{...good.proposals[0],recommended_additions:[{...good.proposals[0].recommended_additions[0],human_review_required:false}]}]}),/evidence/);
console.log("PASS: Assembly proposal import validates exact asset identities, stale inventories, duplicate/conflicting decisions, and review-only evidence.");
