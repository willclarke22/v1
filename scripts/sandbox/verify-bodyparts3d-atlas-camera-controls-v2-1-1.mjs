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
const assetViewerPath =
  "sandbox/probe-lab/assets/ui/asset-library-viewer.tsx";

for (const relative of [viewerPath, assetViewerPath]) {
  assert(existsSync(join(process.cwd(), relative)), `Missing dependency: ${relative}`);
}

const viewer = source(viewerPath);
const assetViewer = source(assetViewerPath);

for (const marker of [
  "function framingFromBox",
  "new THREE.Vector3(1.15, 0.72, 1.35).normalize()",
  "dampingFactor={0.08}",
  "target={framing.center}",
]) {
  assert(
    assetViewer.includes(marker),
    `Asset Library preview reference marker missing: ${marker}`,
  );
}

for (const marker of [
  "ASSET_LIBRARY_VIEW_DIRECTION",
  "function cameraFramingFromSize",
  "Match the deterministic first-frame framing used by AssetLibraryViewer",
  "camera.up.set(0, 1, 0)",
  "camera.lookAt(target)",
  "controlsRef.current.target.copy(target)",
  "controlsRef.current.minDistance = framing.minDistance",
  "controlsRef.current.maxDistance = framing.maxDistance",
  'command.kind === "reset"',
  "controlsRef.current.saveState()",
  "Shared atlas space",
  "Asset Library-style controls",
  "upright Asset Library-style three-quarter view",
]) {
  assert(viewer.includes(marker), `Atlas camera hotfix marker missing: ${marker}`);
}

assert(
  /ASSET_LIBRARY_VIEW_DIRECTION\s*=\s*new THREE\.Vector3\(\s*1\.15,\s*0\.72,\s*1\.35,\s*\)\.normalize\(\)/m.test(
    viewer,
  ),
  "Atlas Reset view must use the same three-quarter direction vector as the Asset Library preview.",
);

assert(
  viewer.includes("fov: 42") &&
    viewer.includes("position: [2.3, 1.44, 2.7]"),
  "Atlas Canvas should start from the Asset Library-style camera envelope before manifest framing runs.",
);

const orbitStart = viewer.indexOf("<OrbitControls");
assert(orbitStart >= 0, "Atlas OrbitControls block is missing.");
const orbitEnd = viewer.indexOf("/>", orbitStart);
assert(orbitEnd > orbitStart, "Atlas OrbitControls block is malformed.");
const orbitBlock = viewer.slice(orbitStart, orbitEnd + 2);

for (const marker of [
  "makeDefault",
  "enableDamping",
  "dampingFactor={0.08}",
  "minDistance={0.015}",
  "maxDistance={100}",
]) {
  assert(
    orbitBlock.includes(marker),
    `Active Atlas OrbitControls must include Asset Library-style marker: ${marker}`,
  );
}

for (const marker of [
  "screenSpacePanning",
  "rotateSpeed=",
  "zoomSpeed=",
  "panSpeed=",
  "target={[0, 0, 0]}",
]) {
  assert(
    !orbitBlock.includes(marker),
    `Active Atlas OrbitControls must not keep the custom V2 control override: ${marker}`,
  );
}

assert(
  (viewer.match(/<Canvas\b/g) ?? []).length === 1,
  "Atlas camera polish must preserve exactly one Canvas.",
);
assert(
  viewer.includes("position={transform.position}") &&
    viewer.includes("rotation={transform.rotation}") &&
    viewer.includes("scale={transform.scale}"),
  "Camera polish must not alter BodyParts3D shared-space transforms.",
);
assert(
  viewer.includes("approximateBounds(manifest?.assets ?? [])") &&
    viewer.includes("const rootOffset = useMemo("),
  "Camera polish must keep the stable whole-atlas root used for layer persistence.",
);
assert(
  !viewer.includes("key={fitKey}") && !viewer.includes("<AtlasCameraFit"),
  "Camera polish must not restore preset-keyed camera remounting.",
);

console.log("PASS: BodyParts3D Atlas Camera + Controls V2.1.1 verified.");
console.log(
  "Reset view re-establishes an upright camera, uses the Asset Library framing direction/radius fit, active OrbitControls match the simpler Asset Library damping behavior, and the historical Shared atlas space invariant is preserved.",
);
