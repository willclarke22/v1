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
    `Missing Atlas Navigation + Semantic Concept V2 dependency: ${relative}`,
  );
}

const route = source(routePath);
const viewer = source(viewerPath);
const runner = source(runnerPath);

for (const marker of [
  '"myway_bodyparts3d_concept_realization_v2"',
  "COMMON_LANGUAGE_PROFILES",
  'id: "gut"',
  'id: "leg"',
  'id: "arm"',
  'id: "chest"',
  'id: "blood_vessels"',
  "REGION_ALIASES",
  "SYSTEM_ALIASES",
  "descendantConceptIds",
  "catalog.isa_relations",
  "catalog.partof_relations",
  "realizationWithDescendants",
  "profileAssets",
  "regionMatches",
  '"myway_common_language_alias_v2"',
  '"myway_common_language_profile_v2"',
  '"ontology_descendants"',
  '"region_system_profile"',
  "profileOwnsEverydayMeaning",
  "Suggestions are non-authoritative inspection aids and never auto-resolve.",
]) {
  assert(route.includes(marker), `Concept V2 route marker missing: ${marker}`);
}

assert(
  route.includes("normalizedConceptName(concept.name) === normalizedQuery") &&
    route.includes("concept.concept_id.toLowerCase() === queryIdentifier") &&
    route.includes("concept.representation_id?.toLowerCase() === queryIdentifier"),
  "Exact BodyParts3D/FMA/BP identity must remain the first catalog authority.",
);

assert(
  !route.includes("runLexicalAssetSearchBench") &&
    !route.includes("asset-semantic") &&
    !route.includes("reranker") &&
    !route.includes("callVisualOrchestrationCalibrationModel"),
  "Concept V2 must remain deterministic and must not add lexical/semantic/reranker/GLM authority.",
);

for (const marker of [
  "AtlasCameraRig",
  'kind: "reset"',
  'kind: "frame"',
  "new THREE.Vector3(0.42, 0.025, 1)",
  "camera.lookAt(target)",
  "controlsRef.current.target.copy(target)",
  "screenSpacePanning",
  "rotateSpeed={0.7}",
  "zoomSpeed={0.85}",
  "panSpeed={0.9}",
  "maxDistance={100}",
  "Reset view",
  "Frame active",
  "Camera persists across systems",
]) {
  assert(viewer.includes(marker), `Navigation V2 marker missing: ${marker}`);
}

assert(
  !viewer.includes("key={fitKey}") &&
    !viewer.includes("<AtlasCameraFit") &&
    viewer.includes("approximateBounds(manifest?.assets ?? [])") &&
    viewer.includes("const rootOffset = useMemo("),
  "Camera persistence requires a stable whole-atlas root and no preset-keyed OrbitControls remount.",
);

for (const marker of [
  'type LayerMode = "hidden" | "solid" | "ghost"',
  "layerStates",
  "layersForPreset",
  "cycleSystem",
  "nextLayerMode",
  "System overlays",
  "type=\"range\"",
  "Load full preset",
  'show("integumentary", "ghost", 0.34)',
]) {
  assert(viewer.includes(marker), `System overlay marker missing: ${marker}`);
}

for (const marker of [
  "SKIN_TONES",
  "new THREE.MeshPhysicalMaterial",
  'system === "integumentary"',
  "clearcoat: 0.08",
  "clearcoatRoughness: 0.86",
  "Procedural skin material; no white semantic override.",
]) {
  assert(viewer.includes(marker), `Skin appearance marker missing: ${marker}`);
}

assert(
  !viewer.includes('color: "#ffffff"') &&
    !viewer.includes('color: "#FFFFFF"'),
  "Atlas skin must not regress to an all-white material override.",
);

for (const marker of [
  "ANATOMY CONCEPT REALIZATION · V2",
  "Ordinary anatomy language → atlas element set",
  'Try "gut", "leg", "chest", "brain", "blood vessels", or "neck muscle"',
  "is-a / part-of descendants",
  "MyWay controlled common-language region/system profile",
  "Stage 2 grounding unchanged",
]) {
  assert(viewer.includes(marker), `Concept UI V2 marker missing: ${marker}`);
}

assert(
  viewer.includes("<Canvas") &&
    viewer.includes("<OrbitControls") &&
    !viewer.includes("<Center") &&
    viewer.includes("position={transform.position}") &&
    viewer.includes("rotation={transform.rotation}") &&
    viewer.includes("scale={transform.scale}"),
  "Navigation/overlay polish must preserve one-Canvas shared-space reconstruction.",
);

assert(
  !runner.includes("myway_bodyparts3d_concept_realization_v2") &&
    !runner.includes("visual-experience/anatomy-atlas?concept="),
  "Concept V2 remains an atlas workbench proof and must not silently connect to Stage 2 yet.",
);

console.log("PASS: BodyParts3D Atlas Navigation + Semantic Concept Robustness V2 verified.");
console.log(
  "The atlas now keeps a stable camera across system changes, supports smooth multi-system overlays and opacity, uses a dedicated skin material, and resolves controlled everyday anatomy language through exact/ontology/profile paths without adding GLM or fuzzy retrieval authority.",
);
