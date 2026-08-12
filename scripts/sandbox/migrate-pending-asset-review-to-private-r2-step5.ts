import {
  createHash,
} from "node:crypto";
import {
  loadEnvConfig,
} from "@next/env";

loadEnvConfig(
  process.cwd(),
);

const CONFIRMATION =
  "MIGRATE_PENDING_ASSET_REVIEW_TO_PRIVATE_R2";

function hashBytes(
  bytes: Uint8Array,
) {
  return createHash("sha256")
    .update(Buffer.from(bytes))
    .digest("hex");
}

async function main() {
  const apply =
    process.argv.includes("--apply");

  const confirmation =
    process.argv
      .find((value) =>
        value.startsWith("--confirm="),
      )
      ?.slice("--confirm=".length);

  if (
    !apply ||
    confirmation !== CONFIRMATION
  ) {
    throw new Error(
      `Step 5 migration requires --apply --confirm=${CONFIRMATION}`,
    );
  }

  const [
    library,
    pending,
    durable,
    auditModule,
  ] = await Promise.all([
    import("../../sandbox/probe-lab/assets/asset-library.server"),
    import("../../sandbox/probe-lab/assets/storage/pending-asset-storage.server"),
    import("../../sandbox/probe-lab/assets/storage/asset-durable-artifacts.server"),
    import("../../sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server"),
  ]);

  if (!durable.durableAssetCloudEnabled()) {
    throw new Error(
      "Step 5 migration requires the configured runtime + source R2 environment.",
    );
  }

  const before =
    await library.listMyWayAssets();

  const approvedLocal =
    before.filter(
      (asset) =>
        asset.asset_type !== "primitive" &&
        asset.status !== "rejected" &&
        asset.storage_provider === "local" &&
        asset.scene_review_status === "approved",
    );

  if (approvedLocal.length) {
    console.error(
      "Approved local assets require explicit review before Step 5:",
    );
    for (const asset of approvedLocal) {
      console.error(
        `- ${asset.asset_id}: ${asset.public_path}`,
      );
    }
    throw new Error(
      "Step 5 refuses to convert an already scene-approved local asset into private pending review storage.",
    );
  }

  const candidates =
    before.filter(
      (asset) =>
        asset.asset_type !== "primitive" &&
        asset.status !== "rejected" &&
        asset.storage_provider === "local" &&
        asset.scene_review_status === "pending",
    );

  console.log("Step 5 migration preflight:");
  console.log(
    `- Local pending candidates: ${candidates.length}`,
  );
  console.log(
    `- Existing private pending candidates: ${
      before.filter(
        (asset) =>
          asset.storage_provider === "r2_private_pending",
      ).length
    }`,
  );

  let migrated = 0;
  let reusedExistingObjects = 0;

  for (const asset of candidates) {
    const stage =
      await pending.stageLocalAssetAsPrivatePending(
        asset,
      );

    if (!stage.staged) {
      throw new Error(
        `Expected candidate to stage to private R2: ${asset.asset_id}`,
      );
    }

    reusedExistingObjects +=
      Math.max(
        0,
        (stage.asset.thumbnail_object_key ? 2 : 1) -
          stage.created_object_keys.length,
      );

    let registryUpdated = false;

    try {
      const updated =
        await library.updateMyWayAsset(
          asset.asset_id,
          stage.asset,
        );

      registryUpdated = true;

      if (
        updated.storage_provider !== "r2_private_pending" ||
        !updated.storage_object_key
      ) {
        throw new Error(
          `Registry did not persist private pending state for ${asset.asset_id}.`,
        );
      }

      const model =
        await pending.readPendingAssetReviewObject(
          updated,
          "model",
        );

      if (!model) {
        throw new Error(
          `Private pending model disappeared after registry update: ${asset.asset_id}`,
        );
      }

      const remoteHash =
        hashBytes(model.body);

      if (
        updated.content_hash &&
        remoteHash !== updated.content_hash
      ) {
        throw new Error(
          `Private pending model hash mismatch after registry update: ${asset.asset_id}`,
        );
      }

      if (
        updated.thumbnail_storage_provider ===
          "r2_private_pending"
      ) {
        const thumbnail =
          await pending.readPendingAssetReviewObject(
            updated,
            "thumbnail",
          );

        if (!thumbnail) {
          throw new Error(
            `Private pending thumbnail disappeared after registry update: ${asset.asset_id}`,
          );
        }
      }

      const cleanup =
        await pending.cleanupLocalPendingStageFiles(
          stage,
        );

      if (cleanup.failed.length) {
        throw new Error(
          `Private R2 migration succeeded for ${asset.asset_id}, but one or more redundant local files could not be removed.`,
        );
      }

      migrated += 1;
      console.log(
        `- Migrated + verified: ${asset.asset_id}`,
      );
    }
    catch (caught) {
      if (!registryUpdated) {
        await pending
          .rollbackPrivatePendingStage(stage)
          .catch(() => undefined);
      }
      throw caught;
    }
  }

  const after =
    await library.listMyWayAssets();

  const remainingLocalPending =
    after.filter(
      (asset) =>
        asset.asset_type !== "primitive" &&
        asset.status !== "rejected" &&
        asset.storage_provider === "local" &&
        asset.scene_review_status === "pending",
    );

  if (remainingLocalPending.length) {
    throw new Error(
      `Step 5 left ${remainingLocalPending.length} local pending candidate(s).`,
    );
  }

  const privatePending =
    after.filter(
      (asset) =>
        asset.storage_provider === "r2_private_pending",
    );

  for (const asset of privatePending) {
    if (
      !(await pending.pendingAssetReviewObjectExists(
        asset,
        "model",
      ))
    ) {
      throw new Error(
        `Private pending model is missing after Step 5: ${asset.asset_id}`,
      );
    }

    if (
      asset.thumbnail_storage_provider ===
        "r2_private_pending" &&
      !(await pending.pendingAssetReviewObjectExists(
        asset,
        "thumbnail",
      ))
    ) {
      throw new Error(
        `Private pending thumbnail is missing after Step 5: ${asset.asset_id}`,
      );
    }
  }

  const audit =
    await auditModule.runAssetCloudAuthorityAudit();

  const missing =
    audit.reconciliation.missing_check_count;

  const mismatches =
    audit.summary.cloud.cloud_size_mismatch ?? 0;

  if (missing !== 0) {
    throw new Error(
      `Cloud-authority audit has ${missing} missing expected object(s) after Step 5.`,
    );
  }

  if (mismatches !== 0) {
    throw new Error(
      `Cloud-authority audit has ${mismatches} cloud size mismatch(es) after Step 5.`,
    );
  }

  if (audit.authority_issues.length !== 0) {
    throw new Error(
      `Cloud-authority audit has ${audit.authority_issues.length} authority issue(s) after Step 5.`,
    );
  }

  console.log("");
  console.log("STEP 5 PRIVATE-PENDING MIGRATION: PASS");
  console.log(
    `- Candidates migrated this run: ${migrated}`,
  );
  console.log(
    `- Existing identical pending objects reused: ${reusedExistingObjects}`,
  );
  console.log(
    `- Private pending assets now: ${privatePending.length}`,
  );
  console.log(
    `- Remaining local pending assets: ${remainingLocalPending.length}`,
  );
  console.log(
    `- Missing expected cloud objects: ${missing}`,
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
    "- R2 deletes performed by successful migration: 0",
  );
}

main().catch(
  (caught) => {
    console.error(
      caught instanceof Error
        ? caught.stack ?? caught.message
        : String(caught),
    );
    process.exitCode = 1;
  },
);
