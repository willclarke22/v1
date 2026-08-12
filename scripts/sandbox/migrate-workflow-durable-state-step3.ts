
import {
  access,
  readdir,
  readFile,
  rm,
} from "node:fs/promises";
import path from "node:path";
import {
  isDeepStrictEqual,
} from "node:util";
import {
  loadEnvConfig,
} from "@next/env";

loadEnvConfig(
  process.cwd(),
);

const CONFIRMATION =
  "MIGRATE_WORKFLOW_STATE_TO_PRIVATE_R2";

async function exists(
  filePath: string,
) {
  try {
    await access(
      filePath,
    );
    return true;
  }
  catch {
    return false;
  }
}

async function readLocalJson(
  filePath: string,
) {
  return JSON.parse(
    await readFile(
      filePath,
      "utf8",
    ),
  ) as unknown;
}

async function main() {
  const apply =
    process.argv.includes(
      "--apply",
    );

  const confirmation =
    process.argv
      .find(
        (value) =>
          value.startsWith(
            "--confirm=",
          ),
      )
      ?.slice(
        "--confirm=".length,
      );

  if (
    !apply ||
    confirmation !==
      CONFIRMATION
  ) {
    throw new Error(
      `Step 3 migration requires --apply --confirm=${CONFIRMATION}`,
    );
  }

  const [
    cloudJson,
    r2,
    workflow,
    paths,
    sceneValidation,
  ] =
    await Promise.all([
      import(
        "../../sandbox/probe-lab/assets/storage/cloud-json.server"
      ),
      import(
        "../../sandbox/probe-lab/assets/storage/r2-asset-storage.server"
      ),
      import(
        "../../sandbox/probe-lab/assets/storage/workflow-durable-state.server"
      ),
      import(
        "../../sandbox/probe-lab/assets/paths.server"
      ),
      import(
        "../../sandbox/probe-lab/scenes/validate-scene-manifest"
      ),
    ]);

  if (
    !cloudJson
      .cloudAssetMetadataEnabled()
  ) {
    throw new Error(
      "Step 3 requires private R2 metadata mode.",
    );
  }

  const sourceStorage =
    r2.getR2SourceStorage();

  async function directReadJson(
    objectKey: string,
  ) {
    const result =
      await sourceStorage.read(
        objectKey,
      );

    if (!result) {
      return null;
    }

    return JSON.parse(
      Buffer.from(
        result.body,
      ).toString(
        "utf8",
      ),
    ) as unknown;
  }

  async function writeAndVerify(
    objectKey: string,
    value: unknown,
  ) {
    await cloudJson.writeCloudJson(
      objectKey,
      value,
    );

    const verified =
      await directReadJson(
        objectKey,
      );

    if (
      verified == null ||
      !isDeepStrictEqual(
        verified,
        value,
      )
    ) {
      throw new Error(
        `Direct private-R2 verification failed after writing ${objectKey}`,
      );
    }

    return verified;
  }

  const queueLocalPath =
    paths.projectPath(
      paths
        .MYWAY_MISSING_ASSET_QUEUE_PROJECT_PATH,
    );

  const sceneLocalDirectory =
    paths.projectPath(
      paths
        .MYWAY_SCENE_MANIFEST_PROJECT_PATH,
    );

  const queueLocalExists =
    await exists(
      queueLocalPath,
    );

  const localQueue =
    queueLocalExists
      ? await readLocalJson(
          queueLocalPath,
        )
      : null;

  if (
    localQueue != null
  ) {
    const queueRecord =
      localQueue as
        Record<string, unknown>;

    if (
      queueRecord
        .schema_version !==
        "myway_missing_asset_acquisition_queue_v1" ||
      !Array.isArray(
        queueRecord.jobs,
      )
    ) {
      throw new Error(
        "The local missing-asset queue does not match the expected v1 schema.",
      );
    }
  }

  const localSceneNames =
    (
      await readdir(
        sceneLocalDirectory,
      ).catch(
        () => [],
      )
    ).filter(
      (name) =>
        name.endsWith(
          ".json",
        ),
    );

  const localScenes:
    Array<{
      name: string;
      path: string;
      object_key: string;
      value: unknown;
    }> = [];

  for (
    const name of
    localSceneNames
  ) {
    const filePath =
      path.join(
        sceneLocalDirectory,
        name,
      );

    const value =
      await readLocalJson(
        filePath,
      );

    const validated =
      sceneValidation
        .validateSceneManifest(
          value,
        );

    if (!validated.ok) {
      throw new Error(
        `Local saved scene ${name} is invalid: ${validated.errors.join("; ")}`,
      );
    }

    localScenes.push({
      name,
      path:
        filePath,
      object_key:
        workflow.sceneManifestCloudKey(
          validated
            .scene
            .scene_id,
        ),
      value,
    });
  }

  console.log(
    "Step 3 migration preflight:",
  );
  console.log(
    `- Local missing-asset queue: ${queueLocalExists ? "present" : "absent"}`,
  );
  console.log(
    `- Local saved-scene manifests: ${localScenes.length}`,
  );

  const deleteAfterVerification:
    string[] = [];

  // ------------------------------------------------------------------------
  // Queue: never overwrite a different existing R2 document.
  // ------------------------------------------------------------------------

  const existingQueue =
    await directReadJson(
      workflow
        .MYWAY_MISSING_ASSET_QUEUE_CLOUD_KEY,
    );

  if (
    existingQueue != null &&
    localQueue != null &&
    !isDeepStrictEqual(
      existingQueue,
      localQueue,
    )
  ) {
    throw new Error(
      "Private R2 already contains a different missing-asset queue. No local queue was deleted and the existing cloud queue was not overwritten.",
    );
  }

  if (
    existingQueue == null
  ) {
    const queueToWrite =
      localQueue ?? {
        schema_version:
          "myway_missing_asset_acquisition_queue_v1",
        updated_at:
          new Date().toISOString(),
        jobs: [],
      };

    await writeAndVerify(
      workflow
        .MYWAY_MISSING_ASSET_QUEUE_CLOUD_KEY,
      queueToWrite,
    );

    console.log(
      "- Missing-asset queue: uploaded + directly verified",
    );
  }
  else {
    console.log(
      "- Missing-asset queue: identical/private-R2 object already present",
    );
  }

  if (
    queueLocalExists
  ) {
    deleteAfterVerification.push(
      queueLocalPath,
    );
  }

  // ------------------------------------------------------------------------
  // Scenes: plan and verify ALL R2 objects before deleting ANY local scene.
  // ------------------------------------------------------------------------

  for (
    const scene of
    localScenes
  ) {
    const existing =
      await directReadJson(
        scene.object_key,
      );

    if (
      existing != null &&
      !isDeepStrictEqual(
        existing,
        scene.value,
      )
    ) {
      throw new Error(
        `Private R2 already contains a different saved scene at ${scene.object_key}. No local workflow JSON has been deleted.`,
      );
    }

    if (
      existing == null
    ) {
      await writeAndVerify(
        scene.object_key,
        scene.value,
      );
    }

    const verified =
      await directReadJson(
        scene.object_key,
      );

    if (
      verified == null ||
      !isDeepStrictEqual(
        verified,
        scene.value,
      )
    ) {
      throw new Error(
        `Saved scene failed final private-R2 verification: ${scene.object_key}`,
      );
    }
  }

  for (
    const scene of
    localScenes
  ) {
    deleteAfterVerification.push(
      scene.path,
    );
  }

  // ------------------------------------------------------------------------
  // Every migration object has now been directly read from source R2.
  // Local workflow JSON can be removed.
  // ------------------------------------------------------------------------

  for (
    const filePath of
    deleteAfterVerification
  ) {
    await rm(
      filePath,
      {
        force:
          true,
      },
    );
  }

  await rm(
    sceneLocalDirectory,
    {
      recursive:
        false,
      force:
        true,
    },
  ).catch(
    () => undefined,
  );

  console.log(
    `- Verified local workflow JSON removed: ${deleteAfterVerification.length}`,
  );

  // ------------------------------------------------------------------------
  // Runtime cloud-first read verification.
  // ------------------------------------------------------------------------

  cloudJson
    .clearCloudJsonMemoryCache();

  const [
    queueStore,
    sceneStore,
  ] =
    await Promise.all([
      import(
        "../../sandbox/probe-lab/assets/acquisition/missing-asset-store.server"
      ),
      import(
        "../../sandbox/probe-lab/scenes/scene-store.server"
      ),
    ]);

  const runtimeQueue =
    await queueStore
      .loadMissingAssetQueue();

  const runtimeScenes =
    await sceneStore
      .listSceneManifests();

  console.log(
    `- Runtime queue jobs loaded from private R2: ${runtimeQueue.jobs.length}`,
  );
  console.log(
    `- Runtime saved scenes loaded from private R2: ${runtimeScenes.length}`,
  );

  // ------------------------------------------------------------------------
  // Full cloud-authority audit after migration.
  // ------------------------------------------------------------------------

  const {
    runAssetCloudAuthorityAudit,
  } =
    await import(
      "../../sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server"
    );

  const audit =
    await runAssetCloudAuthorityAudit();

  const workflowKeys = [
    workflow
      .MYWAY_MISSING_ASSET_QUEUE_CLOUD_KEY,
    ...(
      await workflow
        .listSceneManifestCloudKeys()
    ),
  ];

  for (
    const objectKey of
    workflowKeys
  ) {
    const check =
      audit.cloud_checks.find(
        (item) =>
          item.bucket ===
            "source" &&
          item.object_key ===
            objectKey,
      );

    if (
      !check ||
      check.classification !==
        "cloud_verified"
    ) {
      throw new Error(
        `Cloud-authority audit did not verify Step 3 workflow object: ${objectKey}`,
      );
    }
  }

  if (
    audit.reconciliation
      .missing_check_count !== 0
  ) {
    throw new Error(
      `Cloud-authority audit has ${audit.reconciliation.missing_check_count} missing expected object(s) after Step 3.`,
    );
  }

  const mismatches =
    audit.summary.cloud
      .cloud_size_mismatch ??
    0;

  if (mismatches !== 0) {
    throw new Error(
      `Cloud-authority audit has ${mismatches} size mismatch(es) after Step 3.`,
    );
  }

  if (
    audit.authority_issues
      .length !== 0
  ) {
    throw new Error(
      `Cloud-authority audit has ${audit.authority_issues.length} authority issue(s) after Step 3.`,
    );
  }

  console.log("");
  console.log(
    "STEP 3 PRIVATE-R2 MIGRATION: PASS",
  );
  console.log(
    `- Source R2 workflow objects verified: ${workflowKeys.length}`,
  );
  console.log(
    `- Missing expected cloud objects: ${audit.reconciliation.missing_check_count}`,
  );
  console.log(
    `- Cloud size mismatches: ${mismatches}`,
  );
  console.log(
    `- Authority issues: ${audit.authority_issues.length}`,
  );
  console.log(
    `- Unreferenced managed cloud objects: ${audit.summary.cloud_unreferenced_objects}`,
  );
  console.log(
    "- R2 deletes performed: 0",
  );
}

main().catch(
  (caught) => {
    console.error(
      caught instanceof Error
        ? caught.stack ??
          caught.message
        : String(
            caught,
          ),
    );

    process.exitCode =
      1;
  },
);
