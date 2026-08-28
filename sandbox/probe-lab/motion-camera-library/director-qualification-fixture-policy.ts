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

export const DIRECTOR_COMPOSITION_NEGATIVE_SPACE_FIXTURE_POLICY_VERSION =
  "director_composition_negative_space_fixture_policy_phase1b7a11a20_v1" as const;

export const DIRECTOR_DETAIL_RELATIONSHIP_FIXTURE_POLICY_VERSION =
  "director_detail_relationship_fixture_policy_phase1b7a11a21_v1" as const;

export const DIRECTOR_DETAIL_RELATIONSHIP_CLEANUP_FIXTURE_POLICY_VERSION =
  "director_detail_relationship_cleanup_fixture_policy_phase1b7a11a22_v1" as const;

export const DIRECTOR_DETAIL_RELATIONSHIP_GROUP_PROJECTION_FIXTURE_POLICY_VERSION =
  "director_detail_relationship_group_projection_fixture_policy_phase1b7a11a23_v1" as const;

export const DIRECTOR_DETAIL_RELATIONSHIP_GROUP_VIEW_RIGHT_BASIS = [
  Math.SQRT1_2,
  0,
  -Math.SQRT1_2,
] as const;

export function isDetailRelationshipFramingQualificationFamily(
  family: DirectorQualificationFamily | undefined,
) {
  return Boolean(
    family?.category === "camera_framing" &&
      family.group === "Detail & relationship framing",
  );
}

export function isCompositionQualificationFamily(
  family: DirectorQualificationFamily | undefined,
) {
  return Boolean(
    family?.category === "camera_framing" &&
      family.group === "Composition",
  );
}

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

const DIRECTOR_DETAIL_RELATIONSHIP_TWO_ROLE_IDS = [
  "primary_subject",
  "secondary_subject",
] as const;

const DIRECTOR_DETAIL_RELATIONSHIP_GROUP_ROLE_IDS = [
  "primary_subject",
  "secondary_subject",
  "context_subject",
] as const;

/**
 * Detail/relationship qualification proves only the actors intrinsic to the
 * named framing. Insert deliberately binds its explicit context-detail role as
 * the selected qualification target so Baseline/Diversity change that target
 * asset. Two-shot/OTS use two actors; Group-shot uses three. The frozen POV
 * compatibility path still maps three roles, but A.11A.23 defers POV from active
 * evidence until semantic viewpoint anchors exist. Macro and Cutaway are also
 * deferred and therefore should never reach this selector in active evidence.
 */
export function directorQualificationDetailRelationshipAssetRoles(
  family: DirectorQualificationFamily,
  capability: DirectorCapability,
): DirectorDemoRole[] {
  if (!isDetailRelationshipFramingQualificationFamily(family)) {
    return [...capability.demo.asset_roles];
  }

  const roleIds =
    capability.id === "insert"
      ? ["context_subject"]
      : capability.id === "group_shot" || capability.id === "point_of_view"
        ? DIRECTOR_DETAIL_RELATIONSHIP_GROUP_ROLE_IDS
        : capability.id === "two_shot" ||
            capability.id === "over_shoulder" ||
            capability.id === "cutaway"
          ? DIRECTOR_DETAIL_RELATIONSHIP_TWO_ROLE_IDS
          : capability.demo.asset_roles.map((role) => role.role);

  return roleIds
    .map((roleId) =>
      capability.demo.asset_roles.find((role) => role.role === roleId) ?? null,
    )
    .filter((role): role is DirectorDemoRole => Boolean(role));
}

/**
 * Composition negative-space evidence is a one-subject proof. The semantic
 * promise is the deliberately empty side of frame, so unrelated default
 * secondary/context GLBs are excluded from Qualification only. The production
 * Director remains free to place other actors when a real shot explicitly
 * requires them.
 */
export function directorQualificationCompositionAssetRoles(
  family: DirectorQualificationFamily,
  capability: DirectorCapability,
): DirectorDemoRole[] {
  if (
    !isCompositionQualificationFamily(family) ||
    (capability.id !== "negative_space_left" &&
      capability.id !== "negative_space_right")
  ) {
    return [...capability.demo.asset_roles];
  }

  const primaryRole =
    capability.demo.asset_roles.find((role) => role.role === "primary_subject") ??
    capability.demo.asset_roles[0] ??
    null;

  return primaryRole ? [primaryRole] : [];
}

/**
 * Shared role selection for the Qualification Room. Keep the previously frozen
 * Depth/screen, Group-formation, Relative-actor, and Support/containment policies
 * intact while Composition negative-space proofs remove nonessential support
 * actors from the side that is explicitly supposed to remain empty.
 */
export function directorQualificationAssetRoles(
  family: DirectorQualificationFamily,
  capability: DirectorCapability,
): DirectorDemoRole[] {
  if (isDetailRelationshipFramingQualificationFamily(family)) {
    return directorQualificationDetailRelationshipAssetRoles(family, capability);
  }
  if (isCompositionQualificationFamily(family)) {
    return directorQualificationCompositionAssetRoles(family, capability);
  }
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
 * A.11A.22 gives Detail & relationship framing an honest qualification stage.
 * A.11A.23 refines Group-shot after perceptual review showed that a compact
 * world-space triangle could still collapse into two visible actors from the
 * three-quarter-front demo camera. Group-shot is now staged on that camera's
 * horizontal view-right basis as a left / centre / right cluster with
 * extent-aware centre gaps. The existing projected-envelope camera fit then
 * solves only the closest safe distance; it no longer has to rescue occlusion
 * created by fixture geometry. Production blocking/runtime is untouched.
 *
 * The frozen POV compatibility branch remains below for old plans/verifiers, but
 * POV is no longer part of active Qualification until semantic viewpoint anchors
 * exist.
 */
export function directorQualificationAdjustDetailRelationshipFixturePositions(input: {
  family: DirectorQualificationFamily;
  capability: DirectorCapability;
  scene: DirectorQualificationScene;
  positions: DirectorQualificationFixturePosition[];
  target_extents_m?: number[];
}): DirectorQualificationFixturePosition[] {
  const output = input.positions.map(
    (position) => [...position] as DirectorQualificationFixturePosition,
  );

  if (!isDetailRelationshipFramingQualificationFamily(input.family)) {
    return output;
  }

  const extents = input.target_extents_m ?? [];
  const primaryExtent = Math.max(0.2, Number(extents[0]) || 1);
  const secondaryExtent = Math.max(0.2, Number(extents[1]) || 0.8);
  const contextExtent = Math.max(0.2, Number(extents[2]) || 0.7);
  const centerX = input.scene.blocking.primary[0];
  const centerZ = input.scene.blocking.primary[2];

  if (input.capability.id === "two_shot" && output.length >= 2) {
    const halfSpan = Math.max(
      0.78,
      (primaryExtent + secondaryExtent) * 0.225 + 0.2,
    );
    output[0] = [centerX - halfSpan, output[0]![1], centerZ + 0.12];
    output[1] = [centerX + halfSpan, output[1]![1], centerZ - 0.12];
    return output;
  }

  if (input.capability.id === "group_shot" && output.length >= 3) {
    const [viewRightX, , viewRightZ] =
      DIRECTOR_DETAIL_RELATIONSHIP_GROUP_VIEW_RIGHT_BASIS;
    const primaryToContextGap = Math.max(
      1.18,
      (primaryExtent + contextExtent) * 0.34 + 0.28,
    );
    const contextToSecondaryGap = Math.max(
      1.18,
      (contextExtent + secondaryExtent) * 0.34 + 0.28,
    );
    const groupPosition = (
      lateralOffset: number,
      y: number,
    ): DirectorQualificationFixturePosition => [
      centerX + viewRightX * lateralOffset,
      y,
      centerZ + viewRightZ * lateralOffset,
    ];

    // The default Group-shot demo uses three_quarter_front. Its horizontal
    // camera view-right axis is [+X, 0, -Z] / sqrt(2). Stage the three actors
    // directly along that screen-horizontal basis so world-space depth cannot
    // project the context actor behind a neighbour.
    output[0] = groupPosition(-primaryToContextGap, output[0]![1]);
    output[2] = groupPosition(0, output[2]![1]);
    output[1] = groupPosition(contextToSecondaryGap, output[1]![1]);
    return output;
  }

  if (input.capability.id === "point_of_view" && output.length >= 3) {
    const sourceDistance = Math.max(
      1.85,
      (primaryExtent + secondaryExtent) * 0.32 + 1.05,
    );
    const referenceOffset = Math.max(
      0.82,
      (secondaryExtent + contextExtent) * 0.22 + 0.28,
    );
    output[0] = [centerX, output[0]![1], centerZ + sourceDistance];
    output[1] = [centerX + 0.12, output[1]![1], centerZ - 0.2];
    output[2] = [
      centerX - referenceOffset,
      output[2]![1],
      centerZ - 0.72,
    ];
    return output;
  }

  return output;
}

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
