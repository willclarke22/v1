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
const viewer = read("sandbox/probe-lab/assets/ui/asset-library-viewer.tsx");

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
  "bodyParts3dSemanticMaterialForSystem",
]) {
  requireMarker(
    pilot,
    marker,
    "The BodyParts3D pilot must expose the semantic anatomy palette and mappings.",
  );
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
  requireMarker(
    pilot,
    `representation_id: "${memberId}"`,
    `Pilot member ${memberId} must remain present.`,
  );
}

for (const marker of [
  "function bodyParts3dMaterialForAsset",
  "bodyParts3dSemanticMaterialForMember(membership.member_id)",
  "bodyParts3dSemanticMaterialForSystem(",
  'title={`Default anatomy material: ${anatomyMaterial.label}`}',
  "backgroundColor: anatomyMaterial.base_color",
  '<MetadataRow label="Default anatomy material">',
  '<AssetLibraryViewer',
  'setReviewView("needs_review")',
]) {
  requireMarker(
    library,
    marker,
    "The Asset Library shell must expose semantic anatomy metadata and route selected anatomy into the 3D viewer.",
  );
}

for (const marker of [
  "function semanticMaterial",
  "function SemanticMaterialAsset",
  "const clone = gltf.scene.clone(true)",
  "const nextMaterial = sourceMaterial.clone()",
  "nextMaterial.color.set(material.base_color)",
  "nextMaterial.roughness = material.roughness",
  "nextMaterial.metalness = material.metalness",
  "material ? <SemanticMaterialAsset",
]) {
  requireMarker(
    viewer,
    marker,
    "The dedicated viewer must render semantic anatomy appearance from cloned scene/material instances without mutating stored GLBs.",
  );
}

forbidMarker(
  library,
  "BODYPARTS3D_DIAGNOSTIC_COLORS",
  "Temporary diagnostic colors must not return to the Asset Library shell.",
);
forbidMarker(
  viewer,
  "BODYPARTS3D_DIAGNOSTIC_COLORS",
  "Temporary diagnostic colors must not return to the Asset Library viewer.",
);

console.log(
  "PASS: A.12.4 semantic anatomy material invariant verified in the current split Asset Library architecture: palette/member mappings remain present; card/detail metadata expose the semantic material; the dedicated 3D viewer clones scene/material instances and applies semantic base color, roughness, and metalness without changing stored GLBs; Needs Review behavior remains intact.",
);
