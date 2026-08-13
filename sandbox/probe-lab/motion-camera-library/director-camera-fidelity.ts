import * as THREE from "three";

import {
  applyDirectorBlocking,
  sampleDirectorActorState,
  sampleDirectorCameraPose,
  validateDirectorShot,
  type DirectorRuntimeActor,
} from "../scenes/ui/director-shot-runtime";
import {
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "./director-capability-registry";
import {
  directorControlledAuditRoleLayout,
  directorVisualAuditDefinition,
} from "./director-visual-audit";

export const DIRECTOR_CAMERA_FIDELITY_VERSION =
  "director_camera_fidelity_phase1b_v1" as const;

export const DIRECTOR_CAMERA_FIDELITY_PROGRESS = [
  0,
  0.25,
  0.5,
  0.75,
  1,
] as const;

export type DirectorCameraFidelityFixture =
  | "stationary_subject"
  | "two_actor_relationship"
  | "travelling_subject"
  | "travelling_rotating_subject"
  | "interior_dependent";

export type DirectorCameraFidelityCheck = {
  id: string;
  description: string;
  passed: boolean;
  measured: string;
};

export type DirectorCameraFidelitySample = {
  progress: number;
  camera_position: [number, number, number];
  target_position: [number, number, number];
  fov_degrees: number;
  roll_degrees: number;
  camera_target_distance_m: number;
  primary_actor_position: [number, number, number] | null;
};

export type DirectorCameraFidelityReport = {
  schema_version: typeof DIRECTOR_CAMERA_FIDELITY_VERSION;
  capability_id: string;
  category: DirectorCapability["category"];
  support_level: DirectorCapability["compiler"]["threejs"];
  fixture: DirectorCameraFidelityFixture;
  controlled_geometry: true;
  samples: DirectorCameraFidelitySample[];
  motion_signature: {
    camera_travel_m: number;
    target_travel_m: number;
    camera_target_distance_delta_m: number;
    primary_actor_travel_m: number;
    fov_delta_degrees: number;
    roll_delta_degrees: number;
  };
  checks: DirectorCameraFidelityCheck[];
  automated_status: "pass" | "review";
  limitations: string[];
  visual_review_required: true;
  validation: ReturnType<typeof validateDirectorShot>;
};

function rounded(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function tuple(vector: THREE.Vector3): [number, number, number] {
  return [
    rounded(vector.x),
    rounded(vector.y),
    rounded(vector.z),
  ];
}

function fixtureFor(
  capability: DirectorCapability,
): DirectorCameraFidelityFixture {
  if (capability.id === "inside_object") return "interior_dependent";
  if (
    capability.id === "object_attached" ||
    capability.id === "camera_object_attached"
  ) {
    return "travelling_rotating_subject";
  }
  if (
    capability.category === "camera_movement" &&
    ["static", "follow", "lead_subject", "lag_follow", "track_parallel"].includes(
      capability.id,
    )
  ) {
    return "travelling_subject";
  }
  if (
    capability.category === "camera_framing" &&
    [
      "two_shot",
      "group_shot",
      "over_shoulder",
      "point_of_view",
      "cutaway",
      "two_subject_balance",
      "focus_deep",
    ].includes(capability.id)
  ) {
    return "two_actor_relationship";
  }
  if (
    capability.category === "camera_movement" &&
    ["pan", "reframe", "reverse_reveal"].includes(capability.id)
  ) {
    return "two_actor_relationship";
  }
  return "stationary_subject";
}

function roleSize(
  role: string,
  targetExtent: number,
  fixture: ReturnType<typeof directorVisualAuditDefinition>["fixture"],
): [number, number, number] {
  const extent = Math.max(
    fixture === "detail_target" ? 0.06 : 0.35,
    targetExtent,
  );
  if (fixture === "detail_target" && role === "secondary_subject") {
    return [extent, extent * 0.42, extent];
  }
  if (fixture === "detail_target" && role === "context_subject") {
    return [extent * 0.55, extent, extent * 0.45];
  }
  if (role === "primary_subject") {
    return [extent * 0.56, extent, extent * 0.44];
  }
  if (role === "secondary_subject") {
    return [extent * 0.72, extent * 0.9, extent * 0.62];
  }
  return [extent * 0.68, extent * 0.82, extent * 0.68];
}

export function directorCameraFidelityFixtureActors(
  capability: DirectorCapability,
): DirectorRuntimeActor[] {
  const fixture = directorVisualAuditDefinition(capability).fixture;
  const actors = capability.demo.asset_roles.map((role) => {
    const layout = directorControlledAuditRoleLayout(fixture, role.role);
    return {
      id: role.role,
      position: [...layout.position] as [number, number, number],
      rotation: [...layout.rotation] as [number, number, number],
      size: roleSize(role.role, layout.target_extent_m, fixture),
    };
  });
  const moment = directorCapabilityDemoMoment(capability);
  return applyDirectorBlocking(moment, actors);
}

function actorById(
  actors: DirectorRuntimeActor[],
  id: string,
) {
  return actors.find((actor) => actor.id === id) ?? null;
}

function actorEye(
  moment: ReturnType<typeof directorCapabilityDemoMoment>,
  actor: DirectorRuntimeActor,
  progress: number,
  actors: DirectorRuntimeActor[],
) {
  const sample = sampleDirectorActorState(moment, actor, progress, actors);
  return sample.position.clone().add(
    new THREE.Vector3(0, Math.max(0.08, actor.size[1]) * 0.68, 0),
  );
}

function cameraLocalOffset(
  capability: DirectorCapability,
  actors: DirectorRuntimeActor[],
  progress: number,
) {
  const moment = directorCapabilityDemoMoment(capability);
  const actor = actorById(actors, "primary_subject");
  if (!actor) return null;
  const sample = sampleDirectorActorState(moment, actor, progress, actors);
  const pose = sampleDirectorCameraPose(moment, progress, actors);
  const inverse = new THREE.Quaternion()
    .setFromEuler(sample.rotation)
    .invert();
  return pose.position
    .clone()
    .sub(sample.position)
    .applyQuaternion(inverse);
}

function cameraLocalViewDirection(
  capability: DirectorCapability,
  actors: DirectorRuntimeActor[],
  progress: number,
) {
  const moment = directorCapabilityDemoMoment(capability);
  const actor = actorById(actors, "primary_subject");
  if (!actor) return null;
  const sample = sampleDirectorActorState(moment, actor, progress, actors);
  const pose = sampleDirectorCameraPose(moment, progress, actors);
  const inverse = new THREE.Quaternion()
    .setFromEuler(sample.rotation)
    .invert();
  return pose.target
    .clone()
    .sub(pose.position)
    .normalize()
    .applyQuaternion(inverse)
    .normalize();
}

// Legacy Phase 1B.3.2 diagnostic phrase retained for compatibility: complete head loses recognizability when the fastener is clipped.
function projectedFeatureBounds(
  pose: ReturnType<typeof sampleDirectorCameraPose>,
  center: THREE.Vector3,
  halfWidth: number,
  halfHeight: number,
) {
  const camera = new THREE.PerspectiveCamera(pose.fov, 16 / 9, 0.05, 200);
  camera.position.copy(pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.target);
  if (pose.roll) camera.rotateZ(pose.roll);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const points = [
    center.clone().add(new THREE.Vector3(-halfWidth, 0, 0)),
    center.clone().add(new THREE.Vector3(halfWidth, 0, 0)),
    center.clone().add(new THREE.Vector3(0, -halfHeight, 0)),
    center.clone().add(new THREE.Vector3(0, halfHeight, 0)),
  ].map((point) => point.project(camera));

  return {
    maxAbsX: Math.max(...points.map((point) => Math.abs(point.x))),
    maxAbsY: Math.max(...points.map((point) => Math.abs(point.y))),
  };
}

function cameraSample(
  capability: DirectorCapability,
  actors: DirectorRuntimeActor[],
  progress: number,
): DirectorCameraFidelitySample {
  const moment = directorCapabilityDemoMoment(capability);
  const pose = sampleDirectorCameraPose(moment, progress, actors);
  const primary = actorById(actors, "primary_subject");
  const primarySample = primary
    ? sampleDirectorActorState(moment, primary, progress, actors)
    : null;
  return {
    progress,
    camera_position: tuple(pose.position),
    target_position: tuple(pose.target),
    fov_degrees: rounded(pose.fov, 2),
    roll_degrees: rounded(THREE.MathUtils.radToDeg(pose.roll), 2),
    camera_target_distance_m: rounded(
      pose.position.distanceTo(pose.target),
    ),
    primary_actor_position: primarySample
      ? tuple(primarySample.position)
      : null,
  };
}

function vectorFromTuple(
  value: [number, number, number],
) {
  return new THREE.Vector3(...value);
}

function sampledTravel(
  samples: DirectorCameraFidelitySample[],
  key: "camera_position" | "target_position",
) {
  let total = 0;
  for (let index = 1; index < samples.length; index += 1) {
    total += vectorFromTuple(samples[index - 1]![key]).distanceTo(
      vectorFromTuple(samples[index]![key]),
    );
  }
  return total;
}

function measuredBoolean(
  id: string,
  description: string,
  passed: boolean,
  measured: string,
): DirectorCameraFidelityCheck {
  return { id, description, passed, measured };
}

function cameraSpecificChecks(
  capability: DirectorCapability,
  actors: DirectorRuntimeActor[],
  samples: DirectorCameraFidelitySample[],
): DirectorCameraFidelityCheck[] {
  const moment = directorCapabilityDemoMoment(capability);
  const start = samples[0]!;
  const end = samples[samples.length - 1]!;
  const startPosition = vectorFromTuple(start.camera_position);
  const endPosition = vectorFromTuple(end.camera_position);
  const startTarget = vectorFromTuple(start.target_position);
  const endTarget = vectorFromTuple(end.target_position);
  const cameraTravel = sampledTravel(samples, "camera_position");
  const targetTravel = sampledTravel(samples, "target_position");
  const distanceDelta =
    end.camera_target_distance_m - start.camera_target_distance_m;
  const primary = actorById(actors, "primary_subject");
  const secondary = actorById(actors, "secondary_subject");
  const checks: DirectorCameraFidelityCheck[] = [];

  const allFinite = samples.every((sample) =>
    [
      ...sample.camera_position,
      ...sample.target_position,
      sample.fov_degrees,
      sample.roll_degrees,
      sample.camera_target_distance_m,
    ].every(Number.isFinite),
  );
  checks.push(
    measuredBoolean(
      "finite_camera_samples",
      "Every controlled camera sample is finite and executable.",
      allFinite,
      allFinite ? "all five samples finite" : "non-finite camera sample detected",
    ),
  );

  if (capability.category === "camera_movement") {
    if (capability.id === "static") {
      checks.push(
        measuredBoolean(
          "static_camera_holds",
          "Static camera stays fixed while the fixture actor travels.",
          cameraTravel < 0.06 && targetTravel < 0.06,
          `camera travel ${rounded(cameraTravel)} m; target travel ${rounded(targetTravel)} m`,
        ),
      );
    } else if (capability.id === "push_in") {
      checks.push(
        measuredBoolean(
          "push_in_closes_distance",
          "Push in reduces camera-to-target distance.",
          distanceDelta < -0.08,
          `distance delta ${rounded(distanceDelta)} m`,
        ),
      );
    } else if (capability.id === "pull_out") {
      checks.push(
        measuredBoolean(
          "pull_out_adds_context",
          "Pull out increases camera-to-target distance.",
          distanceDelta > 0.08,
          `distance delta +${rounded(distanceDelta)} m`,
        ),
      );
    } else if (capability.id === "pan" || capability.id === "tilt") {
      checks.push(
        measuredBoolean(
          "rotation_without_translation",
          `${capability.label} changes the viewed target without translating the camera rig.`,
          cameraTravel < 0.08 && targetTravel > 0.08,
          `camera travel ${rounded(cameraTravel)} m; target travel ${rounded(targetTravel)} m`,
        ),
      );
    } else if (capability.id === "follow" && primary) {
      const primaryStart = sampleDirectorActorState(moment, primary, 0, actors).position;
      const primaryEnd = sampleDirectorActorState(moment, primary, 1, actors).position;
      const startRelative = startPosition.clone().sub(primaryStart);
      const endRelative = endPosition.clone().sub(primaryEnd);
      const drift = startRelative.distanceTo(endRelative);
      checks.push(
        measuredBoolean(
          "follow_preserves_relative_frame",
          "Follow travels with the actor while preserving its camera relationship.",
          primaryStart.distanceTo(primaryEnd) > 0.5 && drift < 0.12,
          `actor travel ${rounded(primaryStart.distanceTo(primaryEnd))} m; relative drift ${rounded(drift)} m`,
        ),
      );
    } else if (
      (capability.id === "lead_subject" || capability.id === "lag_follow") &&
      primary
    ) {
      const primaryStart = sampleDirectorActorState(moment, primary, 0, actors).position;
      const primaryEnd = sampleDirectorActorState(moment, primary, 1, actors).position;
      const travel = primaryEnd.clone().sub(primaryStart);
      travel.y = 0;
      const direction = travel.lengthSq() > 0.000001
        ? travel.clone().normalize()
        : new THREE.Vector3(1, 0, 0);
      const testProgress = capability.id === "lead_subject" ? 0.78 : 0.55;
      const actorEyeAtTest = actorEye(moment, primary, testProgress, actors);
      const poseAtTest = sampleDirectorCameraPose(moment, testProgress, actors);
      const signedLookBias = poseAtTest.target.clone().sub(actorEyeAtTest).dot(direction);

      if (capability.id === "lead_subject") {
        checks.push(
          measuredBoolean(
            "lead_lag_direction",
            "Lead shifts the look point ahead of actor travel instead of translating the whole rig unchanged.",
            travel.length() > 0.5 && signedLookBias > 0.12,
            `actor travel ${rounded(travel.length())} m; look-ahead ${rounded(signedLookBias)} m`,
          ),
        );
      } else {
        const endEye = actorEye(moment, primary, 1, actors);
        const endPose = sampleDirectorCameraPose(moment, 1, actors);
        const endBias = endPose.target.clone().sub(endEye).dot(direction);
        checks.push(
          measuredBoolean(
            "lead_lag_direction",
            "Lag lets the actor pull ahead through the move and catches back toward follow by the end.",
            travel.length() > 0.5 &&
              signedLookBias < -0.1 &&
              Math.abs(endBias) < Math.abs(signedLookBias) * 0.45,
            `actor travel ${rounded(travel.length())} m; mid lag ${rounded(signedLookBias)} m; end bias ${rounded(endBias)} m`,
          ),
        );
      }
    } else if (capability.id === "track_parallel" && primary) {
      const primaryStart = sampleDirectorActorState(moment, primary, 0, actors).position;
      const primaryEnd = sampleDirectorActorState(moment, primary, 1, actors).position;
      const travel = primaryEnd.clone().sub(primaryStart);
      travel.y = 0;
      const direction = travel.lengthSq() > 0.000001
        ? travel.clone().normalize()
        : new THREE.Vector3(1, 0, 0);
      const checkpoints = DIRECTOR_CAMERA_FIDELITY_PROGRESS.map((progress) => {
        const eye = actorEye(moment, primary, progress, actors);
        const pose = sampleDirectorCameraPose(moment, progress, actors);
        const relation = pose.position.clone().sub(eye);
        return {
          relation,
          distance: relation.length(),
          targetError: pose.target.distanceTo(eye),
          apparentSizeProxy: primary.size[1] / Math.max(0.001, relation.length()),
        };
      });
      const firstRelation = checkpoints[0]!.relation;
      const distanceValues = checkpoints.map((entry) => entry.distance);
      const apparentValues = checkpoints.map((entry) => entry.apparentSizeProxy);
      const distanceSpread = Math.max(...distanceValues) - Math.min(...distanceValues);
      const apparentSpread = Math.max(...apparentValues) - Math.min(...apparentValues);
      const maxRelationDrift = Math.max(
        ...checkpoints.map((entry) => entry.relation.distanceTo(firstRelation)),
      );
      const maxTargetError = Math.max(...checkpoints.map((entry) => entry.targetError));
      const finalRelation = checkpoints[checkpoints.length - 1]!.relation;
      const alongTravel = Math.abs(finalRelation.dot(direction));
      const lateralMagnitude = finalRelation
        .clone()
        .addScaledVector(direction, -finalRelation.dot(direction))
        .length();
      checks.push(
        measuredBoolean(
          "parallel_track_changes_lateral_offset",
          "Parallel track starts on and preserves a full-shot second rail with stable apparent subject size.",
          travel.length() > 0.5 &&
            distanceSpread < 0.08 &&
            apparentSpread < 0.035 &&
            maxRelationDrift < 0.1 &&
            lateralMagnitude > alongTravel * 5 &&
            maxTargetError < 0.08,
          `actor travel ${rounded(travel.length())} m; full distance spread ${rounded(distanceSpread)} m; apparent-size proxy spread ${rounded(apparentSpread)}; relation drift ${rounded(maxRelationDrift)} m; lateral ${rounded(lateralMagnitude)} m; along ${rounded(alongTravel)} m; max target error ${rounded(maxTargetError)} m`,
        ),
      );
    } else if (capability.id === "camera_object_attached" && primary) {
      const localAtMount = cameraLocalOffset(capability, actors, 0.9);
      const localAtEnd = cameraLocalOffset(capability, actors, 1);
      const viewAtMount = cameraLocalViewDirection(capability, actors, 0.9);
      const viewAtEnd = cameraLocalViewDirection(capability, actors, 1);
      const drift = localAtMount && localAtEnd
        ? localAtMount.distanceTo(localAtEnd)
        : Number.POSITIVE_INFINITY;
      const viewDrift = viewAtMount && viewAtEnd
        ? THREE.MathUtils.radToDeg(viewAtMount.angleTo(viewAtEnd))
        : Number.POSITIVE_INFINITY;
      const forwardAlignment = viewAtEnd
        ? viewAtEnd.dot(new THREE.Vector3(0, 0, 1))
        : -1;
      const mountedHighBack = localAtEnd
        ? localAtEnd.y >= primary.size[1] * 0.64 &&
          localAtEnd.z <= primary.size[2] * 0.3
        : false;
      const downwardPitch = viewAtEnd ? viewAtEnd.y < -0.08 : false;
      checks.push(
        measuredBoolean(
          "object_attached_local_mount",
          "Object-attached camera keeps a stable high/back actor-local mount and a stable slightly downward-forward local viewing direction.",
          drift < 0.06 &&
            viewDrift < 2 &&
            forwardAlignment > 0.96 &&
            mountedHighBack &&
            downwardPitch,
          Number.isFinite(drift) && Number.isFinite(viewDrift) && localAtEnd && viewAtEnd
            ? `local mount drift ${rounded(drift)} m; mount y/z ${rounded(localAtEnd.y)}/${rounded(localAtEnd.z)} m; local view drift ${rounded(viewDrift)} deg; view y ${rounded(viewAtEnd.y)}; forward alignment ${rounded(forwardAlignment)}`
            : "local mount/view direction could not be measured",
        ),
      );
    } else {
      checks.push(
        measuredBoolean(
          "camera_path_is_observable",
          `${capability.label} produces measurable camera or target change in the controlled fixture.`,
          cameraTravel > 0.08 || targetTravel > 0.08,
          `camera travel ${rounded(cameraTravel)} m; target travel ${rounded(targetTravel)} m`,
        ),
      );
    }
  }

  if (capability.category === "camera_framing") {
    if (
      (capability.id === "over_shoulder" || capability.id === "point_of_view") &&
      primary &&
      secondary
    ) {
      const primaryEye = actorEye(moment, primary, 0.5, actors);
      const secondaryEye = actorEye(moment, secondary, 0.5, actors);
      const middlePose = sampleDirectorCameraPose(moment, 0.5, actors);
      const sourceDistance = middlePose.position.distanceTo(primaryEye);
      const focusError = middlePose.target.distanceTo(secondaryEye);
      const primaryRadius = Math.sqrt(
        primary.size[0] ** 2 + primary.size[1] ** 2 + primary.size[2] ** 2,
      ) * 0.5;
      const minimumSourceDistance = capability.id === "point_of_view"
        ? Math.max(0.14, Math.abs(primary.size[2]) * 0.42)
        : Math.max(0.42, primaryRadius * 0.72);
      const maximumSourceDistance = capability.id === "point_of_view"
        ? Math.max(0.5, primaryRadius * 0.82)
        : Math.max(0.9, primaryRadius * 1.55);
      checks.push(
        measuredBoolean(
          capability.id === "point_of_view"
            ? "pov_uses_viewpoint_actor"
            : "over_shoulder_uses_foreground_actor",
          capability.id === "point_of_view"
            ? "POV clears the source actor's face while remaining tied to its viewpoint and looking toward the focus actor."
            : "Over-shoulder stays outside the foreground actor's clearance volume while retaining a shoulder relationship to the focus actor.",
          sourceDistance >= minimumSourceDistance &&
            sourceDistance <= maximumSourceDistance &&
            focusError < 0.12,
          `source distance ${rounded(sourceDistance)} m; expected ${rounded(minimumSourceDistance)}-${rounded(maximumSourceDistance)} m; focus error ${rounded(focusError)} m`,
        ),
      );
    }
    if (capability.id === "macro" || capability.id === "insert") {
      const detailRole = capability.id === "macro"
        ? "secondary_subject"
        : "context_subject";
      const detailActor = actorById(actors, detailRole);
      const middlePose = sampleDirectorCameraPose(moment, 0.5, actors);
      const detailEye = detailActor
        ? actorEye(moment, detailActor, 0.5, actors)
        : null;
      const detailDistance = middlePose.position.distanceTo(middlePose.target);
      const distanceIsLegible = capability.id === "macro"
        ? detailDistance >= 0.4 && detailDistance <= 0.7
        : detailDistance < 1.25;
      const macroBounds = capability.id === "macro" && detailActor
        ? DIRECTOR_CAMERA_FIDELITY_PROGRESS.map((progress) => {
            const pose = sampleDirectorCameraPose(moment, progress, actors);
            const sample = sampleDirectorActorState(moment, detailActor, progress, actors);
            return projectedFeatureBounds(
              pose,
              sample.position,
              Math.max(0.055, detailActor.size[0] * 0.5),
              Math.max(0.055, detailActor.size[0] * 0.5),
            );
          })
        : [];
      const maxMacroX = macroBounds.length
        ? Math.max(...macroBounds.map((bounds) => bounds.maxAbsX))
        : 0;
      const maxMacroY = macroBounds.length
        ? Math.max(...macroBounds.map((bounds) => bounds.maxAbsY))
        : 0;
      const macroSafeFrame = capability.id !== "macro" ||
        (maxMacroX <= 0.82 && maxMacroY <= 0.82);
      checks.push(
        measuredBoolean(
          "detail_target_is_explicit",
          capability.id === "macro"
            ? "Macro isolates the tiny fastener, centers its geometric feature target, and keeps the complete cross-head inside the safe frame."
            : "Insert explicitly isolates the larger lever/control actor.",
          Boolean(detailEye) &&
            moment.shot?.camera.focus_entity_ids[0] === detailRole &&
            middlePose.target.distanceTo(detailEye!) < 0.12 &&
            distanceIsLegible &&
            macroSafeFrame,
          capability.id === "macro"
            ? `focus ${moment.shot?.camera.focus_entity_ids[0] ?? "none"}; camera-detail distance ${rounded(detailDistance)} m; max projected x/y ${rounded(maxMacroX)}/${rounded(maxMacroY)}`
            : `focus ${moment.shot?.camera.focus_entity_ids[0] ?? "none"}; expected ${detailRole}; camera-detail distance ${rounded(detailDistance)} m`,
        ),
      );
    }
    if (capability.id === "cutaway") {
      checks.push(
        measuredBoolean(
          "cutaway_is_compound",
          "Cutaway is represented honestly as a compound detail/context composition.",
          capability.compiler.threejs === "compound",
          `Three.js support ${capability.compiler.threejs}`,
        ),
      );
    }
  }

  if (capability.category === "camera_angle") {
    const middle = sampleDirectorCameraPose(moment, 0.5, actors);
    const offset = middle.position.clone().sub(middle.target);
    const length = Math.max(0.0001, offset.length());
    if (capability.id === "top_down") {
      checks.push(
        measuredBoolean(
          "top_down_vertical",
          "Top-down camera is dominated by vertical offset.",
          Math.abs(offset.y) / length > 0.92,
          `vertical ratio ${rounded(Math.abs(offset.y) / length)}`,
        ),
      );
    } else if (capability.id === "ground_level") {
      checks.push(
        measuredBoolean(
          "ground_level_height",
          "Ground-level camera remains near the support plane.",
          middle.position.y <= 0.25,
          `camera height ${rounded(middle.position.y)} m`,
        ),
      );
    } else if (capability.id === "low_angle") {
      checks.push(
        measuredBoolean(
          "low_angle_below_target",
          "Low angle places the camera below the target center.",
          middle.position.y < middle.target.y,
          `camera y ${rounded(middle.position.y)}; target y ${rounded(middle.target.y)}`,
        ),
      );
    } else if (capability.id === "high_angle") {
      checks.push(
        measuredBoolean(
          "high_angle_above_target",
          "High angle places the camera above the target center.",
          middle.position.y > middle.target.y,
          `camera y ${rounded(middle.position.y)}; target y ${rounded(middle.target.y)}`,
        ),
      );
    } else if (capability.id === "dutch_angle") {
      checks.push(
        measuredBoolean(
          "dutch_roll",
          "Dutch angle produces a visible horizon roll.",
          Math.abs(THREE.MathUtils.radToDeg(middle.roll)) >= 8,
          `roll ${rounded(THREE.MathUtils.radToDeg(middle.roll), 1)}°`,
        ),
      );
    } else if (capability.id === "object_attached" && primary) {
      const localStart = cameraLocalOffset(capability, actors, 0);
      const localEnd = cameraLocalOffset(capability, actors, 1);
      const drift = localStart && localEnd
        ? localStart.distanceTo(localEnd)
        : Number.POSITIVE_INFINITY;
      const localView = cameraLocalViewDirection(capability, actors, 0.5);
      const localMount = cameraLocalOffset(capability, actors, 0.5);
      const mountedHighBack = localMount
        ? localMount.y >= primary.size[1] * 0.64 &&
          localMount.z <= primary.size[2] * 0.3
        : false;
      const downwardForward = localView
        ? localView.y < -0.08 &&
          localView.dot(new THREE.Vector3(0, 0, 1)) > 0.96
        : false;
      checks.push(
        measuredBoolean(
          "object_attached_angle_local",
          "Object-attached view rotates a high/back camera mount with the source actor while looking slightly downward-forward.",
          drift < 0.08 && mountedHighBack && downwardForward,
          Number.isFinite(drift) && localMount && localView
            ? `actor-local offset drift ${rounded(drift)} m; mount y/z ${rounded(localMount.y)}/${rounded(localMount.z)} m; view y/z ${rounded(localView.y)}/${rounded(localView.z)}`
            : "actor-local offset/view could not be measured",
        ),
      );
    } else if (capability.id === "isometric") {
      const validation = validateDirectorShot(moment, actors, 9);
      checks.push(
        measuredBoolean(
          "isometric_is_honest_approximation",
          "Current Three.js isometric is a restrained-perspective technical overview with the controlled layout kept readable.",
          capability.compiler.threejs === "approximate" &&
            validation.required_visible_fraction >= 0.95,
          `Three.js support ${capability.compiler.threejs}; required visible ${rounded(validation.required_visible_fraction * 100, 1)}%`,
        ),
      );
    } else if (capability.id === "inside_object") {
      checks.push(
        measuredBoolean(
          "inside_object_is_geometry_dependent",
          "Inside-object view remains approximate until interior-safe asset metadata exists.",
          capability.compiler.threejs === "approximate",
          `Three.js support ${capability.compiler.threejs}`,
        ),
      );
    }
  }

  return checks;
}

function limitationsFor(
  capability: DirectorCapability,
) {
  const limitations: string[] = [];
  if (capability.id === "isometric") {
    limitations.push(
      "Three.js now solves the full technical-layout envelope with restrained perspective FOV; true orthographic projection remains future work.",
    );
  }
  if (capability.id === "inside_object") {
    limitations.push(
      "A generic GLB may not contain a renderable or camera-safe interior; exact execution awaits interior directability metadata.",
    );
  }
  if (capability.id === "focus_shallow") {
    limitations.push(
      "The current Three.js preview does not simulate production depth-of-field blur.",
    );
  }
  if (capability.id === "macro" || capability.id === "insert") {
    limitations.push(
      "Controlled proof targets an explicit tiny feature actor; real-asset semantic sub-part targeting still awaits asset feature anchors.",
    );
  }
  if (
    capability.id === "object_attached" ||
    capability.id === "camera_object_attached"
  ) {
    limitations.push(
      "Actor-local rotation and a larger clearance-aware mount are respected; canonical semantic front/up metadata remains an asset-directability concern.",
    );
  }
  if (
    capability.id === "over_shoulder" ||
    capability.id === "point_of_view"
  ) {
    limitations.push(
      "The controlled runtime uses the declared foreground actor as viewpoint source, adds body/face clearance, and uses the first focus actor as viewed target.",
    );
  }
  if (capability.id === "cutaway") {
    limitations.push(
      "Cutaway is intentionally compound: meaningful detail selection still depends on Director targeting and future semantic feature anchors.",
    );
  }
  return limitations;
}

export function buildDirectorCameraFidelityReport(
  capability: DirectorCapability,
): DirectorCameraFidelityReport | null {
  if (
    capability.category !== "camera_framing" &&
    capability.category !== "camera_angle" &&
    capability.category !== "camera_movement"
  ) {
    return null;
  }

  const actors = directorCameraFidelityFixtureActors(capability);
  const moment = directorCapabilityDemoMoment(capability);
  const samples = DIRECTOR_CAMERA_FIDELITY_PROGRESS.map((progress) =>
    cameraSample(capability, actors, progress),
  );
  const start = samples[0]!;
  const end = samples[samples.length - 1]!;
  const primaryStart = start.primary_actor_position
    ? vectorFromTuple(start.primary_actor_position)
    : null;
  const primaryEnd = end.primary_actor_position
    ? vectorFromTuple(end.primary_actor_position)
    : null;
  const checks = cameraSpecificChecks(capability, actors, samples);

  return {
    schema_version: DIRECTOR_CAMERA_FIDELITY_VERSION,
    capability_id: capability.id,
    category: capability.category,
    support_level: capability.compiler.threejs,
    fixture: fixtureFor(capability),
    controlled_geometry: true,
    samples,
    motion_signature: {
      camera_travel_m: rounded(
        sampledTravel(samples, "camera_position"),
      ),
      target_travel_m: rounded(
        sampledTravel(samples, "target_position"),
      ),
      camera_target_distance_delta_m: rounded(
        end.camera_target_distance_m - start.camera_target_distance_m,
      ),
      primary_actor_travel_m:
        primaryStart && primaryEnd
          ? rounded(primaryStart.distanceTo(primaryEnd))
          : 0,
      fov_delta_degrees: rounded(end.fov_degrees - start.fov_degrees, 2),
      roll_delta_degrees: rounded(
        end.roll_degrees - start.roll_degrees,
        2,
      ),
    },
    checks,
    automated_status: checks.every((check) => check.passed)
      ? "pass"
      : "review",
    limitations: limitationsFor(capability),
    visual_review_required: true,
    validation: validateDirectorShot(moment, actors),
  };
}
