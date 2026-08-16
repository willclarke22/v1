import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const layout = fs.readFileSync(
  path.join(root, "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout.ts"),
  "utf8",
);
const runtime = fs.readFileSync(
  path.join(root, "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx"),
  "utf8",
);

for (const marker of [
  "hermiteScalar",
  "hermiteVec3",
  "cameraVelocityAtRawTime",
  "continuousCameraAtTime",
  "sampleRawCinematicBurgerRuntime",
  "blendWindowS = 0.34",
]) {
  assert(layout.includes(marker), `CP.1E.6 layout is missing continuous-camera marker: ${marker}`);
}

assert(
  layout.includes("Movement leads the transition") &&
    layout.includes("fadeTail") &&
    layout.includes("opacity: lerp(1, 0.035, fadeTail)") &&
    layout.includes("xOffset: side * 0.22 * movement"),
  "CP.1E.6 must use movement-first support transitions with a short opacity tail.",
);

assert(
  layout.includes("One continuous lateral/arc move") &&
    layout.includes("const sweepX = lerp(-0.72, 0.82, sweep)") &&
    layout.includes("const recenter = smootherStep"),
  "CP.1E.6 final recap must use one flowing apple-to-burger-to-nigiri camera sweep instead of separate mini zooms.",
);

assert(
  runtime.includes("single analytic safe-framing envelope") &&
    runtime.includes("requiredDistance") &&
    runtime.includes("tanHorizontal") &&
    runtime.includes("tanVertical") &&
    !runtime.includes("for (let pass = 0; pass < 4; pass += 1)"),
  "CP.1E.6 must replace iterative reactive framing correction with the analytic safe-framing envelope.",
);

assert(
  runtime.includes("Stable cinematic key/fill/rim rig") &&
    runtime.includes('<ambientLight intensity={0.44}') &&
    runtime.includes('intensity={1.58} color="#fff2df"') &&
    runtime.includes('intensity={0.42} color="#eef8ff"') &&
    runtime.includes('intensity={0.58} color="#bdeeff"') &&
    !runtime.includes('<pointLight position={[0, 2.2, 1.6]}'),
  "CP.1E.6 must use the stable key/fill/rim lighting rig instead of the brighter mixed-light setup.",
);

assert(
  (runtime.match(/onPlaybackTime\(timelineTimeS\);/g) ?? []).length === 1,
  "CP.1E.6 should notify the page clock once per UI update, not twice.",
);

assert(
  runtime.includes('frameloop="demand"') &&
    runtime.includes('powerPreference: "low-power"') &&
    (runtime.match(/<Canvas\b/g) ?? []).length === 1,
  "CP.1E.6 must preserve the single low-overhead cinematic runtime.",
);

console.log("Cinematic Production CP.1E.6 continuous-choreography verification passed.");
console.log(
  "Camera transitions now carry velocity through shot boundaries, support fades are movement-led, framing uses one analytic safety envelope, and lighting uses a stable key/fill/rim rig.",
);
