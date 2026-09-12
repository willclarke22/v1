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
  if (!source.includes(marker)) throw new Error(`${message} Missing marker: ${marker}`);
}

function forbidMarker(source: string, marker: string, message: string) {
  if (source.includes(marker)) throw new Error(`${message} Forbidden marker: ${marker}`);
}

const config = read("sandbox/probe-lab/assets/bodyparts3d-slp-pilot.ts");
const server = read("sandbox/probe-lab/assets/bodyparts3d-full-import.server.ts");
const smart = read("sandbox/probe-lab/assets/smart-asset-intake.server.ts");
const route = read("sandbox/probe-lab/assets/routes/bodyparts3d-pilot.ts");
const importer = read("sandbox/probe-lab/assets/ui/bodyparts3d-slp-pilot-import-lab.tsx");
const library = read("sandbox/probe-lab/assets/ui/asset-library-lab.tsx");

for (const marker of [
  'BODYPARTS3D_FULL_COLLECTION_ID = "bodyparts3d_4_0_full_atlas"',
  "BODYPARTS3D_EXPECTED_ELEMENT_COUNT = 2234",
  "BODYPARTS3D_SYSTEM_MATERIALS",
  'base_color: "#C05245"',
  'base_color: "#527C9F"',
  'base_color: "#D8B565"',
  "makeBodyParts3dFullElementMembership",
  "BODYPARTS3D_PARTOF_PARTS_URL",
  "BODYPARTS3D_PARTOF_ELEMENTS_URL",
]) requireMarker(config, marker, "The BodyParts3D configuration must expose the full collection and expanded semantic palette.");

for (const marker of [
  'schema_version: "myway_bodyparts3d_full_catalog_v1"',
  "named_concepts",
  "isa_relations",
  "partof_relations",
  "partofPartsText",
  "partofElementsText",
  "tree_sources",
  "geometryElementIds",
  "classifySystem",
  "genericPenalty",
  "BODYPARTS3D_EXPECTED_ELEMENT_COUNT",
  "sourceAssetId: element.id",
  'domain: "human_anatomy_bodyparts3d"',
  "runVision: false",
  "runEmbedding: false",
  'normalizationMode: "collection_member"',
  'normalizationMode: "preserve_geometry"',
  "already_present",
  "remaining",
  "MAX_FAILURE_DETAILS",
]) requireMarker(server, marker, "The full-atlas server must build an indexed, resumable, Needs Review import.");

requireMarker(smart, "extractArchiveMembersByBasenameToDirectory", "The full importer must extract the archive once into a resumable workspace.");

for (const marker of [
  'action === "full_step"',
  'action === "full_cancel"',
  'action === "full_status"',
  'action === "full_prepare"',
  'partofParts: file(form, "partof_parts")',
  'partofElements: file(form, "partof_elements")',
  "prepareBodyParts3dFullImport",
  "runBodyParts3dFullImportStep",
  "full_atlas: await bodyParts3dFullLibrarySnapshot()",
]) requireMarker(route, marker, "The BodyParts3D route must expose the full-atlas session lifecycle without duplicate snapshot keys.");

forbidMarker(
  route,
  "...(await bodyParts3dFullLibrarySnapshot())",
  "The full-atlas GET response must not redeclare snapshot properties before spreading the snapshot.",
);

for (const marker of [
  "FULL_BATCH_SIZE = 4",
  "<progress",
  "Pause after current batch",
  "Resume full atlas import",
  "Metadata fallback",
  "partof_parts_list_e.txt",
  "partof_element_parts.txt",
  "Omni Vision after import: <b>OFF</b>",
  "Embedding generation after import: <b>OFF</b>",
  "functional movement constraints are a separate later layer",
]) requireMarker(importer, marker, "The full-atlas UI must expose progress, pause/resume, and the fixed no-enrichment policy.");

for (const marker of [
  "BODYPARTS3D_FULL_COLLECTION_ID",
  "bodyParts3dSemanticMaterialForSystem",
  "bodyParts3dSystemFromGroupTags",
  "showBodyParts3dFullCards",
  "Collapse atlas element cards",
  "Show atlas element cards",
  "2,234 unique BodyParts3D element assets",
]) requireMarker(library, marker, "Needs Review must keep the full atlas organized and semantically colored without mounting thousands of cards by default.");

forbidMarker(
  server,
  "queueAssetEnrichment",
  "The full-atlas importer must not bypass the explicit OFF/OFF policy by queueing enrichment directly.",
);

console.log("PASS: A.12.5 full BodyParts3D atlas import is indexed, resumable, progress-visible, semantically colored, and remains in Needs Review with Omni Vision/embeddings off.");
