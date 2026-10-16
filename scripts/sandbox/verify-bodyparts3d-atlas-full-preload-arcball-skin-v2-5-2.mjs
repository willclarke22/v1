import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function source(relativePath) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const viewerPath =
  "sandbox/probe-lab/visual-experience/ui/orchestration-anatomy-atlas-viewer.tsx";
const packagePath = "package.json";

assert(existsSync(join(process.cwd(), viewerPath)), `Missing viewer: ${viewerPath}`);
assert(existsSync(join(process.cwd(), packagePath)), `Missing package file: ${packagePath}`);

const viewer = source(viewerPath);
const packageJson = source(packagePath);

// V2.5.2 still owns these product invariants after the successor V2.6 control swap:
// full-atlas preload, All anatomy startup, procedural skin, selection color preservation,
// canonical root/reset, close inspection, and one-Canvas shared-space reconstruction.
for (const marker of [
  "ATLAS_PRELOAD_BATCH_SIZE = 32",
  "ATLAS_PRELOAD_BATCH_DELAY_MS = 18",
  "function AtlasAssetPreloadProbe",
  "useGLTF(asset.model_url)",
  "preloadSettledIds",
  "preloadFailedIds",
  "preloadOffset",
  "preloadBatch",
  "batch.every((asset) => preloadSettledIds.current.has(asset.asset_id))",
  "setAtlasPreloadComplete(true)",
  "prewarmedUrls.current.add(asset.model_url)",
  "atlasPreloadComplete ? (",
  "onFailure={reportPreloadFailure}",
  "onLoaded={reportPreloadLoaded}",
  "PREPARING FULL ANATOMY ATLAS",
  "Loading every anatomy asset before interaction",
  "switching bodily systems does not incur another network/model",
]) {
  assert(viewer.includes(marker), `Full-atlas preload gate marker missing: ${marker}`);
}

assert(
  viewer.includes('const [preset, setPreset] = useState<AtlasPreset>("all");') &&
    viewer.includes('setLayerStates(layersForPreset(systems, "all"));') &&
    viewer.includes('setPreset("all");'),
  "The Anatomy Atlas must still start in the All anatomy preset after manifest load.",
);

for (const marker of [
  "function applyProceduralSkinSurface",
  'light: "#C98C6A"',
  'medium: "#9F6047"',
  'deep: "#5B392B"',
  "material.sheen = 0.22",
  "material.sheenRoughness = 0.78",
  "material.ior = 1.4",
  "vMyWaySkinWorldPosition",
  "float mywaySkinNoise(vec3 p)",
  "mywaySkinNoiseValue",
  "roughnessFactor = clamp(",
  "myway-atlas-procedural-skin-v1",
  "applyProceduralSkinSurface(displayMaterial, skinTone)",
]) {
  assert(viewer.includes(marker), `Procedural skin marker missing: ${marker}`);
}

assert(
  !viewer.includes('displayMaterial.emissive.set(selected ? "#e0f2fe" : "#38bdf8")') &&
    !viewer.includes("displayMaterial.emissiveIntensity = selected ? 0.72 : 0.46"),
  "Selection must not bleach anatomy to the former near-white emissive highlight.",
);
for (const marker of [
  'const accent = new THREE.Color(selected ? "#22D3EE" : "#0EA5E9")',
  "const preservedBaseColor =",
  ".copy(preservedBaseColor)",
  ".lerp(accent, selected ? 0.1 : 0.055)",
  "displayMaterial.emissiveIntensity = selected ? 0.2 : 0.12",
]) {
  assert(viewer.includes(marker), `Base-color-preserving selection marker missing: ${marker}`);
}

for (const marker of [
  "CANONICAL_ANATOMY_FRONT_VIEW_DIRECTION",
  "deriveAtlasAnatomicalBasis",
  "normalizedBoundsForAtlasRoot",
  "quaternion={atlasBasis.quaternion}",
  'if (command.kind === "reset") {',
  "camera.up.set(0, 1, 0)",
  "controlsRef.current.target.copy(target)",
  "controlsRef.current.minDistance = framing.minDistance",
  "controlsRef.current.maxDistance = framing.maxDistance",
  "controlsRef.current.update()",
  "controlsRef.current.saveState()",
  "position={transform.position}",
  "rotation={transform.rotation}",
  "scale={transform.scale}",
  "near: Math.max(0.0005, Math.min(radius * 0.0025, 0.01))",
]) {
  assert(viewer.includes(marker), `Canonical anatomy/camera invariant missing: ${marker}`);
}

// The free-manipulation invariant migrated from ArcballControls to the proven
// Learning Space TrackballControls implementation in V2.6.
for (const marker of [
  'import { TrackballControls, useGLTF } from "@react-three/drei";',
  "<TrackballControls",
  "noPan",
  "rotateSpeed={3.2}",
  "zoomSpeed={1.2}",
  "dynamicDampingFactor={0.11}",
]) {
  assert(viewer.includes(marker), `Successor free-control invariant missing: ${marker}`);
}
assert(
  !viewer.includes('import { ArcballControls, useGLTF } from "@react-three/drei";') &&
    !viewer.includes("<ArcballControls"),
  "The retired ArcballControls implementation must not return.",
);

assert(
  (viewer.match(/<Canvas\b/g) ?? []).length === 1,
  "Anatomy Atlas must preserve exactly one Canvas.",
);
assert(
  !viewer.includes("<Center"),
  "Per-piece Center fitting must not return.",
);
assert(
  packageJson.includes('"@react-three/drei": "^10.7.7"') &&
    packageJson.includes('"three": "^0.183.2"'),
  "Anatomy control/appearance invariants require the existing Drei/Three versions recorded by the authoritative dump.",
);

console.log("PASS: BodyParts3D Atlas Full Preload + Free Arcball + Skin Polish V2.5.2 verified.");
console.log(
  "V2.5.2 preload, All-anatomy startup, skin, selection-color, canonical-root/reset, close-inspection, and free-manipulation invariants remain protected; V2.6 intentionally replaces ArcballControls with the Learning Space TrackballControls feel.",
);
