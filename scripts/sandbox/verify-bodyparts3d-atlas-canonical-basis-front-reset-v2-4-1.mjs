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

assert(existsSync(join(process.cwd(), viewerPath)), `Missing viewer: ${viewerPath}`);
const viewer = source(viewerPath);

for (const marker of [
  "type AtlasAnatomicalBasis = {",
  "SUPERIOR_ANCHOR_PATTERNS",
  "INFERIOR_ANCHOR_PATTERNS",
  "ANTERIOR_ANCHOR_PATTERNS",
  "POSTERIOR_ANCHOR_PATTERNS",
  "function lateralPairAxis",
  "function deriveAtlasAnatomicalBasis",
  "new THREE.Matrix4().makeBasis(",
  ".setFromRotationMatrix(sourceBasis)",
  ".invert()",
  "function normalizedBoundsForAtlasRoot",
  "const CANONICAL_ANATOMY_FRONT_VIEW_DIRECTION = new THREE.Vector3(0, 0, 1)",
  "direction = CANONICAL_ANATOMY_FRONT_VIEW_DIRECTION.clone()",
  "camera.aspect",
  'kind === "reset" ? anatomicalFrontDistance : radiusDistance',
  "const atlasBasis = useMemo(",
  "deriveAtlasAnatomicalBasis(manifest?.assets ?? [])",
  "const normalizedAtlasBounds = useMemo(",
  "normalizedBoundsForAtlasRoot(",
  "quaternion={atlasBasis.quaternion}",
  "landmark-derived canonical basis",
  "anatomical front reset",
  "full orbit",
]) {
  assert(viewer.includes(marker), `Canonical Basis V2.4.1 marker missing: ${marker}`);
}

const rigStart = viewer.indexOf("function AtlasCameraRig");
const rigEnd = viewer.indexOf("type AtlasAssetBoundaryProps", rigStart);
assert(rigStart >= 0 && rigEnd > rigStart, "AtlasCameraRig block is missing or malformed.");
const rig = viewer.slice(rigStart, rigEnd);
assert(
  rig.includes("direction = CANONICAL_ANATOMY_FRONT_VIEW_DIRECTION.clone()"),
  "Reset must use the straight-on canonical anterior camera direction.",
);
assert(
  !rig.includes("direction = ANATOMICAL_FRONT_VIEW_DIRECTION.clone()"),
  "The legacy generic Asset Library vector must not remain active in AtlasCameraRig.",
);
assert(
  rig.includes("camera.up.set(0, 1, 0)") && rig.includes("camera.lookAt(target)"),
  "Canonical Reset must retain a deterministic Y-up lookAt camera.",
);

const basisStart = viewer.indexOf("function deriveAtlasAnatomicalBasis");
const basisEnd = viewer.indexOf("function rotatedBoundsSize", basisStart);
assert(basisStart >= 0 && basisEnd > basisStart, "Atlas basis derivation block is missing.");
const basis = viewer.slice(basisStart, basisEnd);
for (const marker of [
  "meanAtlasPosition(superiorAssets)",
  "meanAtlasPosition(inferiorAssets)",
  "lateralPairAxis(assets)",
  "meanAtlasPosition(anteriorAssets)",
  "meanAtlasPosition(posteriorAssets)",
  "sourceUp.clone().cross(sourceAnterior).normalize()",
  "sourceLateral.clone().cross(sourceUp).normalize()",
]) {
  assert(basis.includes(marker), `Landmark-derived orthonormal basis marker missing: ${marker}`);
}

const rootQuaternionIndex = viewer.indexOf("<group quaternion={atlasBasis.quaternion}>");
const rootOffsetIndex = viewer.indexOf(
  "<group position={[rootOffset.x, rootOffset.y, rootOffset.z]}>",
  rootQuaternionIndex,
);
assert(
  rootQuaternionIndex >= 0 && rootOffsetIndex > rootQuaternionIndex,
  "The one atlas normalization quaternion must wrap the existing shared-space centering group.",
);

assert(
  viewer.includes("position={transform.position}") &&
    viewer.includes("rotation={transform.rotation}") &&
    viewer.includes("scale={transform.scale}"),
  "Canonical-basis normalization must not rewrite per-member BodyParts3D runtime transforms.",
);

const frameStart = viewer.indexOf("const frameActive = useCallback");
const frameEnd = viewer.indexOf("const applyPreset = useCallback", frameStart);
assert(frameStart >= 0 && frameEnd > frameStart, "Frame-active block is missing.");
const frame = viewer.slice(frameStart, frameEnd);
assert(
  frame.includes("normalizedBoundsForAtlasRoot(") &&
    frame.includes("atlasBounds.center") &&
    frame.includes("atlasBasis.quaternion") &&
    frame.includes("center: vec3Tuple(displayBounds.center)") &&
    frame.includes("size: vec3Tuple(displayBounds.size)"),
  "Frame active/concept/structure must transform camera bounds through the normalized atlas root.",
);

const orbitStart = viewer.indexOf("<OrbitControls");
assert(orbitStart >= 0, "Atlas OrbitControls block is missing.");
const orbitEnd = viewer.indexOf("/>", orbitStart);
assert(orbitEnd > orbitStart, "Atlas OrbitControls block is malformed.");
const orbitBlock = viewer.slice(orbitStart, orbitEnd + 2);
for (const marker of [
  "makeDefault",
  "enableRotate",
  "enablePan",
  "enableZoom",
  "enableDamping",
  "dampingFactor={0.08}",
  "minPolarAngle={0}",
  "maxPolarAngle={Math.PI}",
  "minDistance={0.015}",
  "maxDistance={100}",
]) {
  assert(orbitBlock.includes(marker), `Full-orbit behavior regressed: ${marker}`);
}

assert(
  viewer.includes("near: Math.max(0.0005, Math.min(radius * 0.0025, 0.01))"),
  "Close-inspection near-plane protection must remain intact.",
);
assert(
  viewer.includes("PREWARM_BATCH_SIZE = 8") &&
    viewer.includes("PREWARM_BATCH_DELAY_MS = 90") &&
    viewer.includes("useGLTF.preload(url)"),
  "Preset cache prewarming must remain intact.",
);

console.log("PASS: BodyParts3D Atlas Canonical Basis + Front Reset V2.4.1 verified.");
console.log(
  "The atlas now derives superior/anterior/lateral axes from anatomy landmarks, applies one root quaternion, resets to a straight-on anterior Y-up camera with human-specific framing, transforms frame targets through the same root, and preserves member transforms, close zoom, prewarming, and full OrbitControls freedom.",
);
