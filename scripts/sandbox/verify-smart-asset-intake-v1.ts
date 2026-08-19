import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const lab = source("sandbox/probe-lab/assets/ui/asset-library-lab.tsx");
const importer = source("sandbox/probe-lab/assets/ui/smart-asset-import-lab.tsx");
const archive = source("sandbox/probe-lab/assets/smart-asset-archive.ts");
const serverIntake = source("sandbox/probe-lab/assets/smart-asset-intake.server.ts");
const smartRoute = source("sandbox/probe-lab/assets/routes/import-smart.ts");
const smartApi = source("app/api/sandbox/probe-lab/assets/import-smart/route.ts");
const localRoute = source("sandbox/probe-lab/assets/routes/import-local.ts");
const manualProvider = source("sandbox/probe-lab/assets/providers/manual-glb-provider.server.ts");
const batch = source("sandbox/probe-lab/assets/manual-glb-batch-intake.ts");
const bundles = source("sandbox/probe-lab/assets/known-asset-bundles.ts");
const enrichment = source("sandbox/probe-lab/assets/enrichment/asset-enrichment-provider.server.ts");
const licenseReview = source("sandbox/probe-lab/assets/licensing/asset-license-review.ts");

assert(
  batch.includes("export const MAX_MANUAL_GLB_BATCH_FILES = 200"),
  "Manual batch cap must be 200.",
);
assert(
  archive.includes("export const MAX_SMART_ASSET_BATCH_FILES = 200") &&
    archive.includes('[".glb", ".gltf", ".fbx", ".obj", ".blend"]'),
  "Smart archive intake must support the five requested model formats with a 200-model cap.",
);
assert(
  importer.includes("Add files") &&
    importer.includes('accept=".glb,.gltf,.fbx,.obj,.blend,.zip"') &&
    importer.includes("Run Omni vision after import") &&
    importer.includes("vision-pending marker") &&
    importer.includes("refuses\n            to guess unresolved licensing"),
  "Unified Import Asset UI markers are missing.",
);
assert(
  lab.includes('manualAcquisitionMode === "import"') &&
    lab.includes("Import Asset") &&
    lab.includes("<SmartAssetImportLab") &&
    !lab.includes("Import CC0 GLB / bundle") &&
    !lab.includes("Import CC BY GLB"),
  "Asset Library must use the unified Import Asset surface instead of separate CC0/CC-BY tabs.",
);
assert(
  lab.includes("◌ vision pending") &&
    lab.includes("⚠ vision failed") &&
    lab.includes("◉ vision ready") &&
    lab.includes('selectedAsset.appearance_profile?.status !==\n                          "ready"'),
  "Needs Review must expose vision status and block approval until vision is ready.",
);
assert(
  localRoute.includes('runVision: formText(formData, "run_vision") !== "false"') &&
    localRoute.includes("vision_queued"),
  "Existing GLB route must honor the vision toggle.",
);
assert(
  manualProvider.includes("runVision?: boolean") &&
    manualProvider.includes("input.runVision === false") &&
    manualProvider.includes("queueAssetEnrichment"),
  "Manual provider must support deferring enrichment without changing normal behavior.",
);
assert(
  smartRoute.includes("materializeArchiveModel") &&
    smartRoute.includes("convertSourceModelToGlb") &&
    smartRoute.includes("GLTF references external files") &&
    smartRoute.includes('runVision: text(form, "run_vision") !== "false"'),
  "Universal import route must preserve archive dependencies, normalize non-GLB formats, and honor vision deferral.",
);
assert(
  smartApi.includes("import") && smartApi.includes("import-smart"),
  "Universal import API wrapper is missing.",
);
assert(
  serverIntake.includes("inflateRawSync") &&
    serverIntake.includes('export_format="GLB"') === false &&
    serverIntake.includes("createNormalizeJob") &&
    serverIntake.includes("runBlenderJob"),
  "Server intake must use the existing Blender normalization bridge.",
);

const manifestEntryCount =
  bundles.match(/^\s*\["[^"]+\.glb", \{"file_name":/gm)?.length ?? 0;
assert(
  bundles.includes("poly_pizza_office_pack_UGIy7YcQP9") &&
    bundles.includes("The Office Pack") &&
    bundles.includes("Adjustable Desk.glb") &&
    bundles.includes("Whiteboard.glb") &&
    manifestEntryCount === 125,
  `Office Pack manifest must contain exactly 125 GLBs; found ${manifestEntryCount}.`,
);
assert(
  bundles.includes('"license_kind": "cc0"') &&
    bundles.includes('"license_kind": "cc_by"') &&
    bundles.includes('"creator_name"') &&
    bundles.includes('"source_asset_id"'),
  "Known bundle manifest must preserve per-model creator, licence, and source identity.",
);
assert(
  licenseReview.includes("POLY_PIZZA_OFFICE_PACK_URL") &&
    licenseReview.includes("isKnownPolyPizzaBundleMemberSource") &&
    licenseReview.includes("Poly Pizza bundle page"),
  "Poly Pizza manual review must recognize the curated Office Pack bundle-member provenance path.",
);
assert(
  enrichment.includes('DEFAULT_ASSET_OMNI_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"') &&
    enrichment.includes('LEGACY_ASSET_VISION_MODEL = "nvidia/nemotron-nano-12b-v2-vl"') &&
    enrichment.includes("chat_template_kwargs: { enable_thinking: false }") &&
    enrichment.includes("max_tokens: 4096") &&
    !enrichment.includes("/no_think"),
  "Asset appearance analysis must default away from legacy 12B to non-thinking Omni.",
);

console.log("Smart Asset Intake v1 verification passed.");
