import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityById,
  directorCapabilityDemoMoment,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function capability(id: string) {
  const value = directorCapabilityById(id);
  assert(value, `Missing capability: ${id}`);
  return value;
}

function moment(id: string) {
  return directorCapabilityDemoMoment(capability(id));
}

const ids = DIRECTOR_CAPABILITIES.map((item) => item.id);
assert(ids.length === 183, `Expected 183 capabilities, found ${ids.length}`);
assert(new Set(ids).size === ids.length, "Capability ids are not unique");

for (const item of DIRECTOR_CAPABILITIES) {
  const fallback = item.compiler.fallback_capability_id;
  assert(!fallback || directorCapabilityById(fallback), `${item.id} has missing fallback ${fallback}`);
  const demo = directorCapabilityDemoMoment(item);
  assert(demo.shot, `${item.id} did not compile a V2 shot`);
  assert(demo.shot.camera.movement_steps.length > 0, `${item.id} has no camera movement step`);
}

const roles = capability("static").demo.asset_roles;
const primary = roles.find((role) => role.role === "primary_subject");
const secondary = roles.find((role) => role.role === "secondary_subject");
const context = roles.find((role) => role.role === "context_subject");
assert(primary?.preferred_asset_ids?.[0] === "soldier_polyp_ul46oxezyk", "Primary fixture is not the Soldier");
assert(secondary?.preferred_asset_ids?.[0] === "fire_hydrant_bk_mrjsn0wl", "Secondary fixture is not the Fire Hydrant");
assert(context?.preferred_asset_ids?.[0] === "lantern_bk_mrqk238f", "Context fixture is not the Lantern");

for (const id of ["static", "follow", "lead_subject", "lag_follow", "track_parallel", "camera_object_attached"]) {
  assert(moment(id).events.some((event) => event.actor_entity_id === "primary_subject" && event.behaviour === "move_to"), `${id} does not include subject travel`);
}

for (const id of ["pan", "reframe"]) {
  const shot = moment(id).shot!;
  assert(shot.camera.focus_entity_ids.includes("secondary_subject"), `${id} does not target the secondary subject`);
}

const settleMoves = moment("settle").shot!.camera.movement_steps.map((step) => step.movement);
assert(settleMoves[0] === "push_in" && settleMoves.includes("settle"), "Settle demo must settle from a preceding move");

const roll = moment("roll").events[0];
assert(roll?.behaviour === "roll", "Roll demo is missing roll behavior");
assert(Number(roll.parameters.distance_m) > 0, "Roll demo has no travel distance");
assert(Array.isArray(roll.parameters.direction), "Roll demo has no travel direction");

for (const id of ["pivot", "hinge", "object_open", "object_close"]) {
  const event = moment(id).events[0];
  assert(Array.isArray(event?.parameters.pivot_local), `${id} has no visible pivot anchor`);
}

assert(capability("inside_object").compiler.threejs === "approximate", "Inside-object view must remain approximate for arbitrary GLBs");
assert(moment("object_attached").events.some((event) => event.behaviour === "move_to"), "Object-attached angle demo does not move its subject");
assert(moment("hard_cut").shot!.camera.movement_steps.some((step) => step.movement === "cut"), "Hard cut has no cut step");
assert(moment("cut_on_action").events.some((event) => event.behaviour === "move_to"), "Cut-on-action has no action to cut on");
assert(moment("preserve_screen_position").shot!.camera.movement_steps.some((step) => step.movement === "follow"), "Preserve-screen-position does not use actor-relative follow");
assert(moment("avoid_occlusion").shot!.camera.movement_steps.some((step) => step.movement === "arc_left"), "Avoid-occlusion demo does not move around its foreground blocker");
assert(moment("introduce").events.some((event) => event.behaviour === "move_to"), "Introduce demo does not bring a subject into frame");
assert(moment("build_from_parts").events.length >= 2, "Build-from-parts demo does not stage multiple parts");
assert(moment("motivated_source").shot!.lighting.motivated_source_entity_id === "context_subject", "Motivated light is not bound to the Lantern context role");

console.log(`Director Capability polish verification passed: ${ids.length} unique capabilities.`);
