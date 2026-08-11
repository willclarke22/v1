import {
  readFile,
} from "node:fs/promises";
import path from "node:path";

import type {
  MyWayAssetRecord,
  MyWayAssetRegistryV2,
} from "../asset-types";
import {
  AMBIENTCG_CLOUD_KEYS,
} from "../catalog/ambientcg/ambientcg-store.server";
import {
  projectPath,
  publicUrlToProjectPath,
} from "../paths.server";
import {
  auditHistoricalLocalAssetStorage,
} from "./asset-historical-cleanup.server";
import {
  buildCloudGapRepairPlan,
} from "./asset-cloud-gap-repair.server";
import {
  durableAssetCloudEnabled,
  durableJsonCloudKey,
  durableJsonLocalPath,
  runtimeObjectKeyFromPublicUrl,
} from "./asset-durable-artifacts.server";
import {
  getR2RuntimeStorage,
  getR2SourceStorage,
} from "./r2-asset-storage.server";

const ASSET_REGISTRY_KEY =
  "metadata/myway/assets/registry-v2.json";
const CLOUD_MIGRATION_KEY =
  "metadata/myway/assets/cloud-migration-v1.json";
const FOUNDRY_CANDIDATE_PREFIX =
  "metadata/myway/foundry/candidates/";

const FIXED_SOURCE_METADATA_KEYS = [
  ASSET_REGISTRY_KEY,
  CLOUD_MIGRATION_KEY,
  ...Object.values(
    AMBIENTCG_CLOUD_KEYS,
  ),
] as const;

type AuditBucket =
  | "runtime"
  | "source";

export type AssetCloudAuthorityClassification =
  | "cloud_verified"
  | "cloud_size_mismatch"
  | "cloud_missing_local_repair_available"
  | "cloud_missing_no_repair_source"
  | "cloud_unreferenced_managed_object"
  | "ambiguous_reference"
  | "approved_asset_not_cloud_backed"
  | "local_duplicate_safe_to_remove"
  | "git_tracked_generated_mirror"
  | "local_only_or_retained"
  | "local_needs_review";

export type AssetCloudAuthorityObjectCheck = {
  classification:
    AssetCloudAuthorityClassification;
  bucket: AuditBucket;
  object_key: string;
  category: string;
  owner_id: string | null;
  expected_bytes: number | null;
  actual_bytes: number | null;
  local_repair_available: boolean;
  reason: string;
};

export type AssetCloudAuthorityIssue = {
  classification:
    | "ambiguous_reference"
    | "approved_asset_not_cloud_backed";
  category: string;
  owner_id: string | null;
  detail: string;
};

export type AssetCloudAuthorityLocalItem = {
  classification:
    | "local_duplicate_safe_to_remove"
    | "git_tracked_generated_mirror"
    | "local_only_or_retained"
    | "local_needs_review";
  phase3_classification:
    "safe_to_remove" | "keep" | "needs_review";
  category: string;
  project_path: string;
  bytes: number;
  file_count: number;
  asset_id: string | null;
  candidate_id: string | null;
  reason: string;
};

type ExpectedObject = {
  bucket: AuditBucket;
  object_key: string;
  category: string;
  owner_id: string | null;
  expected_bytes: number | null;
};

type PrefixExpectation = {
  bucket: "runtime";
  prefix: string;
  category: string;
  owner_id: string | null;
  local_reference: string | null;
};

function expectedId(
  bucket: AuditBucket,
  objectKey: string,
) {
  return `${bucket}:${objectKey}`;
}

function parseJson(
  bytes: Uint8Array,
) {
  return JSON.parse(
    Buffer.from(bytes)
      .toString("utf8"),
  ) as unknown;
}

async function localFileExists(
  reference: string,
) {
  try {
    await readFile(
      durableJsonLocalPath(reference),
    );
    return true;
  } catch {
    return false;
  }
}

function addExpected(
  map: Map<string, ExpectedObject>,
  value: ExpectedObject,
) {
  const id = expectedId(
    value.bucket,
    value.object_key,
  );
  if (!map.has(id)) {
    map.set(id, value);
  }
}

function bucketForObjectKey(
  objectKey: string,
): AuditBucket | null {
  if (objectKey.startsWith("runtime/")) {
    return "runtime";
  }
  if (
    objectKey.startsWith("metadata/") ||
    objectKey.startsWith("source/")
  ) {
    return "source";
  }
  return null;
}

function collectCloudReferences(
  value: unknown,
  input: {
    expected:
      Map<string, ExpectedObject>;
    prefixExpectations:
      PrefixExpectation[];
    category: string;
    ownerId: string | null;
  },
  propertyName = "",
) {
  if (typeof value === "string") {
    const runtimeKey =
      runtimeObjectKeyFromPublicUrl(
        value,
      );
    if (runtimeKey) {
      if (
        /^public[_-]?root$/i.test(
          propertyName,
        )
      ) {
        const prefix =
          `${runtimeKey.replace(/\/+$/g, "")}/`;
        const duplicate =
          input.prefixExpectations.some(
            (item) =>
              item.bucket === "runtime" &&
              item.prefix === prefix &&
              item.category ===
                input.category &&
              item.owner_id ===
                input.ownerId,
          );
        if (!duplicate) {
          input.prefixExpectations.push({
            bucket: "runtime",
            prefix,
            category:
              input.category,
            owner_id:
              input.ownerId,
            local_reference:
              null,
          });
        }
        return;
      }

      addExpected(
        input.expected,
        {
          bucket: "runtime",
          object_key:
            runtimeKey,
          category:
            input.category,
          owner_id:
            input.ownerId,
          expected_bytes:
            null,
        },
      );
      return;
    }

    const propertySuggestsObjectKey =
      /object[_-]?key$/i.test(
        propertyName,
      ) ||
      /object[_-]?keys$/i.test(
        propertyName,
      );

    if (
      propertySuggestsObjectKey
    ) {
      const bucket =
        bucketForObjectKey(
          value,
        );
      if (bucket) {
        addExpected(
          input.expected,
          {
            bucket,
            object_key:
              value,
            category:
              input.category,
            owner_id:
              input.ownerId,
            expected_bytes:
              null,
          },
        );
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCloudReferences(
        item,
        input,
        propertyName,
      );
    }
    return;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    for (const [key, item] of
      Object.entries(
        value as Record<
          string,
          unknown
        >,
      )) {
      collectCloudReferences(
        item,
        input,
        key,
      );
    }
  }
}

function durableReferences(
  asset: MyWayAssetRecord,
) {
  const references:
    Array<{
      reference: string;
      category: string;
    }> = [];

  if (
    asset.license_record_path &&
    !/^https?:\/\//i.test(
      asset.license_record_path,
    )
  ) {
    references.push({
      reference:
        asset.license_record_path,
      category:
        "asset_license",
    });
  }

  if (
    asset.asset_type !==
    "primitive"
  ) {
    references.push({
      reference:
        `sandbox/probe-lab/assets/library/source-records/${asset.asset_id}.json`,
      category:
        "asset_source_record",
    });
  }

  if (
    asset.appearance_embedding?.status ===
      "ready" &&
    asset.appearance_embedding.vector_key
  ) {
    references.push({
      reference:
        asset.appearance_embedding
          .vector_key,
      category:
        "asset_embedding",
    });
  }

  return references;
}

function approvedForRuntime(
  asset: MyWayAssetRecord,
) {
  return (
    asset.asset_type !==
      "primitive" &&
    asset.status !==
      "rejected" &&
    asset.scene_review_status ===
      "approved" &&
    asset.semantic_review_status ===
      "verified" &&
    asset.safe_to_use_in_sandbox
  );
}

async function localReferenceExists(
  reference: string | null,
) {
  if (
    !reference ||
    /^https?:\/\//i.test(
      reference,
    )
  ) {
    return false;
  }

  try {
    const filePath =
      reference.startsWith(
        "/sandbox-assets/myway/",
      )
        ? publicUrlToProjectPath(
            reference,
          )
        : path.isAbsolute(
              reference,
            )
          ? reference
          : projectPath(
              ...reference
                .replace(/\\/g, "/")
                .split("/")
                .filter(Boolean),
            );

    const { stat } =
      await import(
        "node:fs/promises"
      );
    const info =
      await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}


type LegacyCloudCandidate = {
  object_key: string;
  category_hint: string;
  identity_tokens: string[];
};

type CloudGapReconciliationItem = {
  bucket: AuditBucket;
  object_key: string;
  category: string;
  owner_id: string | null;
  local_repair_available: boolean;
  existing_repair_plan_covered: boolean;
  preferred_recovery:
    | "legacy_r2_rekey"
    | "local_repair"
    | "manual_review"
    | "unresolved";
  legacy_r2_candidates: string[];
  reason: string;
};

function normalizeIdentityToken(
  value: string,
) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/\.review\.json$/i, "")
    .replace(/\.json$/i, "")
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function objectKeyIdentityToken(
  objectKey: string,
) {
  return normalizeIdentityToken(
    path.basename(objectKey),
  );
}

function categoryHintForSourceKey(
  objectKey: string,
) {
  if (
    objectKey.startsWith(
      "metadata/myway/assets/embeddings/",
    )
  ) {
    return "asset_embedding";
  }
  if (
    objectKey.startsWith(
      "metadata/myway/assets/licenses/",
    )
  ) {
    return "asset_license";
  }
  if (
    objectKey.startsWith(
      "metadata/myway/assets/source-records/",
    )
  ) {
    return "asset_source_record";
  }
  if (
    objectKey.startsWith(
      "metadata/ambientcg/",
    )
  ) {
    return "ambientcg_reference";
  }
  if (
    objectKey.startsWith(
      "metadata/myway/foundry/",
    )
  ) {
    return "foundry_reference";
  }
  if (objectKey.startsWith("source/")) {
    return "source_archive";
  }
  return "source_other";
}

function categoriesCanReconcile(
  missingCategory: string,
  candidateCategory: string,
) {
  if (
    missingCategory ===
    candidateCategory
  ) {
    return true;
  }

  return (
    missingCategory ===
      "ambientcg_reference" &&
    candidateCategory ===
      "ambientcg_reference"
  );
}

function collectIdentityTokensFromJson(
  value: unknown,
) {
  const tokens = new Set<string>();
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return tokens;
  }

  const record =
    value as Record<string, unknown>;
  for (const key of [
    "asset_id",
    "resource_id",
    "source_asset_id",
    "candidate_id",
  ]) {
    const raw = record[key];
    if (
      typeof raw === "string" &&
      raw.trim()
    ) {
      tokens.add(
        normalizeIdentityToken(raw),
      );
    }
  }

  return tokens;
}

function summarizeByCategory(
  checks: AssetCloudAuthorityObjectCheck[],
) {
  const summary: Record<
    string,
    Record<string, number>
  > = {};

  for (const item of checks) {
    const category =
      summary[item.category] ??= {};
    category[item.classification] =
      (category[
        item.classification
      ] ?? 0) + 1;
  }

  return summary;
}

export async function runAssetCloudAuthorityAudit() {
  if (!durableAssetCloudEnabled()) {
    throw new Error(
      "The asset cloud-authority audit requires the complete Cloudflare R2 environment and cloud asset metadata mode.",
    );
  }

  const runtimeStorage =
    getR2RuntimeStorage();
  const sourceStorage =
    getR2SourceStorage();

  const [
    runtimeObjects,
    sourceMetadataObjects,
    sourceArchiveObjects,
  ] = await Promise.all([
    runtimeStorage.list({
      prefix: "runtime/",
    }),
    sourceStorage.list({
      prefix: "metadata/",
    }),
    sourceStorage.list({
      prefix: "source/",
    }),
  ]);

  const sourceObjects = [
    ...sourceMetadataObjects,
    ...sourceArchiveObjects,
  ];
  const runtimeByKey =
    new Map(
      runtimeObjects.map(
        (item) => [
          item.object_key,
          item,
        ],
      ),
    );
  const sourceByKey =
    new Map(
      sourceObjects.map(
        (item) => [
          item.object_key,
          item,
        ],
      ),
    );

  const expected =
    new Map<
      string,
      ExpectedObject
    >();
  const prefixExpectations:
    PrefixExpectation[] = [];
  const issues:
    AssetCloudAuthorityIssue[] = [];

  for (const key of
    FIXED_SOURCE_METADATA_KEYS) {
    addExpected(
      expected,
      {
        bucket: "source",
        object_key: key,
        category:
          "required_metadata",
        owner_id: null,
        expected_bytes: null,
      },
    );
  }

  const registryObject =
    await sourceStorage.read(
      ASSET_REGISTRY_KEY,
    );
  let registry:
    MyWayAssetRegistryV2 | null =
    null;

  if (registryObject) {
    try {
      const parsed =
        parseJson(
          registryObject.body,
        ) as Partial<MyWayAssetRegistryV2>;
      if (
        parsed.schema_version ===
          "myway_asset_registry_v2" &&
        Array.isArray(
          parsed.assets,
        )
      ) {
        registry =
          parsed as MyWayAssetRegistryV2;
      } else {
        issues.push({
          classification:
            "ambiguous_reference",
          category:
            "asset_registry",
          owner_id: null,
          detail:
            "The R2 asset registry exists but does not match myway_asset_registry_v2.",
        });
      }
    } catch (caught) {
      issues.push({
        classification:
          "ambiguous_reference",
        category:
          "asset_registry",
        owner_id: null,
        detail:
          `The authoritative R2 asset registry could not be parsed: ${
            caught instanceof Error
              ? caught.message
              : String(caught)
          }`,
      });
    }
  }

  if (registry) {
    collectCloudReferences(
      registry,
      {
        expected,
        prefixExpectations,
        category:
          "asset_registry_reference",
        ownerId: null,
      },
    );

    for (const asset of
      registry.assets) {
      if (
        asset.asset_type !==
        "primitive"
      ) {
        if (
          asset.storage_provider ===
            "r2"
        ) {
          if (
            asset.storage_object_key
          ) {
            addExpected(
              expected,
              {
                bucket:
                  "runtime",
                object_key:
                  asset.storage_object_key,
                category:
                  "runtime_model",
                owner_id:
                  asset.asset_id,
                expected_bytes:
                  asset.file_size_bytes ??
                  null,
              },
            );
          } else {
            issues.push({
              classification:
                "ambiguous_reference",
              category:
                "runtime_model",
              owner_id:
                asset.asset_id,
              detail:
                "Registry says storage_provider=r2 but storage_object_key is missing.",
            });
          }

          const publicKey =
            runtimeObjectKeyFromPublicUrl(
              asset.public_path,
            );
          if (
            publicKey &&
            asset.storage_object_key &&
            publicKey !==
              asset.storage_object_key
          ) {
            issues.push({
              classification:
                "ambiguous_reference",
              category:
                "runtime_model",
              owner_id:
                asset.asset_id,
              detail:
                `public_path resolves to ${publicKey}, but storage_object_key is ${asset.storage_object_key}.`,
            });
          }
        } else if (
          approvedForRuntime(
            asset,
          )
        ) {
          issues.push({
            classification:
              "approved_asset_not_cloud_backed",
            category:
              "runtime_model",
            owner_id:
              asset.asset_id,
            detail:
              "The asset is approved for automatic scene use but is not R2-backed.",
          });
        }
      }

      if (
        asset.thumbnail_storage_provider ===
          "r2"
      ) {
        if (
          asset.thumbnail_object_key
        ) {
          addExpected(
            expected,
            {
              bucket:
                "runtime",
              object_key:
                asset.thumbnail_object_key,
              category:
                "thumbnail",
              owner_id:
                asset.asset_id,
              expected_bytes:
                asset.thumbnail_file_size_bytes ??
                null,
            },
          );
        } else {
          issues.push({
            classification:
              "ambiguous_reference",
            category:
              "thumbnail",
            owner_id:
              asset.asset_id,
            detail:
              "Registry says thumbnail_storage_provider=r2 but thumbnail_object_key is missing.",
          });
        }
      }

      if (
        asset.source_storage_provider ===
          "r2"
      ) {
        if (
          asset.source_object_key
        ) {
          addExpected(
            expected,
            {
              bucket:
                "source",
              object_key:
                asset.source_object_key,
              category:
                "source_archive",
              owner_id:
                asset.asset_id,
              expected_bytes:
                asset.source_file_size_bytes ??
                null,
            },
          );
        } else {
          issues.push({
            classification:
              "ambiguous_reference",
            category:
              "source_archive",
            owner_id:
              asset.asset_id,
            detail:
              "Registry says source_storage_provider=r2 but source_object_key is missing.",
          });
        }
      }

      for (const item of
        durableReferences(
          asset,
        )) {
        try {
          addExpected(
            expected,
            {
              bucket:
                "source",
              object_key:
                durableJsonCloudKey(
                  item.reference,
                ),
              category:
                item.category,
              owner_id:
                asset.asset_id,
              expected_bytes:
                null,
            },
          );
        } catch (caught) {
          issues.push({
            classification:
              "ambiguous_reference",
            category:
              item.category,
            owner_id:
              asset.asset_id,
            detail:
              `Unsupported durable metadata reference "${item.reference}": ${
                caught instanceof Error
                  ? caught.message
                  : String(caught)
              }`,
          });
        }
      }

      for (const view of
        asset.appearance_profile
          ?.analysis_views ?? []) {
        const objectKey =
          runtimeObjectKeyFromPublicUrl(
            view.public_path,
          );
        if (objectKey) {
          addExpected(
            expected,
            {
              bucket:
                "runtime",
              object_key:
                objectKey,
              category:
                "analysis_render",
              owner_id:
                asset.asset_id,
              expected_bytes:
                null,
            },
          );
        } else {
          prefixExpectations.push({
            bucket:
              "runtime",
            prefix:
              `runtime/analysis/${asset.asset_id}/${view.name}/`,
            category:
              "analysis_render",
            owner_id:
              asset.asset_id,
            local_reference:
              view.public_path,
          });
        }
      }
    }
  }

  const metadataToScan =
    new Set<string>(
      Object.values(
        AMBIENTCG_CLOUD_KEYS,
      ),
    );
  for (const object of
    sourceMetadataObjects) {
    if (
      object.object_key.startsWith(
        FOUNDRY_CANDIDATE_PREFIX,
      ) &&
      object.object_key.endsWith(
        ".json",
      )
    ) {
      metadataToScan.add(
        object.object_key,
      );
      addExpected(
        expected,
        {
          bucket: "source",
          object_key:
            object.object_key,
          category:
            "foundry_candidate_metadata",
          owner_id:
            path.basename(
              object.object_key,
              ".json",
            ),
          expected_bytes:
            null,
        },
      );
    }
  }

  for (const objectKey of
    metadataToScan) {
    const result =
      await sourceStorage.read(
        objectKey,
      );
    if (!result) continue;

    try {
      collectCloudReferences(
        parseJson(result.body),
        {
          expected,
          prefixExpectations,
          category:
            objectKey.startsWith(
              FOUNDRY_CANDIDATE_PREFIX,
            )
              ? "foundry_reference"
              : "ambientcg_reference",
          ownerId:
            objectKey.startsWith(
              FOUNDRY_CANDIDATE_PREFIX,
            )
              ? path.basename(
                  objectKey,
                  ".json",
                )
              : null,
        },
      );
    } catch {
      issues.push({
        classification:
          "ambiguous_reference",
        category:
          "cloud_metadata",
        owner_id: null,
        detail:
          `Cloud metadata could not be parsed while resolving references: ${objectKey}`,
      });
    }
  }

  let gapPlan:
    Awaited<
      ReturnType<
        typeof buildCloudGapRepairPlan
      >
    > | null = null;
  let gapPlanError:
    string | null = null;
  try {
    gapPlan =
      await buildCloudGapRepairPlan();
  } catch (caught) {
    gapPlanError =
      caught instanceof Error
        ? caught.message
        : String(caught);
  }

  const repairByObjectKey =
    new Map<
      string,
      {
        category: string;
        asset_id: string | null;
        local_path: string;
      }
    >();
  const repairByAssetCategory =
    new Map<
      string,
      {
        local_path: string;
      }
    >();

  for (const item of
    gapPlan?.items ?? []) {
    if (item.object_key) {
      repairByObjectKey.set(
        item.object_key,
        item,
      );
    }
    if (item.asset_id) {
      repairByAssetCategory.set(
        `${item.asset_id}:${item.category}`,
        item,
      );
    }
  }

  const cloudChecks:
    AssetCloudAuthorityObjectCheck[] =
    [];

  for (const item of
    expected.values()) {
    const actual =
      item.bucket ===
        "runtime"
        ? runtimeByKey.get(
            item.object_key,
          )
        : sourceByKey.get(
            item.object_key,
          );

    if (!actual) {
      let localRepair:
        | {
            local_path: string;
          }
        | undefined =
        repairByObjectKey.get(
          item.object_key,
        );

      if (
        !localRepair &&
        item.owner_id
      ) {
        localRepair =
          repairByAssetCategory.get(
            `${item.owner_id}:${item.category}`,
          );
      }

      if (
        !localRepair &&
        item.category.startsWith(
          "asset_",
        ) &&
        item.owner_id
      ) {
        const registryAsset =
          registry?.assets.find(
            (asset) =>
              asset.asset_id ===
              item.owner_id,
          );
        const reference =
          item.category ===
            "asset_embedding"
            ? registryAsset
                ?.appearance_embedding
                ?.vector_key ??
              null
            : item.category ===
                "asset_license"
              ? registryAsset
                  ?.license_record_path ??
                null
              : item.category ===
                  "asset_source_record"
                ? `sandbox/probe-lab/assets/library/source-records/${item.owner_id}.json`
                : null;
        if (
          reference &&
          (await localFileExists(
            reference,
          ))
        ) {
          localRepair = {
            local_path:
              durableJsonLocalPath(
                reference,
              ),
          };
        }
      }

      cloudChecks.push({
        classification:
          localRepair
            ? "cloud_missing_local_repair_available"
            : "cloud_missing_no_repair_source",
        bucket:
          item.bucket,
        object_key:
          item.object_key,
        category:
          item.category,
        owner_id:
          item.owner_id,
        expected_bytes:
          item.expected_bytes,
        actual_bytes:
          null,
        local_repair_available:
          Boolean(localRepair),
        reason:
          localRepair
            ? `The R2 object is missing, but a local repair source is available at ${localRepair.local_path}.`
            : "The expected R2 object is missing and no verified local repair source was identified.",
      });
      continue;
    }

    if (
      item.expected_bytes != null &&
      item.expected_bytes > 0 &&
      actual.size_bytes !==
        item.expected_bytes
    ) {
      cloudChecks.push({
        classification:
          "cloud_size_mismatch",
        bucket:
          item.bucket,
        object_key:
          item.object_key,
        category:
          item.category,
        owner_id:
          item.owner_id,
        expected_bytes:
          item.expected_bytes,
        actual_bytes:
          actual.size_bytes,
        local_repair_available:
          false,
        reason:
          `R2 object exists but size differs from registry metadata (${actual.size_bytes} vs ${item.expected_bytes} bytes).`,
      });
      continue;
    }

    cloudChecks.push({
      classification:
        "cloud_verified",
      bucket:
        item.bucket,
      object_key:
        item.object_key,
      category:
        item.category,
      owner_id:
        item.owner_id,
      expected_bytes:
        item.expected_bytes,
      actual_bytes:
        actual.size_bytes,
      local_repair_available:
        false,
      reason:
        "Expected R2 object exists.",
    });
  }

  const exactExpectationCount =
    expected.size;

  for (const item of
    prefixExpectations) {
    const matches =
      runtimeObjects.filter(
        (object) =>
          object.object_key.startsWith(
            item.prefix,
          ),
      );

    if (matches.length) {
      for (const object of
        matches) {
        addExpected(
          expected,
          {
            bucket:
              "runtime",
            object_key:
              object.object_key,
            category:
              item.category,
            owner_id:
              item.owner_id,
            expected_bytes:
              null,
          },
        );
      }
      cloudChecks.push({
        classification:
          "cloud_verified",
        bucket:
          "runtime",
        object_key:
          `${item.prefix}*`,
        category:
          item.category,
        owner_id:
          item.owner_id,
        expected_bytes:
          null,
        actual_bytes:
          matches.reduce(
            (sum, object) =>
              sum +
              object.size_bytes,
            0,
          ),
        local_repair_available:
          false,
        reason:
          `At least one cloud artifact exists under the expected prefix (${matches.length} object(s)).`,
      });
    } else {
      const localRepair =
        await localReferenceExists(
          item.local_reference,
        );
      cloudChecks.push({
        classification:
          localRepair
            ? "cloud_missing_local_repair_available"
            : "cloud_missing_no_repair_source",
        bucket:
          "runtime",
        object_key:
          `${item.prefix}*`,
        category:
          item.category,
        owner_id:
          item.owner_id,
        expected_bytes:
          null,
        actual_bytes:
          null,
        local_repair_available:
          localRepair,
        reason:
          localRepair
            ? `No R2 object exists under ${item.prefix}, but the referenced local repair file still exists.`
            : `No R2 object exists under ${item.prefix}, and no local repair file was found.`,
      });
    }
  }

  const expectedCheckCount =
    exactExpectationCount +
    prefixExpectations.length;
  if (
    cloudChecks.length !==
    expectedCheckCount
  ) {
    throw new Error(
      `Cloud-authority audit invariant failed: ${cloudChecks.length} classified expected checks for ${expectedCheckCount} expectations.`,
    );
  }

  const expectedIds =
    new Set(
      Array.from(
        expected.values(),
      ).map((item) =>
        expectedId(
          item.bucket,
          item.object_key,
        ),
      ),
    );

  const unreferenced:
    AssetCloudAuthorityObjectCheck[] =
    [];
  for (const object of [
    ...runtimeObjects.map(
      (item) => ({
        bucket:
          "runtime" as const,
        item,
      }),
    ),
    ...sourceObjects.map(
      (item) => ({
        bucket:
          "source" as const,
        item,
      }),
    ),
  ]) {
    if (
      expectedIds.has(
        expectedId(
          object.bucket,
          object.item.object_key,
        ),
      )
    ) {
      continue;
    }

    unreferenced.push({
      classification:
        "cloud_unreferenced_managed_object",
      bucket:
        object.bucket,
      object_key:
        object.item.object_key,
      category:
        "unreferenced_managed_object",
      owner_id:
        null,
      expected_bytes:
        null,
      actual_bytes:
        object.item.size_bytes,
      local_repair_available:
        false,
      reason:
        "Object is inside a MyWay-managed R2 prefix but is not referenced by the authoritative asset registry, required metadata set, AmbientCG metadata, or saved Foundry candidate metadata. This is review-only; the audit never deletes cloud objects.",
    });
  }

  const missingChecks =
    cloudChecks.filter(
      (item) =>
        item.classification ===
          "cloud_missing_local_repair_available" ||
        item.classification ===
          "cloud_missing_no_repair_source",
    );

  const gapPlanExactKeys =
    new Set(
      (gapPlan?.items ?? [])
        .map((item) =>
          item.object_key,
        )
        .filter(
          (value): value is string =>
            Boolean(value),
        ),
    );
  const gapPlanOwnerCategory =
    new Set(
      (gapPlan?.items ?? [])
        .filter(
          (item) =>
            Boolean(item.asset_id),
        )
        .map(
          (item) =>
            `${item.asset_id}:${item.category}`,
        ),
    );

  const unreferencedSourceObjects =
    unreferenced.filter(
      (item) =>
        item.bucket === "source",
    );
  const legacyCandidates:
    LegacyCloudCandidate[] = [];

  for (const item of
    unreferencedSourceObjects) {
    const tokens = new Set<string>([
      objectKeyIdentityToken(
        item.object_key,
      ),
    ]);

    if (
      item.object_key.endsWith(
        ".json",
      )
    ) {
      const object =
        sourceByKey.get(
          item.object_key,
        );
      if (object) {
        try {
          const result =
            await sourceStorage.read(
              item.object_key,
            );
          if (result) {
            for (const token of
              collectIdentityTokensFromJson(
                parseJson(result.body),
              )) {
              tokens.add(token);
            }
          }
        } catch {
          // Reconciliation is best-effort and read-only.
        }
      }
    }

    legacyCandidates.push({
      object_key:
        item.object_key,
      category_hint:
        categoryHintForSourceKey(
          item.object_key,
        ),
      identity_tokens:
        Array.from(tokens)
          .filter(Boolean),
    });
  }

  const reconciliationItems:
    CloudGapReconciliationItem[] = [];

  for (const missing of
    missingChecks) {
    const ownerToken =
      missing.owner_id
        ? normalizeIdentityToken(
            missing.owner_id,
          )
        : null;
    const expectedLeafToken =
      objectKeyIdentityToken(
        missing.object_key
          .replace(/\*$/, ""),
      );

    const cloudCandidates =
      missing.bucket === "source"
        ? legacyCandidates.filter(
            (candidate) => {
              if (
                !categoriesCanReconcile(
                  missing.category,
                  candidate.category_hint,
                )
              ) {
                return false;
              }

              if (
                ownerToken &&
                candidate.identity_tokens.includes(
                  ownerToken,
                )
              ) {
                return true;
              }

              return Boolean(
                expectedLeafToken &&
                candidate.identity_tokens.includes(
                  expectedLeafToken,
                ),
              );
            },
          )
        : [];

    const exactRepairCoverage =
      !missing.object_key.endsWith(
        "*",
      ) &&
      gapPlanExactKeys.has(
        missing.object_key,
      );
    const ownerRepairCoverage =
      Boolean(
        missing.owner_id &&
        gapPlanOwnerCategory.has(
          `${missing.owner_id}:${missing.category}`,
        ),
      );
    const existingRepairPlanCovered =
      exactRepairCoverage ||
      ownerRepairCoverage;

    let preferredRecovery:
      CloudGapReconciliationItem["preferred_recovery"];
    let reason: string;

    if (
      cloudCandidates.length === 1
    ) {
      preferredRecovery =
        "legacy_r2_rekey";
      reason =
        "Exactly one unreferenced source-bucket object has a compatible category and matching owner/key identity. Prefer a later verified R2-to-R2 canonical re-key before using the laptop copy.";
    } else if (
      cloudCandidates.length > 1
    ) {
      preferredRecovery =
        "manual_review";
      reason =
        "Multiple unreferenced R2 objects match this missing canonical source object; do not repair automatically until the candidates are disambiguated.";
    } else if (
      missing.local_repair_available ||
      existingRepairPlanCovered
    ) {
      preferredRecovery =
        "local_repair";
      reason =
        existingRepairPlanCovered
          ? missing.local_repair_available
            ? "No matching legacy R2 object was found; a canonical local repair source exists and the current cloud-gap repair planner covers this gap."
            : "No matching legacy R2 object was found; the current cloud-gap repair planner identified an explicit alternate local recovery source (for example, a provenance record retained under a pre-rename filename)."
          : "No matching legacy R2 object was found; a local repair source exists, but the current cloud-gap repair planner does not cover this expectation yet.";
    } else {
      preferredRecovery =
        "unresolved";
      reason =
        "No matching legacy R2 object and no verified local repair source were identified.";
    }

    reconciliationItems.push({
      bucket:
        missing.bucket,
      object_key:
        missing.object_key,
      category:
        missing.category,
      owner_id:
        missing.owner_id,
      local_repair_available:
        missing.local_repair_available ||
        existingRepairPlanCovered,
      existing_repair_plan_covered:
        existingRepairPlanCovered,
      preferred_recovery:
        preferredRecovery,
      legacy_r2_candidates:
        cloudCandidates.map(
          (candidate) =>
            candidate.object_key,
        ),
      reason,
    });
  }

  const reconciliationSummary =
    reconciliationItems.reduce(
      (summary, item) => {
        summary[
          item.preferred_recovery
        ] =
          (summary[
            item.preferred_recovery
          ] ?? 0) + 1;
        return summary;
      },
      {} as Record<string, number>,
    );

  const missingRepairableNotCovered =
    reconciliationItems.filter(
      (item) =>
        item.preferred_recovery ===
          "local_repair" &&
        !item.existing_repair_plan_covered,
    );

  let localAudit:
    Awaited<
      ReturnType<
        typeof auditHistoricalLocalAssetStorage
      >
    > | null = null;
  let localAuditError:
    string | null = null;

  try {
    localAudit =
      await auditHistoricalLocalAssetStorage();
  } catch (caught) {
    localAuditError =
      caught instanceof Error
        ? caught.message
        : String(caught);
  }

  const localItems:
    AssetCloudAuthorityLocalItem[] =
    (localAudit?.items ?? [])
      .map((item) => {
        const tracked =
          item.verifications.some(
            (verification) =>
              verification.kind ===
                "git_tracking" &&
              verification.ok ===
                false,
          );

        const classification:
          AssetCloudAuthorityLocalItem["classification"] =
          item.classification ===
            "safe_to_remove"
            ? "local_duplicate_safe_to_remove"
            : tracked
              ? "git_tracked_generated_mirror"
              : item.classification ===
                  "keep"
                ? "local_only_or_retained"
                : "local_needs_review";

        return {
          classification,
          phase3_classification:
            item.classification,
          category:
            item.category,
          project_path:
            item.project_path,
          bytes:
            item.bytes,
          file_count:
            item.file_count,
          asset_id:
            item.asset_id ??
            null,
          candidate_id:
            item.candidate_id ??
            null,
          reason:
            item.reason,
        };
      });

  const allCloudChecks = [
    ...cloudChecks,
    ...unreferenced,
  ];

  const cloudSummary =
    allCloudChecks.reduce(
      (summary, item) => {
        summary[
          item.classification
        ] =
          (summary[
            item.classification
          ] ?? 0) + 1;
        return summary;
      },
      {} as Record<
        string,
        number
      >,
    );

  const localSummary =
    localItems.reduce(
      (summary, item) => {
        summary[
          item.classification
        ] =
          (summary[
            item.classification
          ] ?? 0) + 1;
        return summary;
      },
      {} as Record<
        string,
        number
      >,
    );

  return {
    schema_version:
      "myway_asset_cloud_authority_audit_v2",
    generated_at:
      new Date().toISOString(),
    policy: {
      asset_metadata_authority:
        "cloudflare_r2",
      runtime_artifact_authority:
        "cloudflare_r2",
      local_project_files:
        "cache_bootstrap_or_migration_source_only",
      normal_runtime_local_to_cloud_restore:
        false,
      deletes_files:
        false,
      mutates_git:
        false,
    },
    r2: {
      runtime_bucket:
        runtimeStorage.bucket,
      source_bucket:
        sourceStorage.bucket,
      runtime_object_count:
        runtimeObjects.length,
      runtime_bytes:
        runtimeObjects.reduce(
          (sum, item) =>
            sum +
            item.size_bytes,
          0,
        ),
      source_object_count:
        sourceObjects.length,
      source_bytes:
        sourceObjects.reduce(
          (sum, item) =>
            sum +
            item.size_bytes,
          0,
        ),
    },
    registry: {
      object_key:
        ASSET_REGISTRY_KEY,
      available:
        Boolean(registryObject),
      parseable:
        Boolean(registry),
      asset_count:
        registry?.assets.length ??
        null,
    },
    summary: {
      cloud:
        cloudSummary,
      local:
        localSummary,
      issues:
        issues.length,
      exact_expected_object_keys:
        exactExpectationCount,
      prefix_expectations:
        prefixExpectations.length,
      expected_cloud_checks:
        expectedCheckCount,
      expected_cloud_objects:
        expectedCheckCount,
      cloud_unreferenced_objects:
        unreferenced.length,
    },
    reconciliation: {
      category_summary:
        summarizeByCategory(
          cloudChecks,
        ),
      recovery_summary:
        reconciliationSummary,
      missing_check_count:
        missingChecks.length,
      existing_gap_repair_plan_covered:
        reconciliationItems.filter(
          (item) =>
            item.existing_repair_plan_covered,
        ).length,
      local_repair_not_covered_count:
        missingRepairableNotCovered.length,
      unreferenced_source_candidates_scanned:
        legacyCandidates.length,
      items:
        reconciliationItems,
      local_repair_not_covered:
        missingRepairableNotCovered,
    },
    cloud_checks:
      allCloudChecks,
    authority_issues:
      issues,
    local_items:
      localItems,
    supporting_audits: {
      cloud_gap_repair_plan:
        gapPlan
          ? {
              available:
                true,
              item_count:
                gapPlan.items
                  .length,
              bytes:
                gapPlan.summary
                  .bytes,
            }
          : {
              available:
                false,
              error:
                gapPlanError,
            },
      phase3_local_audit:
        localAudit
          ? {
              available:
                true,
              summary:
                localAudit.summary,
            }
          : {
              available:
                false,
              error:
                localAuditError,
            },
    },
  };
}
