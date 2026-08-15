import type { DirectableAssetAffordanceKind } from "./affordance-graph-contract";

export const DIRECTABLE_ASSET_OPERATOR_REGISTRY_VERSION =
  "director_affordance_operator_registry_phase1b5b_v1" as const;

export type DirectableAssetOperatorRole = "self" | "source" | "target";

export type DirectableAssetOperatorId =
  | "translate"
  | "rotate"
  | "lift"
  | "lower"
  | "aim"
  | "align"
  | "roll"
  | "place_on_target"
  | "attach_as_source"
  | "attach_as_target"
  | "surface_attach_as_source"
  | "surface_attach_as_target"
  | "insert_into_target"
  | "fill_target"
  | "drain_target"
  | "accumulate_on_target"
  | "flow_as_source"
  | "flow_as_target"
  | "emit_from_source"
  | "open_subpart"
  | "close_subpart"
  | "skeletal_pose"
  | "play_animation_clip";

export type DirectableAssetOperatorRequirement = {
  id: string;
  label: string;
  role: DirectableAssetOperatorRole;
  any_of_kinds: DirectableAssetAffordanceKind[];
  semantic_name?: string | null;
  required: boolean;
  require_executable_evidence: boolean;
};

export type DirectableAssetOperatorSpec = {
  id: DirectableAssetOperatorId;
  label: string;
  description: string;
  role: DirectableAssetOperatorRole;
  interaction_scope: "single_asset" | "asset_pair" | "subpart" | "rig";
  runtime_execution?: "executable" | "declared_not_executed";
  requirements: DirectableAssetOperatorRequirement[];
  counterpart_note?: string | null;
  fallback_note: string;
};

function requirement(
  id: string,
  label: string,
  role: DirectableAssetOperatorRole,
  anyOfKinds: DirectableAssetAffordanceKind[],
  options?: {
    required?: boolean;
    semanticName?: string | null;
    requireExecutableEvidence?: boolean;
  },
): DirectableAssetOperatorRequirement {
  return {
    id,
    label,
    role,
    any_of_kinds: anyOfKinds,
    semantic_name: options?.semanticName ?? null,
    required: options?.required ?? true,
    require_executable_evidence: options?.requireExecutableEvidence ?? true,
  };
}

const rootTransformRequirement = requirement(
  "root_transform",
  "root transform",
  "self",
  ["root_transform"],
);

export const DIRECTABLE_ASSET_OPERATOR_SPECS: DirectableAssetOperatorSpec[] = [
  {
    id: "translate",
    label: "Translate",
    description: "Move the whole asset through scene space.",
    role: "self",
    interaction_scope: "single_asset",
    requirements: [rootTransformRequirement],
    fallback_note: "No special asset anatomy is required for root translation.",
  },
  {
    id: "rotate",
    label: "Rotate",
    description: "Rotate the whole asset around its scene root.",
    role: "self",
    interaction_scope: "single_asset",
    requirements: [rootTransformRequirement],
    fallback_note: "No special asset anatomy is required for root rotation.",
  },
  {
    id: "lift",
    label: "Lift",
    description: "Translate the whole asset upward while preserving its rigid pose.",
    role: "self",
    interaction_scope: "single_asset",
    requirements: [rootTransformRequirement],
    fallback_note: "Root translation remains available without additional anatomy.",
  },
  {
    id: "lower",
    label: "Lower",
    description: "Translate the whole asset downward while preserving its rigid pose.",
    role: "self",
    interaction_scope: "single_asset",
    requirements: [rootTransformRequirement],
    fallback_note: "Root translation remains available without additional anatomy.",
  },
  {
    id: "aim",
    label: "Aim",
    description: "Orient an asset-specific forward frame toward a target.",
    role: "self",
    interaction_scope: "single_asset",
    requirements: [
      rootTransformRequirement,
      requirement("orientation", "semantic forward/facing frame", "self", ["semantic_forward_frame"]),
    ],
    fallback_note: "A measured GLB coordinate frame is useful for alignment but cannot be treated as semantic facing for Aim without explicit directional evidence.",
  },
  {
    id: "align",
    label: "Align",
    description: "Align the asset using a qualified orientation frame.",
    role: "self",
    interaction_scope: "single_asset",
    requirements: [
      rootTransformRequirement,
      requirement("orientation", "geometric or semantic orientation frame", "self", ["orientation_frame", "semantic_forward_frame"]),
    ],
    fallback_note: "Without trusted orientation, only generic root alignment is available.",
  },
  {
    id: "roll",
    label: "Roll",
    description: "Couple root translation to a qualified rolling radius and axis.",
    role: "self",
    interaction_scope: "single_asset",
    requirements: [
      rootTransformRequirement,
      requirement("rolling", "rolling radius + axis", "self", ["rolling"]),
      requirement("contact", "ground contact", "self", ["ground_contact"], { required: false }),
    ],
    fallback_note: "Without rolling metadata, legacy root motion may still animate, but asset-specific rolling is not qualified.",
  },
  {
    id: "place_on_target",
    label: "Place on this asset",
    description: "Use this asset as a candidate physical support target; source footprint, stability, and clearance remain contextual.",
    role: "target",
    interaction_scope: "asset_pair",
    requirements: [
      requirement("support", "support surface", "target", ["support_surface"]),
    ],
    counterpart_note: "The source actor also needs a usable contact/bounds representation.",
    fallback_note: "The Asset Scene Builder may still place by coarse bounds, but a true support surface is not qualified.",
  },
  {
    id: "attach_as_source",
    label: "Attach as source",
    description: "Use this asset as the moving/source side of a precise attachment.",
    role: "source",
    interaction_scope: "asset_pair",
    requirements: [
      requirement("source_port", "attachment/socket port", "source", ["attachment_port", "socket_port"]),
    ],
    counterpart_note: "A second asset must expose a compatible target port; Phase 1B.5C resolves pair compatibility before Builder validation.",
    fallback_note: "Whole-root parenting remains a degraded fallback, but precise attachment is not asset-qualified.",
  },
  {
    id: "attach_as_target",
    label: "Attach as target",
    description: "Use this asset as the receiving side of a precise attachment.",
    role: "target",
    interaction_scope: "asset_pair",
    requirements: [
      requirement("target_port", "attachment/socket port", "target", ["attachment_port", "socket_port"]),
    ],
    counterpart_note: "A second asset must expose a compatible source port; Phase 1B.5C resolves pair compatibility before Builder validation.",
    fallback_note: "Whole-root parenting remains a degraded fallback, but precise attachment is not asset-qualified.",
  },
  {
    id: "surface_attach_as_source",
    label: "Surface attach as source",
    description: "Use a measured exterior contact region for a generic surface attachment such as sticking, resting, or coarse contact.",
    role: "source",
    interaction_scope: "asset_pair",
    requirements: [
      requirement("surface_contact", "surface-contact region", "source", ["surface_contact_region"]),
    ],
    counterpart_note: "Phase 1B.5C resolves pairwise fit/contact alignment candidates; attachment policy and Builder validation remain contextual.",
    fallback_note: "A generic exterior region is not a semantic connector and must never satisfy precise connector Attach.",
  },
  {
    id: "surface_attach_as_target",
    label: "Surface attach as target",
    description: "Use a measured exterior contact region as a generic receiving surface.",
    role: "target",
    interaction_scope: "asset_pair",
    requirements: [
      requirement("surface_contact", "surface-contact region", "target", ["surface_contact_region"]),
    ],
    counterpart_note: "Phase 1B.5C resolves pairwise fit/contact alignment candidates; attachment policy and Builder validation remain contextual.",
    fallback_note: "Surface contact can support coarse attachment, but it does not imply socket/connector compatibility.",
  },
  {
    id: "insert_into_target",
    label: "Insert into this asset",
    description: "Use this asset as the receiving volume/socket for another actor.",
    role: "target",
    interaction_scope: "asset_pair",
    requirements: [
      requirement("receiver", "containment or socket receiver", "target", ["containment_volume", "socket_port"]),
    ],
    counterpart_note: "Phase 1B.5C resolves source/receiver fit candidates; exact fit/collision stays with Asset Scene Builder.",
    fallback_note: "Without a trusted receiver region, insertion cannot be physically qualified.",
  },
  {
    id: "fill_target",
    label: "Fill",
    description: "Increase quantity inside a trusted containment volume.",
    role: "target",
    interaction_scope: "single_asset",
    requirements: [
      requirement("containment", "containment volume", "target", ["containment_volume"]),
      requirement("access", "inlet/opening", "target", ["inlet_port"], { required: false }),
    ],
    fallback_note: "Without containment evidence, literal fill should use a diagrammatic fallback rather than pretending the asset contains material.",
  },
  {
    id: "drain_target",
    label: "Drain",
    description: "Decrease quantity inside a trusted containment volume.",
    role: "target",
    interaction_scope: "single_asset",
    requirements: [
      requirement("containment", "containment volume", "target", ["containment_volume"]),
      requirement("outlet", "outlet", "target", ["outlet_port"], { required: false }),
    ],
    fallback_note: "Without containment evidence, literal drain is not asset-qualified.",
  },
  {
    id: "accumulate_on_target",
    label: "Accumulate",
    description: "Grow an accumulated quantity within usable containment or, contextually, on a support candidate.",
    role: "target",
    interaction_scope: "single_asset",
    requirements: [
      requirement("receiver", "support surface or containment volume", "target", ["support_surface", "containment_volume"]),
    ],
    fallback_note: "A generic world-space pile is possible, but accumulation on this asset is not qualified without a receiving region.",
  },
  {
    id: "flow_as_source",
    label: "Flow source",
    description: "Use this asset as the source of a directed carrier/process flow.",
    role: "source",
    interaction_scope: "asset_pair",
    requirements: [
      requirement("outlet", "flow outlet", "source", ["outlet_port"]),
    ],
    counterpart_note: "Phase 1B.5C resolves the destination inlet/containment receiver and route endpoints.",
    fallback_note: "Without an outlet, a literal source location should not be invented.",
  },
  {
    id: "flow_as_target",
    label: "Flow destination",
    description: "Use this asset as the receiver of a directed carrier/process flow.",
    role: "target",
    interaction_scope: "asset_pair",
    requirements: [
      requirement("receiver", "flow inlet or containment volume", "target", ["inlet_port", "containment_volume"]),
    ],
    counterpart_note: "Phase 1B.5C resolves source/destination endpoint compatibility before process rendering.",
    fallback_note: "Without a receiver, flow should terminate diagrammatically rather than inside arbitrary geometry.",
  },
  {
    id: "emit_from_source",
    label: "Emit",
    description: "Emit a process/carrier outward from a trusted source point.",
    role: "source",
    interaction_scope: "single_asset",
    requirements: [
      requirement("origin", "outlet/emission origin", "source", ["outlet_port"]),
    ],
    fallback_note: "Without an emission origin, the effect can remain diagrammatic but is not asset-qualified.",
  },
  {
    id: "open_subpart",
    label: "Open subpart",
    description: "Rotate a semantic subpart around a trusted joint.",
    role: "self",
    interaction_scope: "subpart",
    runtime_execution: "declared_not_executed",
    requirements: [
      requirement("part", "runtime-bound semantic subpart", "self", ["semantic_subpart"]),
      requirement("joint", "pivot/revolute joint", "self", ["pivot_joint"]),
    ],
    fallback_note: "A fused or unbound mesh must not fake opening by rotating the whole asset.",
  },
  {
    id: "close_subpart",
    label: "Close subpart",
    description: "Return a semantic articulated subpart toward its declared closed pose.",
    role: "self",
    interaction_scope: "subpart",
    runtime_execution: "declared_not_executed",
    requirements: [
      requirement("part", "runtime-bound semantic subpart", "self", ["semantic_subpart"]),
      requirement("joint", "pivot/revolute joint", "self", ["pivot_joint"]),
    ],
    fallback_note: "A fused or unbound mesh must not fake closing by rotating the whole asset.",
  },
  {
    id: "skeletal_pose",
    label: "Skeletal pose",
    description: "Address a rig through explicit semantic bone mappings.",
    role: "self",
    interaction_scope: "rig",
    runtime_execution: "declared_not_executed",
    requirements: [
      requirement("rig", "semantic rig mapping", "self", ["rig"]),
    ],
    fallback_note: "A rig flag without semantic bone mapping is not enough for Director-level skeletal control.",
  },
  {
    id: "play_animation_clip",
    label: "Play animation clip",
    description: "Use an animation clip already present on the asset.",
    role: "self",
    interaction_scope: "rig",
    runtime_execution: "declared_not_executed",
    requirements: [
      requirement("clip", "available animation clip", "self", ["animation_clip"]),
    ],
    fallback_note: "No clip should be invented when the asset exposes none.",
  },
];

export function directableAssetOperatorSpec(id: DirectableAssetOperatorId) {
  return DIRECTABLE_ASSET_OPERATOR_SPECS.find((item) => item.id === id) ?? null;
}
