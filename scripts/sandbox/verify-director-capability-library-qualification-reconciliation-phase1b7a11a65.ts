import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityById,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_CAPABILITY_QUALIFICATION_ROLES,
  directorCapabilityQualificationDescriptor,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-qualification";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function role(id: string) {
  const capability = directorCapabilityById(id);
  assert(capability, `Missing Director capability ${id}.`);
  return directorCapabilityQualificationDescriptor(capability);
}

function countMarker(value: string, marker: string) {
  return value.split(marker).length - 1;
}

function main() {
  assert(
    DIRECTOR_CAPABILITIES.length === 184,
    "A.11A.65 must preserve the frozen 184-capability Director vocabulary.",
  );

  const expectedExamples = {
    translate: "qualified_primitive",
    hard_cut: "qualified_primitive",
    crossfade: "qualified_primitive",
    oscillate: "modifier",
    dim_environment: "modifier",
    pivot: "compound",
    flow: "compound",
    introduce: "compound",
    fill: "authored_semantic_operation",
    maintain_axis: "constraint_policy",
    keep_visible: "constraint_policy",
    orient: "merged_alias",
    cutaway: "deferred",
  } as const;

  for (const [id, expectedRole] of Object.entries(expectedExamples)) {
    const descriptor = role(id);
    assert(
      descriptor.role === expectedRole,
      `A.11A.65 ${id} qualification role drifted: expected ${expectedRole}, found ${descriptor.role}.`,
    );
  }

  assert(
    role("orient").canonical_capability_id === "establish",
    "A.11A.65 Orient must remain a merged compatibility alias to Establish.",
  );
  assert(
    role("dim_environment").canonical_capability_id === "spotlight_subject",
    "A.11A.65 Dim environment must retain Spotlight subject as the comparison/canonical target.",
  );
  assert(
    role("crossfade").canonical_mechanism === "two_shot_alpha_composite",
    "A.11A.65 Crossfade must expose the qualified two-shot alpha-composite mechanism.",
  );
  assert(
    role("crossfade").requirements.join("|") ===
      [
        "complete_outgoing_shot_state",
        "complete_incoming_shot_state",
        "simultaneous_two_shot_render_authority",
        "deterministic_image_space_alpha_composite",
      ].join("|"),
    "A.11A.65 Crossfade truthfulness requirements drifted.",
  );
  assert(
    role("preserve_visual_anchor").canonical_mechanism ===
      role("preserve_screen_position").canonical_mechanism &&
      role("preserve_visual_anchor").canonical_mechanism ===
        "screen_anchor_continuity",
    "A.11A.65 Preserve visual anchor and Preserve screen position must share the Qualification screen-anchor mechanism.",
  );
  assert(
    role("preserve_orientation").base_policy_capability_id ===
      "preserve_actor_state",
    "A.11A.65 Preserve orientation must remain based on Preserve actor state.",
  );

  const roles = new Set(
    DIRECTOR_CAPABILITIES.map(
      (capability) => directorCapabilityQualificationDescriptor(capability).role,
    ),
  );
  for (const expectedRole of DIRECTOR_CAPABILITY_QUALIFICATION_ROLES) {
    assert(
      roles.has(expectedRole),
      `A.11A.65 library descriptor is missing qualification role ${expectedRole}.`,
    );
  }

  const library = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
  );
  for (const marker of [
    "Level 2 · Director Execution Vocabulary",
    "Director execution vocabulary",
    "Qualification taxonomy",
    "All qualification roles",
    "Qualification role",
    "Canonical mechanism",
    "Director components",
    "Real-asset execution & directability",
    "Director capabilities reviewed",
  ]) {
    assert(
      library.includes(marker),
      `A.11A.65 Capability Library reconciliation marker missing: ${marker}`,
    );
  }
  for (const staleMarker of [
    "Level 2 · Atomic Execution",
    "atomic capabilities reviewed",
    "Atomic Director capabilities:",
  ]) {
    assert(
      !library.includes(staleMarker),
      `A.11A.65 Capability Library still exposes stale atomic wording: ${staleMarker}`,
    );
  }
  assert(
    !library.includes('from "@react-three/fiber"') &&
      !library.includes("<Canvas"),
    "A.11A.65 Capability Library shell must remain metadata/DOM-only and must not mount its own WebGL canvas.",
  );
  assert(
    library.includes('const DirectorQualificationRoom = dynamic(') &&
      library.includes('if (activeTab === "qualification")') &&
      library.includes("<AtomicDirectorCapabilityLibraryLab"),
    "A.11A.65 must preserve lazy, mutually exclusive Capability Library / Qualification Room mounting.",
  );

  const auditViewer = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-audit-viewer.tsx",
  );
  assert(
    countMarker(auditViewer, "<Canvas") === 1,
    "A.11A.65 DirectorAuditViewer must continue to own exactly one real-asset WebGL Canvas.",
  );
  assert(
    auditViewer.includes("single WebGL viewer"),
    "A.11A.65 DirectorAuditViewer must document the single-WebGL architecture.",
  );

  const descriptorSource = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-qualification.ts",
  );
  assert(
    !descriptorSource.includes("@react-three") &&
      !descriptorSource.includes("<Canvas") &&
      !descriptorSource.includes("useFrame("),
    "A.11A.65 qualification descriptors must remain lightweight metadata with no WebGL/runtime hooks.",
  );

  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  assert(
    preview.includes('capability.id === "crossfade" ? (') &&
      !preview.includes(
        'capability.id === "crossfade" && qualificationVisibilityAssist',
      ) &&
      preview.includes("<DirectorShotCrossfadeCompositor") &&
      preview.includes("A.11A.65"),
    "A.11A.65 Capability Library and Qualification Room must share the qualified Crossfade compositor without enabling all Qualification-only visual assists.",
  );

  console.log(
    "A.11A.65 Capability Library reconciliation verified: Qualification taxonomy is visible/filterable, Crossfade uses the shared qualified compositor, and the library remains a single-WebGL selected-capability workbench.",
  );
}

main();
