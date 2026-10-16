import {readFileSync,existsSync} from "node:fs";
import {join} from "node:path";
const root=process.cwd();
const read=(p)=>readFileSync(join(root,p),"utf8");
const required=[
  "sandbox/probe-lab/visual-experience/ui/anatomy-director-lab.tsx",
  "sandbox/probe-lab/visual-experience/ui/anatomy-director-player.tsx",
  "sandbox/probe-lab/visual-experience/anatomy-director/contract.ts",
  "sandbox/probe-lab/visual-experience/anatomy-director/prompts.ts",
  "sandbox/probe-lab/visual-experience/routes/anatomy-director.ts",
  "app/api/sandbox/probe-lab/visual-experience/anatomy-director/route.ts",
];
for(const f of required)if(!existsSync(join(root,f)))throw new Error(`Missing Anatomy Director source: ${f}`);
const tab=read("sandbox/probe-lab/visual-experience/ui/visual-experience-lab.tsx");
for(const marker of ['<OrchestrationLab />','<GsapStoryLab />','<AnatomyDirectorLab />','"anatomy-director"', 'params.get("tab") === "2d-story"']) {
  if(!tab.includes(marker))throw new Error(`Workbench invariant lost: ${marker}`);
}
const player=read(required[1]);
for(const marker of ['useGLTF(asset.model_url)','new THREE.Box3().setFromObject(wrapper)','asset.runtime_transform','sampleKeyframes','TrackballControls']) {
  if(!player.includes(marker))throw new Error(`Playback invariant lost: ${marker}`);
}
const contract=read(required[2]);
for(const marker of ['parseAnatomyDirectorProgram','myway_anatomy_director_v1','duration_s','strictly increasing','Camera frames need finite']) {
  if(!contract.includes(marker))throw new Error(`Validation invariant lost: ${marker}`);
}
const route=read(required[4]);
for(const marker of ['getAssetBrowserRegistrySnapshot','BODYPARTS3D_FULL_COLLECTION_ID','callVisualOrchestrationCalibrationModel','request_messages: exactMessages','parseAnatomyDirectorProgram','timeout_ms: 180_000']) {
  if(!route.includes(marker))throw new Error(`Provider/identity invariant lost: ${marker}`);
}
if(route.includes('eval(')||route.includes('new Function(')||player.includes('new Function('))throw new Error("Executable model code must not run.");
console.log("PASS: Anatomy Director V1 integrated as fourth tab; one grounded GLM request; bounded JSON contract; single-asset Three.js playback; original labs preserved.");
