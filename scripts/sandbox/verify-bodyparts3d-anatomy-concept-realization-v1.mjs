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
const viewerPath =
  "sandbox/probe-lab/visual-experience/ui/orchestration-anatomy-atlas-viewer.tsx";
const runnerPath =
  "sandbox/probe-lab/visual-experience/orchestration/run-stage.server.ts";

for (const relative of [routePath, viewerPath, runnerPath]) {
  assert(
    existsSync(join(process.cwd(), relative)),
    `Missing concept-realization dependency: ${relative}`,
  );
}

const route = source(routePath);
const viewer = source(viewerPath);
const runner = source(runnerPath);

for (const marker of [
  '"myway_bodyparts3d_concept_realization_v1"',
  "readBodyParts3dFullCatalog",
  "normalizedConceptName",
  "conceptSummary",
  "conceptSuggestions",
  "realizationForConcept",
  'authority: "bodyparts3d_named_concept_exact"',
  '"concept_without_geometry"',
  '"ambiguous"',
  '"unresolved"',
  "available_element_ids",
  "missing_element_ids",
  "available_asset_ids",
  "element_ids: concept.element_ids",
  'url.searchParams.get("concept")',
  "normalized BodyParts3D named-concept identity",
  "Suggestions are non-authoritative inspection aids and never auto-resolve.",
]) {
  assert(
    route.includes(marker),
    `Concept realization route marker missing: ${marker}`,
  );
}

assert(
  route.includes(
    "normalizedConceptName(concept.name) === normalizedQuery",
  ) &&
    route.includes(
      "concept.concept_id.toLowerCase() === queryIdentifier",
    ) &&
    route.includes(
      "concept.representation_id?.toLowerCase() === queryIdentifier",
    ),
  "V1 authority must resolve only exact normalized name/FMA/BP identity.",
);

assert(
  !route.includes("runLexicalAssetSearchBench") &&
    !route.includes("asset-semantic") &&
    !route.includes("reranker") &&
    !route.includes("callVisualOrchestrationCalibrationModel"),
  "Concept Realization V1 must not introduce lexical/semantic/reranker/GLM authority.",
);

for (const marker of [
  "ANATOMY CONCEPT REALIZATION · V1",
  "Named concept → atlas element set",
  "Exact BodyParts3D concept identity only.",
  "Resolve concept",
  "SAFE_CONCEPT_RENDER_LIMIT = 180",
  '"context"',
  '"highlight"',
  '"isolate"',
  "Load full concept",
  "conceptElementIds",
  "visibleConceptAssets",
  "emphasized={conceptElementIds.has(",
  'conceptViewMode === "context"',
  "Suggestions are",
  "Stage 2 grounding unchanged",
  "Source: exact BodyParts3D named concept",
]) {
  assert(
    viewer.includes(marker),
    `Concept realization viewer marker missing: ${marker}`,
  );
}

assert(
  viewer.includes("resolvedConcept?.available_element_ids") &&
    viewer.includes("asset.member_id.toLowerCase()"),
  "Viewer must bind exact concept element IDs back to existing atlas members.",
);

assert(
  viewer.includes('conceptViewMode === "isolate"') &&
    viewer.includes('conceptViewMode === "context"') &&
    viewer.includes("uniqueAssets([") &&
    viewer.includes("landmarkAssets(manifest.assets)"),
  "Viewer must support isolate, context, and highlight realization modes without inventing placement.",
);

assert(
  !viewer.includes("<Center") &&
    viewer.includes("position={transform.position}") &&
    viewer.includes("rotation={transform.rotation}") &&
    viewer.includes("scale={transform.scale}"),
  "Concept visualization must preserve the existing shared-space atlas reconstruction.",
);

assert(
  !runner.includes("myway_bodyparts3d_concept_realization_v1") &&
    !runner.includes("visual-experience/anatomy-atlas?concept="),
  "This patch must not connect concept realization to Stage 2 grounding yet.",
);

console.log("PASS: BodyParts3D Anatomy Concept Realization V1 verified.");
console.log(
  "Exact BodyParts3D named concepts map deterministically to one-or-many existing atlas elements; unresolved/ambiguous concepts remain non-authoritative; context/highlight/isolate views preserve shared atlas placement; Stage 2 remains unchanged.",
);
