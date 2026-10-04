import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const labPath = "sandbox/probe-lab/visual-experience/ui/orchestration-lab.tsx";
const viewerPath = "sandbox/probe-lab/visual-experience/ui/orchestration-resolved-cast-viewer.tsx";

assert(existsSync(join(process.cwd(), labPath)), `Missing Orchestration Lab: ${labPath}`);
assert(existsSync(join(process.cwd(), viewerPath)), `Missing Resolved Cast Inspector: ${viewerPath}`);

const lab = source(labPath);
const viewer = source(viewerPath);

for (const marker of [
  'title: "Asset grounding"',
  "OrchestrationResolvedCastViewer",
  "STAGE TAKEAWAY",
  'label: "Provider"',
  'label: "Grounding"',
  'label: "Total"',
  '>Diagnostics<',
  '>Advanced retrieval lab<',
]) {
  assert(lab.includes(marker), `Clean Orchestration UI marker missing: ${marker}`);
}

assert(
  lab.indexOf("OrchestrationResolvedCastViewer") < lab.indexOf(">Diagnostics<"),
  "Resolved Cast Inspector must appear before collapsed diagnostics.",
);
assert(
  lab.indexOf(">Advanced retrieval lab<") < lab.indexOf("ASSET RETRIEVAL QUERY"),
  "Retrieval research controls must live behind the collapsed Advanced retrieval lab.",
);
assert(
  !lab.includes('title: "Anatomy requirements"'),
  "The live Stage 2 label must be generalized from anatomy to asset grounding.",
);

for (const marker of [
  "RESOLVED CAST INSPECTOR",
  "Grounded assets, before scene composition",
  "directorRealAssetBrowserUrl(asset)",
  "DirectorRealAssetLoadBoundary",
  "bodyParts3dSemanticMaterialForSystem",
  "bodyParts3dSystemFromGroupTags",
  'status === "resolved"',
  "presentation variant only · semantic side unchanged",
  "appearance request:",
  "Drag to rotate · scroll to zoom",
  "<Canvas",
  "<OrbitControls",
]) {
  assert(viewer.includes(marker), `Resolved Cast Inspector marker missing: ${marker}`);
}

const canvasCount = (viewer.match(/<Canvas\b/g) ?? []).length;
assert(canvasCount === 1, `Resolved Cast Inspector must own exactly one Canvas; found ${canvasCount}.`);
assert(
  !viewer.includes("useGLTF(asset.public_path)"),
  "Resolved Cast Inspector must route browser loading through the shared safe URL helper.",
);
assert(
  !viewer.includes("DirectorShot") && !viewer.includes("directorCapability") && !viewer.includes("motion_program"),
  "This patch must remain an inspection surface and must not introduce Director motion/choreography.",
);
assert(
  viewer.includes('entry.status === "resolved" && Boolean(entry.asset)'),
  "Only resolved cast entries may become selectable/renderable assets.",
);

console.log("PASS: Visual Experience Resolved Cast Inspector V1 verified.");
console.log("One Canvas renders one grounded GLB at a time; unresolved states stay visible; diagnostics and retrieval research are collapsed; Director motion remains downstream.");
