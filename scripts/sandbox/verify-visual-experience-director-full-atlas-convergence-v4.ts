import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildVisualExperienceDirectorAuthoringManifest,
  VISUAL_EXPERIENCE_DIRECTOR_MANIFEST_VERSION,
} from "../../sandbox/probe-lab/visual-experience/director-authoring-manifest";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function normalizedProse(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function main() {
  const request = source(
    "sandbox/probe-lab/visual-experience/visual-learning-turn-request.ts",
  );
  const resolver = source(
    "sandbox/probe-lab/visual-experience/resolve-visual-learning-turn-assets.server.ts",
  );
  const turn = source(
    "sandbox/probe-lab/visual-experience/visual-learning-turn.ts",
  );
  const layout = source(
    "sandbox/probe-lab/visual-experience/ui/scene-player/semantic-scene-layout.ts",
  );
  const adapter = source(
    "sandbox/probe-lab/visual-experience/ui/scene-player/shared-director-runtime-adapter.ts",
  );
  const canvas = source(
    "sandbox/probe-lab/visual-experience/ui/scene-player/semantic-scene-canvas.tsx",
  );
  const lab = source(
    "sandbox/probe-lab/visual-experience/ui/visual-experience-lab.tsx",
  );
  const readme = source(
    "sandbox/probe-lab/visual-experience/README.md",
  );
  const phase1b5a = source(
    "scripts/sandbox/verify-director-runtime-convergence-phase1b5a.ts",
  );
  const phase1b5d = source(
    "scripts/sandbox/verify-capability-vocabulary-authority-phase1b5d.ts",
  );
  const bodypartsA125 = source(
    "scripts/sandbox/verify-bodyparts3d-full-atlas-needs-review.ts",
  );
  const assetLibraryA1212 = source(
    "scripts/sandbox/verify-asset-library-catalog-virtualization-a12-12.ts",
  );

  for (const marker of [
    'root_problem: "what is keeping the learner stuck"',
    'target_takeaway: "one mental model this turn should build"',
    "learner_facing_prompt.full_prompt is the source of truth",
    "scene.director_plan is primary",
  ]) {
    assert(
      request.includes(marker),
      `Visual Experience lost its learner-intelligence spine: ${marker}`,
    );
  }

  const manifest = buildVisualExperienceDirectorAuthoringManifest({
    learner_message: "Why does rotating the hip inward change where the knee points?",
    preferred_style: "visual_description",
    asset_collection_mode: "bodyparts3d_full_atlas",
  });
  assert(
    manifest.schema_version === VISUAL_EXPERIENCE_DIRECTOR_MANIFEST_VERSION,
    "Director manifest schema version mismatch.",
  );
  assert(manifest.capabilities.length > 0, "Director manifest is empty.");
  assert(
    manifest.counts.global_authorable >= manifest.capabilities.length &&
      manifest.counts.palette_count === manifest.capabilities.length &&
      manifest.counts.palette_count <= manifest.counts.palette_hard_max,
    "Director manifest palette/count accounting drifted.",
  );
  assert(
    manifest.capabilities.length > 0 &&
      manifest.capabilities.every(
        (item) => item.authoring_status === "production_active",
      ),
    "Director manifest palette must contain only production-active capabilities.",
  );
  assert(
    manifest.policy.model_never_authors_camera_xyz === true &&
      manifest.policy.model_never_authors_asset_ids === true &&
      manifest.policy.internal_asset_qualification_exposed === false &&
      manifest.policy.internal_pair_interaction_exposed === false &&
      manifest.policy.internal_builder_placement_exposed === false,
    "Director manifest crossed a MyWay-owned execution authority boundary.",
  );

  for (const marker of [
    "director_authoring_manifest: directorAuthoringManifest",
    "turn-specific production-active capability palette derived from the canonical Director registry",
    'asset_collection_mode?: "bodyparts3d_slp_pilot" | "bodyparts3d_full_atlas" | null',
    "preserve_relative_anatomical_placement: true",
  ]) {
    assert(request.includes(marker), `Model request integration missing: ${marker}`);
  }

  for (const marker of [
    "BODYPARTS3D_FULL_COLLECTION_ID",
    'options.sandbox_asset_collection_mode === "bodyparts3d_full_atlas"',
    "findSandboxBodyParts3dCollectionAsset",
    "canonical collection-space metadata was preserved",
    "collection_membership: asset.collection_membership",
  ]) {
    assert(resolver.includes(marker), `Full-atlas resolver marker missing: ${marker}`);
  }

  for (const marker of [
    "collection_membership?: {",
    'runtime_collection_space: "glb_y_up_meters"',
    "runtime_transform:",
  ]) {
    assert(turn.includes(marker), `Render binding collection contract missing: ${marker}`);
    assert(layout.includes(marker), `Prepared-scene collection contract missing: ${marker}`);
  }

  for (const marker of [
    "buildVisualExperienceDirectorRuntimeContext",
    'status: "shared_runtime_primary"',
    "directorSceneStateBeforeMoment",
    "sampleDirectorActorState",
    "collection_membership?.runtime_transform.position",
  ]) {
    assert(adapter.includes(marker), `Shared-runtime adapter marker missing: ${marker}`);
  }

  for (const marker of [
    "DirectorShotCameraController",
    "DirectorShotLightingRig",
    "directorSample",
    "Shared Director runtime",
    "enabled={!directorRuntime && !isPlaying}",
  ]) {
    assert(canvas.includes(marker), `Visual Experience primary runtime marker missing: ${marker}`);
  }

  for (const marker of [
    "BodyParts3D full atlas · 2,234 elements",
    "Full-atlas anatomy proof",
    'asset_collection_mode: "bodyparts3d_full_atlas"',
  ]) {
    assert(lab.includes(marker), `Visual Experience lab full-atlas control missing: ${marker}`);
  }

  const readmeProse = normalizedProse(readme);
  for (const marker of [
    "learner message -> diagnosis -> learning_focus.root_problem -> target_takeaway -> full_prompt",
    "shared Director V2 / Universal Motion Program runtime",
    "full 2,234-element atlas",
  ]) {
    assert(
      readmeProse.includes(marker),
      `Visual Experience README convergence invariant missing after whitespace normalization: ${marker}`,
    );
  }

  for (const [label, verifier] of [
    ["Phase 1B.5A", phase1b5a],
    ["Phase 1B.5D", phase1b5d],
  ] as const) {
    assert(
      verifier.includes(
        'const supportKinds = ["direct", "compound", "approximate", "declared"] as const;',
      ) &&
        verifier.includes("unknownSupportKinds.length === 0") &&
        verifier.includes("accountedSupportCount") &&
        !verifier.includes("supportCounts.direct === 102") &&
        !verifier.includes("supportCounts.compound === 65") &&
        !verifier.includes("supportCounts.approximate === 15"),
      `${label} must remain successor-safe for truthful Director support reclassification.`,
    );
  }


  assert(
    bodypartsA125.includes('const browser = read("sandbox/probe-lab/assets/routes/library-browser.ts");') &&
      bodypartsA125.includes('"const DEFAULT_LIMIT = 30;"') &&
      bodypartsA125.includes('"const MAX_LIMIT = 60;"') &&
      bodypartsA125.includes('"function AssetCardThumbnail({ asset }"') &&
      bodypartsA125.includes('forbidMarker(library, marker, "Legacy special-case atlas browsing must remain retired') &&
      !bodypartsA125.includes('"showBodyParts3dFullCards",\n  "Collapse atlas element cards"'),
    "Historical A.12.5 BodyParts3D verifier must remain successor-safe for the A.12.9/A.12.12 scalable browser migration.",
  );

  for (const marker of [
    "const DEFAULT_LIMIT = 30;",
    "const MAX_LIMIT = 60;",
    "BROWSER_INDEX_TTL_MS = 5 * 60_000",
    "function browserCardSummary(asset: ListedAsset)",
    "function AssetCardThumbnail({ asset }",
  ]) {
    assert(
      assetLibraryA1212.includes(marker),
      `A.12.12 virtualization successor invariant missing: ${marker}`,
    );
  }

  console.log(
    "PASS: Visual Experience Director/full-atlas convergence V4 verified.",
  );
  console.log(
    `Director palette: ${manifest.counts.palette_count}/${manifest.counts.global_production_active} production-active capabilities selected from ${manifest.counts.global_authorable} authorable capabilities.`,
  );
}

main();
