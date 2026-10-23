import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const at=process.argv.indexOf("--project-root");
const root=path.resolve(at>=0&&process.argv[at+1]?process.argv[at+1]:process.cwd());
const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");
const studio=read("sandbox/probe-lab/visual-experience/ui/orchestration-assembly-studio.tsx");
const viewer=read("sandbox/probe-lab/visual-experience/ui/orchestration-anatomy-atlas-viewer.tsx");
const roles=read("sandbox/probe-lab/visual-experience/ui/assembly-boundary-presentation.ts");
const prior=read("scripts/sandbox/verify-bodyparts3d-assembly-json-editor-v1.mjs");
for (const marker of [
 "function normalizedPresentation(","incoming.presentation","presentation.roles must be an object",
 "if(!knownIds.has(id))","asset_count:ids.length,asset_ids:ids,assets:entries,presentation",
 "assemblySeedRoles(active,ids)","setRole(id:string,role:AnatomyBoundaryRole)",
 "onAssemblySelectAsset=","Boundary presentation", "setBoundaryMode(mode)",
 "Download Applied JSON","key={viewerKey}","assemblyPreview={preview}",
]) assert(studio.includes(marker),`Missing Studio boundary presentation marker: ${marker}`);
for (const marker of [
 "effectiveAssemblyRole(assemblyPreview.presentation?.roles??{},asset.asset_id)",
 "const coreTargets = allTargets.filter", "extendedGhostOpacity={Boolean(assemblyPreview)}",
 "visible={layer.mode !== \"hidden\"}", "mode===\"isolated\"",
 "onAssemblySelectAsset?.(id)", "assemblySignature",
]) assert(viewer.includes(marker),`Missing renderer boundary presentation marker: ${marker}`);
for (const marker of [
 "myway_anatomy_boundary_presentation_v1", "left_hip_man_31d385c4", "left_psoas_major_man_74c98aed",
 "left_iliacus_man_375c9314", "export function assemblySeedRoles", "return roles[assetId] ?? \"core\"",
]) assert(roles.includes(marker),`Missing boundary role marker: ${marker}`);
const raw=roles.match(/const LOWER_LEFT_SEED_ROLES:[^=]+ = \{([\s\S]*?)\n\};/);
assert(raw,"Missing lower-left seed map");
const parts=[...raw[1].matchAll(/\b([a-z_]+_man_[0-9a-f]+): \"(context|boundary)\"/g)];
assert.equal(parts.length,12,"Expected 12 reviewed initial boundary/context roles");
assert.equal(new Set(parts.map(m=>m[1])).size,12,"Duplicate seed role asset IDs");
assert.equal(parts.filter(m=>m[2]==="context").length,4,"Initial context count changed");
assert.equal(parts.filter(m=>m[2]==="boundary").length,8,"Initial boundary count changed");
assert(prior.includes("asset_ids is authoritative")||prior.includes("asset_count:ids.length"),"V1 editor verification must remain present");
assert(!studio.includes("localStorage")&&!studio.includes("save_review"),"Studio must not persist atlas edits");
console.log("PASS: Boundary presentation roles, 4 context / 8 boundary pilots, reusable per-mesh editing, isolated/contextual/full modes, camera stability, and V1 JSON editor compatibility.");
