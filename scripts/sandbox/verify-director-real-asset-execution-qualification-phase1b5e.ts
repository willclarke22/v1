import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { MyWayAssetRecord } from "../../sandbox/probe-lab/assets/asset-types";
import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityById,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  buildDirectorRealAssetExecutionQualification,
  DIRECTOR_REAL_ASSET_EXECUTION_QUALIFICATION_VERSION,
} from "../../sandbox/probe-lab/motion-camera-library/director-real-asset-execution-qualification";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function asset(id: string): MyWayAssetRecord {
  return {
    asset_id: id,
    canonical_label: id,
    display_name: id,
    aliases: [],
    semantic_tags: [],
    asset_type: "glb",
    domain: "generic",
    source_type: "manual",
    public_path: `/sandbox-assets/myway/${id}.glb`,
    dimensions_m: [1, 1, 1],
    default_scale: 1,
    default_rotation: [0, 0, 0],
    ground_offset_m: 0,
    rigged: false,
    animation_clips: [],
    quality_score: 1,
    reuse_count: 0,
    license_kind: "self_owned",
    license_status: "app_ready",
    commercial_use_allowed: true,
    raw_redistribution_allowed: true,
    safe_to_use_in_sandbox: true,
    safe_to_promote_to_app: true,
    status: "approved",
    scene_review_status: "approved",
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z",
  };
}

assert(
  DIRECTOR_REAL_ASSET_EXECUTION_QUALIFICATION_VERSION ===
    "director_real_asset_execution_qualification_phase1b5e_v1",
  "Phase 1B.5E qualification version drifted.",
);

const translate = directorCapabilityById("translate");
assert(translate, "Translate capability is missing.");
const translateReport = buildDirectorRealAssetExecutionQualification(
  translate,
  [
    {
      role: "primary_subject",
      asset: asset("translate_canary"),
      target_extent_m: 1.8,
    },
  ],
);
assert(
  translateReport.execution_status === "ready_for_visual_proof" &&
    translateReport.operator_proofs.some(
      (proof) =>
        proof.qualification?.operator_id === "translate" &&
        proof.qualification.status === "executable_as_is",
    ),
  "A plain reviewed GLB must remain ready for real-asset Translate visual proof.",
);

const open = directorCapabilityById("object_open");
assert(open, "Open capability is missing.");
const openReport = buildDirectorRealAssetExecutionQualification(
  open,
  [
    {
      role: "primary_subject",
      asset: asset("fused_plain_asset"),
      target_extent_m: 1.8,
    },
  ],
);
assert(
  openReport.execution_status === "asset_authoring_required",
  "Open must fail closed for a fused/plain asset without trusted subpart + joint evidence.",
);

const attach = directorCapabilityById("attach");
assert(attach, "Attach capability is missing.");
const attachReport = buildDirectorRealAssetExecutionQualification(
  attach,
  [
    {
      role: "primary_subject",
      asset: asset("plain_source"),
      target_extent_m: 1.2,
    },
    {
      role: "secondary_subject",
      asset: asset("plain_target"),
      target_extent_m: 1.6,
    },
  ],
);
assert(
  attachReport.pair_proofs.length === 2 &&
    attachReport.execution_status !== "ready_for_visual_proof",
  "Attach must expose both precise/surface pair lanes and must not claim a plain pair is ready.",
);

assert(
  DIRECTOR_CAPABILITIES.length === 183,
  `Phase 1B.5E changed the 183-capability registry: ${DIRECTOR_CAPABILITIES.length}.`,
);
const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
  (counts, capability) => {
    counts[capability.compiler.threejs] =
      (counts[capability.compiler.threejs] ?? 0) + 1;
    return counts;
  },
  {},
);
assert(
  supportCounts.direct === 101 &&
    supportCounts.compound === 65 &&
    supportCounts.approximate === 15 &&
    supportCounts.declared === 2,
  `Phase 1B.5E changed support classifications: ${JSON.stringify(supportCounts)}.`,
);

const library = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
for (const marker of [
  "Phase 1B.5D capability authority path",
  "Phase 1B.5E · real-asset execution qualification",
  "roleAssetOverrides",
  "buildDirectorRealAssetExecutionQualification",
  "Load Asset Library for real-asset proof",
  "Phase 1B.5E qualification report JSON",
  "pair relationships remain proposed",
]) {
  assert(
    library.includes(marker),
    `Director Capability Library is missing Phase 1B.5E marker: ${marker}.`,
  );
}
assert(
  !library.includes("<Canvas"),
  "Phase 1B.5E must not move WebGL Canvas ownership into the capability-library shell.",
);

const preview = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
);
for (const marker of [
  "buildAssetDirectabilityProfile",
  "directability: role.asset",
  "Phase 1B.5E",
]) {
  assert(
    preview.includes(marker),
    `Capability preview is missing real-asset directability bridge marker: ${marker}.`,
  );
}
assert(
  !preview.includes("<Canvas"),
  "Phase 1B.5E capability preview must not introduce another Canvas.",
);

const viewer = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-audit-viewer.tsx",
);
assert(
  (viewer.match(/<Canvas/g) ?? []).length === 1 &&
    viewer.includes('frameloop="demand"') &&
    viewer.includes("Real-asset proof"),
  "Phase 1B.5E must preserve the single demand-rendered controlled/real audit viewer.",
);

const historicalQualification = source(
  "sandbox/probe-lab/directability/ui/directable-asset-qualification-lab.tsx",
);
for (const marker of [
  "Phase 1B.5B.1 inference",
  "Phase 1B.5B.2 hardening",
]) {
  assert(
    historicalQualification.includes(marker),
    `Historical qualification marker disappeared during Phase 1B.5E: ${marker}.`,
  );
}

const readme = source(
  "sandbox/probe-lab/motion-camera-library/README.md",
);
for (const marker of [
  "Phase 1B.5E — real-asset execution qualification bench",
  "scene_instance",
  "single demand-rendered Canvas",
  "Builder validation handoff",
]) {
  assert(
    readme.includes(marker),
    `Motion Camera README is missing Phase 1B.5E concept: ${marker}.`,
  );
}

const phaseDoc = source(
  "sandbox/probe-lab/motion-camera-library/PHASE1B5E_REAL_ASSET_EXECUTION_QUALIFICATION.md",
);
for (const marker of [
  "per-role real-asset selectors",
  "asset/operator qualification",
  "pair qualification",
  "directability profile",
  "does **not**",
]) {
  assert(
    phaseDoc.includes(marker),
    `Phase 1B.5E documentation is missing concept: ${marker}.`,
  );
}

console.log(
  "Director real-asset execution qualification bench Phase 1B.5E verification passed.",
);
console.log(
  "Selectable reviewed GLBs now expose asset/operator/pair readiness before visual review while using the existing single audit viewer.",
);
console.log(
  "Real-asset directability is propagated into the shared Director runtime; pair relationships remain proposed and Builder validation authority is unchanged.",
);
console.log(
  "183-capability support distribution and historical Phase 1B.5B.1/B.2 + Phase 1B.5D regression markers remain protected.",
);
