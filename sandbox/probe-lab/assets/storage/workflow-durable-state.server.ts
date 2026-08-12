
import {
  cloudAssetMetadataEnabled,
  readCloudJson,
  writeCloudJson,
} from "./cloud-json.server";
import {
  getR2SourceStorage,
} from "./r2-asset-storage.server";

export const MYWAY_MISSING_ASSET_QUEUE_CLOUD_KEY =
  "metadata/myway/workflows/missing-asset-queue-v1.json";

export const MYWAY_SCENE_MANIFEST_CLOUD_PREFIX =
  "metadata/myway/scenes/manifests/";

export function workflowDurableStateCloudEnabled() {
  return cloudAssetMetadataEnabled();
}

export function sceneManifestCloudKey(
  sceneId: string,
) {
  const normalized =
    sceneId.trim();

  if (!normalized) {
    throw new Error(
      "A scene id is required for durable scene storage.",
    );
  }

  return (
    MYWAY_SCENE_MANIFEST_CLOUD_PREFIX +
    `${normalized}.json`
  );
}

export async function readWorkflowCloudJson<T>(
  objectKey: string,
): Promise<T | null> {
  return readCloudJson<T>(
    objectKey,
  );
}

export async function writeWorkflowCloudJson(
  objectKey: string,
  value: unknown,
) {
  if (
    !workflowDurableStateCloudEnabled()
  ) {
    throw new Error(
      "Private-R2 workflow metadata storage is not enabled.",
    );
  }

  const written =
    await writeCloudJson(
      objectKey,
      value,
    );

  if (!written) {
    throw new Error(
      `Private-R2 workflow write did not return an uploaded object: ${objectKey}`,
    );
  }

  return written;
}

export async function listSceneManifestCloudKeys() {
  if (
    !workflowDurableStateCloudEnabled()
  ) {
    return [] as string[];
  }

  const objects =
    await getR2SourceStorage().list({
      prefix:
        MYWAY_SCENE_MANIFEST_CLOUD_PREFIX,
    });

  return objects
    .map(
      (object) =>
        object.object_key,
    )
    .filter(
      (objectKey) =>
        objectKey.startsWith(
          MYWAY_SCENE_MANIFEST_CLOUD_PREFIX,
        ) &&
        objectKey.endsWith(
          ".json",
        ),
    )
    .sort();
}

function replaceExactStringReferences(
  value: unknown,
  replacements:
    ReadonlyMap<string, string>,
): unknown {
  if (
    typeof value ===
    "string"
  ) {
    return replacements.get(value) ??
      value;
  }

  if (Array.isArray(value)) {
    return value.map(
      (item) =>
        replaceExactStringReferences(
          item,
          replacements,
        ),
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<
          string,
          unknown
        >,
      ).map(
        ([key, item]) => [
          key,
          replaceExactStringReferences(
            item,
            replacements,
          ),
        ],
      ),
    );
  }

  return value;
}

export type WorkflowCloudReferenceMutation = {
  object_key: string;
  original: unknown;
  next: unknown;
};

export async function collectWorkflowCloudReferenceMutations(
  replacements:
    ReadonlyMap<string, string>,
): Promise<
  WorkflowCloudReferenceMutation[]
> {
  if (
    !workflowDurableStateCloudEnabled() ||
    replacements.size === 0
  ) {
    return [];
  }

  const sceneKeys =
    await listSceneManifestCloudKeys();

  const objectKeys = [
    MYWAY_MISSING_ASSET_QUEUE_CLOUD_KEY,
    ...sceneKeys,
  ];

  const mutations:
    WorkflowCloudReferenceMutation[] =
    [];

  for (
    const objectKey of
    objectKeys
  ) {
    const original =
      await readWorkflowCloudJson<
        unknown
      >(objectKey);

    if (original == null) {
      continue;
    }

    const next =
      replaceExactStringReferences(
        original,
        replacements,
      );

    if (
      JSON.stringify(original) ===
      JSON.stringify(next)
    ) {
      continue;
    }

    mutations.push({
      object_key:
        objectKey,
      original,
      next,
    });
  }

  return mutations;
}

export async function applyWorkflowCloudReferenceMutation(
  mutation:
    WorkflowCloudReferenceMutation,
) {
  await writeWorkflowCloudJson(
    mutation.object_key,
    mutation.next,
  );
}

export async function rollbackWorkflowCloudReferenceMutation(
  mutation:
    WorkflowCloudReferenceMutation,
) {
  await writeWorkflowCloudJson(
    mutation.object_key,
    mutation.original,
  );
}
