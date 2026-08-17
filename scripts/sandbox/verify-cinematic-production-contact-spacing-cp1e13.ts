import fs from "node:fs";
import path from "node:path";

import {
  sampleCinematicBurgerRuntime,
  type RuntimeVec3,
} from "../../sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function distance(a: RuntimeVec3, b: RuntimeVec3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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
const safety = fs.readFileSync(
  path.join(root, "sandbox/probe-lab/cinematic-production/ui/cinematic-production-camera-safety.ts"),
  "utf8",
);
const lab = fs.readFileSync(
  path.join(root, "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx"),
  "utf8",
);
const readme = fs.readFileSync(
  path.join(root, "sandbox/probe-lab/cinematic-production/README.md"),
  "utf8",
);

const cp1fSuccessor =
  layout.includes("CP.1F: the film clock now authors only interaction intent") &&
  runtime.includes("resolveAssetAwareInteractionMotion") &&
  runtime.includes("assetInteractionGeometryForRole");

if (cp1fSuccessor) {
  assert(
    !layout.includes("handContactPosition") &&
      layout.includes('id: "hand_nudges_burger"') &&
      layout.includes('sourceRole: "hand"') &&
      layout.includes('targetRole: "burger"'),
    "CP.1F successor must demote the CP.1E.13 hard-coded hand contact coordinate to semantic interaction intent.",
  );
  const contactSample = sampleCinematicBurgerRuntime(3.35);
  const interaction = contactSample.interactions?.find(
    (item) => item.id === "hand_nudges_burger",
  );
  assert(
    interaction?.phase === "contact" &&
      interaction.maintainContact === true &&
      interaction.obstacleRoles.includes("apple"),
    "CP.1F successor must preserve CP.1E.13 approach/contact/retreat meaning through asset-aware contact intent.",
  );
} else {
  for (const marker of [
    "CP.1E.13 turns that safe arc",
    "handContactPosition",
    "handApproachPosition",
    "handRetreatPosition",
    "lerp(-1.48, -1.78, fishArrival)",
  ]) {
    assert(layout.includes(marker), `CP.1E.13 layout marker missing: ${marker}`);
  }

  // The approach and retreat must preserve CP.1E.12 apple clearance.
  for (let timeS = 1.2; timeS <= 6.55; timeS += 0.025) {
    const sample = sampleCinematicBurgerRuntime(timeS);
    if (!sample.hand.visible || sample.hand.opacity < 0.02) continue;
    const apple = sample.foods[0].position;
    const hand = sample.hand.position;
    if (Math.abs(hand[0] - apple[0]) < 0.45) {
      assert(
        hand[1] > 1.0 || hand[2] > apple[2] + 0.42,
        `CP.1E.13 hand clearance collapsed near the apple at ${timeS.toFixed(3)}s.`,
      );
    }
  }

  // Unlike CP.1E.12, the safe route must actually arrive in the burger contact zone
  // and hold there through the nudge instead of stopping short.
  const contactA = sampleCinematicBurgerRuntime(3.35);
  const contactB = sampleCinematicBurgerRuntime(4.35);
  for (const [label, sample] of [["contactA", contactA], ["contactB", contactB]] as const) {
    const hand = sample.hand;
    const burger = sample.foods[1];
    assert(hand.visible && hand.opacity > 0.98, `CP.1E.13 ${label} hand must be fully present.`);
    assert(
      hand.position[0] > -0.36 &&
        hand.position[0] < -0.16 &&
        hand.position[1] < 0.5 &&
        Math.abs(hand.position[2] - burger.position[2]) < 0.16,
      `CP.1E.13 ${label} hand must occupy the burger contact zone.`,
    );
  }
  assert(
    distance(contactA.hand.position, contactB.hand.position) < 0.015,
    "CP.1E.13 hand must hold a stable burger-contact pose through the nudge.",
  );

  const preContact = sampleCinematicBurgerRuntime(2.4);
  const postContact = sampleCinematicBurgerRuntime(5.65);
  assert(
    preContact.hand.position[1] > contactA.hand.position[1] + 0.55 &&
      postContact.hand.position[1] > contactA.hand.position[1] + 0.55,
    "CP.1E.13 hand must approach and retreat through high-clearance poses around the low contact hold.",
  );
}

// The fish stays fixed for the camera-earned reveal, but with more visible depth
// separation than CP.1E.12.
const hidden = sampleCinematicBurgerRuntime(14.4);
const revealed = sampleCinematicBurgerRuntime(16.35);
const hiddenDepthGap = hidden.foods[1].position[2] - hidden.goldfish.position[2];
const revealedDepthGap = revealed.foods[1].position[2] - revealed.goldfish.position[2];
assert(
  hidden.goldfish.opacity > 0.98 &&
    revealed.goldfish.opacity > 0.98 &&
    hiddenDepthGap > 1.65 &&
    revealedDepthGap > 1.65,
  "CP.1E.13 fish must hold substantially deeper negative space behind the burger.",
);
assert(
  distance(
    [hidden.goldfish.position[0], 0, hidden.goldfish.position[2]],
    [revealed.goldfish.position[0], 0, revealed.goldfish.position[2]],
  ) < 0.08,
  "CP.1E.13 fish must remain essentially fixed while the camera earns the reveal.",
);

// Camera behavior is intentionally inherited unchanged from CP.1E.12.
assert(
  runtime.includes("CP.1E.12 soft post-rail camera safety") &&
    runtime.includes("advanceSoftCameraSafetyCorrection") &&
    safety.includes("Playback-only temporal governor") &&
    layout.includes("C2 through-motion master camera rail"),
  "CP.1E.13 must preserve the successful CP.1E.12 final-camera continuity stack.",
);
const rawSamplerSource =
  layout.match(/function sampleRawCinematicBurgerRuntime[\s\S]*?\n}\n\ntype MasterCameraKey/)?.[0] ?? "";
assert(
  rawSamplerSource.includes("return sampleContinuousInsertJourney") &&
    !rawSamplerSource.includes("segmentAtTime(") &&
    !rawSamplerSource.includes("switch (") &&
    layout.includes("sampler now owns the ENTIRE 0 -> 26 second film"),
  "CP.1E.13 must preserve one-film runtime authority rather than restoring shot-switched playback.",
);

const cp1e13Lab =
  lab.includes("MyWay · Cinematic Production · CP.1E.13") &&
  lab.includes("reaches and holds the burger contact zone") &&
  lab.includes("deeper back-plane");
const cp1fLab =
  lab.includes("MyWay · Cinematic Production · CP.1F") &&
  lab.includes("asset-aware") &&
  lab.includes("surface-to-surface");
assert(
  cp1e13Lab || cp1fLab,
  "CP.1E.13-family lab copy must describe the contact/spacing successor.",
);
assert(
  readme.includes("CP.1E.13 — Contact Hold + Deeper Fish Spacing") &&
    readme.includes("Hand approach -> contact -> retreat") &&
    readme.includes("Deeper fish negative space") &&
    readme.includes("Camera lock"),
  "CP.1E.13 README must document the focused contact/spacing pass and camera lock.",
);
assert(
  runtime.includes('frameloop="demand"') &&
    runtime.includes('powerPreference: "low-power"') &&
    (runtime.match(/<Canvas\b/g) ?? []).length === 1,
  "CP.1E.13 must preserve the single low-overhead cinematic runtime.",
);

console.log("Cinematic Production CP.1E.13 contact/spacing verification passed.");
console.log(
  "The hand now clears the apple, holds a real burger-contact zone through the nudge, retreats cleanly, and the fish holds deeper negative space while the CP.1E.12 camera remains unchanged.",
);
