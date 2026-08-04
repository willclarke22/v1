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
} from "../assets/paths.server";

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

  await mkdir(
    privateCandidateDir,
    {
      recursive:
        true,
    },
  );

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
      publicManifest.visual_critique_url ??
      null,
    outputs: {
      glb_url:
        publicManifest.glb_url ??
        null,
      blend_url:
        publicManifest.blend_url ??
        null,
      preview_url:
        publicManifest.preview_url ??
        null,
      inspection_urls:
        publicManifest.inspection_urls ??
        [],
      validation_url:
        publicManifest.validation_url ??
        null,
      quality_url:
        publicManifest.quality_url ??
        null,
      manifest_url:
        `/sandbox-assets/myway/blender-python-builder/${jobId}/manifest.json`,
    },
  };

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

  return candidate;
}
