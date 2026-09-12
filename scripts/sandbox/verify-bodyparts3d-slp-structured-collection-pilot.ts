import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
function read(relative: string) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function requireText(relative: string, markers: string[]) {
  const text = read(relative);
  for (const marker of markers) if (!text.includes(marker)) throw new Error(`${relative} is missing required marker: ${marker}`);
}

requireText("sandbox/probe-lab/assets/bodyparts3d-slp-pilot.ts", [
  'BODYPARTS3D_SLP_COLLECTION_ID = "bodyparts3d_4_0_slp_pilot"',
  'representation_id: "BP9090"',
  'representation_id: "BP9263"',
  'representation_id: "BP7849"',
  'representation_id: "BP9222"',
  'element_file_ids: ["FJ2761"]',
  'element_file_ids: ["FJ3289"]',
  'element_file_ids: ["FJ2772", "FJ3201"]',
  'element_file_ids: ["FJ2747", "FJ2759"]',
]);
requireText("sandbox/probe-lab/assets/routes/bodyparts3d-pilot.ts", [
  'bool(form, "run_vision", false)',
  'bool(form, "run_embedding", false)',
  'normalizationMode: "collection_member"',
  'normalizationMode: "preserve_geometry"',
  'member.element_file_ids',
  'inputPaths,',
]);
requireText("sandbox/probe-lab/assets/blender/scripts/myway-blender-bridge.py", [
  "def normalize_collection_member",
  "def import_obj_components",
  'normalization_mode == "collection_member"',
  'normalization_mode == "preserve_geometry"',
]);
requireText("sandbox/probe-lab/visual-experience/resolve-visual-learning-turn-assets.server.ts", [
  'sandbox_asset_collection_mode === "bodyparts3d_slp_pilot"',
  "This does not approve the asset, verify its identity, or generate an embedding.",
]);
requireText("sandbox/probe-lab/visual-experience/visual-learning-turn-request.ts", [
  'asset_collection_mode?: "bodyparts3d_slp_pilot" | null',
  'available_semantic_assets',
]);
requireText("sandbox/probe-lab/visual-experience/ui/visual-experience-lab.tsx", [
  "SLP anatomy pilot",
  "Use BodyParts3D SLP pilot assets",
]);
requireText("sandbox/probe-lab/assets/blender/blender-job-types.ts", ["input_paths?: string[]"]);
requireText("sandbox/probe-lab/assets/asset-types.ts", ["source_element_ids?: string[]"]);
console.log("PASS: BodyParts3D SLP structured-collection pilot invariants are present, including BP/FMA-to-FJ element resolution.");
