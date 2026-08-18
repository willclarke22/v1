// CP.2A.4 compatibility: focus_role is the temporary attention authority; CP.2A.5 compiles it as a continuous envelope.

import {
  CINEMATIC_BURGER_TIMELINE_DURATION_S,
  sampleCinematicBurgerRuntime,
  type CinematicShotRuntimeLayout,
  type RuntimeActorPose,
  type RuntimeActorRole,
  type RuntimeAssetInteractionIntent,
  type RuntimeDirectionalClearanceConstraint,
  type RuntimeVec3,
} from "./ui/cinematic-production-runtime-layout";

export const CINEMATIC_REPRODUCTION_SCHEMA_VERSION =
  "myway_cinematic_reproduction_plan_v1" as const;

export const LUNCH_RUNTIME_ROLES = [
  "tray",
  "apple",
  "burger",
  "nigiri",
  "cow",
  "chicken",
  "goldfish",
  "hand",
] as const satisfies readonly RuntimeActorRole[];

export type CinematicReproductionInterpolation = "linear" | "smooth" | "c2";

export type CinematicReproductionCameraKey = {
  t: number;
  position: RuntimeVec3;
  target: RuntimeVec3;
  fov: number;
  /**
   * Optional semantic attention hint. The numeric target remains authoritative
   * when omitted. When present, MyWay blends the target toward the sampled
   * actor so "hero anchor" and "temporary focus subject" can differ.
   */
  focus_role?: RuntimeActorRole | null;
  focus_weight?: number;
};

export type CinematicReproductionActorKey = {
  t: number;
  visible: boolean;
  position: RuntimeVec3;
  rotation: RuntimeVec3;
  scale: number;
  opacity: number;
  emphasis: number;
};

export type CinematicReproductionActorTrack = {
  interpolation: CinematicReproductionInterpolation;
  keys: CinematicReproductionActorKey[];
};

export type CinematicReproductionInteraction = {
  id: string;
  kind: "touch" | "nudge" | "push";
  source_role: RuntimeActorRole;
  target_role: RuntimeActorRole;
  approach_start_s: number;
  contact_start_s: number;
  contact_end_s: number;
  retreat_end_s: number;
  approach_direction: RuntimeVec3;
  preferred_target_side:
    | "left"
    | "right"
    | "front"
    | "back"
    | "top"
    | "bottom"
    | "unknown";
  contact_clearance_m: number;
  obstacle_clearance_m: number;
  obstacle_roles: RuntimeActorRole[];
  maintain_contact: boolean;
};

export type CinematicReproductionDirectionalClearance = {
  id: string;
  moving_role: RuntimeActorRole;
  anchor_role: RuntimeActorRole;
  start_s: number;
  end_s: number;
  direction: RuntimeVec3;
  minimum_surface_gap_m: number;
};

export type CinematicReproductionPlanV1 = {
  schema_version: typeof CINEMATIC_REPRODUCTION_SCHEMA_VERSION;
  title: string;
  duration_s: number;
  aspect_ratio: "9:16" | "16:9" | "1:1";
  intent_summary: string;
  camera: {
    interpolation: CinematicReproductionInterpolation;
    keys: CinematicReproductionCameraKey[];
  };
  actors: Record<RuntimeActorRole, CinematicReproductionActorTrack>;
  interactions: CinematicReproductionInteraction[];
  directional_clearance: CinematicReproductionDirectionalClearance[];
  notes: string[];
};

export type CinematicReproductionValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type CinematicReproductionQualityDiagnostics = {
  camera_key_count: number;
  late_orbit_signed_degrees: number;
  late_orbit_total_degrees: number;
  late_orbit_reversal_count: number;
  fish_hold_horizontal_drift_m: number;
  hand_interaction_declared: boolean;
  hand_contact_start_s: number | null;
  hand_contact_end_s: number | null;
  fish_clearance_declared: boolean;
  fish_minimum_surface_gap_m: number | null;
  opening_trio_max_abs_surface_lift_m: number;
  smallest_visible_scale_multiplier: number;
  bounded_actor_scalar_interpolation: true;
  fast_opacity_transition_count: number;
  hand_precontact_target_drift_m: number;
  cow_focus_target_x_m: number;
  chicken_focus_target_x_m: number;
  fish_initial_occlusion_proxy: number;
  fish_reveal_separation_ratio_15s: number;
  non_hand_physical_interaction_count: number;
  slow_opacity_transition_count: number;
  hand_staging_yaw_error_deg: number;
  hand_target_peak_response_m: number;
  hand_target_response_alignment: number;
  cow_focus_target_x_error_m: number;
  chicken_focus_target_x_error_m: number;
  cow_peak_yaw_error_deg: number;
  chicken_peak_yaw_error_deg: number;
  fish_visible_start_s: number | null;
  fish_full_opacity_s: number | null;
  fish_reveal_curve_mean_abs_error: number;
  late_orbit_phase_mean_abs_error_deg: number;
  late_orbit_phase_max_abs_error_deg: number;
  late_orbit_radius_mean_abs_error_m: number;
  late_camera_height_mean_abs_error_m: number;
  final_camera_height_error_m: number;
  final_support_opacity_max: number;
  cow_authored_hold_drift_m: number;
  chicken_authored_hold_drift_m: number;
  fish_forward_yaw_error_deg: number;
  cow_compiled_vertical_arc_m: number;
  chicken_compiled_vertical_arc_m: number;
  cow_compiled_peak_emphasis: number;
  chicken_compiled_peak_emphasis: number;
  attention_target_peak_speed_mps: number;
};

export type CinematicReproductionComparison = {
  sample_count: number;
  camera_position_mean_error_m: number;
  camera_target_mean_error_m: number;
  camera_fov_mean_error_deg: number;
  actor_position_mean_error_m: number;
  actor_scale_mean_error: number;
  actor_opacity_mean_error: number;
  compared_actor_samples: number;
  lunch_quality: CinematicReproductionQualityDiagnostics;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function vec3(value: unknown, fallback: RuntimeVec3 = [0, 0, 0]): RuntimeVec3 {
  if (!Array.isArray(value) || value.length !== 3) return [...fallback];
  return [
    finite(value[0], fallback[0]),
    finite(value[1], fallback[1]),
    finite(value[2], fallback[2]),
  ];
}

function degreesToRadians(value: RuntimeVec3): RuntimeVec3 {
  return value.map((item) => item * Math.PI / 180) as RuntimeVec3;
}

function normalizedRotation(
  value: Record<string, unknown>,
  fallback: RuntimeVec3,
): RuntimeVec3 {
  if (Array.isArray(value.rotation_deg)) {
    return degreesToRadians(vec3(value.rotation_deg, [0, 0, 0]));
  }
  const rotation = vec3(value.rotation, fallback);
  // CP.2A.1 compatibility: GLM's first Lunch attempt understandably emitted
  // degree-like values into the old ambiguous `rotation` field. Preserve manual
  // radians when they are plausible; otherwise normalize the obvious degree form.
  if (rotation.some((item) => Math.abs(item) > Math.PI * 2 + 0.001)) {
    return degreesToRadians(rotation);
  }
  return rotation;
}

function isRole(value: unknown): value is RuntimeActorRole {
  return typeof value === "string" &&
    (LUNCH_RUNTIME_ROLES as readonly string[]).includes(value);
}

function interpolation(value: unknown): CinematicReproductionInterpolation {
  return value === "linear" || value === "smooth" || value === "c2" ? value : "c2";
}

function hiddenPose(): RuntimeActorPose {
  return {
    visible: false,
    position: [0, -10, 0],
    rotation: [0, 0, 0],
    scale: 1,
    opacity: 0,
    emphasis: 0,
  };
}

function actorPose(layout: CinematicShotRuntimeLayout, role: RuntimeActorRole) {
  switch (role) {
    case "tray":
      return layout.tray;
    case "apple":
      return layout.foods[0];
    case "burger":
      return layout.foods[1];
    case "nigiri":
      return layout.foods[2];
    case "cow":
      return layout.cow;
    case "chicken":
      return layout.chicken;
    case "goldfish":
      return layout.goldfish;
    case "hand":
      return layout.hand;
  }
}

function completeActorKey(
  raw: unknown,
  fallback: CinematicReproductionActorKey,
  durationS: number,
): CinematicReproductionActorKey {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    t: clamp(finite(value.t, fallback.t), 0, durationS),
    visible: typeof value.visible === "boolean" ? value.visible : fallback.visible,
    // For support-seated Lunch actors, position.y is lift ABOVE MyWay's
    // measured support surface. `0` means rest on the tray/floor; it is not
    // object-center height. Runtime geometry owns the literal seating height.
    position: vec3(value.position, fallback.position),
    rotation: normalizedRotation(value, fallback.rotation),
    // `scale_multiplier: 1` means the reviewed role-normalized asset size.
    // Keep legacy `scale` for starter/backward compatibility.
    scale: clamp(
      finite(
        value.scale_multiplier,
        finite(value.scale, fallback.scale),
      ),
      0.001,
      20,
    ),
    opacity: clamp01(finite(value.opacity, fallback.opacity)),
    emphasis: clamp01(finite(value.emphasis, fallback.emphasis)),
  };
}

function normalizeCameraKeys(raw: unknown, durationS: number) {
  const items = (Array.isArray(raw) ? raw : []).slice(0, 200);
  const keys = items.map((item) => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      t: clamp(finite(value.t, 0), 0, durationS),
      position: vec3(value.position, [0, 3.18, 5.74]),
      target: vec3(value.target, [0, 0.3, 0]),
      fov: clamp(finite(value.fov, 36), 12, 90),
      focus_role: isRole(value.focus_role) ? value.focus_role : null,
      focus_weight: clamp(finite(value.focus_weight, 0), 0, 1),
    } satisfies CinematicReproductionCameraKey;
  }).sort((a, b) => a.t - b.t);
  return dedupeTimes(keys);
}

function dedupeTimes<T extends { t: number }>(keys: T[]) {
  const byTime = new Map<number, T>();
  for (const key of keys) byTime.set(Number(key.t.toFixed(4)), key);
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

function normalizeActorTrack(
  raw: unknown,
  durationS: number,
): CinematicReproductionActorTrack {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rawKeys = (Array.isArray(value.keys) ? value.keys : []).slice(0, 300);
  const base: CinematicReproductionActorKey = {
    t: 0,
    ...hiddenPose(),
  };
  const keys: CinematicReproductionActorKey[] = [];
  let previous = base;
  for (const item of rawKeys) {
    const key = completeActorKey(item, previous, durationS);
    keys.push(key);
    previous = key;
  }
  return {
    interpolation: interpolation(value.interpolation),
    keys: dedupeTimes(keys.sort((a, b) => a.t - b.t)),
  };
}

export function normalizeCinematicReproductionPlan(
  raw: unknown,
): CinematicReproductionPlanV1 {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const durationS = clamp(finite(value.duration_s, CINEMATIC_BURGER_TIMELINE_DURATION_S), 1, 60);
  const rawCamera = value.camera && typeof value.camera === "object"
    ? value.camera as Record<string, unknown>
    : {};
  const rawActors = value.actors && typeof value.actors === "object"
    ? value.actors as Record<string, unknown>
    : {};

  const actors = Object.fromEntries(
    LUNCH_RUNTIME_ROLES.map((role) => [
      role,
      normalizeActorTrack(rawActors[role], durationS),
    ]),
  ) as Record<RuntimeActorRole, CinematicReproductionActorTrack>;

  const interactions: CinematicReproductionInteraction[] = [];
  for (const [index, item] of (Array.isArray(value.interactions) ? value.interactions : []).slice(0, 32).entries()) {
    if (!item || typeof item !== "object") continue;
    const input = item as Record<string, unknown>;
    // CP.2A.1 accepts the exact contract AND the intuitive aliases GLM used in
    // the first reproduction run. Alias support is explicit compatibility, not
    // silent schema invention: parseCinematicReproductionJson surfaces a warning.
    const sourceRole = isRole(input.source_role)
      ? input.source_role
      : isRole(input.actor)
        ? input.actor
        : null;
    const targetRole = isRole(input.target_role)
      ? input.target_role
      : isRole(input.target)
        ? input.target
        : null;
    if (!sourceRole || !targetRole) continue;

    const aliasStart = finite(input.t_start, 0);
    const aliasEnd = finite(input.t_end, aliasStart);
    const contactStartRaw = input.contact_start_s ?? input.t_start;
    const contactEndRaw = input.contact_end_s ?? input.t_end;
    const contactStartSeed = finite(contactStartRaw, 3.15);
    const contactEndSeed = finite(contactEndRaw, Math.max(contactStartSeed, 4.55));
    const approachStart = clamp(
      finite(
        input.approach_start_s,
        Math.max(0, contactStartSeed - 1.8),
      ),
      0,
      durationS,
    );
    const contactStart = clamp(contactStartSeed, approachStart, durationS);
    const contactEnd = clamp(
      finite(contactEndRaw, Math.max(contactStart, aliasEnd)),
      contactStart,
      durationS,
    );
    const retreatEnd = clamp(
      finite(
        input.retreat_end_s,
        Math.min(durationS, Math.max(contactEnd, contactEnd + 1.8)),
      ),
      contactEnd,
      durationS,
    );
    const kind =
      input.kind === "touch" || input.kind === "nudge" || input.kind === "push"
        ? input.kind
        : typeof input.type === "string" && input.type.toLowerCase().includes("push")
          ? "push"
          : typeof input.type === "string" && input.type.toLowerCase().includes("touch")
            ? "touch"
            : typeof input.type === "string" && input.type.toLowerCase().includes("nudge")
              ? "nudge"
              : null;

    // CP.2A.2: entrance/reveal/pop events belong in actor choreography, not the
    // physical-contact lane. Never coerce an unknown semantic relation into a
    // nudge, because that incorrectly invokes CP.1F contact solving.
    if (!kind) continue;

    interactions.push({
      id: typeof input.id === "string" && input.id.trim() ? input.id.trim() : `interaction_${index + 1}`,
      kind,
      source_role: sourceRole,
      target_role: targetRole,
      approach_start_s: approachStart,
      contact_start_s: contactStart,
      contact_end_s: contactEnd,
      retreat_end_s: retreatEnd,
      approach_direction: vec3(
        input.approach_direction ?? input.nudge_vector,
        [1, -0.12, -0.08],
      ),
      preferred_target_side:
        input.preferred_target_side === "left" ||
        input.preferred_target_side === "right" ||
        input.preferred_target_side === "front" ||
        input.preferred_target_side === "back" ||
        input.preferred_target_side === "top" ||
        input.preferred_target_side === "bottom"
          ? input.preferred_target_side
          : "unknown",
      contact_clearance_m: clamp(finite(input.contact_clearance_m, 0.008), 0, 0.25),
      obstacle_clearance_m: clamp(finite(input.obstacle_clearance_m, 0.035), 0, 0.5),
      obstacle_roles: (Array.isArray(input.obstacle_roles) ? input.obstacle_roles : [])
        .filter(isRole),
      maintain_contact: input.maintain_contact !== false,
    });
  }

  const directionalClearance: CinematicReproductionDirectionalClearance[] = [];
  for (const [index, item] of (Array.isArray(value.directional_clearance) ? value.directional_clearance : []).slice(0, 32).entries()) {
    if (!item || typeof item !== "object") continue;
    const input = item as Record<string, unknown>;
    const movingRole = isRole(input.moving_role)
      ? input.moving_role
      : isRole(input.actor)
        ? input.actor
        : null;
    const anchorRole = isRole(input.anchor_role)
      ? input.anchor_role
      : isRole(input.blocker)
        ? input.blocker
        : null;
    if (!movingRole || !anchorRole) continue;
    directionalClearance.push({
      id: typeof input.id === "string" && input.id.trim() ? input.id.trim() : `clearance_${index + 1}`,
      moving_role: movingRole,
      anchor_role: anchorRole,
      start_s: clamp(finite(input.start_s, finite(input.t_start, 0)), 0, durationS),
      end_s: clamp(finite(input.end_s, finite(input.t_end, durationS)), 0, durationS),
      direction: vec3(input.direction, [0, 0, -1]),
      minimum_surface_gap_m: clamp(
        finite(input.minimum_surface_gap_m, finite(input.min_gap_m, 0.3)),
        0,
        5,
      ),
    });
  }

  return {
    schema_version: CINEMATIC_REPRODUCTION_SCHEMA_VERSION,
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : "Lunch recreation",
    duration_s: durationS,
    aspect_ratio: value.aspect_ratio === "16:9" || value.aspect_ratio === "1:1" ? value.aspect_ratio : "9:16",
    intent_summary: typeof value.intent_summary === "string" ? value.intent_summary : "Recreate the Lunch golden cinematic.",
    camera: {
      interpolation: interpolation(rawCamera.interpolation),
      keys: normalizeCameraKeys(rawCamera.keys, durationS),
    },
    actors,
    interactions,
    directional_clearance: directionalClearance,
    notes: (Array.isArray(value.notes) ? value.notes : [])
      .filter((item): item is string => typeof item === "string")
      .slice(0, 40),
  };
}

function rawAuthoringContractDiagnostics(raw: unknown) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== "object") return { errors, warnings };
  const value = raw as Record<string, unknown>;
  const actors = value.actors && typeof value.actors === "object"
    ? value.actors as Record<string, unknown>
    : {};
  let degreeLikeRotationKeyCount = 0;

  for (const role of LUNCH_RUNTIME_ROLES) {
    const track = actors[role];
    if (!track || typeof track !== "object") continue;
    const keys = Array.isArray((track as Record<string, unknown>).keys)
      ? (track as Record<string, unknown>).keys as unknown[]
      : [];
    for (const item of keys) {
      if (!item || typeof item !== "object") continue;
      const key = item as Record<string, unknown>;
      const legacyRotation = vec3(key.rotation, [0, 0, 0]);
      if (
        !Array.isArray(key.rotation_deg) &&
        Array.isArray(key.rotation) &&
        legacyRotation.some((axis) => Math.abs(axis) > Math.PI * 2 + 0.001)
      ) {
        degreeLikeRotationKeyCount += 1;
      }
    }
  }

  if (degreeLikeRotationKeyCount > 0) {
    warnings.push(
      `${degreeLikeRotationKeyCount} actor key(s) used degree-like values in legacy rotation; MyWay converted them. Prefer rotation_deg in authored JSON.`,
    );
  }

  const interactions = Array.isArray(value.interactions) ? value.interactions : [];
  for (const [index, item] of interactions.entries()) {
    if (!item || typeof item !== "object") {
      errors.push(`interactions[${index}] must be an object.`);
      continue;
    }
    const input = item as Record<string, unknown>;
    const exactRoles = isRole(input.source_role) && isRole(input.target_role);
    const aliasRoles = isRole(input.actor) && isRole(input.target);
    if (!exactRoles && !aliasRoles) {
      errors.push(
        `interactions[${index}] must identify valid source_role/target_role (or actor/target compatibility aliases).`,
      );
    } else if (!exactRoles && aliasRoles) {
      warnings.push(
        `interactions[${index}] used actor/target aliases; MyWay normalized them to source_role/target_role.`,
      );
    }
    const authoredKind =
      typeof input.kind === "string"
        ? input.kind
        : typeof input.type === "string"
          ? input.type
          : "";
    if (
      authoredKind &&
      !["touch", "nudge", "push"].includes(authoredKind.toLowerCase()) &&
      !authoredKind.toLowerCase().includes("touch") &&
      !authoredKind.toLowerCase().includes("nudge") &&
      !authoredKind.toLowerCase().includes("push")
    ) {
      warnings.push(
        `interactions[${index}] kind "${authoredKind}" is choreography, not physical contact; MyWay ignores it here. Author reveal/entrance/exit through actor tracks instead.`,
      );
    }
    if (
      "contact_point" in input ||
      "contact_normal" in input
    ) {
      warnings.push(
        `interactions[${index}] supplied literal contact geometry; CP.1F ignores those coordinates and solves contact from measured assets.`,
      );
    }
  }

  const clearances = Array.isArray(value.directional_clearance)
    ? value.directional_clearance
    : [];
  for (const [index, item] of clearances.entries()) {
    if (!item || typeof item !== "object") {
      errors.push(`directional_clearance[${index}] must be an object.`);
      continue;
    }
    const input = item as Record<string, unknown>;
    const exactRoles = isRole(input.moving_role) && isRole(input.anchor_role);
    const aliasRoles = isRole(input.actor) && isRole(input.blocker);
    if (!exactRoles && !aliasRoles) {
      errors.push(
        `directional_clearance[${index}] must identify valid moving_role/anchor_role (or actor/blocker compatibility aliases).`,
      );
    } else if (!exactRoles && aliasRoles) {
      warnings.push(
        `directional_clearance[${index}] used actor/blocker aliases; MyWay normalized them to moving_role/anchor_role.`,
      );
    }
  }

  return { errors, warnings };
}

export function validateCinematicReproductionPlan(
  plan: CinematicReproductionPlanV1,
): CinematicReproductionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (plan.schema_version !== CINEMATIC_REPRODUCTION_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${CINEMATIC_REPRODUCTION_SCHEMA_VERSION}.`);
  }
  if (plan.camera.keys.length < 2) {
    errors.push("camera.keys needs at least 2 keyframes.");
  }
  for (const role of LUNCH_RUNTIME_ROLES) {
    const track = plan.actors[role];
    if (!track || track.keys.length < 1) {
      errors.push(`actors.${role}.keys needs at least 1 keyframe.`);
    }
  }
  const activeActors = LUNCH_RUNTIME_ROLES.filter((role) =>
    plan.actors[role]?.keys.some((key) => key.visible && key.opacity > 0.01),
  );
  if (activeActors.length < LUNCH_RUNTIME_ROLES.length) {
    warnings.push(`Only ${activeActors.length}/${LUNCH_RUNTIME_ROLES.length} Lunch roles become visible.`);
  }
  if (!plan.interactions.some((item) => item.source_role === "hand" && item.target_role === "burger")) {
    warnings.push("No hand → burger interaction is declared; CP.1F contact solving will not run for the nudge.");
  }
  if (!plan.directional_clearance.some((item) => item.moving_role === "goldfish" && item.anchor_role === "burger")) {
    warnings.push("No goldfish → burger directional clearance is declared; the reveal may become cramped.");
  }
  const cameraTimes = plan.camera.keys.map((key) => key.t);
  if (
    cameraTimes.length > 0 &&
    (cameraTimes[0] > 0.01 ||
      cameraTimes[cameraTimes.length - 1] < plan.duration_s - 0.01)
  ) {
    warnings.push("Camera keys do not span the full duration; endpoint poses will be held outside the authored range.");
  }

  const quality = buildLunchReproductionQualityDiagnostics(plan);
  if (quality.camera_key_count < 14) {
    warnings.push(
      `Lunch camera has only ${quality.camera_key_count} keys; the golden one-film rail needs a denser continuous journey (target >= 14).`,
    );
  }
  if (quality.late_orbit_signed_degrees < 300) {
    warnings.push(
      `Late Lunch orbit covers only ${quality.late_orbit_signed_degrees.toFixed(0)}° in the required direction; target >= 300° without reversing.`,
    );
  }
  if (quality.late_orbit_reversal_count > 0) {
    warnings.push(
      `Late Lunch orbit reverses direction ${quality.late_orbit_reversal_count} time(s); the golden reveal/recap must continue one direction back to the hero front.`,
    );
  }
  if (quality.fish_hold_horizontal_drift_m > 0.18) {
    warnings.push(
      `Goldfish drifts ${quality.fish_hold_horizontal_drift_m.toFixed(2)}m during the reveal hold; target <= 0.18m so parallax is camera-earned.`,
    );
  }
  if (quality.opening_trio_max_abs_surface_lift_m > 0.25) {
    warnings.push(
      `Opening tray actors use up to ${quality.opening_trio_max_abs_surface_lift_m.toFixed(2)}m of authored Y lift. In this contract position.y is lift above measured support; use ~0 for resting food.`,
    );
  }
  if (quality.smallest_visible_scale_multiplier < 0.58) {
    warnings.push(
      `Visible scale_multiplier drops to ${quality.smallest_visible_scale_multiplier.toFixed(2)}. In this contract 1.0 means the reviewed role-normalized asset size; avoid treating scale as absolute physical size.`,
    );
  }
  if (
    quality.hand_contact_start_s !== null &&
    Math.abs(quality.hand_contact_start_s - 3.15) > 0.65
  ) {
    warnings.push(
      `Hand contact begins at ${quality.hand_contact_start_s.toFixed(2)}s; the golden interaction target is about 3.15s.`,
    );
  }
  if (
    quality.hand_contact_end_s !== null &&
    Math.abs(quality.hand_contact_end_s - 4.55) > 0.65
  ) {
    warnings.push(
      `Hand contact ends at ${quality.hand_contact_end_s.toFixed(2)}s; the golden interaction target is about 4.55s.`,
    );
  }
  if (quality.fast_opacity_transition_count > 0) {
    warnings.push(
      `${quality.fast_opacity_transition_count} actor opacity transition(s) complete in under 0.45s. MyWay will soften them, but GLM should author cinematic fades around 0.5–0.8s.`,
    );
  }
  if (quality.hand_precontact_target_drift_m > 0.02) {
    warnings.push(
      `Burger authored drift before hand contact is ${quality.hand_precontact_target_drift_m.toFixed(3)}m. MyWay will causally hold the target until contact, but GLM should keep the burger stationary before ~3.15s.`,
    );
  }
  if (quality.cow_focus_target_x_m < 0.28) {
    warnings.push(
      `Cow beat camera target remains too centered (x=${quality.cow_focus_target_x_m.toFixed(2)}m near 9.35s). Temporarily bias attention camera-right while keeping burger contextual.`,
    );
  }
  if (quality.chicken_focus_target_x_m > -0.28) {
    warnings.push(
      `Chicken beat camera target remains too centered (x=${quality.chicken_focus_target_x_m.toFixed(2)}m near 12.85s). Temporarily bias attention camera-left while keeping burger contextual.`,
    );
  }
  if (quality.fish_initial_occlusion_proxy < 0.36) {
    warnings.push(
      `Fish/burger screen-overlap proxy is only ${quality.fish_initial_occlusion_proxy.toFixed(2)} near 14.55s; target >=0.36 for the measured Lunch projection proxy.`,
    );
  }
  if (quality.fish_reveal_separation_ratio_15s > 1.5) {
    warnings.push(
      `Fish separates too quickly from the burger (screen-separation ratio ${quality.fish_reveal_separation_ratio_15s.toFixed(2)} at 15.0s; target <=1.50). Slow the opening orbit so discovery is earned progressively.`,
    );
  }
  if (quality.slow_opacity_transition_count > 0) {
    warnings.push(
      `${quality.slow_opacity_transition_count} major insert opacity transition(s) take longer than 0.95s. Lunch insert fades should generally land around 0.5–0.8s rather than dissolve slowly across the whole beat.`,
    );
  }
  if (quality.hand_staging_yaw_error_deg > 45) {
    warnings.push(
      `Hand staging yaw differs from the readable Lunch effector frame by ${quality.hand_staging_yaw_error_deg.toFixed(0)}°. Use a palm-readable staging orientation near [7°,180°,0°]; MyWay owns the final geometry contact frame.`,
    );
  }
  if (
    quality.hand_target_peak_response_m < 0.045 ||
    quality.hand_target_peak_response_m > 0.14
  ) {
    warnings.push(
      `Burger peak authored response during hand contact is ${quality.hand_target_peak_response_m.toFixed(3)}m. Target a small but legible nudge around 0.06–0.11m during 3.15→4.55s, then let it settle.`,
    );
  }
  if (
    quality.hand_target_peak_response_m >= 0.02 &&
    quality.hand_target_response_alignment < 0.45
  ) {
    warnings.push(
      `Burger nudge response alignment is only ${quality.hand_target_response_alignment.toFixed(2)} with the hand approach direction. The target should move with the push, not sideways/back against it.`,
    );
  }
  if (quality.cow_focus_target_x_error_m > 0.22) {
    warnings.push(
      `Cow temporary camera attention misses the Golden target by ${quality.cow_focus_target_x_error_m.toFixed(2)}m in X. Keep numeric target as the composition anchor and let focus_role/focus_weight provide the temporary shift once.`,
    );
  }
  if (quality.chicken_focus_target_x_error_m > 0.22) {
    warnings.push(
      `Chicken temporary camera attention misses the Golden target by ${quality.chicken_focus_target_x_error_m.toFixed(2)}m in X. Keep numeric target as the composition anchor and let focus_role/focus_weight provide the temporary shift once.`,
    );
  }
  if (quality.cow_peak_yaw_error_deg > 24) {
    warnings.push(
      `Cow remains too side-on at peak readability (${quality.cow_peak_yaw_error_deg.toFixed(0)}° yaw error). Turn it into a camera-readable three-quarter presentation as it settles.`,
    );
  }
  if (quality.chicken_peak_yaw_error_deg > 24) {
    warnings.push(
      `Chicken remains too side-on at peak readability (${quality.chicken_peak_yaw_error_deg.toFixed(0)}° yaw error). Turn it into a camera-readable three-quarter presentation as it settles.`,
    );
  }
  if (
    quality.fish_visible_start_s !== null &&
    quality.fish_visible_start_s < 12.55
  ) {
    warnings.push(
      `Goldfish becomes visible at ${quality.fish_visible_start_s.toFixed(2)}s. Keep it out of the visible film until roughly 12.9s so the chicken beat can resolve before the hidden-behind-burger setup begins.`,
    );
  }
  if (quality.fish_reveal_curve_mean_abs_error > 0.42) {
    warnings.push(
      `Fish reveal curve differs from Golden by ${quality.fish_reveal_curve_mean_abs_error.toFixed(2)} burger-radii on average. Match the 14.55→18s screen-space parallax progression, not just the final reveal.`,
    );
  }
  if (
    quality.late_orbit_phase_mean_abs_error_deg > 18 ||
    quality.late_orbit_phase_max_abs_error_deg > 42
  ) {
    warnings.push(
      `Late orbit timing is out of phase with Golden (mean ${quality.late_orbit_phase_mean_abs_error_deg.toFixed(0)}°, max ${quality.late_orbit_phase_max_abs_error_deg.toFixed(0)}°). Preserve the one-direction orbit but do not reach the front hero early.`,
    );
  }
  if (quality.late_orbit_radius_mean_abs_error_m > 0.55) {
    warnings.push(
      `Late orbit radius differs from Golden by ${quality.late_orbit_radius_mean_abs_error_m.toFixed(2)}m on average. Shape the rail instead of using a mathematical constant-radius circle.`,
    );
  }
  if (quality.late_camera_height_mean_abs_error_m > 0.30) {
    warnings.push(
      `Late camera height differs from Golden by ${quality.late_camera_height_mean_abs_error_m.toFixed(2)}m on average. Preserve the lower beauty-orbit height profile through the hero finish.`,
    );
  }
  if (quality.final_camera_height_error_m > 0.28) {
    warnings.push(
      `Final hero camera is ${quality.final_camera_height_error_m.toFixed(2)}m away from the Golden height. Finish lower and more beauty-shot-like rather than top-down.`,
    );
  }
  if (quality.final_support_opacity_max > 0.72) {
    warnings.push(
      `Final support opacity remains ${quality.final_support_opacity_max.toFixed(2)}. Deemphasize apple/nigiri toward ~0.58 while the burger stays fully opaque and becomes the unmistakable hero.`,
    );
  }
  if (quality.cow_authored_hold_drift_m > 0.09) {
    warnings.push(
      `Cow authored track moves ${quality.cow_authored_hold_drift_m.toFixed(2)}m before the intended 10.55s departure start. Hold the settled cow pose through 10.55s; MyWay's choreography compiler will then own the departure envelope.`,
    );
  }
  if (quality.chicken_authored_hold_drift_m > 0.09) {
    warnings.push(
      `Chicken authored track moves ${quality.chicken_authored_hold_drift_m.toFixed(2)}m before the intended 13.05s departure start. Hold the settled chicken pose through 13.05s; MyWay's choreography compiler will then own the departure envelope.`,
    );
  }
  if (quality.fish_forward_yaw_error_deg > 45) {
    warnings.push(
      `Goldfish semantic forward yaw is reversed by ${quality.fish_forward_yaw_error_deg.toFixed(0)}°. For the hidden-behind-burger setup use near-zero yaw; MyWay treats the reviewed fish forward axis as semantic authority.`,
    );
  }
  if (quality.attention_target_peak_speed_mps > 2.8) {
    warnings.push(
      `Temporary attention target moves too abruptly (${quality.attention_target_peak_speed_mps.toFixed(2)}m/s peak). Cow→chicken attention should crossfade continuously instead of switching focus authority.`,
    );
  }
  if (quality.non_hand_physical_interaction_count > 0) {
    warnings.push(
      `Lunch has ${quality.non_hand_physical_interaction_count} non-hand physical interaction(s). Cow/chicken/fish entrances belong in actor tracks and directional clearance, not CP.1F contact.`,
    );
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function parseCinematicReproductionJson(text: string) {
  const raw = JSON.parse(text) as unknown;
  const plan = normalizeCinematicReproductionPlan(raw);
  const validation = validateCinematicReproductionPlan(plan);
  const authoringDiagnostics = rawAuthoringContractDiagnostics(raw);
  validation.errors.push(...authoringDiagnostics.errors);
  validation.warnings.unshift(...authoringDiagnostics.warnings);
  validation.ok = validation.errors.length === 0;
  const rawRecord = raw && typeof raw === "object"
    ? raw as Record<string, unknown>
    : null;
  if (rawRecord?.schema_version !== CINEMATIC_REPRODUCTION_SCHEMA_VERSION) {
    validation.errors.unshift(
      `schema_version must be ${CINEMATIC_REPRODUCTION_SCHEMA_VERSION}.`,
    );
    validation.ok = false;
  }
  return { plan, validation };
}

function smoothStep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpVec3(a: RuntimeVec3, b: RuntimeVec3, t: number): RuntimeVec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function scalarTangentAt<T extends { t: number }>(
  keys: T[],
  index: number,
  getter: (key: T) => number,
) {
  const current = keys[index];
  const previous = keys[Math.max(0, index - 1)];
  const next = keys[Math.min(keys.length - 1, index + 1)];
  if (index === 0) return (getter(next) - getter(current)) / Math.max(0.001, next.t - current.t);
  if (index === keys.length - 1) return (getter(current) - getter(previous)) / Math.max(0.001, current.t - previous.t);
  return (getter(next) - getter(previous)) / Math.max(0.001, next.t - previous.t);
}

function scalarAccelerationAt<T extends { t: number }>(
  keys: T[],
  index: number,
  getter: (key: T) => number,
) {
  if (index <= 0 || index >= keys.length - 1) return 0;
  const previous = keys[index - 1];
  const current = keys[index];
  const next = keys[index + 1];
  const previousSpan = Math.max(0.001, current.t - previous.t);
  const nextSpan = Math.max(0.001, next.t - current.t);
  const previousSlope = (getter(current) - getter(previous)) / previousSpan;
  const nextSlope = (getter(next) - getter(current)) / nextSpan;
  return 2 * (nextSlope - previousSlope) / (previousSpan + nextSpan);
}

function quinticHermiteScalar(
  start: number,
  end: number,
  startVelocity: number,
  endVelocity: number,
  startAcceleration: number,
  endAcceleration: number,
  progress: number,
  durationS: number,
) {
  const t = clamp01(progress);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  const h00 = 1 - 10 * t3 + 15 * t4 - 6 * t5;
  const h10 = t - 6 * t3 + 8 * t4 - 3 * t5;
  const h20 = 0.5 * (t2 - 3 * t3 + 3 * t4 - t5);
  const h01 = 10 * t3 - 15 * t4 + 6 * t5;
  const h11 = -4 * t3 + 7 * t4 - 3 * t5;
  const h21 = 0.5 * (t3 - 2 * t4 + t5);
  return h00 * start +
    h10 * durationS * startVelocity +
    h20 * durationS * durationS * startAcceleration +
    h01 * end +
    h11 * durationS * endVelocity +
    h21 * durationS * durationS * endAcceleration;
}

function sampleScalar<T extends { t: number }>(
  keys: T[],
  timeS: number,
  mode: CinematicReproductionInterpolation,
  getter: (key: T) => number,
) {
  if (!keys.length) return 0;
  if (keys.length === 1 || timeS <= keys[0].t) return getter(keys[0]);
  if (timeS >= keys[keys.length - 1].t) return getter(keys[keys.length - 1]);
  let rightIndex = keys.findIndex((key) => timeS <= key.t);
  if (rightIndex <= 0) rightIndex = 1;
  const leftIndex = rightIndex - 1;
  const left = keys[leftIndex];
  const right = keys[rightIndex];
  const span = Math.max(0.001, right.t - left.t);
  let t = clamp01((timeS - left.t) / span);
  if (mode === "smooth") t = smoothStep(t);
  if (mode !== "c2") return lerp(getter(left), getter(right), t);
  return quinticHermiteScalar(
    getter(left),
    getter(right),
    scalarTangentAt(keys, leftIndex, getter),
    scalarTangentAt(keys, rightIndex, getter),
    scalarAccelerationAt(keys, leftIndex, getter),
    scalarAccelerationAt(keys, rightIndex, getter),
    t,
    span,
  );
}

function sampleVec3<T extends { t: number }>(
  keys: T[],
  timeS: number,
  mode: CinematicReproductionInterpolation,
  getter: (key: T) => RuntimeVec3,
): RuntimeVec3 {
  if (mode !== "c2") {
    if (!keys.length) return [0, 0, 0];
    if (keys.length === 1 || timeS <= keys[0].t) return [...getter(keys[0])];
    if (timeS >= keys[keys.length - 1].t) return [...getter(keys[keys.length - 1])];
    let rightIndex = keys.findIndex((key) => timeS <= key.t);
    if (rightIndex <= 0) rightIndex = 1;
    const left = keys[rightIndex - 1];
    const right = keys[rightIndex];
    const span = Math.max(0.001, right.t - left.t);
    let t = clamp01((timeS - left.t) / span);
    if (mode === "smooth") t = smoothStep(t);
    return lerpVec3(getter(left), getter(right), t);
  }
  return [0, 1, 2].map((axis) =>
    sampleScalar(keys, timeS, mode, (key) => getter(key)[axis]),
  ) as RuntimeVec3;
}

function sampleLocalBoundedScalar<T extends { t: number }>(
  keys: T[],
  timeS: number,
  getter: (key: T) => number,
  min: number,
  max: number,
) {
  if (!keys.length) return min;
  if (keys.length === 1 || timeS <= keys[0].t) {
    return clamp(getter(keys[0]), min, max);
  }
  if (timeS >= keys[keys.length - 1].t) {
    return clamp(getter(keys[keys.length - 1]), min, max);
  }
  let rightIndex = keys.findIndex((key) => timeS <= key.t);
  if (rightIndex <= 0) rightIndex = 1;
  const left = keys[rightIndex - 1];
  const right = keys[rightIndex];
  const span = Math.max(0.001, right.t - left.t);
  const t = smoothStep((timeS - left.t) / span);
  // CP.2A.1: bounded actor channels must never inherit future C2 tangents.
  // This prevents opacity/emphasis/scale "pre-echo" before an entrance key.
  return clamp(lerp(getter(left), getter(right), t), min, max);
}

function sampleOpacityWithMinimumFade(
  keys: CinematicReproductionActorKey[],
  timeS: number,
  minimumFadeS = 0.48,
) {
  for (let index = 0; index < keys.length - 1; index += 1) {
    const left = keys[index];
    const right = keys[index + 1];
    const leftOpacity = clamp(left.opacity, 0, 1);
    const rightOpacity = clamp(right.opacity, 0, 1);
    const authoredSpan = Math.max(0.001, right.t - left.t);
    if (
      Math.abs(rightOpacity - leftOpacity) < 0.2 ||
      authoredSpan >= minimumFadeS
    ) {
      continue;
    }

    // CP.2A.2 visibility governor. Fast model-authored visibility switches are
    // expanded without moving spatial keys. Fade-ins begin at the authored
    // start; fade-outs still finish at the authored end.
    const rising = rightOpacity > leftOpacity;
    const fadeStart = rising
      ? left.t
      : Math.max(
          index > 0 ? keys[index - 1].t : 0,
          right.t - minimumFadeS,
        );
    const fadeEnd = rising
      ? Math.min(
          index + 2 < keys.length ? keys[index + 2].t : Number.POSITIVE_INFINITY,
          left.t + minimumFadeS,
        )
      : right.t;
    if (timeS >= fadeStart && timeS <= fadeEnd) {
      const progress = smoothStep(
        (timeS - fadeStart) / Math.max(0.001, fadeEnd - fadeStart),
      );
      return clamp(lerp(leftOpacity, rightOpacity, progress), 0, 1);
    }
  }
  return sampleLocalBoundedScalar(keys, timeS, (key) => key.opacity, 0, 1);
}

function sampleActorTrack(track: CinematicReproductionActorTrack, timeS: number): RuntimeActorPose {
  const keys = track.keys;
  if (!keys.length) return hiddenPose();
  const opacity = sampleOpacityWithMinimumFade(keys, timeS);
  const emphasis = sampleLocalBoundedScalar(keys, timeS, (key) => key.emphasis, 0, 1);
  const scale = sampleLocalBoundedScalar(keys, timeS, (key) => key.scale, 0.001, 20);
  return {
    visible: opacity > 0.001,
    position: sampleVec3(keys, timeS, track.interpolation, (key) => key.position),
    rotation: sampleVec3(keys, timeS, track.interpolation, (key) => key.rotation),
    scale,
    opacity,
    emphasis,
  };
}

type LunchInsertRecipe = {
  arrivalStartS: number;
  arrivalEndS: number;
  holdEndS: number;
  departureEndS: number;
  opacityInStartS: number;
  opacityInEndS: number;
  opacityOutStartS: number;
  opacityOutEndS: number;
  verticalArcM: number;
  settleZAmplitudeM: number;
};

const LUNCH_INSERT_RECIPES: Partial<Record<RuntimeActorRole, LunchInsertRecipe>> = {
  cow: {
    arrivalStartS: 7.55,
    arrivalEndS: 9.15,
    holdEndS: 10.55,
    departureEndS: 11.75,
    opacityInStartS: 7.35,
    opacityInEndS: 8.05,
    opacityOutStartS: 11.0,
    opacityOutEndS: 11.78,
    verticalArcM: 0.055,
    settleZAmplitudeM: 0.04,
  },
  chicken: {
    arrivalStartS: 10.55,
    arrivalEndS: 11.55,
    holdEndS: 13.05,
    departureEndS: 14.55,
    opacityInStartS: 10.45,
    opacityInEndS: 11.05,
    opacityOutStartS: 13.75,
    opacityOutEndS: 14.62,
    verticalArcM: 0.05,
    settleZAmplitudeM: -0.01,
  },
};

function smoothTimeProgress(timeS: number, startS: number, endS: number) {
  return smoothStep((timeS - startS) / Math.max(0.001, endS - startS));
}

function smoothTimeWindow(
  timeS: number,
  inStartS: number,
  inEndS: number,
  outStartS: number,
  outEndS: number,
) {
  const fadeIn = smoothTimeProgress(timeS, inStartS, inEndS);
  const fadeOut = 1 - smoothTimeProgress(timeS, outStartS, outEndS);
  return clamp01(Math.min(fadeIn, fadeOut));
}

function lerpAngleRadians(left: number, right: number, progress: number) {
  return left + shortestAngleDeltaRadians(right, left) * clamp01(progress);
}

function lerpActorPose(
  left: RuntimeActorPose,
  right: RuntimeActorPose,
  progress: number,
): RuntimeActorPose {
  const t = clamp01(progress);
  return {
    visible: left.visible || right.visible,
    position: lerpVec3(left.position, right.position, t),
    rotation: [
      lerpAngleRadians(left.rotation[0], right.rotation[0], t),
      lerpAngleRadians(left.rotation[1], right.rotation[1], t),
      lerpAngleRadians(left.rotation[2], right.rotation[2], t),
    ],
    scale: lerp(left.scale, right.scale, t),
    opacity: lerp(left.opacity, right.opacity, t),
    emphasis: lerp(left.emphasis, right.emphasis, t),
  };
}

/**
 * CP.2A.5 actor choreography compiler.
 *
 * GLM still chooses the semantic participants and broad endpoints. MyWay owns
 * the connective motion grammar: arrive -> settle -> hold -> depart. This
 * prevents a model key at the nominal departure start from being interpreted
 * as "already half departed", which was the source of the cow/chicken rhythm
 * error in the CP.2A.4 film.
 */
function compileLunchInsertPose(
  role: "cow" | "chicken",
  track: CinematicReproductionActorTrack,
  timeS: number,
): RuntimeActorPose {
  const recipe = LUNCH_INSERT_RECIPES[role]!;
  const entryPose = sampleActorTrack(track, recipe.arrivalStartS);
  const settledPose = sampleActorTrack(track, recipe.arrivalEndS);
  const exitPose = sampleActorTrack(track, recipe.departureEndS);
  const arrival = smoothTimeProgress(
    timeS,
    recipe.arrivalStartS,
    recipe.arrivalEndS,
  );
  const departure = smoothTimeProgress(
    timeS,
    recipe.holdEndS,
    recipe.departureEndS,
  );

  let pose = timeS <= recipe.holdEndS
    ? lerpActorPose(entryPose, settledPose, arrival)
    : lerpActorPose(settledPose, exitPose, departure);

  const arrivalArc = Math.sin(arrival * Math.PI) *
    recipe.verticalArcM *
    (1 - departure);
  const settleWobble = Math.sin(arrival * Math.PI * 2) *
    Math.pow(1 - arrival, 2) *
    recipe.settleZAmplitudeM;
  const opacity = smoothTimeWindow(
    timeS,
    recipe.opacityInStartS,
    recipe.opacityInEndS,
    recipe.opacityOutStartS,
    recipe.opacityOutEndS,
  );

  pose = {
    ...pose,
    visible: opacity > 0.001,
    position: [
      pose.position[0],
      pose.position[1] + arrivalArc,
      pose.position[2] + settleWobble,
    ],
    rotation: [
      pose.rotation[0] + 0.02 * arrival * (1 - departure),
      pose.rotation[1],
      pose.rotation[2] + settleWobble * 0.32,
    ],
    opacity,
  };
  return pose;
}

function compileLunchGoldfishPose(
  track: CinematicReproductionActorTrack,
  timeS: number,
): RuntimeActorPose {
  const arrival = smoothTimeProgress(timeS, 12.95, 13.72);
  const departure = smoothTimeProgress(timeS, 18.2, 19.05);
  const entryPose = sampleActorTrack(track, 12.95);
  const settledPose = sampleActorTrack(track, 13.72);
  const fishSwim = Math.sin(timeS * Math.PI * 2) * 0.012 * (1 - departure);
  const fishTail = Math.sin(timeS * Math.PI * 4.2) * 0.035 * (1 - departure);
  const opacity = smoothTimeWindow(timeS, 12.9, 13.45, 18.45, 19.12);
  const emphasis = smoothTimeWindow(timeS, 14.75, 15.25, 17.75, 18.3);

  return {
    visible: opacity > 0.001,
    position: [
      lerp(entryPose.position[0], settledPose.position[0], arrival) +
        departure * 0.72,
      lerp(entryPose.position[1], settledPose.position[1], arrival) +
        Math.sin(arrival * Math.PI) * 0.025 +
        fishSwim,
      lerp(entryPose.position[2], settledPose.position[2], arrival) +
        departure * 0.22,
    ],
    // Semantic forward authority: near-zero yaw points the fish long axis down
    // the initial viewing ray. A raw 180-degree model yaw is treated as an
    // asset-facing mistake rather than allowed to invert the reveal.
    rotation: [
      0.02 + fishTail * 0.03,
      fishTail * 0.05,
      fishTail * 0.07,
    ],
    scale:
      lerp(entryPose.scale, settledPose.scale, arrival) *
      lerp(1, 0.94, departure),
    opacity,
    emphasis,
  };
}

function compileLunchHandStagingPose(
  track: CinematicReproductionActorTrack,
  timeS: number,
): RuntimeActorPose {
  const staging = sampleActorTrack(track, 1.35);
  const opacity = smoothTimeWindow(timeS, 1.2, 1.85, 4.85, 6.55);
  const handScale = lerp(
    sampleActorTrack(track, 1.35).scale,
    sampleActorTrack(track, 3.55).scale,
    smoothTimeProgress(timeS, 1.35, 3.15),
  );
  return {
    ...staging,
    visible: opacity > 0.001,
    // CP.1F owns literal approach/contact/retreat roots. GLM's hand position
    // track is staging evidence only and must not fight the physical solver.
    position: [...staging.position],
    rotation: [0.12, Math.PI, 0],
    scale: handScale,
    opacity,
    emphasis: 0,
  };
}

function compileLunchActorChoreography(
  role: RuntimeActorRole,
  track: CinematicReproductionActorTrack,
  timeS: number,
  authored: RuntimeActorPose,
): RuntimeActorPose {
  if (role === "cow" || role === "chicken") {
    return compileLunchInsertPose(role, track, timeS);
  }
  if (role === "goldfish") {
    return compileLunchGoldfishPose(track, timeS);
  }
  if (role === "hand") {
    return compileLunchHandStagingPose(track, timeS);
  }
  return authored;
}

function compiledLunchAttentionEmphasis(
  role: RuntimeActorRole,
  keys: CinematicReproductionCameraKey[],
  timeS: number,
) {
  const authoredFocus = keys.some(
    (key) => key.focus_role === role && (key.focus_weight ?? 0) > 0,
  );
  if (!authoredFocus) return 0;
  if (role === "cow") {
    return smoothTimeWindow(timeS, 8.65, 9.2, 10.25, 10.75);
  }
  if (role === "chicken") {
    return smoothTimeWindow(timeS, 11.35, 11.8, 12.85, 13.45);
  }
  return 0;
}

function sampledCameraAttentionWeights(
  keys: CinematicReproductionCameraKey[],
  timeS: number,
) {
  const weights = {} as Partial<Record<RuntimeActorRole, number>>;
  for (const role of LUNCH_RUNTIME_ROLES) {
    const weight = sampleLocalBoundedScalar(
      keys,
      timeS,
      (key) =>
        key.focus_role === role
          ? clamp(key.focus_weight ?? 0, 0, 1)
          : 0,
      0,
      1,
    );
    if (weight > 0.001) weights[role] = weight;
  }
  return weights;
}

function sampleInteraction(
  interaction: CinematicReproductionInteraction,
  timeS: number,
): RuntimeAssetInteractionIntent | null {
  if (timeS < interaction.approach_start_s || timeS >= interaction.retreat_end_s) return null;
  let phase: RuntimeAssetInteractionIntent["phase"];
  let startS: number;
  let endS: number;
  if (timeS < interaction.contact_start_s) {
    phase = "approach";
    startS = interaction.approach_start_s;
    endS = interaction.contact_start_s;
  } else if (timeS < interaction.contact_end_s) {
    phase = "contact";
    startS = interaction.contact_start_s;
    endS = interaction.contact_end_s;
  } else {
    phase = "retreat";
    startS = interaction.contact_end_s;
    endS = interaction.retreat_end_s;
  }
  return {
    id: interaction.id,
    kind: interaction.kind,
    sourceRole: interaction.source_role,
    targetRole: interaction.target_role,
    phase,
    phaseProgress: clamp01((timeS - startS) / Math.max(0.001, endS - startS)),
    approachDirection: interaction.approach_direction,
    preferredTargetSide: interaction.preferred_target_side,
    contactClearanceM: interaction.contact_clearance_m,
    obstacleClearanceM: interaction.obstacle_clearance_m,
    obstacleRoles: interaction.obstacle_roles,
    maintainContact: phase === "contact" && interaction.maintain_contact,
  };
}

function compiledCameraAttentionStrength(
  role: RuntimeActorRole,
  keys: CinematicReproductionCameraKey[],
  timeS: number,
  sampledWeight: number,
) {
  const roleKeys = keys.filter(
    (key) => key.focus_role === role && (key.focus_weight ?? 0) > 0,
  );
  if (!roleKeys.length) return 0;
  const peakHint = Math.max(...roleKeys.map((key) => key.focus_weight ?? 0));
  if (role === "cow") {
    const fadeIn = Math.pow(
      smoothTimeProgress(timeS, 7.35, 9.35),
      1.4,
    );
    const fadeOut = 1 - smoothTimeProgress(timeS, 9.6, 11.2);
    return clamp01(peakHint * 0.8 * fadeIn * fadeOut);
  }
  if (role === "chicken") {
    const fadeIn = Math.pow(
      smoothTimeProgress(timeS, 11.35, 12.85),
      0.7,
    );
    const fadeOut = 1 - smoothTimeProgress(timeS, 12.85, 13.75);
    return clamp01(peakHint * 0.8 * fadeIn * fadeOut);
  }
  return clamp01(sampledWeight * 0.8);
}

function sampledCameraFocusTarget(
  keys: CinematicReproductionCameraKey[],
  timeS: number,
  poses: Record<RuntimeActorRole, RuntimeActorPose>,
  authoredTarget: RuntimeVec3,
  attentionWeights: Partial<Record<RuntimeActorRole, number>>,
): RuntimeVec3 {
  // CP.2A.5 continuous attention envelope. CP.2A.4 selected one "best" focus
  // key, which could hand authority from cow to chicken discontinuously even
  // when both individual target locations looked numerically correct.
  const compositionKeys = keys.filter(
    (key) => !key.focus_role || !key.focus_weight || key.focus_weight <= 0,
  );
  const compositionTarget = compositionKeys.length >= 2
    ? sampleVec3(
        compositionKeys,
        timeS,
        "c2",
        (key) => key.target,
      )
    : authoredTarget;

  let totalStrength = 0;
  const focusPoint: RuntimeVec3 = [0, 0, 0];
  for (const role of LUNCH_RUNTIME_ROLES) {
    const pose = poses[role];
    const sampledWeight = attentionWeights[role] ?? 0;
    const strength = compiledCameraAttentionStrength(
      role,
      keys,
      timeS,
      sampledWeight,
    );
    if (!pose?.visible || pose.opacity <= 0.01 || strength <= 0.001) continue;
    focusPoint[0] += pose.position[0] * strength;
    focusPoint[1] += (
      role === "hand" ? Math.max(0.42, pose.position[1]) : 0.32
    ) * strength;
    focusPoint[2] += pose.position[2] * strength;
    totalStrength += strength;
  }
  if (totalStrength <= 0.001) return compositionTarget;

  focusPoint[0] /= totalStrength;
  focusPoint[1] /= totalStrength;
  focusPoint[2] /= totalStrength;
  return lerpVec3(
    compositionTarget,
    focusPoint,
    clamp01(totalStrength),
  );
}

export function sampleCinematicReproductionPlan(
  plan: CinematicReproductionPlanV1,
  timeS: number,
): CinematicShotRuntimeLayout {
  const t = clamp(timeS, 0, plan.duration_s);
  const cameraKeys = plan.camera.keys;
  const fallbackCamera = sampleCinematicBurgerRuntime(0).camera;

  const poses = Object.fromEntries(
    LUNCH_RUNTIME_ROLES.map((role) => {
      const authored = sampleActorTrack(plan.actors[role], t);
      return [
        role,
        compileLunchActorChoreography(role, plan.actors[role], t, authored),
      ];
    }),
  ) as Record<RuntimeActorRole, RuntimeActorPose>;

  const attentionWeights = sampledCameraAttentionWeights(cameraKeys, t);
  for (const role of LUNCH_RUNTIME_ROLES) {
    const weight = attentionWeights[role] ?? 0;
    const compiledEmphasis = compiledLunchAttentionEmphasis(
      role,
      cameraKeys,
      t,
    );
    if ((weight <= 0.001 && compiledEmphasis <= 0.001) || !poses[role].visible) {
      continue;
    }
    poses[role] = {
      ...poses[role],
      // Temporary camera attention and outline emphasis are one semantic beat,
      // but the visual highlight gets its own continuous cinematic envelope.
      emphasis: Math.max(poses[role].emphasis, compiledEmphasis),
    };
  }

  // Physical causality: an interaction target cannot start drifting because of
  // a model-authored C2 key before literal contact. For the reproduction lane,
  // hold push/nudge targets at their approach-start pose until contact begins.
  for (const interaction of plan.interactions) {
    if (
      (interaction.kind === "nudge" || interaction.kind === "push") &&
      t >= interaction.approach_start_s &&
      t < interaction.contact_start_s
    ) {
      poses[interaction.target_role] = sampleActorTrack(
        plan.actors[interaction.target_role],
        interaction.approach_start_s,
      );
    }
  }

  const camera = cameraKeys.length
    ? (() => {
        const authoredTarget = sampleVec3(
          cameraKeys,
          t,
          plan.camera.interpolation,
          (key) => key.target,
        );
        return {
          position: sampleVec3(cameraKeys, t, plan.camera.interpolation, (key) => key.position),
          target: sampledCameraFocusTarget(
            cameraKeys,
            t,
            poses,
            authoredTarget,
            attentionWeights,
          ),
          fov: clamp(sampleScalar(cameraKeys, t, plan.camera.interpolation, (key) => key.fov), 12, 90),
        };
      })()
    : fallbackCamera;

  const interactions = plan.interactions
    .map((item) => sampleInteraction(item, t))
    .filter((item): item is RuntimeAssetInteractionIntent => Boolean(item));
  const directionalClearanceConstraints: RuntimeDirectionalClearanceConstraint[] =
    plan.directional_clearance
      .filter((item) => t >= item.start_s && t <= item.end_s)
      .map((item) => ({
        id: item.id,
        movingRole: item.moving_role,
        anchorRole: item.anchor_role,
        direction: item.direction,
        minimumSurfaceGapM: item.minimum_surface_gap_m,
      }));

  return {
    camera,
    tray: poses.tray,
    foods: [poses.apple, poses.burger, poses.nigiri],
    cow: poses.cow,
    chicken: poses.chicken,
    goldfish: poses.goldfish,
    hand: poses.hand,
    interactions,
    directionalClearanceConstraints,
  };
}

function actorKey(role: RuntimeActorRole, timeS: number): CinematicReproductionActorKey {
  const pose = actorPose(sampleCinematicBurgerRuntime(timeS), role);
  let transformPose = pose;
  // Golden visibility windows return the generic hidden pose exactly at a fade
  // boundary. Keep the boundary opacity, but borrow the neighboring authored
  // transform so generated interpolation never flies in from y=-8.
  if (!pose.visible) {
    for (const offset of [0.02, -0.02, 0.05, -0.05]) {
      const candidateTime = clamp(
        timeS + offset,
        0,
        CINEMATIC_BURGER_TIMELINE_DURATION_S,
      );
      const candidate = actorPose(sampleCinematicBurgerRuntime(candidateTime), role);
      if (candidate.visible) {
        transformPose = candidate;
        break;
      }
    }
  }
  return {
    t: timeS,
    visible: pose.visible,
    position: [...transformPose.position],
    rotation: [...transformPose.rotation],
    scale: transformPose.scale,
    opacity: pose.opacity,
    emphasis: pose.emphasis,
  };
}

const GOLDEN_CAMERA_TIMES = [
  0, 2.1, 4.7, 7.35, 9.35, 11, 12.85, 13.75, 14.55, 15.25,
  16.05, 16.85, 18, 19.25, 20.45, 21.75, 23, 24.4, 26,
] as const;

const GOLDEN_ACTOR_TIMES: Record<RuntimeActorRole, readonly number[]> = {
  tray: [0, 4.35, 10, 21.5, 25.6, 26],
  apple: [0, 1.45, 4.9, 9.35, 16.85, 18.1, 18.55, 18.9, 21, 22.1, 25.4, 26],
  burger: [0, 1.45, 2.95, 3.18, 3.55, 4.28, 4.52, 4.9, 9.35, 16.85, 18.75, 19.1, 19.55, 19.9, 21, 23.55, 25.4, 26],
  nigiri: [0, 1.45, 4.9, 9.35, 16.85, 19.75, 20.1, 20.55, 20.9, 21, 22.1, 25.4, 26],
  cow: [7.35, 8.05, 9.15, 10.25, 10.75, 11, 11.78],
  chicken: [10.45, 11.05, 11.55, 11.8, 12.85, 13.45, 13.75, 14.62],
  goldfish: [12.9, 13.45, 13.72, 14.75, 15.25, 17.75, 18.3, 18.45, 19.12],
  hand: [1.2, 1.35, 1.85, 3.15, 4.55, 4.85, 6.55, 6.65],
};

export function buildLunchGoldenDerivedStarterPlan(): CinematicReproductionPlanV1 {
  const cameraKeys = GOLDEN_CAMERA_TIMES.map((t) => {
    const camera = sampleCinematicBurgerRuntime(t).camera;
    return {
      t,
      position: [...camera.position] as RuntimeVec3,
      target: [...camera.target] as RuntimeVec3,
      fov: camera.fov,
    };
  });
  const actors = Object.fromEntries(
    LUNCH_RUNTIME_ROLES.map((role) => [
      role,
      {
        interpolation: "c2" as const,
        keys: GOLDEN_ACTOR_TIMES[role].map((t) => actorKey(role, t)),
      },
    ]),
  ) as Record<RuntimeActorRole, CinematicReproductionActorTrack>;

  return {
    schema_version: CINEMATIC_REPRODUCTION_SCHEMA_VERSION,
    title: "Lunch · editable starter",
    duration_s: CINEMATIC_BURGER_TIMELINE_DURATION_S,
    aspect_ratio: "9:16",
    intent_summary:
      "Editable golden-derived scaffold for testing the CP.2A JSON compiler. Replace this with GLM or ChatGPT-authored JSON when evaluating orchestration.",
    camera: { interpolation: "c2", keys: cameraKeys },
    actors,
    interactions: [
      {
        id: "hand_nudges_burger",
        kind: "nudge",
        source_role: "hand",
        target_role: "burger",
        approach_start_s: 1.35,
        contact_start_s: 3.15,
        contact_end_s: 4.55,
        retreat_end_s: 6.65,
        approach_direction: [1, -0.12, -0.08],
        preferred_target_side: "left",
        contact_clearance_m: 0.008,
        obstacle_clearance_m: 0.035,
        obstacle_roles: ["apple", "nigiri", "tray"],
        maintain_contact: true,
      },
    ],
    directional_clearance: [
      {
        id: "fish_behind_burger_surface_gap",
        moving_role: "goldfish",
        anchor_role: "burger",
        start_s: 12.9,
        end_s: 19.12,
        direction: [0, 0, -1],
        minimum_surface_gap_m: 0.3,
      },
    ],
    notes: [
      "This starter is intentionally derived from sparse samples of the frozen golden Lunch so the editable JSON lane has a known-valid example.",
      "Generate with GLM replaces the working JSON; Render JSON never calls a model.",
    ],
  };
}

function distance(a: RuntimeVec3, b: RuntimeVec3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function horizontalDistance(a: RuntimeVec3, b: RuntimeVec3) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}


function countFastOpacityTransitions(plan: CinematicReproductionPlanV1) {
  let count = 0;
  for (const role of LUNCH_RUNTIME_ROLES) {
    const keys = plan.actors[role].keys;
    for (let index = 0; index < keys.length - 1; index += 1) {
      const left = keys[index];
      const right = keys[index + 1];
      if (
        Math.abs(right.opacity - left.opacity) >= 0.5 &&
        right.t - left.t < 0.45
      ) {
        count += 1;
      }
    }
  }
  return count;
}

function countSlowOpacityTransitions(plan: CinematicReproductionPlanV1) {
  let count = 0;
  for (const role of ["cow", "chicken", "goldfish"] as const) {
    const keys = plan.actors[role].keys;
    for (let index = 0; index < keys.length - 1; index += 1) {
      const left = keys[index];
      const right = keys[index + 1];
      if (
        Math.abs(right.opacity - left.opacity) >= 0.5 &&
        right.t - left.t > 0.95
      ) {
        count += 1;
      }
    }
  }
  return count;
}

function radiansToDegrees(value: number) {
  return value * 180 / Math.PI;
}

function shortestAngleDeltaRadians(a: number, b: number) {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function actorVisibleStart(track: CinematicReproductionActorTrack) {
  const key = track.keys.find((item) => item.visible && item.opacity > 0.01);
  return key?.t ?? null;
}

function actorFullOpacityStart(track: CinematicReproductionActorTrack) {
  const key = track.keys.find((item) => item.visible && item.opacity >= 0.98);
  return key?.t ?? null;
}

function normalizeVec(value: RuntimeVec3, fallback: RuntimeVec3): RuntimeVec3 {
  const magnitude = Math.hypot(value[0], value[1], value[2]);
  if (magnitude < 1e-7) return [...fallback];
  return [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude];
}

function crossVec(a: RuntimeVec3, b: RuntimeVec3): RuntimeVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dotVec(a: RuntimeVec3, b: RuntimeVec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function subtractVec(a: RuntimeVec3, b: RuntimeVec3): RuntimeVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Lightweight screen-space proxy used only for research diagnostics. It does
 * not replace renderer occlusion testing; it asks whether burger/fish projected
 * centres and approximate reviewed extents still substantially overlap.
 */
function fishOcclusionProxy(
  plan: CinematicReproductionPlanV1,
  timeS: number,
) {
  const sample = sampleCinematicReproductionPlan(plan, timeS);
  const camera = sample.camera;
  const forward = normalizeVec(
    subtractVec(camera.target, camera.position),
    [0, 0, -1],
  );
  const worldUp: RuntimeVec3 = Math.abs(forward[1]) > 0.96
    ? [0, 0, 1]
    : [0, 1, 0];
  const right = normalizeVec(crossVec(forward, worldUp), [1, 0, 0]);
  const up = normalizeVec(crossVec(right, forward), [0, 1, 0]);
  const tanHalfFov = Math.tan(camera.fov * Math.PI / 360);
  const aspect = 9 / 16;

  const project = (point: RuntimeVec3, extentM: number) => {
    const relative = subtractVec(point, camera.position);
    const depth = Math.max(0.05, dotVec(relative, forward));
    const x = dotVec(relative, right) / Math.max(0.001, depth * tanHalfFov * aspect);
    const y = dotVec(relative, up) / Math.max(0.001, depth * tanHalfFov);
    const radius = (extentM * 0.5) / Math.max(0.001, depth * tanHalfFov);
    return { x, y, radius };
  };

  const burger = project(sample.foods[1].position, 1.18);
  const fish = project(sample.goldfish.position, 0.86);
  const separation = Math.hypot(
    burger.x - fish.x,
    burger.y - fish.y,
  );
  return clamp01(
    1 - separation / Math.max(0.001, burger.radius + fish.radius),
  );
}

function fishScreenSeparationRatioFromSample(
  sample: CinematicShotRuntimeLayout,
) {
  const camera = sample.camera;
  const forward = normalizeVec(
    subtractVec(camera.target, camera.position),
    [0, 0, -1],
  );
  const worldUp: RuntimeVec3 = Math.abs(forward[1]) > 0.96
    ? [0, 0, 1]
    : [0, 1, 0];
  const right = normalizeVec(crossVec(forward, worldUp), [1, 0, 0]);
  const up = normalizeVec(crossVec(right, forward), [0, 1, 0]);
  const tanHalfFov = Math.tan(camera.fov * Math.PI / 360);
  const aspect = 9 / 16;
  const project = (point: RuntimeVec3, extentM: number) => {
    const relative = subtractVec(point, camera.position);
    const depth = Math.max(0.05, dotVec(relative, forward));
    return {
      x: dotVec(relative, right) / Math.max(0.001, depth * tanHalfFov * aspect),
      y: dotVec(relative, up) / Math.max(0.001, depth * tanHalfFov),
      radius: (extentM * 0.5) / Math.max(0.001, depth * tanHalfFov),
    };
  };
  const burger = project(sample.foods[1].position, 1.18);
  const fish = project(sample.goldfish.position, 0.86);
  return Math.hypot(burger.x - fish.x, burger.y - fish.y) /
    Math.max(0.001, burger.radius);
}

function fishScreenSeparationRatio(
  plan: CinematicReproductionPlanV1,
  timeS: number,
) {
  return fishScreenSeparationRatioFromSample(
    sampleCinematicReproductionPlan(plan, timeS),
  );
}

function orbitProgressSeries(
  sampler: (timeS: number) => CinematicShotRuntimeLayout,
  times: number[],
) {
  const result: number[] = [];
  let previousAngle: number | null = null;
  let cumulative = 0;
  for (const timeS of times) {
    const sample = sampler(timeS);
    const burger = sample.foods[1].position;
    let angle = Math.atan2(
      sample.camera.position[0] - burger[0],
      sample.camera.position[2] - burger[2],
    );
    if (previousAngle !== null) {
      while (angle < previousAngle - Math.PI) angle += Math.PI * 2;
      while (angle > previousAngle + Math.PI) angle -= Math.PI * 2;
      cumulative += angle - previousAngle;
    }
    result.push(cumulative);
    previousAngle = angle;
  }
  return result;
}

function horizontalCameraRadius(sample: CinematicShotRuntimeLayout) {
  const burger = sample.foods[1].position;
  return Math.hypot(
    sample.camera.position[0] - burger[0],
    sample.camera.position[2] - burger[2],
  );
}

function authoredInteractionPeakResponse(
  plan: CinematicReproductionPlanV1,
  interaction: CinematicReproductionInteraction | null,
) {
  if (!interaction || (interaction.kind !== "nudge" && interaction.kind !== "push")) {
    return { distanceM: 0, alignment: 0 };
  }
  const track = plan.actors[interaction.target_role];
  const start = sampleActorTrack(track, interaction.contact_start_s).position;
  let peakDistance = 0;
  let peakDisplacement: RuntimeVec3 = [0, 0, 0];
  const span = Math.max(0.001, interaction.contact_end_s - interaction.contact_start_s);
  for (let index = 0; index <= 28; index += 1) {
    const timeS = interaction.contact_start_s + span * index / 28;
    const point = sampleActorTrack(track, timeS).position;
    const displacement: RuntimeVec3 = [
      point[0] - start[0],
      0,
      point[2] - start[2],
    ];
    const distanceM = Math.hypot(displacement[0], displacement[2]);
    if (distanceM > peakDistance) {
      peakDistance = distanceM;
      peakDisplacement = displacement;
    }
  }
  const responseDirection = normalizeVec(peakDisplacement, [0, 0, 0]);
  const authoredDirection = normalizeVec(
    [interaction.approach_direction[0], 0, interaction.approach_direction[2]],
    [1, 0, 0],
  );
  return {
    distanceM: peakDistance,
    alignment: peakDistance > 1e-6
      ? clamp(dotVec(responseDirection, authoredDirection), -1, 1)
      : 0,
  };
}

export function buildLunchReproductionQualityDiagnostics(
  plan: CinematicReproductionPlanV1,
): CinematicReproductionQualityDiagnostics {
  const orbitStartS = Math.min(plan.duration_s, 14.55);
  const orbitEndS = Math.min(plan.duration_s, 26);
  let previousAngle: number | null = null;
  let cumulativeOrbit = 0;
  let totalOrbit = 0;
  let reversalCount = 0;

  for (let timeS = orbitStartS; timeS <= orbitEndS + 1e-6; timeS += 0.25) {
    const sample = sampleCinematicReproductionPlan(plan, timeS);
    const burger = sample.foods[1].position;
    let angle = Math.atan2(
      sample.camera.position[0] - burger[0],
      sample.camera.position[2] - burger[2],
    );
    if (previousAngle !== null) {
      while (angle < previousAngle - Math.PI) angle += Math.PI * 2;
      while (angle > previousAngle + Math.PI) angle -= Math.PI * 2;
      const delta = angle - previousAngle;
      cumulativeOrbit += delta;
      totalOrbit += Math.abs(delta);
      if (delta < -0.02) reversalCount += 1;
    }
    previousAngle = angle;
  }

  const fishHoldStart = sampleCinematicReproductionPlan(
    plan,
    Math.min(plan.duration_s, 13.72),
  ).goldfish.position;
  const fishHoldEnd = sampleCinematicReproductionPlan(
    plan,
    Math.min(plan.duration_s, 18.2),
  ).goldfish.position;

  const openingTrioLift = ["apple", "burger", "nigiri"].flatMap((role) =>
    plan.actors[role as RuntimeActorRole].keys
      .filter((key) => key.t <= 7.0 && key.visible && key.opacity > 0.01)
      .map((key) => Math.abs(key.position[1]))
  );
  const visibleScales = LUNCH_RUNTIME_ROLES.flatMap((role) =>
    plan.actors[role].keys
      .filter((key) => key.visible && key.opacity > 0.01)
      .map((key) => key.scale)
  );

  const handInteraction = plan.interactions.find(
    (item) => item.source_role === "hand" && item.target_role === "burger",
  ) ?? null;
  const fishClearance = plan.directional_clearance.find(
    (item) => item.moving_role === "goldfish" && item.anchor_role === "burger",
  ) ?? null;

  const fastOpacityTransitionCount = countFastOpacityTransitions(plan);
  const slowOpacityTransitionCount = countSlowOpacityTransitions(plan);
  const handPrecontactTargetDrift = handInteraction
    ? horizontalDistance(
        sampleActorTrack(
          plan.actors[handInteraction.target_role],
          handInteraction.approach_start_s,
        ).position,
        sampleActorTrack(
          plan.actors[handInteraction.target_role],
          handInteraction.contact_start_s,
        ).position,
      )
    : 0;

  const cowSample = sampleCinematicReproductionPlan(
    plan,
    Math.min(plan.duration_s, 9.35),
  );
  const chickenSample = sampleCinematicReproductionPlan(
    plan,
    Math.min(plan.duration_s, 12.85),
  );
  const goldenCowSample = sampleCinematicBurgerRuntime(
    Math.min(CINEMATIC_BURGER_TIMELINE_DURATION_S, 9.35),
  );
  const goldenChickenSample = sampleCinematicBurgerRuntime(
    Math.min(CINEMATIC_BURGER_TIMELINE_DURATION_S, 12.85),
  );
  const cowFocusTargetX = cowSample.camera.target[0];
  const chickenFocusTargetX = chickenSample.camera.target[0];

  const handStagingYawErrorDeg = Math.abs(radiansToDegrees(
    shortestAngleDeltaRadians(
      sampleActorTrack(plan.actors.hand, Math.min(plan.duration_s, 2.5)).rotation[1],
      sampleCinematicBurgerRuntime(2.5).hand.rotation[1],
    ),
  ));
  const targetResponse = authoredInteractionPeakResponse(plan, handInteraction);

  const cowPeakYawErrorDeg = Math.abs(radiansToDegrees(
    shortestAngleDeltaRadians(
      sampleActorTrack(plan.actors.cow, Math.min(plan.duration_s, 9.15)).rotation[1],
      sampleCinematicBurgerRuntime(9.15).cow.rotation[1],
    ),
  ));
  const chickenPeakYawErrorDeg = Math.abs(radiansToDegrees(
    shortestAngleDeltaRadians(
      sampleActorTrack(plan.actors.chicken, Math.min(plan.duration_s, 11.55)).rotation[1],
      sampleCinematicBurgerRuntime(11.55).chicken.rotation[1],
    ),
  ));

  const fishInitialOcclusionProxy = fishOcclusionProxy(
    plan,
    Math.min(plan.duration_s, 14.55),
  );
  const fishRevealSeparationRatio15s = fishScreenSeparationRatio(
    plan,
    Math.min(plan.duration_s, 15.0),
  );
  const fishRevealTimes = [14.55, 15.25, 16.05, 16.85, 18.0]
    .map((value) => Math.min(plan.duration_s, value));
  const fishRevealCurveErrors = fishRevealTimes.map((timeS) => Math.abs(
    fishScreenSeparationRatio(plan, timeS) -
      fishScreenSeparationRatioFromSample(sampleCinematicBurgerRuntime(timeS)),
  ));
  const fishRevealCurveMeanAbsError = fishRevealCurveErrors.length
    ? fishRevealCurveErrors.reduce((sum, value) => sum + value, 0) /
      fishRevealCurveErrors.length
    : 0;

  const orbitPhaseTimes = [
    14.55, 15.25, 16.05, 16.85, 18.0, 19.25, 20.45, 21.75, 23.0, 24.4, 26.0,
  ].map((value) => Math.min(plan.duration_s, value));
  const generatedOrbitProgress = orbitProgressSeries(
    (timeS) => sampleCinematicReproductionPlan(plan, timeS),
    orbitPhaseTimes,
  );
  const goldenOrbitProgress = orbitProgressSeries(
    sampleCinematicBurgerRuntime,
    orbitPhaseTimes,
  );
  const orbitPhaseErrorsDeg = generatedOrbitProgress.map((value, index) =>
    Math.abs(radiansToDegrees(value - goldenOrbitProgress[index]))
  );
  const lateOrbitPhaseMeanAbsErrorDeg = orbitPhaseErrorsDeg.length
    ? orbitPhaseErrorsDeg.reduce((sum, value) => sum + value, 0) /
      orbitPhaseErrorsDeg.length
    : 0;
  const lateOrbitPhaseMaxAbsErrorDeg = orbitPhaseErrorsDeg.length
    ? Math.max(...orbitPhaseErrorsDeg)
    : 0;

  const radiusErrors: number[] = [];
  const heightErrors: number[] = [];
  for (const timeS of orbitPhaseTimes) {
    const generated = sampleCinematicReproductionPlan(plan, timeS);
    const golden = sampleCinematicBurgerRuntime(timeS);
    radiusErrors.push(
      Math.abs(horizontalCameraRadius(generated) - horizontalCameraRadius(golden)),
    );
    heightErrors.push(Math.abs(generated.camera.position[1] - golden.camera.position[1]));
  }
  const lateOrbitRadiusMeanAbsErrorM = radiusErrors.length
    ? radiusErrors.reduce((sum, value) => sum + value, 0) / radiusErrors.length
    : 0;
  const lateCameraHeightMeanAbsErrorM = heightErrors.length
    ? heightErrors.reduce((sum, value) => sum + value, 0) / heightErrors.length
    : 0;

  const cowAuthoredHoldDriftM = horizontalDistance(
    sampleActorTrack(plan.actors.cow, Math.min(plan.duration_s, 9.15)).position,
    sampleActorTrack(plan.actors.cow, Math.min(plan.duration_s, 10.55)).position,
  );
  const chickenAuthoredHoldDriftM = horizontalDistance(
    sampleActorTrack(plan.actors.chicken, Math.min(plan.duration_s, 11.55)).position,
    sampleActorTrack(plan.actors.chicken, Math.min(plan.duration_s, 13.05)).position,
  );
  const rawFishYaw = sampleActorTrack(
    plan.actors.goldfish,
    Math.min(plan.duration_s, 15.25),
  ).rotation[1];
  const goldenFishYaw = sampleCinematicBurgerRuntime(
    Math.min(CINEMATIC_BURGER_TIMELINE_DURATION_S, 15.25),
  ).goldfish.rotation[1];
  const fishForwardYawErrorDeg = Math.abs(radiansToDegrees(
    shortestAngleDeltaRadians(rawFishYaw, goldenFishYaw),
  ));

  const compiledVerticalArc = (
    role: "cow" | "chicken",
    startS: number,
    endS: number,
  ) => {
    let peak = 0;
    for (let timeS = startS; timeS <= endS + 1e-6; timeS += 0.05) {
      const sample = sampleCinematicReproductionPlan(plan, Math.min(plan.duration_s, timeS));
      const pose = role === "cow" ? sample.cow : sample.chicken;
      peak = Math.max(peak, Math.abs(pose.position[1]));
    }
    return peak;
  };
  const cowCompiledVerticalArcM = compiledVerticalArc("cow", 7.55, 9.15);
  const chickenCompiledVerticalArcM = compiledVerticalArc("chicken", 10.55, 11.55);
  const cowCompiledPeakEmphasis = sampleCinematicReproductionPlan(
    plan,
    Math.min(plan.duration_s, 9.35),
  ).cow.emphasis;
  const chickenCompiledPeakEmphasis = sampleCinematicReproductionPlan(
    plan,
    Math.min(plan.duration_s, 12.3),
  ).chicken.emphasis;

  let attentionTargetPeakSpeedMps = 0;
  let previousAttentionTarget: RuntimeVec3 | null = null;
  let previousAttentionTimeS: number | null = null;
  for (let timeS = 7.35; timeS <= Math.min(plan.duration_s, 13.75) + 1e-6; timeS += 0.05) {
    const target = sampleCinematicReproductionPlan(plan, timeS).camera.target;
    if (previousAttentionTarget && previousAttentionTimeS !== null) {
      attentionTargetPeakSpeedMps = Math.max(
        attentionTargetPeakSpeedMps,
        distance(target, previousAttentionTarget) /
          Math.max(0.001, timeS - previousAttentionTimeS),
      );
    }
    previousAttentionTarget = target;
    previousAttentionTimeS = timeS;
  }

  const finalSample = sampleCinematicReproductionPlan(plan, plan.duration_s);
  const goldenFinal = sampleCinematicBurgerRuntime(
    Math.min(plan.duration_s, CINEMATIC_BURGER_TIMELINE_DURATION_S),
  );
  const finalSupportOpacityMax = Math.max(
    finalSample.foods[0].opacity,
    finalSample.foods[2].opacity,
  );

  const nonHandPhysicalInteractionCount = plan.interactions.filter(
    (item) => item.source_role !== "hand",
  ).length;

  return {
    camera_key_count: plan.camera.keys.length,
    late_orbit_signed_degrees: cumulativeOrbit * 180 / Math.PI,
    late_orbit_total_degrees: totalOrbit * 180 / Math.PI,
    late_orbit_reversal_count: reversalCount,
    fish_hold_horizontal_drift_m: horizontalDistance(fishHoldStart, fishHoldEnd),
    hand_interaction_declared: Boolean(handInteraction),
    hand_contact_start_s: handInteraction?.contact_start_s ?? null,
    hand_contact_end_s: handInteraction?.contact_end_s ?? null,
    fish_clearance_declared: Boolean(fishClearance),
    fish_minimum_surface_gap_m: fishClearance?.minimum_surface_gap_m ?? null,
    opening_trio_max_abs_surface_lift_m: openingTrioLift.length
      ? Math.max(...openingTrioLift)
      : 0,
    smallest_visible_scale_multiplier: visibleScales.length
      ? Math.min(...visibleScales)
      : 1,
    bounded_actor_scalar_interpolation: true,
    fast_opacity_transition_count: fastOpacityTransitionCount,
    hand_precontact_target_drift_m: handPrecontactTargetDrift,
    cow_focus_target_x_m: cowFocusTargetX,
    chicken_focus_target_x_m: chickenFocusTargetX,
    fish_initial_occlusion_proxy: fishInitialOcclusionProxy,
    fish_reveal_separation_ratio_15s: fishRevealSeparationRatio15s,
    non_hand_physical_interaction_count: nonHandPhysicalInteractionCount,
    slow_opacity_transition_count: slowOpacityTransitionCount,
    hand_staging_yaw_error_deg: handStagingYawErrorDeg,
    hand_target_peak_response_m: targetResponse.distanceM,
    hand_target_response_alignment: targetResponse.alignment,
    cow_focus_target_x_error_m: Math.abs(
      cowFocusTargetX - goldenCowSample.camera.target[0],
    ),
    chicken_focus_target_x_error_m: Math.abs(
      chickenFocusTargetX - goldenChickenSample.camera.target[0],
    ),
    cow_peak_yaw_error_deg: cowPeakYawErrorDeg,
    chicken_peak_yaw_error_deg: chickenPeakYawErrorDeg,
    fish_visible_start_s: actorVisibleStart(plan.actors.goldfish),
    fish_full_opacity_s: actorFullOpacityStart(plan.actors.goldfish),
    fish_reveal_curve_mean_abs_error: fishRevealCurveMeanAbsError,
    late_orbit_phase_mean_abs_error_deg: lateOrbitPhaseMeanAbsErrorDeg,
    late_orbit_phase_max_abs_error_deg: lateOrbitPhaseMaxAbsErrorDeg,
    late_orbit_radius_mean_abs_error_m: lateOrbitRadiusMeanAbsErrorM,
    late_camera_height_mean_abs_error_m: lateCameraHeightMeanAbsErrorM,
    final_camera_height_error_m: Math.abs(
      finalSample.camera.position[1] - goldenFinal.camera.position[1],
    ),
    final_support_opacity_max: finalSupportOpacityMax,
    cow_authored_hold_drift_m: cowAuthoredHoldDriftM,
    chicken_authored_hold_drift_m: chickenAuthoredHoldDriftM,
    fish_forward_yaw_error_deg: fishForwardYawErrorDeg,
    cow_compiled_vertical_arc_m: cowCompiledVerticalArcM,
    chicken_compiled_vertical_arc_m: chickenCompiledVerticalArcM,
    cow_compiled_peak_emphasis: cowCompiledPeakEmphasis,
    chicken_compiled_peak_emphasis: chickenCompiledPeakEmphasis,
    attention_target_peak_speed_mps: attentionTargetPeakSpeedMps,
  };
}

export function compareReproductionPlanToGolden(
  plan: CinematicReproductionPlanV1,
): CinematicReproductionComparison {
  let cameraPosition = 0;
  let cameraTarget = 0;
  let cameraFov = 0;
  let actorPosition = 0;
  let actorScale = 0;
  let actorOpacity = 0;
  let actorSamples = 0;
  let sampleCount = 0;
  for (let timeS = 0; timeS <= Math.min(plan.duration_s, CINEMATIC_BURGER_TIMELINE_DURATION_S) + 1e-6; timeS += 0.5) {
    const golden = sampleCinematicBurgerRuntime(timeS);
    const generated = sampleCinematicReproductionPlan(plan, timeS);
    cameraPosition += distance(golden.camera.position, generated.camera.position);
    cameraTarget += distance(golden.camera.target, generated.camera.target);
    cameraFov += Math.abs(golden.camera.fov - generated.camera.fov);
    for (const role of LUNCH_RUNTIME_ROLES) {
      const left = actorPose(golden, role);
      const right = actorPose(generated, role);
      if (left.visible || right.visible) {
        actorPosition += distance(left.position, right.position);
        actorScale += Math.abs(left.scale - right.scale);
        actorOpacity += Math.abs(left.opacity - right.opacity);
        actorSamples += 1;
      }
    }
    sampleCount += 1;
  }
  return {
    sample_count: sampleCount,
    camera_position_mean_error_m: cameraPosition / Math.max(1, sampleCount),
    camera_target_mean_error_m: cameraTarget / Math.max(1, sampleCount),
    camera_fov_mean_error_deg: cameraFov / Math.max(1, sampleCount),
    actor_position_mean_error_m: actorPosition / Math.max(1, actorSamples),
    actor_scale_mean_error: actorScale / Math.max(1, actorSamples),
    actor_opacity_mean_error: actorOpacity / Math.max(1, actorSamples),
    compared_actor_samples: actorSamples,
    lunch_quality: buildLunchReproductionQualityDiagnostics(plan),
  };
}

export function cinematicReproductionPlanSchemaExample() {
  return {
    schema_version: CINEMATIC_REPRODUCTION_SCHEMA_VERSION,
    title: "Lunch recreation",
    duration_s: 26,
    aspect_ratio: "9:16",
    intent_summary: "Recreate the frozen Lunch golden film.",
    camera: {
      interpolation: "c2",
      keys: [
        { t: 0, position: [0, 3.2, 5.7], target: [0, 0.3, 0.1], fov: 36 },
        {
          t: 9,
          position: [0.8, 2.2, 4.2],
          target: [0.2, 0.32, -0.1],
          fov: 32,
          focus_role: "cow",
          focus_weight: 0.55,
        },
        { t: 26, position: [0.1, 1.9, 3.8], target: [0, 0.4, -0.1], fov: 30.2 },
      ],
    },
    actors: Object.fromEntries(
      LUNCH_RUNTIME_ROLES.map((role) => [
        role,
        {
          interpolation: "c2",
          keys: [
            {
              t: 0,
              visible:
                role === "tray" ||
                role === "apple" ||
                role === "burger" ||
                role === "nigiri",
              // position = [x, support_lift_y, z]. For supported actors,
              // support_lift_y=0 means "sit on MyWay's measured support."
              position: [0, 0, 0],
              // Authoring should use degrees. MyWay normalizes to radians.
              rotation_deg: [0, 0, 0],
              // 1.0 = reviewed role-normalized asset size, not 1 metre.
              scale_multiplier: 1,
              opacity:
                role === "tray" ||
                role === "apple" ||
                role === "burger" ||
                role === "nigiri"
                  ? 1
                  : 0,
              emphasis: 0,
            },
          ],
        },
      ]),
    ),
    interactions: [
      {
        id: "hand_nudges_burger",
        kind: "nudge",
        source_role: "hand",
        target_role: "burger",
        approach_start_s: 1.35,
        contact_start_s: 3.15,
        contact_end_s: 4.55,
        retreat_end_s: 6.65,
        approach_direction: [1, -0.12, -0.08],
        preferred_target_side: "left",
        contact_clearance_m: 0.008,
        obstacle_clearance_m: 0.035,
        obstacle_roles: ["apple", "nigiri", "tray"],
        maintain_contact: true,
      },
    ],
    directional_clearance: [
      {
        id: "fish_behind_burger_surface_gap",
        moving_role: "goldfish",
        anchor_role: "burger",
        start_s: 12.9,
        end_s: 19.12,
        direction: [0, 0, -1],
        minimum_surface_gap_m: 0.3,
      },
    ],
    notes: [
      "The relation objects above show the exact accepted field names.",
      "Do not author literal contact_point/contact_normal; CP.1F solves contact from measured geometry.",
    ],
  };
}
