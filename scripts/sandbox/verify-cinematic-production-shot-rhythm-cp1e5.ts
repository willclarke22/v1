import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const layoutPath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout.ts",
);
const runtimePath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);

const layout = fs.readFileSync(layoutPath, "utf8");
const runtime = fs.readFileSync(runtimePath, "utf8");

for (const marker of [
  "supportTransitionForInsert",
  "recapPulse",
  "animalCameraFocus",
  "fishFocus",
  "burgerDeemphasis",
  "appleRecap",
  "burgerRecap",
  "nigiriRecap",
  "finalEmphasis",
]) {
  assert(layout.includes(marker), `CP.1E.5 layout is missing shot-rhythm marker: ${marker}`);
}

assert(
  (layout.includes("lerp(1, 0.04, burgerDeemphasis)") ||
    layout.includes("burgerDeemphasis - 0.72")) &&
    layout.includes("{ position: [0.2, 1.62, 3.18]") &&
    layout.includes("smoothWindow(progress, 0.3, 0.42, 0.68, 0.84)"),
  "CP.1E.5 must preserve the dedicated goldfish focus shot with burger de-emphasis and fish emphasis active.",
);

assert(
  (layout.match(/animalCameraFocus/g) ?? []).length >= 4 &&
    layout.includes("fov: 30.2"),
  "CP.1E.5 cow/chicken insert beats must preserve a slight focus push-in and release.",
);

assert(
  (layout.includes("xOffset: side * 0.18 * shaped") ||
    layout.includes("xOffset: side * 0.22 * movement")) &&
    (layout.includes("zOffset: 0.11 * shaped") || layout.includes("zOffset: 0.14 * movement")) &&
    (layout.includes("scale: lerp(1, 0.94, shaped)") ||
      layout.includes("scale: lerp(1, 0.93, movement)")) &&
    (layout.includes("opacity: lerp(1, 0.02, shaped)") ||
      layout.includes("opacity: lerp(1, 0.035, fadeTail)")),
  "CP.1E.5 must preserve support-food transitions that combine staggered opacity with subtle motion and scale.",
);

assert(
  layout.includes("recapPulse(progress, 0.16") &&
    layout.includes("recapPulse(progress, 0.37") &&
    layout.includes("recapPulse(progress, 0.58"),
  "CP.1E.5 return-to-tray beat must preserve apple, burger, and nigiri recap focus beats.",
);

assert(
  /function sampleReturnTray[\s\S]*?hand: hiddenActor\(\),/.test(layout) &&
    /function sampleHero[\s\S]*?hand: hiddenActor\(\),/.test(layout),
  "CP.1E.5 must keep the hand out of the ending sequence.",
);

assert(
  runtime.includes("protectCameraFraming") &&
    runtime.includes("applyGroupEmphasis") &&
    runtime.includes('frameloop="demand"') &&
    runtime.includes('powerPreference: "low-power"'),
  "CP.1E.5 must preserve safe framing, outline emphasis, and the low-overhead runtime.",
);

console.log("Cinematic Production CP.1E.5 shot-rhythm verification passed.");
console.log(
  "Fish keeps its dedicated focus shot; cow/chicken retain camera push-ins; support transitions combine movement, scale, and opacity; and the ending preserves three-food recap emphasis before the final hero payoff.",
);
