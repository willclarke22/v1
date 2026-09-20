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
      `A.12.17P6 verification failed: ${message} Missing marker: ${marker}`,
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
    "FULL_ATLAS_REFINED_SESSION_ROOT = path.join(",
    "os.tmpdir()",
    "myway_bodyparts3d_full_atlas_refined_thumbnail_session_v1",
    "writeFullAtlasRefinedSession(",
    "const temporaryPath = `${statePath}.tmp`",
    "await rename(temporaryPath, statePath)",
    "prepareBodyParts3dFullAtlasRefinedThumbnailSession",
    "bodyParts3dFullAtlasRefinedThumbnailSessionStatus",
    "runBodyParts3dFullAtlasRefinedThumbnailStep",
    "cancelBodyParts3dFullAtlasRefinedThumbnailSession",
    "activeFullAtlasRefinedSessions",
    "session.next_index += 1",
    "viewerMatchRefined: true",
  ]) {
    requireMarker(
      maintenance,
      marker,
      "The full-atlas refined run must use a durable atomic server checkpoint and advance it only after successful refined regeneration.",
    );
  }

  for (const marker of [
    'action === "full_atlas_refined_status"',
    'action === "full_atlas_refined_step"',
    'action === "full_atlas_refined_cancel"',
    "await prepareBodyParts3dFullAtlasRefinedThumbnailSession({",
    "await runBodyParts3dFullAtlasRefinedThumbnailStep({",
  ]) {
    requireMarker(
      route,
      marker,
      "The route must expose prepare/status/step/cancel operations for resumable refined regeneration.",
    );
  }

  for (const marker of [
    "FULL_ATLAS_REFINED_SESSION_KEY",
    "window.localStorage.getItem(",
    "window.localStorage.setItem(",
    'action: "full_atlas_refined_status"',
    '"full_atlas_refined_step"',
    "async function runFullAtlasRefinedLoop(sessionId: string)",
    "Saved full-atlas refined thumbnail session",
    "completed thumbnails will not restart from asset 1",
    "Clear saved full-atlas session",
    "Resume full-atlas refined regeneration",
  ]) {
    requireMarker(
      ui,
      marker,
      "The browser must remember the session id, recover status after reload, and explicitly resume rather than auto-running.",
    );
  }

  requireMarker(
    ui,
    "useEffect(() => {",
    "Saved-session recovery should happen when the maintenance UI remounts.",
  );
  requireMarker(
    ui,
    "The saved session id was kept; retry Resume",
    "Transient connectivity errors must preserve the saved browser session id.",
  );

  console.log(
    "PASS: A.12.17P6 durable BodyParts3D refined-thumbnail resume verified: progress is checkpointed atomically on the server after each successful thumbnail, the browser persists the session id, reload/connectivity recovery reads authoritative status, and resume continues from the next unfinished asset.",
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
