import {
  randomUUID,
} from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  projectPath,
  publicUrlToProjectPath,
} from "../assets/paths.server";
import {
  durableAssetCloudEnabled,
  uploadRuntimeAssetFile,
} from "../assets/storage/asset-durable-artifacts.server";
import {
  keepLocalAssetMetadataMirror,
  writeCloudJson,
} from "../assets/storage/cloud-json.server";
import {
  getR2SourceStorage,
} from "../assets/storage/r2-asset-storage.server";

function safeId(
  value: string,
) {
  if (
    !/^[a-z0-9-]{8,80}$/i.test(
      value,
    )
  ) {
    throw new Error(
      "A valid Blender Foundry job id is required.",
    );
  }
  return value;
}

async function readJson(
  filePath: string,
) {
  return JSON.parse(
    await readFile(
      filePath,
      "utf8",
    ),
  ) as Record<
    string,
    unknown
  >;
}

function stringOrNull(
  value: unknown,
) {
  return typeof value === "string"
    ? value
    : null;
}

function localPublicArtifact(
  value: unknown,
) {
  if (
    typeof value !== "string" ||
    !value.startsWith(
      "/sandbox-assets/myway/",
    )
  ) {
    return null;
  }

  return {
    url: value,
    path:
      publicUrlToProjectPath(
        value,
      ),
  };
}

async function publishFoundryRuntimeArtifact(
  input: {
    candidateId: string;
    value: unknown;
    label: string;
  },
) {
  const local =
    localPublicArtifact(
      input.value,
    );
  if (!local) {
    return typeof input.value ===
      "string"
      ? input.value
      : null;
  }

  const uploaded =
    await uploadRuntimeAssetFile({
      localPath: local.path,
      objectKey:
        `runtime/foundry/candidates/${input.candidateId}/` +
        `${input.label}-${path.basename(local.path)}`,
      metadata: {
        "candidate-id":
          input.candidateId,
        "artifact-kind":
          input.label,
      },
    });

  return (
    uploaded?.public_url ??
    local.url
  );
}

async function publishFoundryPrivateFile(
  input: {
    candidateId: string;
    localPath: string;
    objectName: string;
    contentType:
      string;
  },
) {
  const storage =
    getR2SourceStorage();
  const objectKey =
    `source/foundry/candidates/${input.candidateId}/${input.objectName}`;
  const uploaded =
    await storage.upload({
      local_path:
        input.localPath,
      object_key:
        objectKey,
      content_type:
        input.contentType,
      visibility:
        "private",
      cache_control:
        "no-store",
      metadata: {
        "candidate-id":
          input.candidateId,
      },
    });

  if (
    !(await storage.exists(
      objectKey,
    ))
  ) {
    throw new Error(
      `Foundry private artifact verification failed: ${objectKey}`,
    );
  }

  return uploaded;
}

async function publishFoundryPrivateBytes(
  input: {
    candidateId: string;
    objectName: string;
    body: string;
    contentType: string;
  },
) {
  const storage =
    getR2SourceStorage();
  const objectKey =
    `source/foundry/candidates/${input.candidateId}/${input.objectName}`;
  const uploaded =
    await storage.uploadBytes({
      body: input.body,
      object_key:
        objectKey,
      content_type:
        input.contentType,
      visibility:
        "private",
      cache_control:
        "no-store",
      metadata: {
        "candidate-id":
          input.candidateId,
      },
    });

  if (
    !(await storage.exists(
      objectKey,
    ))
  ) {
    throw new Error(
      `Foundry private artifact verification failed: ${objectKey}`,
    );
  }

  return uploaded;
}

export async function saveFoundryCandidate(
  input: {
    jobId: string;
    reviewNotes?: string;
  },
) {
  const jobId =
    safeId(
      input.jobId,
    );
  const candidateId =
    randomUUID();
  const privateJobDir =
    projectPath(
      "sandbox/probe-lab/blender-python-builder/jobs",
      jobId,
    );
  const publicJobDir =
    projectPath(
      "public/sandbox-assets/myway/blender-python-builder",
      jobId,
    );
  const privateCandidateDir =
    projectPath(
      "sandbox/probe-lab/blender-python-builder/candidates",
      candidateId,
    );

  const [
    requestRecord,
    publicManifest,
    sourceCode,
  ] = await Promise.all([
    readJson(
      path.join(
        privateJobDir,
        "request.json",
      ),
    ),
    readJson(
      path.join(
        publicJobDir,
        "manifest.json",
      ),
    ),
    readFile(
      path.join(
        privateJobDir,
        "source_code.py",
      ),
      "utf8",
    ),
  ]);

  const cloud =
    durableAssetCloudEnabled();

  let glbUrl =
    stringOrNull(
      publicManifest.glb_url,
    );
  let blendUrl =
    stringOrNull(
      publicManifest.blend_url,
    );
  let previewUrl =
    stringOrNull(
      publicManifest.preview_url,
    );
  let inspectionUrls =
    Array.isArray(
      publicManifest.inspection_urls,
    )
      ? publicManifest
          .inspection_urls
          .filter(
            (value: unknown): value is string =>
              typeof value ===
              "string",
          )
      : [];
  let validationUrl =
    stringOrNull(
      publicManifest.validation_url,
    );
  let qualityUrl =
    stringOrNull(
      publicManifest.quality_url,
    );
  let visualCritiqueUrl =
    stringOrNull(
      publicManifest.visual_critique_url,
    );
  let manifestUrl: string | null =
    `/sandbox-assets/myway/blender-python-builder/${jobId}/manifest.json`;
  let blendSourceObjectKey:
    string | null = null;
  let sourceCodeObjectKey:
    string | null = null;

  if (cloud) {
    [
      glbUrl,
      previewUrl,
      validationUrl,
      qualityUrl,
      visualCritiqueUrl,
      manifestUrl,
    ] = await Promise.all([
      publishFoundryRuntimeArtifact({
        candidateId,
        value: glbUrl,
        label: "glb",
      }),
      publishFoundryRuntimeArtifact({
        candidateId,
        value: previewUrl,
        label: "preview",
      }),
      publishFoundryRuntimeArtifact({
        candidateId,
        value: validationUrl,
        label: "validation",
      }),
      publishFoundryRuntimeArtifact({
        candidateId,
        value: qualityUrl,
        label: "quality",
      }),
      publishFoundryRuntimeArtifact({
        candidateId,
        value: visualCritiqueUrl,
        label: "visual-critique",
      }),
      publishFoundryRuntimeArtifact({
        candidateId,
        value: manifestUrl,
        label: "manifest",
      }),
    ]);

    inspectionUrls =
      await Promise.all(
        inspectionUrls.map(
          async (
            value: string,
            index: number,
          ) =>
            (
              await publishFoundryRuntimeArtifact({
                candidateId,
                value,
                label:
                  `inspection-${String(index + 1).padStart(2, "0")}`,
              })
            ) ?? value,
        ),
      );

    const localBlend =
      localPublicArtifact(
        blendUrl,
      );
    if (localBlend) {
      const blendUpload =
        await publishFoundryPrivateFile({
          candidateId,
          localPath:
            localBlend.path,
          objectName:
            path.basename(
              localBlend.path,
            ),
          contentType:
            "application/octet-stream",
        });
      blendSourceObjectKey =
        blendUpload.object_key;
      blendUrl = null;
    }

    const sourceUpload =
      await publishFoundryPrivateBytes({
        candidateId,
        objectName:
          "source_code.py",
        body: sourceCode,
        contentType:
          "text/x-python; charset=utf-8",
      });
    sourceCodeObjectKey =
      sourceUpload.object_key;
  }

  const candidate = {
    schema_version:
      "myway_blender_foundry_candidate_v1",
    candidate_id:
      candidateId,
    source_job_id:
      jobId,
    review_status:
      "needs_review",
    review_notes:
      input.reviewNotes ??
      null,
    created_at:
      new Date()
        .toISOString(),
    asset_name:
      publicManifest.asset_name ??
      requestRecord.asset_name ??
      "generated_asset",
    design_brief:
      requestRecord.design_brief ??
      publicManifest.design_brief ??
      null,
    resource_plan:
      requestRecord.resource_plan ??
      publicManifest.resource_plan ??
      null,
    resource_manifest:
      requestRecord.resource_manifest ??
      publicManifest.resource_manifest ??
      null,
    look_adjustments:
      requestRecord.look_adjustments ??
      publicManifest.look_adjustments ??
      null,
    technical_status:
      publicManifest.technical_status ??
      null,
    release_status:
      publicManifest.release_status ??
      "visual_and_human_review_required",
    asset_spec:
      requestRecord.asset_spec ??
      publicManifest.asset_spec ??
      null,
    helper_library_version:
      requestRecord.helper_library_version ??
      publicManifest.helper_library_version ??
      null,
    inspection_footer_version:
      requestRecord.inspection_footer_version ??
      publicManifest.inspection_footer_version ??
      null,
    quality_report:
      publicManifest.quality_report ??
      null,
    build_validation:
      publicManifest.build_validation ??
      null,
    visual_critique:
      publicManifest.visual_critique ??
      null,
    visual_critique_url:
      visualCritiqueUrl,
    cloud_storage: {
      provider:
        cloud ? "r2" : "local",
      candidate_metadata_object_key:
        cloud
          ? `metadata/myway/foundry/candidates/${candidateId}.json`
          : null,
      source_code_object_key:
        sourceCodeObjectKey,
      blend_source_object_key:
        blendSourceObjectKey,
    },
    outputs: {
      glb_url:
        glbUrl,
      blend_url:
        blendUrl,
      preview_url:
        previewUrl,
      inspection_urls:
        inspectionUrls,
      validation_url:
        validationUrl,
      quality_url:
        qualityUrl,
      manifest_url:
        manifestUrl,
    },
  };

  if (cloud) {
    await writeCloudJson(
      `metadata/myway/foundry/candidates/${candidateId}.json`,
      candidate,
    );

    if (
      keepLocalAssetMetadataMirror()
    ) {
      await mkdir(
        privateCandidateDir,
        {
          recursive:
            true,
        },
      );
      await Promise.all([
        writeFile(
          path.join(
            privateCandidateDir,
            "candidate.json",
          ),
          JSON.stringify(
            candidate,
            null,
            2,
          ) + "\n",
          "utf8",
        ),
        writeFile(
          path.join(
            privateCandidateDir,
            "source_code.py",
          ),
          sourceCode,
          "utf8",
        ),
      ]);
    }
  } else {
    await mkdir(
      privateCandidateDir,
      {
        recursive:
          true,
      },
    );
    await Promise.all([
      writeFile(
        path.join(
          privateCandidateDir,
          "candidate.json",
        ),
        JSON.stringify(
          candidate,
          null,
          2,
        ) + "\n",
        "utf8",
      ),
      writeFile(
        path.join(
          privateCandidateDir,
          "source_code.py",
        ),
        sourceCode,
        "utf8",
      ),
    ]);
  }

  return candidate;
}
