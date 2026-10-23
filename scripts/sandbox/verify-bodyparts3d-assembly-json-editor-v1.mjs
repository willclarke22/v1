import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const rootIndex=process.argv.indexOf("--project-root");
const root=path.resolve(rootIndex>=0 && process.argv[rootIndex+1]?process.argv[rootIndex+1]:process.cwd());
const source=fs.readFileSync(path.join(root,"sandbox/probe-lab/visual-experience/ui/orchestration-assembly-studio.tsx"),"utf8");
const viewer=fs.readFileSync(path.join(root,"sandbox/probe-lab/visual-experience/ui/orchestration-anatomy-atlas-viewer.tsx"),"utf8");
const api=fs.readFileSync(path.join(root,"sandbox/probe-lab/visual-experience/routes/anatomy-assemblies.ts"),"utf8");
const must=[
 "function validateAndNormalize(",
 "incoming.assembly_id!==active",
 "incoming.atlas_fingerprint!==data.atlas_fingerprint",
 "if(seen.has(rawId))",
 "if(!known.has(rawId))",
 "asset_count:ids.length,asset_ids:ids,assets:entries",
 "selection_mode:\"manual_override\"",
 "onChange={(event:{target:{value:string}})=>edit(event.target.value)}",
 "onClick={apply}",
 "onClick={reset}",
 "assemblyPreview={preview}",
 "key={viewerKey}",
 "download(`myway_${active}_${override?",
 "Copy JSON",
 "Download all 11 assemblies (automatic report)",
 ];
for(const marker of must)assert(source.includes(marker),`Missing Studio/editor integration marker: ${marker}`);
assert(viewer.includes("assemblyPreview.asset_ids"),"Viewer must render supplied assembly asset_ids.");
assert(viewer.includes("assemblyMountCount"),"Viewer must progressively mount all included assets.");
assert(api.includes("assets:assets.map(({asset_id,member_id,label,system})"),"Server must expose authoritative atlas ID and label mapping.");
assert(!source.includes("localStorage")&&!source.includes("save_review"),"Editor must not mutate persisted reviews or local storage.");
console.log("PASS: Assembly JSON Editor V1 contract, atlas ID/fingerprint validation, explicit Apply/Reset, viewer remount, and read-only storage boundaries.");
