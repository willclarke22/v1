import type {
  DirectorCapability,
  DirectorDemoRole,
} from "./director-capability-registry";
import type { DirectorQualificationFamily } from "./director-qualification-families";
import type { DirectorQualificationScene } from "./director-qualification-scenes";

export const DIRECTOR_QUALIFICATION_FIXTURE_POLICY_VERSION =
  "director_qualification_fixture_policy_phase1b7a11a2_v1" as const;


export const DIRECTOR_GROUP_FORMATION_FIXTURE_POLICY_VERSION =
  "director_group_formation_fixture_policy_phase1b7a11a4_v1" as const;

export const DIRECTOR_RELATIVE_ACTOR_FIXTURE_POLICY_VERSION =
  "director_relative_actor_fixture_policy_phase1b7a11a5_v1" as const;

export const DIRECTOR_RELATIVE_ACTOR_BETWEEN_FRAMING_POLICY_VERSION =
  "director_relative_actor_between_framing_policy_phase1b7a11a6_v1" as const;

export const DIRECTOR_SUPPORT_CONTAINMENT_FIXTURE_POLICY_VERSION =
  "director_support_containment_fixture_policy_phase1b7a11a7_v1" as const;

export function isDepthScreenPlacementQualificationFamily(
  family: DirectorQualificationFamily | undefined,
) {
  return Boolean(
    family?.category === "blocking_placement" &&
      family.group === "Depth & screen placement",
  );
}


export function isGroupFormationsQualificationFamily(
  family: DirectorQualificationFamily | undefined,
) {
  return Boolean(
    family?.category === "blocking_placement" &&
      family.group === "Group formations",
  );
}

export function isRelativeActorPlacementQualificationFamily(
  family: DirectorQualificationFamily | undefined,
) {
  return Boolean(
    family?.category === "blocking_placement" &&
      family.group === "Relative actor placement",
  );
}

export function isSupportContainmentQualificationFamily(
  family: DirectorQualificationFamily | undefined,
) {
  return Boolean(
    family?.category === "blocking_placement" &&
      family.group === "Support & containment",
  );
}

const DIRECTOR_GROUP_FORMATION_BASE_ROLE_IDS = [
  "primary_subject",
  "secondary_subject",
  "context_subject",
] as const;

const DIRECTOR_GROUP_FORMATION_EXTRA_ROLE_IDS = [
  "formation_support_2",
  "formation_support_3",
] as const;

export function directorQualificationGroupFormationParticipantRoleIds(
  capability: DirectorCapability,
): string[] {
  if (capability.id === "symmetrical_pair") {
    return ["primary_subject", "secondary_subject"];
  }
  if (capability.id === "surround") {
    return [
      ...DIRECTOR_GROUP_FORMATION_BASE_ROLE_IDS,
      DIRECTOR_GROUP_FORMATION_EXTRA_ROLE_IDS[0],
    ];
  }
  if (capability.id === "form_circle") {
    return [
      ...DIRECTOR_GROUP_FORMATION_BASE_ROLE_IDS,
      ...DIRECTOR_GROUP_FORMATION_EXTRA_ROLE_IDS,
    ];
  }
  return [...DIRECTOR_GROUP_FORMATION_BASE_ROLE_IDS];
}

function syntheticFormationSupportRole(
  capability: DirectorCapability,
  role: string,
): DirectorDemoRole {
  const contextTemplate =
    capability.demo.asset_roles.find((candidate) => candidate.role === "context_subject") ??
    capability.demo.asset_roles[capability.demo.asset_roles.length - 1];

  return {
    role,
    preferred_concepts: contextTemplate?.preferred_concepts.length
      ? [...contextTemplate.preferred_concepts]
      : ["prop", "object", "supporting object"],
    optional: false,
  };
}

/**
 * Group-formation qualification is perceptual rather than merely algebraic.
 * Line and Cluster retain three actors, Symmetrical Pair retains exactly two,
 * Surround uses one privileged centre plus three supports, and Form Circle uses
 * five circumference actors so the empty-centre ring reads as a circle instead
 * of a triangle. Extra support roles are qualification-only aliases that reuse
 * the scene's context cast pool; the canonical runtime still accepts arbitrary
 * participant entity ids from authored scenes.
 */
export function directorQualificationGroupFormationAssetRoles(
  family: DirectorQualificationFamily,
  capability: DirectorCapability,
): DirectorDemoRole[] {
  if (!isGroupFormationsQualificationFamily(family)) {
    return [...capability.demo.asset_roles];
  }

  return directorQualificationGroupFormationParticipantRoleIds(capability).map(
    (roleId) =>
      capability.demo.asset_roles.find((role) => role.role === roleId) ??
      syntheticFormationSupportRole(capability, roleId),
  );
}

const DIRECTOR_RELATIVE_ACTOR_TWO_ROLE_IDS = [
  "primary_subject",
  "secondary_subject",
] as const;

const DIRECTOR_RELATIVE_ACTOR_BETWEEN_ROLE_IDS = [
  "primary_subject",
  "secondary_subject",
  "context_subject",
] as const;

/**
 * Relative-actor qualification removes optional context from all two-actor
 * relationships. Between is intrinsically ternary, so it alone retains the
 * second reference actor. This makes the visual variable under test explicit.
 */
export function directorQualificationRelativeActorAssetRoles(
  family: DirectorQualificationFamily,
  capability: DirectorCapability,
): DirectorDemoRole[] {
  if (!isRelativeActorPlacementQualificationFamily(family)) {
    return [...capability.demo.asset_roles];
  }

  const roleIds =
    capability.id === "between"
      ? DIRECTOR_RELATIVE_ACTOR_BETWEEN_ROLE_IDS
      : DIRECTOR_RELATIVE_ACTOR_TWO_ROLE_IDS;

  return roleIds
    .map((roleId) =>
      capability.demo.asset_roles.find((role) => role.role === roleId) ?? null,
    )
    .filter((role): role is DirectorDemoRole => Boolean(role));
}


const DIRECTOR_SUPPORT_CONTAINMENT_BINARY_ROLE_IDS = [
  "primary_subject",
  "secondary_subject",
] as const;

/**
 * Support/containment qualification is a physical-relationship proof, not a
 * generic three-prop composition. On Ground needs only the grounded source.
 * On Surface / Attached To / Inside render exactly the source and receiver so
 * measured region selection cannot be visually confused with unrelated context.
 */
export function directorQualificationSupportContainmentAssetRoles(
  family: DirectorQualificationFamily,
  capability: DirectorCapability,
): DirectorDemoRole[] {
  if (!isSupportContainmentQualificationFamily(family)) {
    return [...capability.demo.asset_roles];
  }

  const roleIds =
    capability.id === "on_ground"
      ? ["primary_subject"]
      : DIRECTOR_SUPPORT_CONTAINMENT_BINARY_ROLE_IDS;

  return roleIds
    .map((roleId) =>
      capability.demo.asset_roles.find((role) => role.role === roleId) ?? null,
    )
    .filter((role): role is DirectorDemoRole => Boolean(role));
}

/**
 * Shared role selection for the Qualification Room. Keep the previously frozen
 * Depth/screen, Group-formation, and Relative-actor policies intact while
 * Support & containment proves only the actors required by the physical relation.
 */
export function directorQualificationAssetRoles(
  family: DirectorQualificationFamily,
  capability: DirectorCapability,
): DirectorDemoRole[] {
  if (isDepthScreenPlacementQualificationFamily(family)) {
    return directorQualificationDepthScreenAssetRoles(family, capability);
  }
  if (isGroupFormationsQualificationFamily(family)) {
    return directorQualificationGroupFormationAssetRoles(family, capability);
  }
  if (isRelativeActorPlacementQualificationFamily(family)) {
    return directorQualificationRelativeActorAssetRoles(family, capability);
  }
  if (isSupportContainmentQualificationFamily(family)) {
    return directorQualificationSupportContainmentAssetRoles(family, capability);
  }
  return [...capability.demo.asset_roles];
}

/**
 * Qualification should render only the actors required to prove the depth/screen
 * relation. The optional context role remains present for layered_depth because
 * that capability explicitly requires all three layers, but it is omitted from
 * the five two-actor siblings so it cannot become accidental visual noise.
 */
export function directorQualificationDepthScreenAssetRoles(
  family: DirectorQualificationFamily,
  capability: DirectorCapability,
): DirectorDemoRole[] {
  if (!isDepthScreenPlacementQualificationFamily(family)) {
    return [...capability.demo.asset_roles];
  }

  const required = new Set(capability.demo.required_visible_roles);
  return capability.demo.asset_roles.filter((role) => required.has(role.role));
}

export type DirectorQualificationFixturePosition = [number, number, number];

/**
 * Scene B was authored with its supporting actor on the right side. That makes
 * screen_left naturally clean but biases screen_right toward overlap. During
 * qualification only, mirror the Screen Right primary/support pair around the
 * neutral Scene-B pair centre before the canonical camera-relative blocking
 * solver runs. The Director primitive itself is untouched.
 */
export function directorQualificationAdjustDepthScreenFixturePositions(input: {
  family: DirectorQualificationFamily;
  capability: DirectorCapability;
  scene: DirectorQualificationScene;
  positions: DirectorQualificationFixturePosition[];
}): DirectorQualificationFixturePosition[] {
  const output = input.positions.map(
    (position) => [...position] as DirectorQualificationFixturePosition,
  );

  if (
    !isDepthScreenPlacementQualificationFamily(input.family) ||
    input.capability.id !== "screen_right" ||
    output.length < 2
  ) {
    return output;
  }

  const neutralPairCenterX =
    (input.scene.blocking.primary[0] + input.scene.blocking.secondary[0]) / 2;

  for (let index = 0; index < 2; index += 1) {
    output[index]![0] =
      neutralPairCenterX - (output[index]![0] - neutralPairCenterX);
  }

  return output;
}

/**
 * Relative-actor qualification uses a neutral readable fixture rather than the
 * generic three-object Scene-B spread. Facing siblings get a compact left/right
 * pair so orientation is large enough to judge. Between starts outside a
 * deliberately separated reference interval and must be moved to its midpoint by
 * the canonical runtime. Extent inputs keep the same fixture safe in Full-cast
 * physical-stress evidence.
 */
export function directorQualificationAdjustRelativeActorFixturePositions(input: {
  family: DirectorQualificationFamily;
  capability: DirectorCapability;
  scene: DirectorQualificationScene;
  positions: DirectorQualificationFixturePosition[];
  target_extents_m?: number[];
}): DirectorQualificationFixturePosition[] {
  const output = input.positions.map(
    (position) => [...position] as DirectorQualificationFixturePosition,
  );

  if (!isRelativeActorPlacementQualificationFamily(input.family)) {
    return output;
  }

  const extents = input.target_extents_m ?? [];
  const primaryExtent = Math.max(0.25, Number(extents[0]) || 1.2);
  const secondaryExtent = Math.max(0.25, Number(extents[1]) || 1.1);
  const contextExtent = Math.max(0.25, Number(extents[2]) || 0.9);
  const pairCenterX =
    (input.scene.blocking.primary[0] + input.scene.blocking.secondary[0]) / 2;
  const pairCenterZ =
    (input.scene.blocking.primary[2] + input.scene.blocking.secondary[2]) / 2;

  if (
    (input.capability.id === "facing" ||
      input.capability.id === "facing_away") &&
    output.length >= 2
  ) {
    const halfSpan = Math.max(
      0.92,
      (primaryExtent + secondaryExtent) * 0.34 + 0.38,
    );
    output[0] = [pairCenterX - halfSpan, output[0]![1], pairCenterZ];
    output[1] = [pairCenterX + halfSpan, output[1]![1], pairCenterZ];
    return output;
  }

  if (input.capability.id === "between" && output.length >= 3) {
    // A.11A.6: the first repaired Between proof was semantically correct but the
    // qualification references were so far apart that the ordinary group camera
    // fit backed away and made all three actors tiny. Keep an extent-aware
    // interval with real breathing room, but do not count each actor's largest
    // 3D extent as full horizontal width. Full-cast remains the physical-scale
    // stress pass; Baseline/Diversity should prove the ternary relation clearly.
    const referenceHalfSpan = Math.max(
      1.2,
      primaryExtent * 0.4 +
        Math.max(secondaryExtent, contextExtent) * 0.32 +
        0.26,
    );
    const centerZ =
      (input.scene.blocking.secondary[2] + input.scene.blocking.context[2]) / 2;
    output[1] = [pairCenterX - referenceHalfSpan, output[1]![1], centerZ];
    output[2] = [pairCenterX + referenceHalfSpan, output[2]![1], centerZ];
    output[0] = [
      pairCenterX - referenceHalfSpan * 1.55,
      output[0]![1],
      centerZ + 0.22,
    ];
  }

  return output;
}

