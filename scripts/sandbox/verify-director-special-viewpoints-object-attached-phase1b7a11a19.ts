import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DIRECTOR_CAPABILITIES } from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  directorQualificationMountedCameraHostSuitability,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-cast";
import {
  emptyDirectorQualificationCampaignState,
  normalizeDirectorQualificationCampaignState,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-campaign";
import {
  DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);

  const frozenCapabilityIds = frozenFamilies.flatMap((family) => family.capability_ids);
  const activeCapabilityIds = activeFamilies.flatMap((family) => family.capability_ids);

  assert(
    DIRECTOR_CAPABILITIES.length === 184 &&
      frozenFamilies.length === 33 &&
      frozenCapabilityIds.length === 184 &&
      new Set(frozenCapabilityIds).size === 184,
    `A.11A.19 must preserve the frozen 184-capability / 33-family taxonomy. Got registry=${DIRECTOR_CAPABILITIES.length}, families=${frozenFamilies.length}, assignments=${frozenCapabilityIds.length}.`,
  );

  const deferredCapabilityIds = [
    ...DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  ] as readonly string[];

  assert(
    deferredCapabilityIds.includes("inside_object"),
    "A.11A.19 lineage requires inside_object to remain deferred from active qualification.",
  );

  assert(
    activeFamilies.length === 33 &&
      activeCapabilityIds.length === DIRECTOR_CAPABILITIES.length - deferredCapabilityIds.length &&
      new Set(activeCapabilityIds).size === activeCapabilityIds.length &&
      deferredCapabilityIds.every((id) => !activeCapabilityIds.includes(id)) &&
      frozenCapabilityIds.includes("inside_object"),
    `A.11A.19 successor compatibility requires every currently deferred capability to be absent from active qualification while the frozen taxonomy retains inside_object. Active=${activeCapabilityIds.length}, deferred=${JSON.stringify(deferredCapabilityIds)}.`,
  );

  const insideObject = DIRECTOR_CAPABILITIES.find(
    (capability) => capability.id === "inside_object",
  );
  assert(
    insideObject?.compiler.threejs === "approximate",
    "inside_object must remain in the Director registry as the existing approximate capability rather than being deleted or reclassified.",
  );

  const special = activeFamilies.find(
    (family) =>
      family.category === "camera_angle" &&
      family.group === "Special viewpoints",
  );
  assert(special, "Active Special viewpoints family could not be resolved.");
  assert(
    special.capability_ids.length === 2 &&
      special.capability_ids.includes("isometric") &&
      special.capability_ids.includes("object_attached") &&
      !special.capability_ids.includes("inside_object"),
    `Active Special viewpoints must contain only isometric + object_attached. Got ${JSON.stringify(special.capability_ids)}.`,
  );

  const frozenSpecial = frozenFamilies.find(
    (family) =>
      family.category === "camera_angle" &&
      family.group === "Special viewpoints",
  );
  assert(frozenSpecial, "Frozen Special viewpoints family could not be resolved.");
  const staleCampaign = emptyDirectorQualificationCampaignState(
    frozenFamilies,
    "2026-08-27T00:00:00.000Z",
  );
  staleCampaign.families[frozenSpecial.key] = {
    ...staleCampaign.families[frozenSpecial.key]!,
    capability_ids: [...frozenSpecial.capability_ids],
    status: "awaiting_perceptual_review",
    latest_evidence_reel_id: "old-three-capability-special-viewpoints-reel",
    latest_evidence_integrity: "pass",
    latest_evidence_coverage_mode: "cross_asset",
    frozen_capability_ids: ["isometric"],
  };
  const normalizedCampaign = normalizeDirectorQualificationCampaignState(
    staleCampaign,
    activeFamilies,
    "2026-08-27T00:01:00.000Z",
  );
  const normalizedSpecial = normalizedCampaign.families[special.key];
  assert(
    normalizedSpecial?.status === "needs_re_evidence" &&
      normalizedSpecial.capability_ids.length === 2 &&
      !normalizedSpecial.capability_ids.includes("inside_object") &&
      normalizedSpecial.frozen_capability_ids.length === 1 &&
      normalizedSpecial.frozen_capability_ids[0] === "isometric" &&
      normalizedSpecial.re_evidence_reason.includes(
        "Active qualification capability membership changed",
      ),
    "Stored three-capability Special Viewpoints evidence must become Needs re-evidence while preserving frozen Isometric.",
  );

  const objectAttachedProfile = directorQualificationCapabilityProfile(
    special,
    "object_attached",
  );
  assert(
    objectAttachedProfile.suitable_primary_cast_slots.length === 1 &&
      objectAttachedProfile.suitable_primary_cast_slots[0] === "vehicle" &&
      objectAttachedProfile.comparison_group === "mounted_camera" &&
      objectAttachedProfile.requires_directional_facing &&
      objectAttachedProfile.qualification_note?.includes("solid-bodied vehicle"),
    "Object-attached Special Viewpoints profile must be Vehicle-only, directional, mounted-camera evidence with an explicit solid-bodied-host rule.",
  );

  const bicycle = {
    canonical_label: "bicycle",
    display_name: "City Bicycle",
    verified_canonical_label: null,
    aliases: ["bike"],
    verified_aliases: [],
    semantic_tags: ["vehicle", "bicycle"],
    contains: [],
    affordances: [],
    preferred_for_concepts: [],
    dimensions_m: [1.7, 1.1, 0.45],
  } as any;
  const sedan = {
    canonical_label: "sedan",
    display_name: "Police Car",
    verified_canonical_label: "car",
    aliases: ["automobile"],
    verified_aliases: [],
    semantic_tags: ["vehicle", "car", "bodywork"],
    contains: [],
    affordances: [],
    preferred_for_concepts: [],
    dimensions_m: [1.9, 1.45, 4.6],
  } as any;

  assert(
    !directorQualificationMountedCameraHostSuitability(bicycle).suitable,
    "Open-frame bicycle must remain rejected as canonical Object-attached evidence.",
  );
  assert(
    directorQualificationMountedCameraHostSuitability(sedan).suitable,
    "Solid-bodied car must remain eligible as canonical Object-attached evidence.",
  );

  const campaignSource = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-campaign.ts",
  );
  for (const marker of [
    "capabilityMembershipChanged",
    "Active qualification capability membership changed; render fresh deterministic evidence for the current family.",
  ]) {
    assert(campaignSource.includes(marker), `A.11A.19 campaign marker missing: ${marker}`);
  }

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  for (const marker of [
    "buildActiveDirectorQualificationFamilies",
    'family.category === "camera_angle"',
    'family.group === "Special viewpoints"',
    'capability.id === "object_attached"',
    "return mountedCameraHostCandidateForPass(pools, passKind)",
    '["camera_object_attached", "object_attached"].includes(capability.id)',
    "Inside-object is deferred from active Qualification Room coverage",
    "solid-bodied mount-suitable vehicle",
    "function decisionCounts(\n  state: DirectorQualificationState,\n  capabilityIds: readonly string[]",
    "const activeCapabilityIds = useMemo",
    "decisionCounts(qualificationState, activeCapabilityIds)",
  ]) {
    assert(room.includes(marker), `A.11A.19 Qualification Room marker missing: ${marker}`);
  }

  const runtime = source(
    "sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx",
  );
  assert(
    !runtime.includes("A.11A.19"),
    "A.11A.19 must not change the shared Director camera runtime.",
  );

  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  for (const marker of [
    "Phase 1B.7A.11A.19 — Special Viewpoints qualification truth",
    "183 actively qualifiable capabilities",
    "interior-safe",
    "asset/directability metadata",
    "directionally suitable solid-bodied vehicle",
    "does **not** change the shared mounted-camera solver",
  ]) {
    assert(readme.includes(marker), `A.11A.19 README marker missing: ${marker}`);
  }

  const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
    (counts, item) => {
      counts[item.compiler.threejs] = (counts[item.compiler.threejs] ?? 0) + 1;
      return counts;
    },
    {},
  );
  assert(
    supportCounts.direct === 102 &&
      supportCounts.compound === 65 &&
      supportCounts.approximate === 15 &&
      supportCounts.declared === 2,
    `A.11A.19 must preserve the Level 2 support distribution: ${JSON.stringify(supportCounts)}.`,
  );

  console.log(
    "Director Special Viewpoints Phase 1B.7A.11A.19 qualification-truth verification passed.",
  );
  console.log(
    `Inside-object stays in the frozen 184-entry vocabulary and remains deferred from the ${activeCapabilityIds.length}-capability active campaign; Object-attached still reuses the proven solid-bodied mounted-host gate and Isometric/runtime execution remain frozen.`,
  );
}

main();
