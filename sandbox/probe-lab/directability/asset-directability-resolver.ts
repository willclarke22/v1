import type {
  MotionProgramDirectabilityRequirement,
  MotionProgramVec3,
} from "../motion-program/motion-program-contract";
import type {
  AssetDirectabilityAnchor,
  AssetDirectabilityPivot,
  AssetDirectabilityProfileV1,
  AssetDirectabilityRequirementResolution,
  AssetDirectabilitySubpart,
  AssetDirectabilityVec3,
} from "./asset-directability-contract";

function normalizedSemantic(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function semanticMatch(semanticNames: readonly string[], requested: string) {
  const normalized = normalizedSemantic(requested);
  return semanticNames.some((name) => {
    const candidate = normalizedSemantic(name);
    return (
      candidate === normalized ||
      candidate.includes(normalized) ||
      normalized.includes(candidate)
    );
  });
}

function anchorForRequirement(
  profile: AssetDirectabilityProfileV1,
  semanticName: string,
): AssetDirectabilityAnchor | null {
  const direct = profile.anchors.find((anchor) =>
    semanticMatch(anchor.semantic_names, semanticName),
  );
  if (direct) return direct;

  if (semanticName === "attachment_anchor") {
    return (
      profile.anchors.find(
        (anchor) =>
          anchor.kind === "attachment" || anchor.kind === "socket",
      ) ?? null
    );
  }
  if (
    semanticName === "emission_origin" ||
    semanticName === "flow_outlet"
  ) {
    return (
      profile.anchors.find((anchor) => anchor.kind === "outlet") ??
      profile.anchors.find((anchor) => anchor.kind === "attachment") ??
      null
    );
  }
  if (semanticName === "flow_inlet") {
    return profile.anchors.find((anchor) => anchor.kind === "inlet") ?? null;
  }
  if (semanticName === "focus_anchor") {
    return profile.anchors.find((anchor) => anchor.kind === "focus") ?? null;
  }
  return null;
}

function pivotForRequirement(
  profile: AssetDirectabilityProfileV1,
  semanticName: string,
): AssetDirectabilityPivot | null {
  const direct = profile.pivots.find((pivot) =>
    semanticMatch(pivot.semantic_names, semanticName),
  );
  if (direct) return direct;
  if (
    semanticName === "hinge_anchor" ||
    semanticName === "hinge_axis"
  ) {
    return profile.pivots[0] ?? null;
  }
  return null;
}

function subpartForRequirement(
  profile: AssetDirectabilityProfileV1,
  semanticName: string,
): AssetDirectabilitySubpart | null {
  return (
    profile.subparts.find((subpart) =>
      semanticMatch(subpart.semantic_names, semanticName),
    ) ?? null
  );
}

export function resolveAssetDirectabilityRequirement(
  profile: AssetDirectabilityProfileV1 | null | undefined,
  requirement: MotionProgramDirectabilityRequirement,
): AssetDirectabilityRequirementResolution {
  if (!profile) {
    return {
      requirement_id: requirement.id,
      resolved: false,
      evidence_kind: null,
      evidence_id: null,
      confidence: null,
      note: "No asset directability profile is attached to this actor.",
    };
  }

  if (requirement.kind === "anchor") {
    const anchor = anchorForRequirement(profile, requirement.semantic_name);
    const pivot =
      requirement.semantic_name === "hinge_anchor"
        ? pivotForRequirement(profile, requirement.semantic_name)
        : null;
    if (anchor) {
      return {
        requirement_id: requirement.id,
        resolved: true,
        evidence_kind: "anchor",
        evidence_id: anchor.id,
        confidence: anchor.confidence,
        note: `Resolved from ${anchor.source} anchor ${anchor.id}.`,
      };
    }
    if (pivot) {
      return {
        requirement_id: requirement.id,
        resolved: true,
        evidence_kind: "pivot",
        evidence_id: pivot.id,
        confidence: pivot.confidence,
        note: `Resolved from ${pivot.source} pivot ${pivot.id}.`,
      };
    }
  }

  if (requirement.kind === "axis") {
    const pivot = pivotForRequirement(profile, requirement.semantic_name);
    if (pivot) {
      return {
        requirement_id: requirement.id,
        resolved: true,
        evidence_kind: "pivot",
        evidence_id: pivot.id,
        confidence: pivot.confidence,
        note: `Resolved from ${pivot.source} pivot axis ${pivot.id}.`,
      };
    }
    if (requirement.semantic_name === "rolling_axis" && profile.rolling) {
      return {
        requirement_id: requirement.id,
        resolved: true,
        evidence_kind: "rolling",
        evidence_id: "rolling",
        confidence: profile.rolling.confidence,
        note: "Resolved from declared rolling metadata.",
      };
    }
    if (
      requirement.semantic_name.startsWith("alignment_axis") ||
      requirement.semantic_name === "slide_axis"
    ) {
      return {
        requirement_id: requirement.id,
        resolved: true,
        evidence_kind: "orientation",
        evidence_id: "orientation",
        confidence: profile.orientation.confidence,
        note: `Resolved from ${profile.orientation.source} orientation frame.`,
      };
    }
  }

  if (requirement.kind === "geometry_region") {
    if (
      requirement.semantic_name === "rolling_radius" &&
      profile.rolling
    ) {
      return {
        requirement_id: requirement.id,
        resolved: true,
        evidence_kind: "rolling",
        evidence_id: "rolling",
        confidence: profile.rolling.confidence,
        note: "Resolved from declared rolling radius.",
      };
    }
    if (
      requirement.semantic_name === "containment_region" &&
      profile.containment_regions.length
    ) {
      const region = profile.containment_regions[0]!;
      return {
        requirement_id: requirement.id,
        resolved: true,
        evidence_kind: "containment",
        evidence_id: region.id,
        confidence: region.confidence,
        note: `Resolved from containment region ${region.id}.`,
      };
    }
    if (
      requirement.semantic_name === "accumulation_region" &&
      profile.surfaces.length
    ) {
      const surface = profile.surfaces[0]!;
      return {
        requirement_id: requirement.id,
        resolved: true,
        evidence_kind: "surface",
        evidence_id: surface.id,
        confidence: surface.confidence,
        note: `Resolved from support surface ${surface.id}.`,
      };
    }
  }

  if (requirement.kind === "surface") {
    const surface =
      profile.surfaces.find((entry) =>
        semanticMatch(entry.semantic_names, requirement.semantic_name),
      ) ?? profile.surfaces[0] ?? null;
    if (surface) {
      return {
        requirement_id: requirement.id,
        resolved: true,
        evidence_kind: "surface",
        evidence_id: surface.id,
        confidence: surface.confidence,
        note: `Resolved from ${surface.source} surface ${surface.id}.`,
      };
    }
  }

  if (requirement.kind === "subpart") {
    const subpart = subpartForRequirement(
      profile,
      requirement.semantic_name,
    );
    if (subpart) {
      return {
        requirement_id: requirement.id,
        resolved: true,
        evidence_kind: "subpart",
        evidence_id: subpart.id,
        confidence: subpart.confidence,
        note: `Resolved from semantic subpart ${subpart.id}.`,
      };
    }
  }

  if (requirement.kind === "rig" && profile.rig.rigged) {
    return {
      requirement_id: requirement.id,
      resolved: true,
      evidence_kind: "rig",
      evidence_id: "rig",
      confidence: profile.rig.confidence,
      note: "Resolved from asset rig metadata.",
    };
  }

  if (requirement.kind === "animation_clip") {
    const requested = normalizedSemantic(requirement.semantic_name);
    const mappedClip = Object.entries(profile.rig.clip_map).find(
      ([semantic]) => normalizedSemantic(semantic) === requested,
    )?.[1];
    const directClip = profile.rig.available_clips.find(
      (clip) => normalizedSemantic(clip) === requested,
    );
    const clip = mappedClip ?? directClip ?? null;
    if (clip) {
      return {
        requirement_id: requirement.id,
        resolved: true,
        evidence_kind: "animation_clip",
        evidence_id: clip,
        confidence: profile.rig.confidence,
        note: `Resolved to animation clip ${clip}.`,
      };
    }
  }

  return {
    requirement_id: requirement.id,
    resolved: false,
    evidence_kind: null,
    evidence_id: null,
    confidence: null,
    note: `No trustworthy ${requirement.kind} evidence resolves ${requirement.semantic_name}.`,
  };
}

export function resolveMotionProgramDirectabilityRequirementsByEntity(
  requirements: MotionProgramDirectabilityRequirement[],
  profileForEntity: (
    entityId: string,
  ) => AssetDirectabilityProfileV1 | null | undefined,
) {
  const resolutions = requirements.map((requirement) =>
    resolveAssetDirectabilityRequirement(
      profileForEntity(requirement.target_entity_id),
      requirement,
    ),
  );
  const byId = new Map(
    resolutions.map((resolution) => [
      resolution.requirement_id,
      resolution,
    ]),
  );
  const resolvedRequirements = requirements.map((requirement) => ({
    ...requirement,
    runtime_status: byId.get(requirement.id)?.resolved
      ? ("resolved" as const)
      : ("declared" as const),
  }));

  return {
    requirements: resolvedRequirements,
    resolutions,
    resolved_requirement_ids: resolutions
      .filter((resolution) => resolution.resolved)
      .map((resolution) => resolution.requirement_id),
    unresolved_required_requirement_ids: requirements
      .filter(
        (requirement) =>
          requirement.required && !byId.get(requirement.id)?.resolved,
      )
      .map((requirement) => requirement.id),
    unresolved_optional_requirement_ids: requirements
      .filter(
        (requirement) =>
          !requirement.required && !byId.get(requirement.id)?.resolved,
      )
      .map((requirement) => requirement.id),
  };
}

export function resolveMotionProgramDirectabilityRequirements(
  requirements: MotionProgramDirectabilityRequirement[],
  profile: AssetDirectabilityProfileV1 | null | undefined,
) {
  return resolveMotionProgramDirectabilityRequirementsByEntity(
    requirements,
    () => profile,
  );
}

function dominantAxis(
  vector: AssetDirectabilityVec3,
): "x" | "y" | "z" {
  const absolute = vector.map((value) => Math.abs(value)) as AssetDirectabilityVec3;
  if (absolute[1] >= absolute[0] && absolute[1] >= absolute[2]) return "y";
  return absolute[2] >= absolute[0] ? "z" : "x";
}

export function directabilityForwardHorizontalAxis(
  profile: AssetDirectabilityProfileV1 | null | undefined,
): "x" | "z" | null {
  if (!profile) return null;
  const axis = dominantAxis(profile.orientation.forward_axis);
  return axis === "y" ? null : axis;
}

export function directabilityForwardVector(
  profile: AssetDirectabilityProfileV1 | null | undefined,
): MotionProgramVec3 | null {
  return profile
    ? [...profile.orientation.forward_axis] as MotionProgramVec3
    : null;
}

export function directabilityRollingAxis(
  profile: AssetDirectabilityProfileV1 | null | undefined,
): "x" | "y" | "z" | null {
  return profile?.rolling ? dominantAxis(profile.rolling.axis) : null;
}

export function directabilityRollingRadiusForActor(
  profile: AssetDirectabilityProfileV1 | null | undefined,
  actorWorldSize: MotionProgramVec3,
): number | null {
  if (!profile?.rolling) return null;
  const local = profile.local_bounds_size;
  const scales = [0, 1, 2]
    .map((index) => {
      const base = Math.abs(local[index] ?? 0);
      return base > 1e-6
        ? Math.abs(actorWorldSize[index] ?? 0) / base
        : null;
    })
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (!scales.length) return profile.rolling.radius_m;
  scales.sort((a, b) => a - b);
  const scale = scales[Math.floor(scales.length / 2)]!;
  return Math.max(0.0001, profile.rolling.radius_m * scale);
}

export function directabilityRootPivot(
  profile: AssetDirectabilityProfileV1 | null | undefined,
  semanticName: string,
) {
  if (!profile) return null;
  const pivot =
    profile.pivots.find(
      (candidate) =>
        candidate.target_scope === "root" &&
        semanticMatch(candidate.semantic_names, semanticName),
    ) ??
    profile.pivots.find((candidate) => candidate.target_scope === "root") ??
    null;
  return pivot;
}

export function directabilityRequirementSummary(
  profile: AssetDirectabilityProfileV1 | null | undefined,
  requirements: MotionProgramDirectabilityRequirement[],
) {
  const result = resolveMotionProgramDirectabilityRequirements(
    requirements,
    profile,
  );
  return {
    profile_present: Boolean(profile),
    profile_asset_id: profile?.asset_id ?? null,
    resolved_requirement_ids: result.resolved_requirement_ids,
    unresolved_required_requirement_ids:
      result.unresolved_required_requirement_ids,
    unresolved_optional_requirement_ids:
      result.unresolved_optional_requirement_ids,
    resolutions: result.resolutions,
  };
}
