import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_PERCEPTUAL_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-perceptual-capabilities";
import {
  sampleDirectorPerceptualCapabilityRuntime,
} from "../../sandbox/probe-lab/motion-camera-library/director-perceptual-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string) {
  const value = DIRECTOR_PERCEPTUAL_CAPABILITIES.find((candidate) => candidate.id === id);
  assert(value, `Missing Level 1 capability: ${id}.`);
  return value;
}

function pose(sample: ReturnType<typeof sampleDirectorPerceptualCapabilityRuntime>, id: string) {
  const value = sample.actor_poses.find((candidate) => candidate.slot_id === id);
  assert(value, `Missing proof pose: ${id}.`);
  return value;
}

const contact = capability("agent_approach_contact_response_retreat");
const contactLeft = sampleDirectorPerceptualCapabilityRuntime(contact, 0, { direction_degrees: 180 });
const contactRight = sampleDirectorPerceptualCapabilityRuntime(contact, 0, { direction_degrees: 0 });
assert(pose(contactLeft, "effector").position[0] < 0 && pose(contactRight, "effector").position[0] > 0, "Approach must work from left and right.");
assert(
  JSON.stringify(pose(contactLeft, "obstacle").position) === JSON.stringify(pose(contactRight, "obstacle").position),
  "Changing approach side must not rotate the whole fixture.",
);

const arrival = capability("arrive_settle_present_depart");
const arriveLeft = sampleDirectorPerceptualCapabilityRuntime(arrival, 0, { direction_degrees: 180 });
const arriveRight = sampleDirectorPerceptualCapabilityRuntime(arrival, 0, { direction_degrees: 0 });
assert(pose(arriveLeft, "insert_actor").position[0] < pose(arriveRight, "insert_actor").position[0], "Arrival side must change independently of the context anchor.");
assert(
  JSON.stringify(pose(arriveLeft, "context_anchor").position) === JSON.stringify(pose(arriveRight, "context_anchor").position),
  "Arrival direction must preserve the context anchor.",
);

const handoff = capability("overlapping_attention_handoff");
const handoffHorizontal = sampleDirectorPerceptualCapabilityRuntime(handoff, 0.5, { direction_degrees: 0 });
const handoffDepth = sampleDirectorPerceptualCapabilityRuntime(handoff, 0.5, { direction_degrees: 90 });
assert(Math.abs(pose(handoffHorizontal, "source_actor").position[0]) > 1, "Horizontal handoff should separate roles on X.");
assert(Math.abs(pose(handoffDepth, "source_actor").position[2]) > 1, "Depth handoff should separate roles on Z.");

const parallax = capability("occlusion_to_parallax_discovery");
const clockwise = sampleDirectorPerceptualCapabilityRuntime(parallax, 0.7, { travel_direction: "forward" });
const counter = sampleDirectorPerceptualCapabilityRuntime(parallax, 0.7, { travel_direction: "reverse" });
assert(clockwise.camera.position[0] * counter.camera.position[0] < 0, "Parallax reveal must support opposite orbit directions.");
assert(
  JSON.stringify(pose(clockwise, "hidden_subject").position) === JSON.stringify(pose(counter, "hidden_subject").position),
  "Parallax direction must be camera-earned; hidden subject must remain fixed.",
);

const hero = capability("context_to_hero_resolution");
const heroFront = sampleDirectorPerceptualCapabilityRuntime(hero, 0.7, { direction_degrees: 90, travel_direction: "forward" });
const heroLeft = sampleDirectorPerceptualCapabilityRuntime(hero, 0.7, { direction_degrees: 180, travel_direction: "forward" });
assert(Math.abs(heroFront.camera.position[2]) > Math.abs(heroFront.camera.position[0]), "Front hero resolve should be depth-dominant.");
assert(Math.abs(heroLeft.camera.position[0]) > Math.abs(heroLeft.camera.position[2]), "Left hero resolve should be lateral-dominant.");
assert(JSON.stringify(pose(heroFront, "hero").position) === JSON.stringify(pose(heroLeft, "hero").position), "Hero camera-side variation must not spin the hero fixture.");

const recap = capability("recap_sweep");
const recapForward = sampleDirectorPerceptualCapabilityRuntime(recap, 0.2, { travel_direction: "forward" });
const recapReverse = sampleDirectorPerceptualCapabilityRuntime(recap, 0.2, { travel_direction: "reverse" });
assert(pose(recapForward, "target_a").emphasis > pose(recapForward, "target_c").emphasis, "Forward recap should favor target A first.");
assert(pose(recapReverse, "target_c").emphasis > pose(recapReverse, "target_a").emphasis, "Reverse recap should favor target C first.");

const consequence = capability("action_consequence_reframe");
const consequenceLeft = sampleDirectorPerceptualCapabilityRuntime(consequence, 0.2, { direction_degrees: 180 });
const consequenceRight = sampleDirectorPerceptualCapabilityRuntime(consequence, 0.2, { direction_degrees: 0 });
assert(pose(consequenceLeft, "causal_context").position[0] < pose(consequenceRight, "causal_context").position[0], "Consequence reframe must accept different causal-context sides.");
assert(JSON.stringify(pose(consequenceLeft, "changed_target").position) === JSON.stringify(pose(consequenceRight, "changed_target").position), "Changed target must remain stable when causal-context side changes.");

const level1 = source("sandbox/probe-lab/motion-camera-library/ui/director-level1-capability-visualization.tsx");
assert(level1.includes("Asset facing correction") && level1.includes("roleYawOffsets"), "Per-role asset facing correction is missing.");
assert(level1.includes("Clockwise reveal") && level1.includes("Counterclockwise reveal"), "Parallax orbit-direction controls are missing.");
assert(level1.includes("Any angle"), "Arbitrary-angle directional control is missing.");

const viewer = source("sandbox/probe-lab/motion-camera-library/ui/director-perceptual-capability-audit-viewer.tsx");
assert(viewer.includes("scale={1.028}") && viewer.includes('color: "#e8e44d"'), "Golden-style tight outline shell is missing.");
assert(!viewer.includes("HighlightEnvelope") && !viewer.includes("ringGeometry args={[0.78, 0.92, 48]}"), "Retired halo/floor-ring emphasis must be removed.");

const registry = source("sandbox/probe-lab/motion-camera-library/director-capability-registry.ts");
assert(registry.includes("tight high-contrast silhouette outline") && !registry.includes("outline / halo emphasis"), "highlight_subject description must match the Golden outline grammar.");

console.log("Director Level 1 directional variants Phase 1B.6.4 verification passed.");
console.log("Directional execution, clockwise/counterclockwise path variants, per-asset facing correction, and Golden-style tight outline emphasis are independently controlled.");
