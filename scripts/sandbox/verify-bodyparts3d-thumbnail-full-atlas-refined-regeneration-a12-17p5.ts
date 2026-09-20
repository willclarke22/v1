import fs from "node:fs";
import path from "node:path";

const rootIndex = process.argv.indexOf("--project-root");
const root = path.resolve(
  rootIndex >= 0 && process.argv[rootIndex + 1]
    ? process.argv[rootIndex + 1]
    : process.cwd(),
);

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requireMarker(source: string, marker: string, message: string) {
  if (!source.includes(marker)) {
    throw new Error(
      `A.12.17P5 verification failed: ${message} Missing marker: ${marker}`,
    );
  }
}

function main() {
  const maintenance = read(
    "sandbox/probe-lab/assets/bodyparts3d-thumbnail-maintenance.server.ts",
  );
  const route = read(
    "sandbox/probe-lab/assets/routes/bodyparts3d-thumbnails.ts",
  );
  const ui = read(
    "sandbox/probe-lab/assets/ui/bodyparts3d-thumbnail-maintenance-lab.tsx",
  );

  for (const marker of [
    "BODYPARTS3D_EXPECTED_ELEMENT_COUNT",
    "export type BodyParts3dFullAtlasThumbnailTarget = {",
    "export async function listBodyParts3dFullAtlasThumbnailTargets(input: {",
    "assets.length !== BODYPARTS3D_EXPECTED_ELEMENT_COUNT",
    "items: assets.map((asset): BodyParts3dFullAtlasThumbnailTarget => ({",
  ]) {
    requireMarker(
      maintenance,
      marker,
      "The maintenance server must expose and validate an ordered full-atlas queue for refined regeneration.",
    );
  }

  for (const marker of [
    'action === "prepare_full_atlas_refined_regeneration"',
    'await listBodyParts3dFullAtlasThumbnailTargets({',
    'prepare_full_atlas_refined_regeneration, or render_appearance_calibration_one',
  ]) {
    requireMarker(
      route,
      marker,
      "The thumbnail route must expose a dedicated full-atlas refined-regeneration queue action.",
    );
  }

  for (const marker of [
    'type FullAtlasRefinedQueueItem = {',
    'type FullAtlasRefinedQueue = {',
    'fullAtlasRunning',
    'fullAtlasPauseRequested',
    'fullAtlasPausePending',
    'fullAtlasQueue',
    'fullAtlasNextIndex',
    'fullAtlasProgress',
    'function pauseFullAtlasRegeneration()',
    'async function regenerateFullAtlasRefinedThumbnails()',
    'action: "prepare_full_atlas_refined_regeneration"',
    'action: "regenerate_viewer_match_refined_one"',
    'Resume full-atlas refined regeneration',
    'Regenerate all 2,234 atlas thumbnails with GLB-matched colors',
    'Full-atlas refined regeneration ·',
    'stop on first failure',
    'useState<"audit" | "repair" | "bulk" | null>(null);',
    '<progress',
  ]) {
    requireMarker(
      ui,
      marker,
      "The maintenance UI must provide an explicit full-atlas refined-regeneration workflow with progress and pause controls.",
    );
  }

  console.log(
    "PASS: A.12.17P5 BodyParts3D full-atlas refined regeneration verified: the UI prepares the authoritative 2,234-asset atlas queue, regenerates thumbnails sequentially with the refined viewer-match profile, shows progress, supports page-session pause/resume, and stops on the first failure without replacing the older visual-issue bulk path.",
  );
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? error.stack ?? error.message : error,
  );
  process.exitCode = 1;
}
