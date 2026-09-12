import fs from "node:fs";
import path from "node:path";

const rootArgIndex = process.argv.indexOf("--project-root");
const projectRoot = path.resolve(
  rootArgIndex >= 0 && process.argv[rootArgIndex + 1]
    ? process.argv[rootArgIndex + 1]
    : process.cwd(),
);

function read(relative: string) {
  return fs.readFileSync(path.join(projectRoot, relative), "utf8");
}

function requireMarker(source: string, marker: string, message: string) {
  if (!source.includes(marker)) {
    throw new Error(`${message} Missing marker: ${marker}`);
  }
}

function forbidMarker(source: string, marker: string, message: string) {
  if (source.includes(marker)) {
    throw new Error(`${message} Forbidden marker: ${marker}`);
  }
}

const pilot = read("sandbox/probe-lab/assets/bodyparts3d-slp-pilot.ts");
const library = read("sandbox/probe-lab/assets/ui/asset-library-lab.tsx");

for (const marker of [
  'schema_version: "myway_bodyparts3d_semantic_material_v1"',
  'source: "myway_semantic_anatomy_palette_v1"',
  'base_color: "#E2D9BA"',
  'base_color: "#A85B50"',
  'base_color: "#AEC3BB"',
  'base_color: "#D6C8A5"',
  'base_color: "#B98991"',
  'base_color: "#B8916B"',
  'material_class: "muscle"',
  'material_class: "bone"',
  'material_class: "cartilage"',
  'material_class: "ligament"',
  'material_class: "respiratory"',
  'material_class: "digestive"',
  "bodyParts3dSemanticMaterialForMember",
]) {
  requireMarker(pilot, marker, "The BodyParts3D pilot must expose the semantic anatomy palette and member mapping.");
}

for (const memberId of [
  "BP9090",
  "BP8107",
  "BP8836",
  "BP9263",
  "BP7901",
  "BP9249",
  "BP8314",
  "BP9026",
  "BP8188",
  "BP7849",
  "BP9222",
  "BP8636",
]) {
  requireMarker(pilot, `representation_id: "${memberId}"`, `Pilot member ${memberId} must remain present.`);
}

for (const marker of [
  'import {\n  BODYPARTS3D_SLP_COLLECTION_ID,\n  bodyParts3dSemanticMaterialForMember,',
  "function SemanticMaterialAsset",
  "function bodyParts3dMaterialForAsset",
  "<SemanticMaterialAsset src={asset.public_path} material={anatomyMaterial} />",
  "const material = bodyParts3dSemanticMaterialForMember(membership.member_id);",
  "Semantic anatomy",
  "material overrides can replace them later.",
  'title={`Default anatomy material: ${anatomyMaterial.label}`}',
  '<MetadataRow label="Default anatomy material">',
]) {
  requireMarker(library, marker, "The Asset Library must render semantic anatomy materials in Needs Review and collection inspection.");
}

forbidMarker(
  library,
  "BODYPARTS3D_DIAGNOSTIC_COLORS",
  "A.12.4 replaces the temporary diagnostic palette with semantic anatomy materials.",
);

requireMarker(
  library,
  "stored GLBs remain unchanged",
  "The UI must make clear that display materials are runtime defaults rather than baked source changes.",
);
requireMarker(
  library,
  'setReviewView("needs_review")',
  "BodyParts3D assets must continue to land in Needs Review.",
);

console.log("PASS: A.12.4 BodyParts3D semantic anatomy materials verified for Needs Review previews and shared-space inspection.");
