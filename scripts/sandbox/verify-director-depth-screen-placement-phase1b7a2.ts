import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  directorCapabilityDemoShot,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_SCENES,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-scenes";
import {
  applyDirectorBlocking,
  projectDirectorActorCenter,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string) {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability: ${id}`);
  return found;
}

function requireSceneBQualificationFixture() {
  const found = DIRECTOR_QUALIFICATION_SCENES.find(
    (scene) => scene.id === "scene_b_spatial_relationship",
  );
  if (!found) {
    throw new Error("Scene B qualification fixture is missing.");
  }
  return found;
}

const sceneB = requireSceneBQualificationFixture();

function sceneBActors(): DirectorRuntimeActor[] {
  return [
    {
      id: "primary_subject",
      position: [...sceneB.blocking.primary],
      rotation: [0, 0, 0],
      size: [0.66, 1.75, 0.52],
    },
    {
      id: "secondary_subject",
      position: [...sceneB.blocking.secondary],
      rotation: [0, 0, 0],
      size: [0.82, 1.10, 0.82],
    },
    {
      id: "context_subject",
      position: [...sceneB.blocking.context],
      rotation: [0, 0, 0],
      size: [0.46, 0.90, 0.46],
    },
  ];
}

function staged(id: string) {
  const selected = capability(id);
  const moment = directorCapabilityDemoMoment(selected);
  const actors = applyDirectorBlocking(moment, sceneBActors());
  const primary = projectDirectorActorCenter(moment, actors, "primary_subject", 0);
  assert(primary, `${id} did not produce primary screen-space evidence.`);
  return { selected, moment, actors, primary };
}

const screenLeft = staged("screen_left");
const screenRight = staged("screen_right");
assert(
  screenLeft.primary.ndc[0] < -0.08,
  `Screen left must place the primary visibly left of frame center; got NDC x=${screenLeft.primary.ndc[0].toFixed(3)}.`,
);
assert(
  screenRight.primary.ndc[0] > 0.08,
  `Screen right must place the primary visibly right of frame center; got NDC x=${screenRight.primary.ndc[0].toFixed(3)}.`,
);
assert(
  screenRight.primary.ndc[0] - screenLeft.primary.ndc[0] > 0.22,
  "Screen-left and screen-right auditions are not visually distinct enough.",
);
assert(
  screenLeft.primary.visible_in_safe_frame && screenRight.primary.visible_in_safe_frame,
  "Screen-side placement must remain inside the qualification safe frame.",
);

const foreground = staged("foreground");
const midground = staged("midground");
const background = staged("background");
assert(
  foreground.primary.camera_depth_m + 0.4 < midground.primary.camera_depth_m,
  `Foreground must resolve nearer than Midground in camera space (${foreground.primary.camera_depth_m.toFixed(2)} vs ${midground.primary.camera_depth_m.toFixed(2)}m).`,
);
assert(
  midground.primary.camera_depth_m + 0.4 < background.primary.camera_depth_m,
  `Background must resolve deeper than Midground in camera space (${midground.primary.camera_depth_m.toFixed(2)} vs ${background.primary.camera_depth_m.toFixed(2)}m).`,
);
assert(
  foreground.primary.visible_in_safe_frame &&
    midground.primary.visible_in_safe_frame &&
    background.primary.visible_in_safe_frame,
  "Depth placement canaries must keep the primary visible while changing depth.",
);

const layeredCapability = capability("layered_depth");
const layeredShot = directorCapabilityDemoShot(layeredCapability);
assert(
  layeredShot.composition.framing === "group_shot",
  "Layered depth must use a group framing so the foreground actor cannot erase the other layers.",
);
assert(
  layeredShot.camera.focus_entity_ids.join("|") ===
    "primary_subject|secondary_subject|context_subject",
  "Layered depth camera solve must include all three depth layers.",
);
const layeredMoment = directorCapabilityDemoMoment(layeredCapability);
const layeredActors = applyDirectorBlocking(layeredMoment, sceneBActors());
const layeredPrimary = projectDirectorActorCenter(
  layeredMoment,
  layeredActors,
  "primary_subject",
  0,
);
const layeredSecondary = projectDirectorActorCenter(
  layeredMoment,
  layeredActors,
  "secondary_subject",
  0,
);
const layeredContext = projectDirectorActorCenter(
  layeredMoment,
  layeredActors,
  "context_subject",
  0,
);
assert(
  layeredPrimary && layeredSecondary && layeredContext,
  "Layered depth is missing screen-space evidence for one or more actors.",
);
assert(
  layeredPrimary.visible_in_safe_frame &&
    layeredSecondary.visible_in_safe_frame &&
    layeredContext.visible_in_safe_frame,
  "Layered depth must keep foreground, midground, and background actors inside the safe frame.",
);
assert(
  layeredPrimary.camera_depth_m + 0.35 < layeredSecondary.camera_depth_m &&
    layeredSecondary.camera_depth_m + 0.35 < layeredContext.camera_depth_m,
  `Layered depth must preserve ordered camera-space layers; got ${[
    layeredPrimary.camera_depth_m,
    layeredSecondary.camera_depth_m,
    layeredContext.camera_depth_m,
  ].map((value) => value.toFixed(2)).join(" / ")}m.`,
);

const runtime = source(
  "sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx",
);
for (const marker of [
  "directorBlockingCompositionBasis",
  "setCompositionCoordinate",
  "view_forward",
  "view_right",
  "projectDirectorActorCenter",
  "Negative view-forward is physically toward the opening camera.",
]) {
  assert(runtime.includes(marker), `Camera-relative blocking runtime marker missing: ${marker}`);
}
for (const retiredMarker of [
  'case "foreground": position.z +=',
  'case "background": position.z -=',
  'case "screen_left": position.x -=',
  'case "screen_right": position.x +=',
]) {
  assert(
    !runtime.includes(retiredMarker),
    `Depth/screen placement still contains retired world-axis approximation: ${retiredMarker}`,
  );
}

const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
for (const marker of [
  "QualificationAssetPreloader",
  "PREPARING AUDITION REEL",
  "The reel will unlock only after every scheduled real asset is cached.",
  "Retry preparation",
  "REEL COMPLETE",
  "safe to stop the Snipping Tool recording",
  'overflowWrap: "anywhere"',
  'phase === "complete"',
]) {
  assert(room.includes(marker), `Qualification recording-hardening marker missing: ${marker}`);
}
assert(
  (room.match(/<Canvas/g) ?? []).length === 1,
  "Qualification Room must retain exactly one active WebGL Canvas.",
);

const readme = source(
  "sandbox/probe-lab/motion-camera-library/README.md",
);
assert(
  readme.includes("Phase 1B.7A.2 — camera-relative placement + recording hardening"),
  "Director README is missing the Phase 1B.7A.2 qualification note.",
);

console.log("Director Qualification Room Phase 1B.7A.2 verification passed.");
console.log("Depth/screen placement is camera-relative, projected canaries distinguish all six Scene-B placements, and recording waits for real-asset warmup then ends on an explicit REEL COMPLETE slate.");
