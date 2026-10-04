import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function source(relativePath) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const routePath =
  "sandbox/probe-lab/visual-experience/routes/anatomy-atlas.ts";
const apiPath =
  "app/api/sandbox/probe-lab/visual-experience/anatomy-atlas/route.ts";
const viewerPath =
  "sandbox/probe-lab/visual-experience/ui/orchestration-anatomy-atlas-viewer.tsx";
const labPath =
  "sandbox/probe-lab/visual-experience/ui/orchestration-lab.tsx";

for (const relative of [routePath, apiPath, viewerPath, labPath]) {
  assert(existsSync(join(process.cwd(), relative)), `Missing atlas proof file: ${relative}`);
}

const route = source(routePath);
const api = source(apiPath);
const viewer = source(viewerPath);
const lab = source(labPath);

for (const marker of [
  '"myway_bodyparts3d_atlas_assembly_v1"',
  "getAssetBrowserRegistrySnapshot",
  "BODYPARTS3D_FULL_COLLECTION_ID",
  "BODYPARTS3D_EXPECTED_ELEMENT_COUNT",
  'runtime_collection_space === "glb_y_up_meters"',
  "membership.runtime_transform",
  "bodyParts3dSystemFromGroupTags",
  "browserModelUrl(asset)",
  'route: "visual-experience/anatomy-atlas"',
  "Assembly proof only.",
]) {
  assert(route.includes(marker), `Atlas manifest authority marker missing: ${marker}`);
}

assert(
  route.includes("asset.scene_review_status !== \"rejected\"") &&
    route.includes("asset.semantic_review_status !== \"mismatch\"") &&
    route.includes("asset.safe_to_use_in_sandbox !== false"),
  "Atlas proof route must keep rejected/mismatched/unsafe assets out while retaining the sandbox Needs Review exception.",
);
assert(
  !route.includes("runLexicalAssetSearchBench") &&
    !route.includes("callVisualOrchestrationCalibrationModel") &&
    !route.includes("resolveReviewedAsset"),
  "Atlas assembly must not invoke GLM, search, or reviewed-resolver scoring.",
);

for (const marker of [
  'export { GET } from "@/sandbox/probe-lab/visual-experience/routes/anatomy-atlas"',
  'export const runtime = "nodejs"',
]) {
  assert(api.includes(marker), `Atlas API wrapper marker missing: ${marker}`);
}

for (const marker of [
  "BODYPARTS3D · ATLAS ASSEMBLY PROOF",
  "Reconstruct the human in shared collection space",
  "runtime_transform",
  "Shared atlas space",
  "Landmarks",
  "Skeleton",
  "Muscular",
  "Nervous",
  "Cardiovascular",
  "All anatomy",
  "SAFE_RENDER_LIMIT = 320",
  "Load full preset",
  "Load atlas proof",
  "<Canvas",
  "<OrbitControls",
  "approximateBounds",
  "rootOffset",
  "bodyParts3dSemanticMaterialForSystem",
]) {
  assert(viewer.includes(marker), `Atlas viewer marker missing: ${marker}`);
}

const canvasCount = (viewer.match(/<Canvas\b/g) ?? []).length;
assert(canvasCount === 1, `Atlas assembly proof must own exactly one Canvas; found ${canvasCount}.`);
assert(
  !viewer.includes("<Center") &&
    !viewer.includes("displayScale") &&
    !viewer.includes("2.55 / largestDimension"),
  "Atlas assembly proof must never per-piece center or fit-scale BodyParts3D members.",
);
assert(
  viewer.includes("position={transform.position}") &&
    viewer.includes("rotation={transform.rotation}") &&
    viewer.includes("scale={transform.scale}"),
  "Every atlas mesh must receive its saved collection-space runtime transform.",
);
assert(
  viewer.includes("<group position={[rootOffset.x, rootOffset.y, rootOffset.z]}>"),
  "Only one atlas-root viewing offset may center the assembled collection.",
);
assert(
  !viewer.includes("DirectorShot") &&
    !viewer.includes("motion_program") &&
    !viewer.includes("callVisualOrchestrationCalibrationModel"),
  "Atlas proof must not introduce Director motion or GLM authoring.",
);

for (const marker of [
  'import { OrchestrationAnatomyAtlasViewer } from "./orchestration-anatomy-atlas-viewer";',
  "<OrchestrationAnatomyAtlasViewer />",
  ">Advanced retrieval lab<",
]) {
  assert(lab.includes(marker), `Orchestration Lab atlas marker missing: ${marker}`);
}
assert(
  lab.indexOf("<OrchestrationAnatomyAtlasViewer />") <
    lab.indexOf(">Advanced retrieval lab<"),
  "Atlas assembly proof should remain a first-class visual proof before the collapsed retrieval research lab.",
);

console.log("PASS: BodyParts3D Atlas Assembly Proof V1 verified.");
console.log(
  "MyWay exposes a bounded full-atlas manifest, reconstructs members from saved shared-space transforms in one Canvas, defaults to a landmark proof, keeps larger presets explicitly bounded, and adds no GLM/search/Director authority.",
);
