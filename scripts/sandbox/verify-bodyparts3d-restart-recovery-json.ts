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

const importer = read("sandbox/probe-lab/assets/ui/bodyparts3d-slp-pilot-import-lab.tsx");
const library = read("sandbox/probe-lab/assets/ui/asset-library-lab.tsx");
const server = read("sandbox/probe-lab/assets/bodyparts3d-full-import.server.ts");

for (const marker of [
  "async function readJsonApiResponse(",
  "HTML instead of JSON",
  "Imported BodyParts3D assets are preserved",
  "Recovered the interrupted BodyParts3D import session",
  "previous temporary BodyParts3D import session is no longer available after the restart",
  "MyWay will skip elements already registered",
  "The full-atlas loop is paused",
  'readJsonApiResponse(response, "BodyParts3D saved-session status")',
  'readJsonApiResponse(response, "BodyParts3D full-import step")',
  'readJsonApiResponse(response, "BodyParts3D atlas preparation")',
]) requireMarker(importer, marker, "BodyParts3D restart recovery must provide safe JSON parsing and actionable resume guidance.");

forbidMarker(
  importer,
  "const json = await response.json() as Record<string, unknown>;",
  "BodyParts3D importer API calls must not expose raw JSON parse failures after a dev-server restart.",
);

for (const marker of [
  "async function readAssetApiJson<T>(",
  "The current Asset Library state has not been deleted",
  'readAssetApiJson<LibraryResponse>(libraryResponse, "library")',
  'readAssetApiJson<AcquisitionResponse>(acquisitionResponse, "acquisition")',
  'readAssetApiJson<EnrichmentResponse>(enrichmentResponse, "enrichment")',
  'readAssetApiJson<GeometryResponse>(geometryResponse, "geometry")',
  'readAssetApiJson<AcquisitionResponse>(response, "acquisition poll")',
  'readAssetApiJson<EnrichmentResponse>(response, "enrichment poll")',
  'readAssetApiJson<GeometryResponse>(response, "geometry poll")',
  'current?.startsWith("Asset API acquisition poll")',
  'current?.startsWith("Asset API enrichment poll")',
  'current?.startsWith("Asset API geometry poll")',
]) requireMarker(library, marker, "Asset Library polling must recover cleanly from transient HTML responses.");

for (const marker of [
  ".filter((asset) => asset.collection_membership?.collection_id === BODYPARTS3D_FULL_COLLECTION_ID)",
  ".map((asset) => asset.source_asset_id?.toUpperCase())",
  "const queue = catalog.elements.map((element) => element.id).filter((elementId) => !existingIds.has(elementId.toUpperCase()));",
]) requireMarker(server, marker, "Restarted full-atlas preparation must skip BodyParts3D elements already registered before the interruption.");

console.log("PASS: A.12.6 restart recovery prevents raw HTML-as-JSON errors, preserves imported anatomy, and guides safe resume/re-prepare after interruption.");
