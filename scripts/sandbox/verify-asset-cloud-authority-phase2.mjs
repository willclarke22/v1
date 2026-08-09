import fs from "node:fs";
import path from "node:path";

const argIndex = process.argv.indexOf("--root");
const root = argIndex >= 0 && process.argv[argIndex + 1]
  ? path.resolve(process.argv[argIndex + 1])
  : process.cwd();

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing Phase 2 file: ${rel}`);
  }
  return fs.readFileSync(file, "utf8");
}

function expect(rel, text, checks) {
  for (const [label, matcher] of checks) {
    const ok = typeof matcher === "string"
      ? text.includes(matcher)
      : matcher.test(text);
    if (!ok) throw new Error(`${rel}: ${label}`);
  }
}

const phase1Temp = read("sandbox/probe-lab/assets/storage/asset-temp-workspace.server.ts");
expect("asset-temp-workspace.server.ts", phase1Temp, [
  ["Phase 1 OS-temp workspace guardrail is missing", "createAssetTempWorkspace"],
]);

const bridgePy = read("sandbox/probe-lab/assets/blender/scripts/myway-blender-bridge.py");
expect("myway-blender-bridge.py", bridgePy, [
  ["Phase 1 BlenderKit temp workspace was lost", 'create_asset_temp_workspace("blenderkit")'],
]);

const jobs = read("sandbox/probe-lab/assets/blender/blender-job-store.server.ts");
expect("blender-job-store.server.ts", jobs, [
  ["Phase 1 terminal job retention was lost", "MYWAY_BLENDER_JOB_HISTORY_LIMIT"],
]);

const durable = read("sandbox/probe-lab/assets/storage/asset-durable-artifacts.server.ts");
expect("asset-durable-artifacts.server.ts", durable, [
  ["embedding R2 namespace missing", "metadata/myway/assets/embeddings/"],
  ["license R2 namespace missing", "metadata/myway/assets/licenses/"],
  ["source-record R2 namespace missing", "metadata/myway/assets/source-records/"],
  ["cloud-first durable reader missing", "readDurableAssetJson"],
  ["durable writer missing", "writeDurableAssetJson"],
  ["runtime R2 upload verifier missing", "uploadRuntimeAssetFile"],
  ["private source archive missing", "archivePrivateAssetSource"],
  ["runtime upload HEAD verification missing", /storage\.exists\([\s\S]*uploaded\.object_key/],
  ["private source HEAD verification missing", /Private R2 source verification failed/],
]);

const enrichment = read("sandbox/probe-lab/assets/enrichment/asset-enrichment-worker.server.ts");
expect("asset-enrichment-worker.server.ts", enrichment, [
  ["Phase 1 remote hydration cleanup missing", 'createAssetTempWorkspace("enrichment")'],
  ["analysis temp workspace missing", 'createAssetTempWorkspace("analysis")'],
  ["analysis runtime R2 namespace missing", "runtime/analysis/"],
  ["analysis publication missing", "publishAnalysisViews"],
  ["embedding durable writer missing", "writeDurableAssetJson"],
  ["analysis cleanup missing", "analysisDestination.cleanup()"],
]);

const ranking = read("sandbox/probe-lab/assets/appearance-ranking.server.ts");
expect("appearance-ranking.server.ts", ranking, [
  ["appearance vectors are not read through durable storage", "readDurableAssetJson"],
]);

const manual = read("sandbox/probe-lab/assets/providers/manual-glb-provider.server.ts");
expect("manual-glb-provider.server.ts", manual, [
  ["manual raw source is not privately archived", "archivePrivateAssetSource"],
  ["manual source/license metadata is not durable", "writeDurableAssetJson"],
  ["verified raw source cleanup missing", /sourceArchive[\s\S]*durableAssetCloudEnabled\(\)[\s\S]*rm\(/],
]);

const blenderkit = read("sandbox/probe-lab/assets/providers/blenderkit-provider.server.ts");
expect("blenderkit-provider.server.ts", blenderkit, [
  ["BlenderKit provenance is not durable", "writeDurableAssetJson"],
]);

const trellis = read("sandbox/probe-lab/assets/providers/trellis-asset-provider.server.ts");
expect("trellis-asset-provider.server.ts", trellis, [
  ["TRELLIS raw source is not privately archived", "archivePrivateAssetSource"],
  ["TRELLIS verified local raw cleanup missing", /sourceArchive[\s\S]*durableAssetCloudEnabled\(\)[\s\S]*rm\(/],
]);

const ambient = read("sandbox/probe-lab/assets/catalog/ambientcg/ambientcg-model-import.server.ts");
expect("ambientcg-model-import.server.ts", ambient, [
  ["ambientCG durable provenance missing", "writeDurableAssetJson"],
  ["ambientCG private source archive missing", "archivePrivateAssetSource"],
]);

const promotion = read("sandbox/probe-lab/assets/asset-promotion.server.ts");
expect("asset-promotion.server.ts", promotion, [
  ["promotion must read license cloud-first", "readDurableAssetJson"],
  ["runtime model upload missing", "runtime/models/"],
  ["runtime thumbnail upload missing", "runtime/thumbnails/"],
  ["analysis publication during promotion missing", "publishAnalysisViews"],
  ["private metadata verification missing", "publishDurableMetadata"],
  ["atomic verified local cleanup flag missing", "removeLocalAfterVerification"],
  ["local metadata mirror cleanup missing", "removeLocalDurableAssetJson"],
]);

const review = read("sandbox/probe-lab/assets/acquisition/missing-asset-review.server.ts");
expect("missing-asset-review.server.ts", review, [
  ["approved acquisitions must archive their source", /archiveSource:\s*true/],
  ["approved acquisitions must clear verified local runtime copies", /removeLocalAfterVerification:\s*true/],
  ["manual review metadata must use durable storage", "writeDurableAssetJson"],
]);

const directPromote = read("sandbox/probe-lab/assets/routes/promote.ts");
expect("routes/promote.ts", directPromote, [
  ["direct promotion must archive source", /archiveSource:\s*true/],
  ["direct promotion must clear verified local copies", /removeLocalAfterVerification:\s*true/],
]);

const foundry = read("sandbox/probe-lab/blender-python-builder/foundry-candidate-store.server.ts");
expect("foundry-candidate-store.server.ts", foundry, [
  ["Foundry runtime candidate namespace missing", "runtime/foundry/candidates/"],
  ["Foundry private candidate namespace missing", "source/foundry/candidates/"],
  ["Foundry candidate metadata is not stored in R2", "metadata/myway/foundry/candidates/"],
  ["local candidate duplication is not controlled by mirror policy", "keepLocalAssetMetadataMirror"],
]);

const library = read("sandbox/probe-lab/assets/asset-library.server.ts");
expect("asset-library.server.ts", library, [
  ["licence/provenance editing is not cloud-first", "writeDurableAssetJson"],
  ["cloud-only embedding reads are not supported by identity maintenance", "previousDurableVector"],
  ["cloud embedding rename cleanup is missing", "durableVectorCopied"],
]);

const maintenance = read("sandbox/probe-lab/assets/asset-maintenance.server.ts");
expect("asset-maintenance.server.ts", maintenance, [
  ["asset removal does not clean durable private metadata", "deleteDurableAssetJson"],
  ["asset removal does not recognize R2 analysis URLs", "runtimeObjectKeyFromPublicUrl"],
]);

const migration = read("sandbox/probe-lab/assets/cloud-library-migration.server.ts");
expect("cloud-library-migration.server.ts", migration, [
  ["historical metadata migration does not use durable cloud helper", "ensureDurableAssetJson"],
  ["historical metadata migration does not read cloud-first", "readDurableAssetJson"],
  ["historical embedding migration is missing", "embedding_archived"],
]);

const storageReadme = read("sandbox/probe-lab/assets/storage/README.md");
expect("storage/README.md", storageReadme, [
  ["Phase 2 storage contract is undocumented", "## Phase 2 durable cloud authority"],
  ["Phase 3 boundary is undocumented", "Phase 3"],
]);

console.log(
  "Phase 2 asset cloud-authority fixture passed: Phase 1 temp/retention guardrails are retained; durable metadata and source archives are private-R2-first; analysis/final runtime artifacts are runtime-R2-first; approved assets can finalize with verified local cleanup; and saved Foundry candidates are cloud-backed without a second local candidate copy by default.",
);
