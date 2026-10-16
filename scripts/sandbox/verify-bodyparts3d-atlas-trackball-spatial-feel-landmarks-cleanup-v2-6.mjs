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
const priorVerifierPath =
  "scripts/sandbox/verify-bodyparts3d-atlas-full-preload-arcball-skin-v2-5-2.mjs";
const packagePath = "package.json";

for (const path of [viewerPath, priorVerifierPath, packagePath]) {
  assert(existsSync(join(process.cwd(), path)), `Missing V2.6 dependency: ${path}`);
}

const viewer = source(viewerPath);
const priorVerifier = source(priorVerifierPath);
const packageJson = source(packagePath);

for (const marker of [
  'import { TrackballControls, useGLTF } from "@react-three/drei";',
  "<TrackballControls",
  "noPan",
  "minDistance={0.015}",
  "maxDistance={100}",
  "rotateSpeed={3.2}",
  "zoomSpeed={1.2}",
  "dynamicDampingFactor={0.11}",
  "Learning Space Trackball feel",
  "free tumble + roll",
  "anchored target",
]) {
  assert(viewer.includes(marker), `Trackball spatial-feel marker missing: ${marker}`);
}

assert(
  !viewer.includes('import { ArcballControls, useGLTF } from "@react-three/drei";') &&
    !viewer.includes("<ArcballControls"),
  "ArcballControls must be fully retired from the active Anatomy Atlas source.",
);

const trackballStart = viewer.indexOf("<TrackballControls");
const trackballEnd = viewer.indexOf("/>", trackballStart);
assert(
  trackballStart >= 0 && trackballEnd > trackballStart,
  "Active TrackballControls block is missing or malformed.",
);
const trackballBlock = viewer.slice(trackballStart, trackballEnd + 2);
for (const marker of [
  "noPan",
  "minDistance={0.015}",
  "maxDistance={100}",
  "rotateSpeed={3.2}",
  "zoomSpeed={1.2}",
  "dynamicDampingFactor={0.11}",
]) {
  assert(
    trackballBlock.includes(marker),
    `TrackballControls lost Learning Space feel marker: ${marker}`,
  );
}
assert(
  !trackballBlock.includes("panSpeed") &&
    !trackballBlock.includes("minPolarAngle") &&
    !trackballBlock.includes("maxPolarAngle"),
  "Trackball interaction must stay anchored and free of OrbitControls-style polar limits.",
);

const rigStart = viewer.indexOf("function AtlasCameraRig");
const rigEnd = viewer.indexOf("type AtlasAssetBoundaryProps", rigStart);
assert(rigStart >= 0 && rigEnd > rigStart, "AtlasCameraRig block is missing.");
const rig = viewer.slice(rigStart, rigEnd);
for (const marker of [
  "direction = CANONICAL_ANATOMY_FRONT_VIEW_DIRECTION.clone()",
  "camera.up.set(0, 1, 0)",
  "camera.lookAt(target)",
  "controlsRef.current.target.copy(target)",
  "controlsRef.current.minDistance = framing.minDistance",
  "controlsRef.current.maxDistance = framing.maxDistance",
  "controlsRef.current.update()",
]) {
  assert(rig.includes(marker), `Trackball camera-rig invariant missing: ${marker}`);
}
for (const retired of [
  'typeof controlsRef.current.setCamera === "function"',
  "controlsRef.current.setCamera(camera)",
  "controlsRef.current.enableFocus = false",
  "controlsRef.current.enableGizmos = false",
  "controlsRef.current.rotateSpeed = 1.05",
  "controlsRef.current.dampingFactor = 18",
]) {
  assert(!rig.includes(retired), `Retired Arcball runtime mutation remains: ${retired}`);
}

assert(
  !viewer.includes('"landmarks"') &&
    !viewer.includes('label: "Landmarks"') &&
    !viewer.includes('preset === "landmarks"'),
  "The old user-facing Landmarks test/preset must be removed completely.",
);
for (const marker of [
  "function landmarkAssets",
  "...landmarkAssets(manifest.assets)",
  'const [preset, setPreset] = useState<AtlasPreset>("all");',
  'setLayerStates(layersForPreset(systems, "all"));',
  'setPreset("all");',
]) {
  assert(
    viewer.includes(marker),
    `Landmark-context or All-anatomy invariant missing after preset cleanup: ${marker}`,
  );
}

for (const marker of [
  "ATLAS_PRELOAD_BATCH_SIZE = 32",
  "setAtlasPreloadComplete(true)",
  "PREPARING FULL ANATOMY ATLAS",
  "function applyProceduralSkinSurface",
  "quaternion={atlasBasis.quaternion}",
  "position={transform.position}",
  "rotation={transform.rotation}",
  "scale={transform.scale}",
]) {
  assert(viewer.includes(marker), `Preserved V2.5/V2.4 invariant missing: ${marker}`);
}

assert(
  priorVerifier.includes("The free-manipulation invariant migrated from ArcballControls") &&
    priorVerifier.includes("TrackballControls") &&
    !priorVerifier.includes("const arcballStart = viewer.indexOf"),
  "The V2.5.2 historical verifier must be deliberately updated instead of faking an active Arcball block.",
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
  "V2.6 requires the existing Drei/Three versions recorded by the authoritative dump.",
);

console.log("PASS: BodyParts3D Atlas Trackball Spatial Feel + Landmarks Cleanup V2.6 verified.");
console.log(
  "The Anatomy Atlas now reuses the Learning Space Trackball interaction feel with an anchored no-pan target, removes the old Landmarks test/preset while retaining internal landmark context for concept realization, and preserves preload, All-anatomy startup, skin, selection color, canonical reset, framing, and shared-space transforms.",
);
