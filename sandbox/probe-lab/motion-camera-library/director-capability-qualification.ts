import type { DirectorCapability } from "./director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_COMPOSABLE_MODIFIER_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_COMPOUND_NARRATIVE_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_COMPOUND_NARRATIVE_COMPONENTS_BY_ID,
  DIRECTOR_QUALIFICATION_VISIBILITY_MODIFIER_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_REVEAL_COMPOUND_NARRATIVE_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_REVEAL_COMPOUND_NARRATIVE_COMPONENTS_BY_ID,
  DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_COMPONENTS_BY_ID,
  DIRECTOR_QUALIFICATION_OBJECT_MOTION_MODIFIER_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_COMPONENTS_BY_ID,
  DIRECTOR_QUALIFICATION_KINEMATIC_MODIFIER_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_KINEMATIC_RELATION_STATE_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_KINEMATIC_ORIENTATION_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_KINEMATIC_COMPONENTS_BY_ID,
  DIRECTOR_QUALIFICATION_KINEMATIC_RELATION_CANONICAL_MECHANISM_BY_ID,
  DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPONENTS_BY_ID,
  DIRECTOR_QUALIFICATION_OBJECT_RELATION_CANONICAL_MECHANISM_BY_ID,
  DIRECTOR_QUALIFICATION_OBJECT_RELATION_AUTHORED_STATE_REQUIREMENTS_BY_ID,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_SCALE_MODIFIER_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPOUND_MOTIF_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_GROUP_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPONENTS_BY_ID,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_CANONICAL_MECHANISM_BY_ID,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_REQUIREMENTS_BY_ID,
  DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPOUND_MECHANIC_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_RIGID_MECHANICS_PRIMITIVE_ALIAS_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_RIGID_MECHANICS_ARTICULATION_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPONENTS_BY_ID,
  DIRECTOR_QUALIFICATION_RIGID_MECHANICS_CANONICAL_MECHANISM_BY_ID,
  DIRECTOR_QUALIFICATION_RIGID_MECHANICS_AUTHORED_STATE_REQUIREMENTS_BY_ID,
  DIRECTOR_QUALIFICATION_CONTINUITY_POLICY_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_CONTINUITY_CANONICAL_MECHANISM_BY_ID,
  DIRECTOR_QUALIFICATION_CONTINUITY_POLICY_REQUIREMENTS_BY_ID,
  DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_POLICY_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_CANONICAL_MECHANISM_BY_ID,
  DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_POLICY_REQUIREMENTS_BY_ID,
  DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_BASE_POLICY_BY_ID,
  DIRECTOR_QUALIFICATION_TRANSITION_FROZEN_PRIMITIVE_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_TRANSITION_CAMERA_INTERPOLATION_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_TRANSITION_CONTINUITY_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_TRANSITION_SEQUENCE_POLICY_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_TRANSITION_COMPOUND_MOTIF_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_TRANSITION_TIMING_MODIFIER_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_TRANSITION_CANONICAL_MECHANISM_BY_ID,
  DIRECTOR_QUALIFICATION_TRANSITION_REQUIREMENTS_BY_ID,
  DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_MERGE_CANDIDATE_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_MERGE_CANDIDATE_TARGET_BY_ID,
  DIRECTOR_QUALIFICATION_MERGED_CAPABILITY_IDS,
} from "./director-qualification-families";

/**
 * Lightweight read-model for the Director Capability Library.
 *
 * The Qualification Room remains the semantic authority. This module does not
 * render, mount a Canvas, load assets, or run qualification evidence. It only
 * projects the final Qualification taxonomy into metadata that the library can
 * display and filter.
 */
export const DIRECTOR_CAPABILITY_QUALIFICATION_ROLES = [
  "qualified_primitive",
  "modifier",
  "compound",
  "constraint_policy",
  "authored_semantic_operation",
  "merged_alias",
  "deferred",
] as const;

export type DirectorCapabilityQualificationRole =
  (typeof DIRECTOR_CAPABILITY_QUALIFICATION_ROLES)[number];

export const DIRECTOR_CAPABILITY_QUALIFICATION_ROLE_LABELS: Record<
  DirectorCapabilityQualificationRole,
  string
> = {
  qualified_primitive: "Qualified primitive",
  modifier: "Modifier / alias",
  compound: "Compound / motif",
  constraint_policy: "Constraint / continuity policy",
  authored_semantic_operation: "Authored semantic operation",
  merged_alias: "Merged compatibility alias",
  deferred: "Deferred",
};

export type DirectorCapabilityQualificationDescriptor = {
  capability_id: string;
  role: DirectorCapabilityQualificationRole;
  role_label: string;
  role_summary: string;
  canonical_capability_id: string | null;
  canonical_mechanism: string | null;
  component_capability_ids: string[];
  requirements: string[];
  base_policy_capability_id: string | null;
  source: "Qualification Room A.11A.42–64";
};

const MERGED_CANONICAL_CAPABILITY_BY_ID = {
  camera_object_attached: "object_attached",
  orient: "establish",
} as const;

function includes(ids: readonly string[], capabilityId: string) {
  return ids.includes(capabilityId);
}

function stringValue(
  map: Record<string, string>,
  capabilityId: string,
): string | null {
  return map[capabilityId] ?? null;
}

function stringList(
  map: Record<string, readonly string[]>,
  capabilityId: string,
): string[] {
  return [...(map[capabilityId] ?? [])];
}

function roleSummary(role: DirectorCapabilityQualificationRole) {
  switch (role) {
    case "qualified_primitive":
      return "Independent cross-asset visual behavior retained by Qualification.";
    case "modifier":
      return "Author-facing modifier or convenience alias over an already-qualified mechanism.";
    case "compound":
      return "Reusable author-facing composition built from qualified primitives and/or declared state.";
    case "constraint_policy":
      return "Invariant or sequence policy enforced while composing shots rather than a standalone rendered primitive.";
    case "authored_semantic_operation":
      return "Requires truthful authored identity, articulation, containment, quantity, or representation state.";
    case "merged_alias":
      return "Compatibility vocabulary retained after Qualification resolved the behavior to a canonical capability.";
    case "deferred":
      return "Retained in the Director vocabulary but not frozen as a cross-asset visual primitive.";
  }
}

function qualificationRole(capabilityId: string): DirectorCapabilityQualificationRole {
  if (includes(DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS, capabilityId)) {
    return "deferred";
  }
  if (includes(DIRECTOR_QUALIFICATION_MERGED_CAPABILITY_IDS, capabilityId)) {
    return "merged_alias";
  }

  // A.11A.42 keeps Dim environment as a composable lighting modifier while
  // comparing it against the canonical Spotlight subject primitive.
  if (includes(DIRECTOR_QUALIFICATION_MERGE_CANDIDATE_CAPABILITY_IDS, capabilityId)) {
    return "modifier";
  }

  // A.11A.44 keeps Introduce as an explicitly compound narrative motif even
  // though it remains useful vocabulary in the active narrative family.
  if (capabilityId === "introduce") {
    return "compound";
  }

  if (
    includes(DIRECTOR_QUALIFICATION_COMPOSABLE_MODIFIER_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_VISIBILITY_MODIFIER_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_OBJECT_MOTION_MODIFIER_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_SCALE_MODIFIER_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_RIGID_MECHANICS_PRIMITIVE_ALIAS_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_TRANSITION_TIMING_MODIFIER_CAPABILITY_IDS, capabilityId)
  ) {
    return "modifier";
  }

  if (
    includes(DIRECTOR_QUALIFICATION_KINEMATIC_MODIFIER_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_KINEMATIC_RELATION_STATE_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_KINEMATIC_ORIENTATION_COMPOUND_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_CONTINUITY_POLICY_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_POLICY_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_TRANSITION_SEQUENCE_POLICY_CAPABILITY_IDS, capabilityId)
  ) {
    return "constraint_policy";
  }

  if (
    includes(DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPOUND_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_COMPOUND_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_RIGID_MECHANICS_ARTICULATION_COMPOUND_CAPABILITY_IDS, capabilityId)
  ) {
    return "authored_semantic_operation";
  }

  if (
    includes(DIRECTOR_QUALIFICATION_COMPOUND_NARRATIVE_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_REVEAL_COMPOUND_NARRATIVE_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPOUND_MOTIF_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_GROUP_COMPOUND_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPOUND_MECHANIC_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_TRANSITION_CAMERA_INTERPOLATION_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_TRANSITION_CONTINUITY_COMPOUND_CAPABILITY_IDS, capabilityId) ||
    includes(DIRECTOR_QUALIFICATION_TRANSITION_COMPOUND_MOTIF_CAPABILITY_IDS, capabilityId)
  ) {
    return "compound";
  }

  if (includes(DIRECTOR_QUALIFICATION_TRANSITION_FROZEN_PRIMITIVE_CAPABILITY_IDS, capabilityId)) {
    return "qualified_primitive";
  }

  return "qualified_primitive";
}

function canonicalMechanism(capabilityId: string): string | null {
  const maps = [
    DIRECTOR_QUALIFICATION_KINEMATIC_RELATION_CANONICAL_MECHANISM_BY_ID,
    DIRECTOR_QUALIFICATION_OBJECT_RELATION_CANONICAL_MECHANISM_BY_ID,
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_CANONICAL_MECHANISM_BY_ID,
    DIRECTOR_QUALIFICATION_RIGID_MECHANICS_CANONICAL_MECHANISM_BY_ID,
    DIRECTOR_QUALIFICATION_CONTINUITY_CANONICAL_MECHANISM_BY_ID,
    DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_CANONICAL_MECHANISM_BY_ID,
    DIRECTOR_QUALIFICATION_TRANSITION_CANONICAL_MECHANISM_BY_ID,
  ] as const;

  for (const map of maps) {
    const value = stringValue(map as Record<string, string>, capabilityId);
    if (value) return value;
  }
  return null;
}

function componentCapabilityIds(capabilityId: string): string[] {
  const maps = [
    DIRECTOR_QUALIFICATION_COMPOUND_NARRATIVE_COMPONENTS_BY_ID,
    DIRECTOR_QUALIFICATION_REVEAL_COMPOUND_NARRATIVE_COMPONENTS_BY_ID,
    DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_COMPONENTS_BY_ID,
    DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_COMPONENTS_BY_ID,
    DIRECTOR_QUALIFICATION_KINEMATIC_COMPONENTS_BY_ID,
    DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPONENTS_BY_ID,
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPONENTS_BY_ID,
    DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPONENTS_BY_ID,
  ] as const;

  for (const map of maps) {
    const values = stringList(
      map as Record<string, readonly string[]>,
      capabilityId,
    );
    if (values.length) return values;
  }

  if (capabilityId === "match_cut") return ["hard_cut"];
  if (capabilityId === "cut_on_action") {
    return ["hard_cut", "preserve_action_continuity"];
  }
  return [];
}

function requirements(capabilityId: string): string[] {
  const maps = [
    DIRECTOR_QUALIFICATION_OBJECT_RELATION_AUTHORED_STATE_REQUIREMENTS_BY_ID,
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_REQUIREMENTS_BY_ID,
    DIRECTOR_QUALIFICATION_RIGID_MECHANICS_AUTHORED_STATE_REQUIREMENTS_BY_ID,
    DIRECTOR_QUALIFICATION_CONTINUITY_POLICY_REQUIREMENTS_BY_ID,
    DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_POLICY_REQUIREMENTS_BY_ID,
    DIRECTOR_QUALIFICATION_TRANSITION_REQUIREMENTS_BY_ID,
  ] as const;

  for (const map of maps) {
    const values = stringList(
      map as Record<string, readonly string[]>,
      capabilityId,
    );
    if (values.length) return values;
  }
  return [];
}

function canonicalCapabilityId(capabilityId: string): string | null {
  const merged = stringValue(
    MERGED_CANONICAL_CAPABILITY_BY_ID as Record<string, string>,
    capabilityId,
  );
  if (merged) return merged;

  return stringValue(
    DIRECTOR_QUALIFICATION_MERGE_CANDIDATE_TARGET_BY_ID as Record<string, string>,
    capabilityId,
  );
}

function basePolicyCapabilityId(capabilityId: string): string | null {
  return stringValue(
    DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_BASE_POLICY_BY_ID as Record<
      string,
      string
    >,
    capabilityId,
  );
}

export function directorCapabilityQualificationDescriptor(
  capability: Pick<DirectorCapability, "id">,
): DirectorCapabilityQualificationDescriptor {
  const role = qualificationRole(capability.id);
  return {
    capability_id: capability.id,
    role,
    role_label: DIRECTOR_CAPABILITY_QUALIFICATION_ROLE_LABELS[role],
    role_summary: roleSummary(role),
    canonical_capability_id: canonicalCapabilityId(capability.id),
    canonical_mechanism: canonicalMechanism(capability.id),
    component_capability_ids: componentCapabilityIds(capability.id),
    requirements: requirements(capability.id),
    base_policy_capability_id: basePolicyCapabilityId(capability.id),
    source: "Qualification Room A.11A.42–64",
  };
}
