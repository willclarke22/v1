import type { MyWayAssetRecord } from "../assets/asset-types";
import {
  buildAssetDirectabilityProfile,
} from "./asset-directability-from-asset";
import type {
  AssetDirectabilityAnchor,
  AssetDirectabilityEvidenceSource,
  AssetDirectabilityProfileV1,
} from "./asset-directability-contract";
import {
  DIRECTABLE_ASSET_AFFORDANCE_GRAPH_SCHEMA_VERSION,
  DIRECTABLE_ASSET_COMPILER_VERSION,
  type DirectableAssetAffordanceGraphV1,
  type DirectableAssetAffordanceNode,
  type DirectableAssetEvidence,
  type DirectableAssetEvidenceAuthority,
  type DirectableAssetQualificationLevel,
  type DirectableAssetPortAffordance,
  type DirectableAssetSuggestion,
  type DirectableAssetStructureInspectionV1,
} from "./affordance-graph-contract";
import {
  chooseGeometryRollCandidate,
  chooseGeometryTopOpeningCandidate,
  contextualRequirementsForRollCandidate,
  rollCandidateDefaultPose,
  rollInferenceConfidence,
  rollingProfileForCandidate,
  rollingRadiusFromCandidate,
  runtimeModelForRollCandidate,
} from "./geometry-affordance-inference";

function clamp01(value: number, fallback = 0.5) {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function normalizedId(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 96) || "item"
  );
}

type CompilerEvidenceSource = AssetDirectabilityEvidenceSource | "geometry_inference";

function authorityForSource(
  source: CompilerEvidenceSource,
): DirectableAssetEvidenceAuthority {
  if (source === "manual_override") return "verified_manual";
  if (source === "geometry_profile") return "measured_geometry";
  if (source === "geometry_inference") return "geometry_inference";
  if (source === "asset_metadata") return "asset_structure";
  return "fallback";
}

function qualificationForSource(
  source: CompilerEvidenceSource,
): DirectableAssetQualificationLevel {
  if (source === "manual_override") return "verified";
  if (source === "geometry_profile") return "measured";
  if (source === "geometry_inference") return "inferred";
  if (source === "asset_metadata") return "verified";
  return "unknown";
}

function evidence(
  source: CompilerEvidenceSource,
  confidence: number,
  note: string,
  executable = source !== "fallback_bounds",
  qualificationOverride?: DirectableAssetQualificationLevel,
): DirectableAssetEvidence {
  return {
    source,
    authority: authorityForSource(source),
    confidence: clamp01(confidence),
    qualification: qualificationOverride ?? qualificationForSource(source),
    executable,
    note,
  };
}

function normalizedSemanticToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function assetSemanticHints(asset: MyWayAssetRecord) {
  return new Set(
    [
      ...(asset.affordances ?? []),
      ...(asset.semantic_tags ?? []),
    ].map(normalizedSemanticToken),
  );
}

function hasAnySemanticHint(
  asset: MyWayAssetRecord,
  hints: readonly string[],
) {
  const values = assetSemanticHints(asset);
  return hints.some((hint) => values.has(normalizedSemanticToken(hint)));
}

function semanticNamesSuggestConnector(names: readonly string[]) {
  return names.some((name) =>
    /\b(mount|connector|socket|port|hook|hitch|plug|coupler|fastener|snap|clip)\b/i.test(
      name.replace(/_/g, " "),
    ),
  );
}

function supportViability(
  asset: MyWayAssetRecord,
  surfaceId: string,
  confidence: number,
  normal: readonly number[],
  fallbackSize: [number, number],
) {
  const raw = asset.geometry_profile?.support_surfaces.find(
    (surface) => surface.id === surfaceId,
  );
  const usableSize = raw?.usable_size ?? raw?.size ?? fallbackSize;
  const area = raw?.area ?? Math.max(0, usableSize[0] * usableSize[1]);
  const footprintArea = Math.max(
    1e-6,
    asset.geometry_profile
      ? asset.geometry_profile.local_bounds.size[0] *
          asset.geometry_profile.local_bounds.size[2]
      : asset.dimensions_m[0] * asset.dimensions_m[2],
  );
  const areaScore = clamp01(area / Math.max(footprintArea * 0.18, 1e-6));
  const upwardScore = clamp01((Number(normal[1] ?? 0) - 0.35) / 0.65);
  const blockedFraction = clamp01(raw?.blocked_fraction ?? 0, 0);
  const clearance = raw?.clearance_above_m ?? null;
  const clearanceScore =
    clearance === null
      ? 0.65
      : clamp01(
          clearance /
            Math.max(
              0.08,
              (asset.geometry_profile?.local_bounds.size[1] ??
                asset.dimensions_m[1]) *
                0.35,
            ),
        );
  const score = clamp01(
    0.28 * clamp01(confidence) +
      0.28 * areaScore +
      0.22 * upwardScore +
      0.12 * (1 - blockedFraction) +
      0.1 * clearanceScore,
  );
  return {
    usableSize: [...usableSize] as [number, number],
    area,
    clearance,
    blockedFraction,
    score,
    viability:
      score >= 0.72
        ? "strong_candidate" as const
        : score >= 0.5
          ? "candidate" as const
          : "weak" as const,
    contextRequirements: [
      "source footprint must fit within the usable support region",
      "source center of mass must remain stably supported",
      "clearance above the selected region must be sufficient",
    ],
  };
}

function containmentUsability(
  asset: MyWayAssetRecord,
  regionId: string,
  confidence: number,
  accessDirection: readonly number[] | null,
) {
  const raw = asset.geometry_profile?.interior_volumes.find(
    (region) => region.id === regionId,
  );
  const openness = raw?.openness ?? "unknown";
  const hasAccess = Boolean(raw?.access_direction ?? accessDirection);
  const semanticContainer = hasAnySemanticHint(asset, [
    "container",
    "fillable",
    "vessel",
    "cup",
    "bowl",
    "pot",
  ]);
  const bounds = asset.geometry_profile?.local_bounds.size ?? asset.dimensions_m;
  const volume = raw
    ? Math.max(0, raw.size[0] * raw.size[1] * raw.size[2])
    : 0;
  const boundsVolume = Math.max(1e-8, bounds[0] * bounds[1] * bounds[2]);
  const relativeVolumeScore = clamp01(volume / (boundsVolume * 0.08));
  const score = clamp01(
    0.45 * confidence +
      0.2 * (openness === "open" ? 1 : 0) +
      0.2 * (hasAccess ? 1 : 0) +
      0.15 * relativeVolumeScore,
  );
  const minimumConfidence = semanticContainer ? 0.62 : 0.72;
  const usable =
    openness === "open" &&
    hasAccess &&
    confidence >= minimumConfidence &&
    score >= 0.7;
  return {
    raw,
    openness,
    semanticContainer,
    score,
    usable,
  };
}

function portKind(anchor: AssetDirectabilityAnchor): DirectableAssetPortAffordance["kind"] | null {
  if (anchor.kind === "attachment") return "attachment_port";
  if (anchor.kind === "socket") return "socket_port";
  if (anchor.kind === "inlet") return "inlet_port";
  if (anchor.kind === "outlet") return "outlet_port";
  return null;
}

function compileFromProfile(
  asset: MyWayAssetRecord,
  profile: AssetDirectabilityProfileV1,
  structure: DirectableAssetStructureInspectionV1 | null,
): DirectableAssetAffordanceNode[] {
  const affordances: DirectableAssetAffordanceNode[] = [
    {
      id: "root_transform",
      kind: "root_transform",
      semantic_names: ["root_transform", "whole_asset", "rigid_body"],
      target_scope: "root",
      subpart_id: null,
      evidence: evidence(
        "asset_metadata",
        1,
        "Every resolved asset exposes a root transform in the shared scene runtime.",
        true,
      ),
    },
    {
      id: "orientation_frame",
      kind: "orientation_frame",
      semantic_names: ["geometry_frame", "orientation", "up"],
      target_scope: "root",
      subpart_id: null,
      up_axis: [...profile.orientation.up_axis],
      forward_axis: [...profile.orientation.forward_axis],
      evidence: evidence(
        profile.orientation.source,
        profile.orientation.confidence,
        profile.orientation.source === "fallback_bounds"
          ? "Only the default normalized GLB coordinate frame is available."
          : "Geometric coordinate frame comes from trusted directability evidence; it does not by itself prove semantic facing.",
        profile.orientation.source !== "fallback_bounds",
      ),
    },
  ];

  if (asset.directability_overrides?.orientation?.forward_axis) {
    affordances.push({
      id: "semantic_forward_frame",
      kind: "semantic_forward_frame",
      semantic_names: ["semantic_forward", "facing", "aim_direction", "forward"],
      target_scope: "root",
      subpart_id: null,
      up_axis: [...profile.orientation.up_axis],
      forward_axis: [...profile.orientation.forward_axis],
      evidence: evidence(
        "manual_override",
        profile.orientation.confidence,
        "Semantic facing is explicitly authored rather than inferred from the raw GLB coordinate frame.",
        true,
      ),
    });
  }

  for (const anchor of profile.anchors) {
    if (anchor.kind === "contact") {
      affordances.push({
        id: `contact:${anchor.id}`,
        kind: "ground_contact",
        semantic_names: unique([
          ...anchor.semantic_names,
          "ground_contact",
          "contact",
        ]),
        target_scope: anchor.target_scope,
        subpart_id: anchor.subpart_id,
        local_position: [...anchor.local_position],
        local_normal: anchor.local_normal ? [...anchor.local_normal] : null,
        contact_size:
          asset.geometry_profile?.bottom_contact_region?.id === anchor.id
            ? [...asset.geometry_profile.bottom_contact_region.size]
            : null,
        evidence: evidence(
          anchor.source,
          anchor.confidence,
          `Ground/contact affordance compiled from anchor ${anchor.id}.`,
        ),
      });
      continue;
    }

    const kind = portKind(anchor);
    if (!kind) continue;

    if (
      kind === "attachment_port" &&
      anchor.source === "geometry_profile"
    ) {
      const rawRegion = asset.geometry_profile?.attachment_regions.find(
        (region) => region.id === anchor.id,
      );
      affordances.push({
        id: `surface_contact:${anchor.id}`,
        kind: "surface_contact_region",
        semantic_names: unique([
          ...anchor.semantic_names,
          "surface_contact",
          "exterior_contact",
        ]),
        target_scope: anchor.target_scope,
        subpart_id: anchor.subpart_id,
        local_position: [...anchor.local_position],
        local_normal: anchor.local_normal ? [...anchor.local_normal] : null,
        size: rawRegion ? [...rawRegion.size] : null,
        evidence: evidence(
          anchor.source,
          anchor.confidence,
          `Measured exterior region ${anchor.id} is a generic surface-contact candidate, not a semantic connector port.`,
          true,
        ),
      });
      if (!semanticNamesSuggestConnector(anchor.semantic_names)) {
        continue;
      }
    }

    affordances.push({
      id: `${kind}:${anchor.id}`,
      kind,
      semantic_names: unique([...anchor.semantic_names, anchor.kind]),
      target_scope: anchor.target_scope,
      subpart_id: anchor.subpart_id,
      local_position: [...anchor.local_position],
      local_normal: anchor.local_normal ? [...anchor.local_normal] : null,
      opening_size: null,
      evidence: evidence(
        anchor.source,
        anchor.confidence,
        `${kind.replace(/_/g, " ")} compiled from ${anchor.source === "geometry_profile" ? "semantically specific measured" : "explicit"} anchor ${anchor.id}.`,
      ),
    });
  }

  for (const surface of profile.surfaces) {
    const viability = supportViability(
      asset,
      surface.id,
      surface.confidence,
      surface.normal,
      surface.size,
    );
    affordances.push({
      id: `surface:${surface.id}`,
      kind: "support_surface",
      semantic_names: unique([...surface.semantic_names, "support_surface"]),
      target_scope: "root",
      subpart_id: null,
      local_center: [...surface.local_center],
      normal: [...surface.normal],
      size: [...surface.size],
      usable_size: viability.usableSize,
      area_m2: viability.area,
      clearance_above_m: viability.clearance,
      blocked_fraction: viability.blockedFraction,
      viability_score: viability.score,
      viability: viability.viability,
      context_requirements: viability.contextRequirements,
      evidence: evidence(
        surface.source,
        Math.min(surface.confidence, Math.max(0.2, viability.score)),
        `Support region ${surface.id} is retained as ${viability.viability.replace(/_/g, " ")} evidence; source footprint, stability, and clearance remain contextual.`,
        viability.viability !== "weak",
      ),
    });
  }

  for (const region of profile.containment_regions) {
    const usability = containmentUsability(
      asset,
      region.id,
      region.confidence,
      region.access_direction,
    );
    affordances.push({
      id: `containment_candidate:${region.id}`,
      kind: "containment_candidate",
      semantic_names: unique([
        ...region.semantic_names,
        "interior_candidate",
        "geometric_void",
      ]),
      target_scope: "root",
      subpart_id: null,
      local_center: [...region.local_center],
      size: [...region.size],
      access_direction: region.access_direction
        ? [...region.access_direction]
        : null,
      openness: usability.openness,
      usability_score: usability.score,
      derivation:
        region.source === "manual_override"
          ? "manual"
          : "measured_interior",
      evidence: evidence(
        region.source,
        region.confidence,
        `Measured interior ${region.id} is retained as non-executable containment evidence until accessibility and enclosure quality are sufficient.`,
        false,
      ),
    });

    if (region.source === "manual_override" || usability.usable) {
      affordances.push({
        id: `containment:${region.id}`,
        kind: "containment_volume",
        semantic_names: unique([
          ...region.semantic_names,
          "containment_volume",
          "usable_container",
          "interior",
        ]),
        target_scope: "root",
        subpart_id: null,
        local_center: [...region.local_center],
        size: [...region.size],
        access_direction: region.access_direction
          ? [...region.access_direction]
          : null,
        openness: usability.openness,
        usability_score: usability.score,
        derivation:
          region.source === "manual_override"
            ? "manual"
            : "measured_interior",
        evidence: evidence(
          region.source,
          Math.min(region.confidence, Math.max(0.5, usability.score)),
          region.source === "manual_override"
            ? `Containment region ${region.id} is explicitly authored.`
            : `Measured interior ${region.id} is open, accessible, and high-confidence enough to qualify as usable containment.`,
          true,
        ),
      });
    }
  }

  const hasUsableContainment = affordances.some(
    (item) => item.kind === "containment_volume" && item.evidence.executable,
  );
  const topOpening = chooseGeometryTopOpeningCandidate(
    structure?.geometry_shape,
  );
  if (
    !hasUsableContainment &&
    topOpening &&
    hasAnySemanticHint(asset, ["container", "fillable", "vessel", "cup", "bowl", "pot"])
  ) {
    const bounds = asset.geometry_profile?.local_bounds;
    const size = bounds?.size ?? asset.dimensions_m;
    const center = bounds?.center ?? [0, size[1] * 0.5, 0];
    const minY = bounds?.min[1] ?? 0;
    const openingCenter = topOpening.local_center ?? [
      center[0],
      minY + size[1],
      center[2],
    ];
    const openingSize = topOpening.opening_size ?? [
      size[0] * topOpening.opening_size_ratio[0],
      size[2] * topOpening.opening_size_ratio[1],
    ];
    affordances.push({
      id: "containment:semantic_top_opening",
      kind: "containment_volume",
      semantic_names: [
        "containment_volume",
        "usable_container",
        "semantic_container_with_measured_opening",
      ],
      target_scope: "root",
      subpart_id: null,
      local_center: [
        openingCenter[0],
        minY + size[1] * 0.42,
        openingCenter[2],
      ],
      size: [
        Math.max(1e-4, openingSize[0] * 0.92),
        Math.max(1e-4, size[1] * 0.68),
        Math.max(1e-4, openingSize[1] * 0.92),
      ],
      access_direction: [...topOpening.access_direction],
      openness: "open",
      usability_score: topOpening.score,
      derivation: "semantic_plus_geometry",
      evidence: evidence(
        "geometry_inference",
        topOpening.confidence,
        "Advisory container semantics are corroborated by an independently measured open-top surface pattern; neither signal is sufficient alone.",
        true,
      ),
    });
    affordances.push({
      id: "inlet_port:semantic_top_opening",
      kind: "inlet_port",
      semantic_names: ["inlet", "opening", "top_opening"],
      target_scope: "root",
      subpart_id: null,
      local_position: [
        openingCenter[0],
        openingCenter[1],
        openingCenter[2],
      ],
      local_normal: [...topOpening.access_direction],
      opening_size: [
        Math.max(1e-4, openingSize[0]),
        Math.max(1e-4, openingSize[1]),
      ],
      evidence: evidence(
        "geometry_inference",
        topOpening.confidence,
        "Open-top inlet is inferred only because semantic container evidence and measured opening geometry agree.",
        true,
      ),
    });
  }

  for (const pivot of profile.pivots) {
    affordances.push({
      id: `joint:${pivot.id}`,
      kind: "pivot_joint",
      semantic_names: unique([
        ...pivot.semantic_names,
        "pivot",
        "hinge",
        "revolute_joint",
      ]),
      target_scope: pivot.target_scope,
      subpart_id: pivot.subpart_id,
      local_position: [...pivot.local_position],
      axis: [...pivot.axis],
      min_degrees: pivot.min_degrees,
      max_degrees: pivot.max_degrees,
      evidence: evidence(
        pivot.source,
        pivot.confidence,
        `Joint affordance compiled from pivot ${pivot.id}.`,
      ),
    });
  }

  for (const subpart of profile.subparts) {
    const nodeName = subpart.node_name;
    const nodeMissing = Boolean(
      nodeName && structure && !structure.node_names.includes(nodeName),
    );
    const nodeExecutable = Boolean(
      nodeName && (!structure || structure.node_names.includes(nodeName)),
    );
    affordances.push({
      id: `subpart:${subpart.id}`,
      kind: "semantic_subpart",
      semantic_names: unique([...subpart.semantic_names, subpart.id]),
      target_scope: "subpart",
      subpart_id: subpart.id,
      node_name: nodeName,
      capabilities: [...subpart.capabilities],
      pivot_id: subpart.pivot_id,
      anchor_ids: [...subpart.anchor_ids],
      evidence: evidence(
        subpart.source,
        subpart.confidence,
        !nodeName
          ? `Semantic subpart ${subpart.id} is declared, but no runtime node binding is available yet.`
          : structure && !structure.node_names.includes(nodeName)
            ? `Semantic subpart ${subpart.id} references runtime node ${nodeName}, but that node was not found in the inspected GLB hierarchy.`
            : structure
              ? `Semantic subpart ${subpart.id} is explicitly bound to inspected runtime node ${nodeName}.`
              : `Semantic subpart ${subpart.id} is explicitly bound to runtime node ${nodeName}; GLB hierarchy has not been independently inspected in this compile.`,
        nodeExecutable,
        nodeMissing ? "contradicted" : nodeName ? undefined : "unknown",
      ),
    });
  }

  if (profile.rolling) {
    affordances.push({
      id: "rolling",
      kind: "rolling",
      semantic_names: ["rolling", "roll", "wheel_like_motion"],
      target_scope: "root",
      subpart_id: null,
      radius_m: profile.rolling.radius_m,
      axis: [...profile.rolling.axis],
      local_center: profile.rolling.local_center
        ? [...profile.rolling.local_center]
        : null,
      derivation: "explicit",
      geometry_score: null,
      default_pose: "ready",
      context_requirements: [],
      rolling_profile: "cylindrical",
      runtime_model: "constant_radius",
      evidence: evidence(
        profile.rolling.source,
        profile.rolling.confidence,
        "Rolling radius and axis are explicitly qualified for this asset.",
      ),
    });
  }

  if (!profile.rolling) {
    const candidate = chooseGeometryRollCandidate(structure?.geometry_shape);
    if (candidate) {
      const defaultPose = rollCandidateDefaultPose(
        candidate,
        profile.orientation.up_axis,
      );
      const rollingProfile = rollingProfileForCandidate(candidate);
      const runtimeModel = runtimeModelForRollCandidate(candidate);
      affordances.push({
        id: `rolling:geometry:${candidate.axis_name}`,
        kind: "rolling",
        semantic_names: [
          "rolling",
          "roll",
          "geometry_roll_candidate",
          rollingProfile,
        ],
        target_scope: "root",
        subpart_id: null,
        radius_m: rollingRadiusFromCandidate(
          candidate,
          profile.local_bounds_size,
        ),
        axis: [...candidate.axis],
        local_center: null,
        derivation: "geometry_inference",
        geometry_score: candidate.score,
        default_pose: defaultPose,
        context_requirements: [
          ...contextualRequirementsForRollCandidate(
            candidate,
            profile.orientation.up_axis,
          ),
          ...(runtimeModel === "approximate_only"
            ? [
                "current constant-radius UMP Roll is not a faithful motion model for this tapered or irregular profile",
              ]
            : []),
        ],
        rolling_profile: rollingProfile,
        runtime_model: runtimeModel,
        evidence: evidence(
          "geometry_inference",
          rollInferenceConfidence(candidate),
          `Actual GLB surface geometry supports a plausible ${rollingProfile.replace(/_/g, " ")} rolling profile around local ${candidate.axis_name.toUpperCase()} with score ${candidate.score.toFixed(2)}. This remains contextual rather than semantic truth.`,
          runtimeModel === "constant_radius",
        ),
      });
    }
  }

  if (profile.rig.rigged) {
    const semanticBoneCount = Object.keys(profile.rig.bone_map).length;
    const mappedBoneNames = Object.values(profile.rig.bone_map);
    const missingMappedBones = structure
      ? mappedBoneNames.filter((name) => !structure.bone_names.includes(name))
      : [];
    affordances.push({
      id: "rig",
      kind: "rig",
      semantic_names: ["rig", "skeleton", "skeletal_control"],
      target_scope: "root",
      subpart_id: null,
      semantic_bone_count: semanticBoneCount,
      evidence: evidence(
        profile.rig.source,
        profile.rig.confidence,
        semanticBoneCount === 0
          ? "Rig is present, but semantic bone control is not yet qualified."
          : missingMappedBones.length
            ? `Semantic bone map references missing inspected bones: ${missingMappedBones.join(", ")}.`
            : structure
              ? "Rig is present and all explicit semantic bone mappings were found in the inspected hierarchy."
              : "Rig is present with an explicit semantic bone map; GLB hierarchy has not been independently inspected in this compile.",
        semanticBoneCount > 0 && missingMappedBones.length === 0,
        missingMappedBones.length
          ? "contradicted"
          : semanticBoneCount > 0
            ? undefined
            : "unknown",
      ),
    });
  }

  const semanticClipNames = new Map<string, string[]>();
  for (const [semanticName, clipName] of Object.entries(profile.rig.clip_map)) {
    semanticClipNames.set(clipName, [
      ...(semanticClipNames.get(clipName) ?? []),
      semanticName,
    ]);
  }
  for (const clipName of profile.rig.available_clips) {
    affordances.push({
      id: `clip:${normalizedId(clipName)}`,
      kind: "animation_clip",
      semantic_names: unique([
        clipName,
        ...(semanticClipNames.get(clipName) ?? []),
      ]),
      target_scope: "root",
      subpart_id: null,
      clip_name: clipName,
      evidence: evidence(
        "asset_metadata",
        profile.rig.confidence,
        structure && !structure.animation_clip_names.includes(clipName)
          ? `Animation clip ${clipName} is declared in asset metadata but was not found in the inspected GLB.`
          : structure
            ? `Animation clip ${clipName} is present in the inspected GLB.`
            : `Animation clip ${clipName} is present in asset metadata; GLB structure has not been independently inspected in this compile.`,
        !structure || structure.animation_clip_names.includes(clipName),
        structure && !structure.animation_clip_names.includes(clipName)
          ? "contradicted"
          : undefined,
      ),
    });
  }

  return affordances;
}

function metadataSuggestions(asset: MyWayAssetRecord): DirectableAssetSuggestion[] {
  return unique(asset.affordances ?? []).map((label, index) => ({
    id: `metadata_suggestion_${index + 1}_${normalizedId(label)}`,
    label,
    source: "asset_metadata" as const,
    qualification: "suggested" as const,
    executable: false as const,
    note:
      "Legacy/free-form asset affordance metadata is advisory only in Phase 1B.5B and cannot resolve an interaction operator without trusted graph evidence.",
  }));
}

export function compileDirectableAssetAffordanceGraph(
  asset: MyWayAssetRecord,
  options?: { structure?: DirectableAssetStructureInspectionV1 | null },
): DirectableAssetAffordanceGraphV1 {
  const profile = buildAssetDirectabilityProfile(asset);
  const structure = options?.structure ?? null;
  const affordances = compileFromProfile(asset, profile, structure);
  const suggestions = metadataSuggestions(asset);
  const warnings = [...profile.diagnostics.warnings];

  if (suggestions.length) {
    warnings.push(
      "Free-form asset affordance labels are retained as non-executable suggestions; they do not grant Director capabilities by themselves.",
    );
  }
  if (
    affordances.some((item) => item.kind === "containment_candidate") &&
    !affordances.some((item) => item.kind === "containment_volume")
  ) {
    warnings.push(
      "Measured interior/void regions exist but are intentionally demoted to containment candidates because usable opening/enclosure evidence is insufficient.",
    );
  }
  if (
    affordances.some((item) => item.kind === "surface_contact_region") &&
    !affordances.some(
      (item) => item.kind === "attachment_port" || item.kind === "socket_port",
    )
  ) {
    warnings.push(
      "Measured exterior contact regions are not semantic connectors; precise Attach remains unqualified until a mount/port/socket is explicitly supported.",
    );
  }
  if (
    affordances.some((item) => item.kind === "orientation_frame") &&
    !affordances.some((item) => item.kind === "semantic_forward_frame")
  ) {
    warnings.push(
      "A geometric coordinate frame is available, but semantic facing/Aim direction is not explicitly qualified.",
    );
  }
  const rollingAffordance = affordances.find((item) => item.kind === "rolling");
  if (!rollingAffordance) {
    warnings.push(
      "No qualified or geometry-inferred rolling affordance exists; Roll may retain legacy root-motion fallback, but asset-specific rolling is not proven.",
    );
  } else if (
    rollingAffordance.kind === "rolling" &&
    rollingAffordance.derivation === "geometry_inference"
  ) {
    warnings.push(
      rollingAffordance.runtime_model === "constant_radius"
        ? `Roll is geometry-inferred as ${rollingAffordance.rolling_profile.replace(/_/g, " ")}; pose, support surface, and travel direction must be resolved from scene context before execution.`
        : `Geometry suggests ${rollingAffordance.rolling_profile.replace(/_/g, " ")} rolling, but the current constant-radius UMP Roll is not faithful; retain an approximate/tumble fallback.`,
    );
  }
  if (
    !affordances.some((item) => item.kind === "semantic_subpart") ||
    !affordances.some((item) => item.kind === "pivot_joint")
  ) {
    warnings.push(
      "Mechanical subpart articulation is not qualified unless both semantic part identity and joint evidence exist.",
    );
  }

  return {
    schema_version: DIRECTABLE_ASSET_AFFORDANCE_GRAPH_SCHEMA_VERSION,
    compiler_version: DIRECTABLE_ASSET_COMPILER_VERSION,
    asset_id: asset.asset_id,
    display_name: asset.display_name || asset.canonical_label || asset.asset_id,
    coordinate_space: "normalized_glb_y_up",
    local_bounds_size: [...profile.local_bounds_size],
    local_bounds_center: asset.geometry_profile?.local_bounds.center
      ? [...asset.geometry_profile.local_bounds.center]
      : [0, profile.local_bounds_size[1] * 0.5, 0],
    affordances,
    suggestions,
    diagnostics: {
      geometry_status: profile.diagnostics.geometry_profile_audit_status,
      directability_override_status: asset.directability_overrides
        ? "present"
        : "missing",
      rig_status: asset.rigged ? "rigged" : "not_rigged",
      animation_clip_count: asset.animation_clips.length,
      structure_status: structure ? "inspected" : "not_inspected",
      structure_node_count: structure?.node_names.length ?? 0,
      structure_mesh_count: structure?.mesh_names.length ?? 0,
      structure_bone_count: structure?.bone_names.length ?? 0,
      geometry_shape_status: structure?.geometry_shape ? "inspected" : "not_inspected",
      geometry_shape_sample_count: structure?.geometry_shape?.sample_count ?? 0,
      inferred_affordance_count: affordances.filter(
        (item) => item.evidence.qualification === "inferred",
      ).length,
      executable_affordance_count: affordances.filter(
        (item) => item.evidence.executable,
      ).length,
      suggestion_count: suggestions.length,
      warnings,
    },
  };
}
