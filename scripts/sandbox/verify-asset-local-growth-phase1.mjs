import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import path from "node:path";

function projectFile(relativePath) {
  return path.join(
    process.cwd(),
    ...relativePath.split("/"),
  );
}

async function source(relativePath) {
  return readFile(
    projectFile(relativePath),
    "utf8",
  );
}

const [
  blenderPython,
  enrichmentWorker,
  tempWorkspace,
  jobStore,
  blenderBridge,
  paths,
] = await Promise.all([
  source(
    "sandbox/probe-lab/assets/blender/scripts/myway-blender-bridge.py",
  ),
  source(
    "sandbox/probe-lab/assets/enrichment/asset-enrichment-worker.server.ts",
  ),
  source(
    "sandbox/probe-lab/assets/storage/asset-temp-workspace.server.ts",
  ),
  source(
    "sandbox/probe-lab/assets/blender/blender-job-store.server.ts",
  ),
  source(
    "sandbox/probe-lab/assets/blender/blender-bridge.server.ts",
  ),
  source(
    "sandbox/probe-lab/assets/paths.server.ts",
  ),
]);

assert(
  !blenderPython.includes(
    'Path(job["output_path"]).parent / ".blenderkit-download"',
  ),
  "BlenderKit must not place its working download directory beside the public output GLB.",
);
assert(
  blenderPython.includes(
    'create_asset_temp_workspace("blenderkit")',
  ),
  "BlenderKit acquisition must use the OS-temporary MyWay workspace.",
);
assert(
  blenderPython.includes(
    "shutil.rmtree(temp_workspace, ignore_errors=True)",
  ),
  "BlenderKit temporary workspaces must be removed on both failure and completion paths.",
);

assert(
  !enrichmentWorker.includes(
    '"sandbox/probe-lab/assets/enrichment/cache"',
  ),
  "Remote enrichment must not materialize GLBs into the repository cache.",
);
assert(
  enrichmentWorker.includes(
    'createAssetTempWorkspace("enrichment")',
  ),
  "Remote enrichment must hydrate into an OS-temporary workspace.",
);
assert(
  enrichmentWorker.includes(
    "await materialized.cleanup().catch(",
  ),
  "Enrichment must clean temporary hydration in a finally path.",
);
assert(
  !paths.includes(
    '"sandbox/probe-lab/assets/enrichment/cache"',
  ),
  "ensureAssetDirectories must not recreate the retired enrichment cache.",
);

assert(
  tempWorkspace.includes(
    'path.join(os.tmpdir(), "myway-assets")',
  ),
  "Default asset temporary storage must live under the OS temporary directory.",
);
assert(
  tempWorkspace.includes(
    "MYWAY_ASSET_TEMP_ROOT",
  ),
  "The temporary workspace must support an explicit outside-project override.",
);
assert(
  tempWorkspace.includes(
    "MYWAY_ASSET_TEMP_MAX_AGE_HOURS",
  ),
  "The temporary workspace must have stale-workspace retention.",
);

assert(
  jobStore.includes(
    "MYWAY_BLENDER_JOB_HISTORY_LIMIT",
  ),
  "Blender job history needs a bounded terminal-record limit.",
);
assert(
  jobStore.includes(
    "MYWAY_KEEP_BLENDER_JOB_HISTORY",
  ),
  "Blender job history needs an explicit debugging opt-out.",
);
assert(
  blenderBridge.includes(
    "pruneBlenderJobHistory",
  ),
  "The Blender bridge must trigger terminal job-history pruning.",
);

console.log(
  "Phase 1 asset local-growth verification passed.",
);
