import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  buildActiveDirectorQualificationFamilies,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string): DirectorCapability {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability ${id}.`);
  return found;
}

function main() {
  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  const families = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-families.ts",
  );
  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  const a46 = source(
    "scripts/sandbox/verify-director-attention-sequence-reveal-readability-phase1b7a11a46.ts",
  );
  const a45 = source(
    "scripts/sandbox/verify-asset-identity-director-fixture-stability-phase1b7a11a45.ts",
  );
  const a10b = source(
    "scripts/sandbox/verify-director-qualification-evidence-integrity-phase1b7a10b.ts",
  );

  const causalFamily = buildActiveDirectorQualificationFamilies(
    DIRECTOR_CAPABILITIES,
  ).find(
    (family) =>
      family.category === "narrative_attention" &&
      family.group === "Causal clarity",
  );
  assert(causalFamily, "Active Causal clarity family is missing.");
  assert(
    causalFamily.capability_ids.join("|") === "connect_cause|show_consequence",
    `A.11A.47 must not change Causal-clarity membership: ${causalFamily.capability_ids.join("|")}.`,
  );

  const connectCause = directorCapabilityDemoMoment(capability("connect_cause"));
  assert(connectCause.shot, "Connect cause demo shot is missing.");
  assert(
    connectCause.shot.narrative_job === "connect_cause" &&
      connectCause.shot.camera.movement_steps.some(
        (step) =>
          step.movement === "reframe" &&
          step.target_entity_id === "secondary_subject",
      ) &&
      connectCause.shot.camera.movement_steps.some(
        (step) =>
          step.movement === "track_parallel" &&
          step.target_entity_id === "primary_subject",
      ),
    "Connect cause must preserve its accepted cause -> relationship -> effect camera grammar.",
  );

  const showConsequence = directorCapabilityDemoMoment(
    capability("show_consequence"),
  );
  assert(showConsequence.shot, "Show consequence demo shot is missing.");
  assert(
    showConsequence.shot.narrative_job === "show_consequence" &&
      showConsequence.shot.camera.movement_steps.some(
        (step) =>
          step.movement === "reframe" &&
          step.start_progress === 0.45 &&
          step.end_progress === 0.72 &&
          step.target_entity_id === "secondary_subject",
      ) &&
      showConsequence.shot.camera.movement_steps.some(
        (step) =>
          step.movement === "settle" &&
          step.start_progress === 0.7 &&
          step.end_progress === 1 &&
          step.target_entity_id === "secondary_subject",
      ) &&
      showConsequence.shot.hold_after_ms === 1400,
    "Show consequence production directing grammar must remain reframe -> settle -> hold on the consequence actor.",
  );

  for (const marker of [
    "DIRECTOR_CAUSAL_CONSEQUENCE_CHANGE_START = 0.34",
    "DIRECTOR_CAUSAL_CONSEQUENCE_CHANGE_END = 0.58",
    "DIRECTOR_CAUSAL_CONSEQUENCE_ATTENTION_START = 0.42",
    "DIRECTOR_CAUSAL_CONSEQUENCE_ATTENTION_END = 0.72",
    "function qualificationConsequenceChangeAmount",
    "function qualificationConsequenceAttentionAmount",
    "function qualificationConsequenceProofActors",
    'if (!enabled || capability.id !== "show_consequence") return actors;',
    "A.11A.47: Qualification supplies a small, asset-independent changed end",
    "changedPosition.addScaledVector(direction, displacement * changeAmount);",
    "THREE.MathUtils.degToRad(16) * changeAmount",
    "const qualificationActors = useMemo(",
    "enabled: qualificationVisibilityAssist",
    "qualificationVisibilityAssist={qualificationVisibilityAssist}",
    "actors={qualificationActors}",
    "allActors={qualificationActors}",
    "const consequenceEndpointEmphasis =",
    'color="#facc15"',
    "opacity={0.16 + consequenceAttention * 0.5}",
    "opacity={qualificationProof ? 1 - attentionTransfer * 0.55 : 1}",
  ]) {
    assert(
      preview.includes(marker),
      `A.11A.47 consequence-proof marker missing: ${marker}`,
    );
  }

  const proofStart = preview.indexOf("function qualificationConsequenceProofActors({");
  const actorStart = preview.indexOf("function AnimatedActor({", proofStart);
  assert(
    proofStart >= 0 && actorStart > proofStart,
    "Qualification consequence-proof helper block is missing.",
  );
  const proofBlock = preview.slice(proofStart, actorStart);
  assert(
    proofBlock.includes('capability.id !== "show_consequence"') &&
      !proofBlock.includes('capability.id === "connect_cause"') &&
      !proofBlock.includes('capability.id === "reveal"'),
    "The changed-end-state fixture must be qualification-only and Show-consequence-only.",
  );

  const connectStart = preview.indexOf('if (capability.id === "connect_cause") {');
  const compareStart = preview.indexOf(
    'if (capability.id === "compare" || capability.id === "two_subject_balance")',
    connectStart,
  );
  assert(
    connectStart >= 0 && compareStart > connectStart,
    "Connect cause relationship block is missing.",
  );
  const connectBlock = preview.slice(connectStart, compareStart);
  for (const marker of [
    "const firstEnd = primary.clone().lerp(context, clamp01(progress * 2));",
    "const secondEnd = context.clone().lerp(secondary, clamp01((progress - 0.48) * 2));",
    'color="#38bdf8" lineWidth={4}',
    'color="#f97316" lineWidth={4}',
  ]) {
    assert(
      connectBlock.includes(marker),
      `Connect cause frozen visual marker regressed: ${marker}`,
    );
  }

  assert(
    preview.includes(
      'qualificationVisibilityAssist && capability.id === "show_consequence"',
    ) &&
      preview.includes(
        'consequenceProof && resolvedRole.role === "secondary_subject"',
      ),
    "Show consequence must transfer the qualification attention cue from cause to consequence.",
  );

  // A.11A.46 and prior frozen work stay exact guards in the installer. These
  // semantic lineage checks make accidental removal visible to the new verifier.
  assert(
    runtime.includes(
      "DIRECTOR_ATTENTION_REVEAL_READABILITY_FILL_INTENSITY = 18",
    ) &&
      a46.includes(
        "Director Attention sequence Phase 1B.7A.11A.46 Reveal-readability verification passed.",
      ) &&
      a45.includes(
        "A.11A.45 Asset Identity / Director Fixture Stability verification passed.",
      ),
    "A.11A.47 predecessor lineage is incomplete.",
  );
  assert(
    families.includes('category: "narrative_attention"') ||
      families.includes("return group;"),
    "Qualification-family source unexpectedly changed shape.",
  );
  assert(
    room.includes("qualificationVisibilityAssist") &&
      room.includes('fixtureMode="real_assets"'),
    "Qualification Room must continue to opt real-asset previews into qualification-only assists.",
  );

  // A.10B predates later legitimate support-level reclassifications. Keep its evidence-integrity
  // contract authoritative while making its unrelated support-distribution assertion successor-safe.
  for (const marker of [
    "Successor-safe historical invariant: A.10B owns evidence capture/integrity",
    "DIRECTOR_CAPABILITY_SUPPORT_LEVELS",
    "recognizedSupportKinds",
    "unknownSupportKinds.length === 0",
    "classifiedCapabilityCount === DIRECTOR_CAPABILITIES.length",
  ]) {
    assert(
      a10b.includes(marker),
      `A.11A.47 v1.1 successor-safe A.10B marker missing: ${marker}`,
    );
  }
  assert(
    !a10b.includes("supportCounts.direct === 102") &&
      !a10b.includes("supportCounts.compound === 65") &&
      !a10b.includes("supportCounts.approximate === 15"),
    "A.10B must not re-freeze its obsolete one-time support distribution.",
  );

  console.log(
    "Director Causal clarity Phase 1B.7A.11A.47 consequence-proof verification passed.",
  );
  console.log(
    "Connect cause remains unchanged; Show consequence now receives a Qualification-only changed end state, transfers attention to the secondary actor, reframes to that staged result, and preserves the production reframe/settle/1400 ms hold contract.",
  );
}

main();
