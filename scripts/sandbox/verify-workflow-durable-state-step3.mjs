
import {
  readFile,
} from "node:fs/promises";

async function source(
  path,
) {
  return readFile(
    path,
    "utf8",
  );
}

function requireText(
  text,
  needle,
  message,
) {
  if (
    !text.includes(
      needle,
    )
  ) {
    throw new Error(
      `Step 3 verifier failed: ${message}`,
    );
  }
}

const [
  workflow,
  queue,
  scenes,
  library,
  audit,
  migration,
] =
  await Promise.all([
    source(
      "sandbox/probe-lab/assets/storage/workflow-durable-state.server.ts",
    ),
    source(
      "sandbox/probe-lab/assets/acquisition/missing-asset-store.server.ts",
    ),
    source(
      "sandbox/probe-lab/scenes/scene-store.server.ts",
    ),
    source(
      "sandbox/probe-lab/assets/asset-library.server.ts",
    ),
    source(
      "sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server.ts",
    ),
    source(
      "scripts/sandbox/migrate-workflow-durable-state-step3.ts",
    ),
  ]);

requireText(
  workflow,
  "metadata/myway/workflows/missing-asset-queue-v1.json",
  "private R2 missing-asset queue key is absent",
);

requireText(
  workflow,
  "metadata/myway/scenes/manifests/",
  "private R2 scene-manifest prefix is absent",
);

requireText(
  workflow,
  "getR2SourceStorage().list",
  "scene manifests are not enumerated from source R2",
);

requireText(
  queue,
  "workflowDurableStateCloudEnabled()",
  "missing-asset queue has no cloud-authority branch",
);

requireText(
  queue,
  "readWorkflowCloudJson",
  "missing-asset queue is not read from private R2",
);

requireText(
  queue,
  "writeWorkflowCloudJson",
  "missing-asset queue is not written to private R2",
);

if (
  queue.indexOf(
    "workflowDurableStateCloudEnabled()",
  ) >
  queue.indexOf(
    'process.env.VERCEL === "1"',
  )
) {
  throw new Error(
    "Step 3 verifier failed: Vercel ephemeral state would run before private-R2 authority.",
  );
}

requireText(
  scenes,
  "sceneManifestCloudKey",
  "saved scene storage does not use private R2 object keys",
);

requireText(
  scenes,
  "listSceneManifestCloudKeys",
  "saved scene listing does not use private R2",
);

requireText(
  library,
  "collectWorkflowCloudReferenceMutations",
  "asset rename/repair does not collect cloud workflow references",
);

requireText(
  library,
  "rollbackWorkflowCloudReferenceMutation",
  "asset rename/repair lacks workflow-state rollback",
);

requireText(
  audit,
  "MYWAY_MISSING_ASSET_QUEUE_CLOUD_KEY",
  "cloud-authority audit does not expect the queue object",
);

requireText(
  audit,
  "MYWAY_SCENE_MANIFEST_CLOUD_PREFIX",
  "cloud-authority audit does not recognize saved scene objects",
);

requireText(
  migration,
  "isDeepStrictEqual",
  "migration does not compare existing/local JSON before overwrite",
);

requireText(
  migration,
  "sourceStorage.read",
  "migration lacks direct private-R2 read verification",
);

requireText(
  migration,
  "deleteAfterVerification",
  "local deletion is not gated behind verification",
);

requireText(
  migration,
  "R2 deletes performed: 0",
  "migration does not declare its non-deleting R2 boundary",
);

console.log(
  "Step 3 workflow durable-state source verification passed.",
);
