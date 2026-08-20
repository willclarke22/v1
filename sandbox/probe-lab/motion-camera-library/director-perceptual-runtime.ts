/**
 * Phase 1B.6 perceptual-capability visual-proof sampler.
 *
 * IMPORTANT: this is a normalized role-space audit fixture, not production
 * cinematography authority. It contains no Golden Lunch asset IDs, world-space
 * coordinates, or copied camera keys. Real production execution must derive exact
 * placement, clearance, contact, framing, and camera rails from selected Asset
 * Library geometry/directability, then compose existing atomic Director capabilities.
 */

import type { DirectorPerceptualCapability } from "./director-perceptual-capabilities";

export type Vec3 = [number, number, number];

export type DirectorPerceptualCapabilityPreviewSlot = {
  slot_id: string;
  semantic_role_id: string;
  label: string;
  required: boolean;
  target_extent_m: number;
  purpose: string;
};

export type DirectorPerceptualCapabilityActorPose = {
  slot_id: string;
  position: Vec3;
  rotation: Vec3;
  scale_multiplier: number;
  visible: boolean;
  emphasis: number;
};

export type DirectorPerceptualCapabilityCameraPose = {
  position: Vec3;
  target: Vec3;
  fov_degrees: number;
};

export type DirectorPerceptualCapabilityRuntimeSample = {
  capability_id: string;
  progress: number;
  phase_index: number;
  phase_label: string;
  actor_poses: DirectorPerceptualCapabilityActorPose[];
  camera: DirectorPerceptualCapabilityCameraPose;
};

export type DirectorPerceptualTravelDirection = "forward" | "reverse";

export type DirectorPerceptualRuntimeOptions = {
  /**
   * Semantic direction in the scene plane. Unlike the retired whole-fixture
   * rotation proof, this changes only the movement/camera relationship that the
   * selected capability owns. 0° = right, 90° = front, 180° = left, 270° = back.
   */
  direction_degrees?: number;
  /** Reverse a directional camera/sweep path without swapping semantic roles. */
  travel_direction?: DirectorPerceptualTravelDirection;
};

export const DIRECTOR_PERCEPTUAL_DIRECTION_PRESETS = [
  { id: "right", label: "Right", degrees: 0 },
  { id: "front_right", label: "Front-right", degrees: 45 },
  { id: "front", label: "Front", degrees: 90 },
  { id: "front_left", label: "Front-left", degrees: 135 },
  { id: "left", label: "Left", degrees: 180 },
  { id: "back_left", label: "Back-left", degrees: 225 },
  { id: "back", label: "Back", degrees: 270 },
  { id: "back_right", label: "Back-right", degrees: 315 },
] as const;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * clamp01(t);
}

function smootherStep(value: number) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function pulse(progress: number, center: number, width: number) {
  return clamp01(1 - Math.abs(progress - center) / Math.max(0.001, width));
}

function normalizeDegrees(value: number) {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function directionUnit(degrees: number): Vec3 {
  const radians = (normalizeDegrees(degrees) * Math.PI) / 180;
  return [Math.cos(radians), 0, Math.sin(radians)];
}

function scaleVec([x, y, z]: Vec3, scalar: number): Vec3 {
  return [x * scalar, y * scalar, z * scalar];
}

function addVec([ax, ay, az]: Vec3, [bx, by, bz]: Vec3): Vec3 {
  return [ax + bx, ay + by, az + bz];
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function travelSign(direction: DirectorPerceptualTravelDirection | undefined) {
  return direction === "reverse" ? -1 : 1;
}

function yawToward(from: Vec3, to: Vec3) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  return Math.atan2(dx, dz);
}

function actor(
  slot_id: string,
  position: Vec3,
  options: Partial<Omit<DirectorPerceptualCapabilityActorPose, "slot_id" | "position">> = {},
): DirectorPerceptualCapabilityActorPose {
  return {
    slot_id,
    position,
    rotation: options.rotation ?? [0, 0, 0],
    scale_multiplier: options.scale_multiplier ?? 1,
    visible: options.visible ?? true,
    emphasis: options.emphasis ?? 0,
  };
}

export function directorPerceptualPreviewSlots(capability: DirectorPerceptualCapability): DirectorPerceptualCapabilityPreviewSlot[] {
  switch (capability.id) {
    case "agent_approach_contact_response_retreat":
      return [
        { slot_id: "effector", semantic_role_id: "effector", label: "Effector", required: true, target_extent_m: 1.35, purpose: "Actor that visibly causes the intervention." },
        { slot_id: "target", semantic_role_id: "target", label: "Target", required: true, target_extent_m: 1.65, purpose: "Actor that receives and displays the response." },
        { slot_id: "obstacle", semantic_role_id: "obstacles", label: "Context / obstacle", required: false, target_extent_m: 1.15, purpose: "Optional geometry that makes the approach path spatially meaningful." },
      ];
    case "arrive_settle_present_depart":
      return [
        { slot_id: "context_anchor", semantic_role_id: "context_anchor", label: "Context anchor", required: true, target_extent_m: 1.7, purpose: "Persistent actor that keeps the learner oriented." },
        { slot_id: "insert_actor", semantic_role_id: "insert_actor", label: "Insert actor", required: true, target_extent_m: 1.55, purpose: "Temporary actor that arrives, settles, presents, and leaves." },
      ];
    case "overlapping_attention_handoff":
      return [
        { slot_id: "source_actor", semantic_role_id: "source_actor", label: "Source actor", required: true, target_extent_m: 1.45, purpose: "Current owner of learner attention." },
        { slot_id: "target_actor", semantic_role_id: "target_actor", label: "Target actor", required: true, target_extent_m: 1.45, purpose: "Next owner of learner attention." },
        { slot_id: "context_anchor", semantic_role_id: "context_anchor", label: "Context anchor", required: false, target_extent_m: 1.25, purpose: "Optional persistent reference frame shared across the handoff." },
      ];
    case "occlusion_to_parallax_discovery":
      return [
        { slot_id: "occluder", semantic_role_id: "occluder", label: "Occluder", required: true, target_extent_m: 2.1, purpose: "Foreground actor that initially hides the subject." },
        { slot_id: "hidden_subject", semantic_role_id: "hidden_subject", label: "Hidden subject", required: true, target_extent_m: 1.22, purpose: "Actor discovered by viewpoint change rather than self-motion." },
        { slot_id: "context", semantic_role_id: "context", label: "Context", required: false, target_extent_m: 1.05, purpose: "Optional scale/orientation reference that persists through the reveal." },
      ];
    case "context_to_hero_resolution":
      return [
        { slot_id: "hero", semantic_role_id: "hero", label: "Hero", required: true, target_extent_m: 1.8, purpose: "Final conceptual focus." },
        { slot_id: "support_a", semantic_role_id: "supporting_context", label: "Supporting context A", required: false, target_extent_m: 1.25, purpose: "Previously established context that recedes but remains legible." },
        { slot_id: "support_b", semantic_role_id: "supporting_context", label: "Supporting context B", required: false, target_extent_m: 1.15, purpose: "Second optional context actor for hero dominance testing." },
      ];
    case "recap_sweep":
      return [
        { slot_id: "scene_anchor", semantic_role_id: "scene_anchor", label: "Scene anchor", required: true, target_extent_m: 1.5, purpose: "Stable reference that binds the recap into one spatial model." },
        { slot_id: "target_a", semantic_role_id: "targets", label: "Recap target A", required: true, target_extent_m: 1.15, purpose: "First established target revisited by the sweep." },
        { slot_id: "target_b", semantic_role_id: "targets", label: "Recap target B", required: true, target_extent_m: 1.15, purpose: "Second established target revisited by the sweep." },
        { slot_id: "target_c", semantic_role_id: "targets", label: "Recap target C", required: false, target_extent_m: 1.15, purpose: "Optional third target for ordered attention." },
      ];
    case "action_consequence_reframe":
    default:
      return [
        { slot_id: "changed_target", semantic_role_id: "changed_target", label: "Changed target", required: true, target_extent_m: 1.7, purpose: "Resulting state that deserves compositional priority." },
        { slot_id: "causal_context", semantic_role_id: "causal_context", label: "Causal context", required: false, target_extent_m: 1.25, purpose: "Optional evidence of the action that caused the changed state." },
      ];
  }
}

export function directorPerceptualDefaultDirectionDegrees(capability: DirectorPerceptualCapability) {
  switch (capability.id) {
    case "agent_approach_contact_response_retreat":
      return 180;
    case "arrive_settle_present_depart":
      return 0;
    case "context_to_hero_resolution":
      return 90;
    case "overlapping_attention_handoff":
    case "action_consequence_reframe":
    case "recap_sweep":
    case "occlusion_to_parallax_discovery":
    default:
      return 0;
  }
}

export function directorPerceptualSupportsDirectionalSide(capability: DirectorPerceptualCapability) {
  return [
    "agent_approach_contact_response_retreat",
    "arrive_settle_present_depart",
    "overlapping_attention_handoff",
    "context_to_hero_resolution",
    "action_consequence_reframe",
  ].includes(capability.id);
}

export function directorPerceptualSupportsTravelDirection(capability: DirectorPerceptualCapability) {
  return [
    "occlusion_to_parallax_discovery",
    "context_to_hero_resolution",
    "recap_sweep",
  ].includes(capability.id);
}

function phaseIndexFor(capability: DirectorPerceptualCapability, progress: number) {
  const count = Math.max(1, capability.phases.length);
  return Math.min(count - 1, Math.floor(clamp01(progress) * count));
}

export function sampleDirectorPerceptualCapabilityRuntime(
  capability: DirectorPerceptualCapability,
  progressInput: number,
  options: DirectorPerceptualRuntimeOptions = {},
): DirectorPerceptualCapabilityRuntimeSample {
  const t = clamp01(progressInput);
  const phaseIndex = phaseIndexFor(capability, t);
  const phaseLabel = capability.phases[phaseIndex] ?? capability.phases[0] ?? "capability";
  const directionDegrees = normalizeDegrees(
    options.direction_degrees ?? directorPerceptualDefaultDirectionDegrees(capability),
  );
  const direction = directionUnit(directionDegrees);
  const sign = travelSign(options.travel_direction);
  let actorPoses: DirectorPerceptualCapabilityActorPose[] = [];
  let camera: DirectorPerceptualCapabilityCameraPose = {
    position: [0, 2.7, 7.2],
    target: [0, 0.65, 0],
    fov_degrees: 42,
  };

  switch (capability.id) {
    case "agent_approach_contact_response_retreat": {
      const approach = smootherStep(t / 0.42);
      const response = smootherStep((t - 0.42) / 0.2);
      const settle = smootherStep((t - 0.62) / 0.14);
      const retreat = smootherStep((t - 0.72) / 0.28);
      const start = scaleVec(direction, 3.6);
      const contact = scaleVec(direction, 0.95);
      const retreatEnd = scaleVec(direction, 3.4);
      const effectorPosition = t < 0.72
        ? lerpVec(start, contact, approach)
        : lerpVec(contact, retreatEnd, retreat);
      const responseDistance = response * 0.62 - settle * 0.16;
      const targetPosition = scaleVec(direction, -responseDistance);
      actorPoses = [
        actor("effector", addVec(effectorPosition, [0, 0, 0.05]), {
          rotation: [0, yawToward(effectorPosition, targetPosition), 0],
          emphasis: pulse(t, 0.45, 0.18),
        }),
        actor("target", targetPosition, { emphasis: pulse(t, 0.6, 0.26) }),
        // Context remains in world space so changing the approach side is not
        // secretly implemented by spinning the whole fixture.
        actor("obstacle", [1.9, 0, -1.55], { scale_multiplier: 0.9, visible: true }),
      ];
      camera = {
        position: [3.55, 2.55, 6.2],
        target: [targetPosition[0] * 0.22, 0.58, targetPosition[2] * 0.22],
        fov_degrees: 40,
      };
      break;
    }
    case "arrive_settle_present_depart": {
      const arrive = smootherStep(t / 0.38);
      const depart = smootherStep((t - 0.74) / 0.26);
      const settlePosition: Vec3 = [1.45, 0, 0.15];
      const offstagePosition = addVec(settlePosition, scaleVec(direction, 2.95));
      const insertPosition = t < 0.74
        ? lerpVec(offstagePosition, settlePosition, arrive)
        : lerpVec(settlePosition, addVec(settlePosition, scaleVec(direction, 3.25)), depart);
      const settleArc = t < 0.38 ? Math.sin(clamp01(t / 0.38) * Math.PI) * 0.48 : 0;
      const insertScale = t < 0.16 ? lerp(0.76, 1, smootherStep(t / 0.16)) : 1;
      actorPoses = [
        actor("context_anchor", [-1.15, 0, 0], { emphasis: 0.16 }),
        actor("insert_actor", addVec(insertPosition, [0, settleArc, 0]), {
          rotation: [0, yawToward(insertPosition, [0, 0, 0]), 0],
          scale_multiplier: insertScale,
          emphasis: t > 0.33 && t < 0.76 ? 0.86 : 0.18,
        }),
      ];
      camera = {
        position: [3.8, 2.5, 6.4],
        target: [lerp(-0.25, 0.45, smootherStep((t - 0.18) / 0.34)), 0.62, 0],
        fov_degrees: 41,
      };
      break;
    }
    case "overlapping_attention_handoff": {
      const transfer = smootherStep((t - 0.18) / 0.64);
      const sourcePosition = scaleVec(direction, -1.55);
      const targetPosition = scaleVec(direction, 1.55);
      actorPoses = [
        actor("source_actor", addVec(sourcePosition, [0, 0, 0.05]), { emphasis: 1 - transfer * 0.82 }),
        actor("target_actor", addVec(targetPosition, [0, 0, -0.05]), { emphasis: 0.18 + transfer * 0.82 }),
        actor("context_anchor", [0, 0, -1.65], { scale_multiplier: 0.92, emphasis: 0.08 }),
      ];
      const attentionTarget = lerpVec(sourcePosition, targetPosition, transfer);
      camera = {
        position: [0.1, 2.65, 6.8],
        target: [attentionTarget[0] * 0.64, 0.62, attentionTarget[2] * 0.64],
        fov_degrees: 42,
      };
      break;
    }
    case "occlusion_to_parallax_discovery": {
      const reveal = smootherStep((t - 0.18) / 0.68);
      const angle = sign * reveal * (Math.PI * 0.34);
      const radius = 7.0;
      actorPoses = [
        actor("occluder", [0, 0, 0], { emphasis: 0.14 }),
        actor("hidden_subject", [0, 0.08, -1.55], { rotation: [0, 0.06, 0], emphasis: 0.2 + reveal * 0.75 }),
        actor("context", [-2.35, 0, -0.65], { scale_multiplier: 0.85, emphasis: 0.05 }),
      ];
      camera = {
        position: [Math.sin(angle) * radius, 2.05, Math.cos(angle) * radius],
        target: [0, 0.68, -0.32],
        fov_degrees: 39,
      };
      break;
    }
    case "context_to_hero_resolution": {
      const resolve = smootherStep((t - 0.14) / 0.76);
      const baseAngle = (directionDegrees * Math.PI) / 180;
      const arcAngle = baseAngle + sign * lerp(-0.10, 0.10, resolve);
      const radius = lerp(8.0, 4.45, resolve);
      actorPoses = [
        actor("hero", [0, 0, 0], { scale_multiplier: lerp(0.94, 1.06, resolve), emphasis: 0.2 + resolve * 0.8 }),
        actor("support_a", [lerp(-1.9, -2.45, resolve), 0, -0.55], { scale_multiplier: lerp(1, 0.86, resolve), emphasis: 0.14 * (1 - resolve) }),
        actor("support_b", [lerp(1.95, 2.55, resolve), 0, -0.7], { scale_multiplier: lerp(1, 0.82, resolve), emphasis: 0.12 * (1 - resolve) }),
      ];
      camera = {
        position: [Math.cos(arcAngle) * radius, lerp(3.2, 1.72, resolve), Math.sin(arcAngle) * radius],
        target: [0, lerp(0.55, 0.68, resolve), 0],
        fov_degrees: lerp(45, 34, resolve),
      };
      break;
    }
    case "recap_sweep": {
      const reversed = sign < 0;
      const segment = t < 0.33 ? 0 : t < 0.66 ? 1 : 2;
      const local = segment === 0
        ? smootherStep(t / 0.33)
        : segment === 1
          ? smootherStep((t - 0.33) / 0.33)
          : smootherStep((t - 0.66) / 0.34);
      const targetXs = reversed ? [2.0, 0, -2.0] : [-2.0, 0, 2.0];
      const currentX = segment === 0
        ? lerp(reversed ? 1.1 : -1.1, targetXs[0], local)
        : segment === 1
          ? lerp(targetXs[0], targetXs[1], local)
          : lerp(targetXs[1], targetXs[2], local);
      const aCenter = reversed ? 0.8 : 0.22;
      const bCenter = 0.5;
      const cCenter = reversed ? 0.22 : 0.8;
      actorPoses = [
        actor("scene_anchor", [0, 0, -1.65], { scale_multiplier: 0.9, emphasis: 0.08 }),
        actor("target_a", [-2.0, 0, 0], { emphasis: pulse(t, aCenter, 0.22) }),
        actor("target_b", [0, 0, 0.2], { emphasis: pulse(t, bCenter, 0.23) }),
        actor("target_c", [2.0, 0, 0], { emphasis: pulse(t, cCenter, 0.22) }),
      ];
      camera = {
        position: [lerp(reversed ? 2.2 : -2.1, reversed ? -2.1 : 2.2, smootherStep(t)), 2.75, 7.0],
        target: [currentX * 0.72, 0.62, 0],
        fov_degrees: 43,
      };
      break;
    }
    case "action_consequence_reframe":
    default: {
      const reframe = smootherStep((t - 0.2) / 0.62);
      const changedTarget: Vec3 = [0.35, 0, 0];
      const causalContext = addVec(changedTarget, scaleVec(direction, 2.25));
      const cameraStart = addVec(scaleVec(direction, 1.15), [0, 2.8, 6.25]);
      actorPoses = [
        actor("changed_target", changedTarget, { scale_multiplier: lerp(0.96, 1.06, reframe), emphasis: 0.18 + reframe * 0.82 }),
        actor("causal_context", causalContext, { scale_multiplier: lerp(1, 0.84, reframe), emphasis: 0.28 * (1 - reframe) }),
      ];
      camera = {
        position: lerpVec(cameraStart, [0.9, 2.1, 5.05], reframe),
        target: lerpVec(causalContext, [0.35, 0.62, 0], reframe),
        fov_degrees: lerp(43, 37, reframe),
      };
      break;
    }
  }

  return {
    capability_id: capability.id,
    progress: t,
    phase_index: phaseIndex,
    phase_label: phaseLabel,
    actor_poses: actorPoses,
    camera,
  };
}
