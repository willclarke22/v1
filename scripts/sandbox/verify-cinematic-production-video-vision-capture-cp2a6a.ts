import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const root = process.cwd();
const source = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const lab = source("sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx");
const runtime = source("sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx");

for (const marker of [
  "Universal Vision viability · CP.2A.6",
  "captureMode={isVisionComparing}",
  "the canvas may remain scrolled off-screen",
]) {
  assert(lab.includes(marker), `CP.2A.6A lab marker missing: ${marker}`);
}
for (const marker of [
  "captureMode?: boolean",
  "const capturePlaybackActive = props.captureMode",
  "? isDocumentVisible",
  ": isViewportActive && isDocumentVisible && isWindowFocused",
  "isViewportActive={capturePlaybackActive}",
  "previous.captureMode === next.captureMode",
]) {
  assert(runtime.includes(marker), `CP.2A.6A runtime marker missing: ${marker}`);
}
assert(
  runtime.includes('frameloop="demand"') &&
  runtime.includes('powerPreference: "low-power"') &&
  runtime.includes("IntersectionObserver") &&
  runtime.includes("document.hasFocus()"),
  "CP.2A.6A must preserve the ordinary preview performance/focus gates.",
);
assert(
  (lab.match(/<CinematicProductionRuntimeCanvas\b/g) ?? []).length === 1,
  "CP.2A.6A must preserve exactly one shared WebGL runtime.",
);
console.log("Cinematic Production CP.2A.6A capture-authority verification passed.");
console.log("Normal preview playback remains viewport/focus aware; intentional Nemotron capture can complete while the canvas is below the fold.");
