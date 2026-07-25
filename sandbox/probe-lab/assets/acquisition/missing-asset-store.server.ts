import type {
  PrimitiveBuilderAssetRequirement,
} from "../../primitive-builder/asset-requirement-plan";
import {
  appearanceRequirementKey,
  normalizeAppearanceRequest,
} from "../appearance-request";
import {
  ensureAssetDirectories,
  MYWAY_MISSING_ASSET_QUEUE_PROJECT_PATH,
  projectPath,
} from "../paths.server";
import { safeAssetId } from "../normalize-asset-record";
import {
  readJsonFileWithRetry,
  writeJsonFileAtomic,
} from "../json-file.server";
import type {
  MissingAssetAcquisitionJob,
  MissingAssetAcquisitionJobSummary,
  MissingAssetAcquisitionProvider,
  MissingAssetAcquisitionQueueV1,
  MissingAssetAcquisitionStatus,
  MissingAssetCandidateHistoryEntry,
  MissingAssetSceneReference,
} from "./missing-asset-types";

let mutationQueue: Promise<unknown> =
  Promise.resolve();
let ephemeralQueue:
  MissingAssetAcquisitionQueueV1 | null = null;

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function now() {
  return new Date().toISOString();
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string",
      )
    : [];
}

function activeStatusIsStale(
  status: MissingAssetAcquisitionStatus,
  updatedAt: string,
) {
  if (
    status !== "searching_blenderkit" &&
    status !== "generating_trellis"
  ) {
    return false;
  }

  const timestamp = Date.parse(updatedAt);
  return (
    Number.isFinite(timestamp) &&
    Date.now() - timestamp > 30 * 60 * 1000
  );
}

function emptyQueue():
  MissingAssetAcquisitionQueueV1 {
  return {
    schema_version:
      "myway_missing_asset_acquisition_queue_v1",
    updated_at: now(),
    jobs: [],
  };
}

function normalizedSceneReference(
  value: MissingAssetSceneReference,
): MissingAssetSceneReference {
  return {
    scene_session_id:
      value.scene_session_id.trim(),
    scene_id:
      typeof value.scene_id === "string" &&
      value.scene_id.trim()
        ? value.scene_id.trim()
        : null,
    source:
      value.source === "visual_experience"
        ? "visual_experience"
        : "primitive_builder",
    title:
      typeof value.title === "string" &&
      value.title.trim()
        ? value.title.trim()
        : null,
    original_prompt:
      typeof value.original_prompt === "string" &&
      value.original_prompt.trim()
        ? value.original_prompt.trim()
        : null,
    requirement_instance_ids:
      uniqueStrings(
        stringArray(
          value.requirement_instance_ids,
        ),
      ),
    requested_at:
      typeof value.requested_at === "string" &&
      value.requested_at
        ? value.requested_at
        : now(),
  };
}

function normalizeCandidate(
  value: MissingAssetCandidateHistoryEntry,
): MissingAssetCandidateHistoryEntry {
  return {
    asset_id: value.asset_id,
    source_type: value.source_type,
    source_asset_id:
      value.source_asset_id ?? null,
    status: value.status,
    created_at: value.created_at || now(),
    reviewed_at:
      value.reviewed_at ?? null,
    review_note:
      value.review_note ?? null,
  };
}

function normalizeJob(
  value: MissingAssetAcquisitionJob,
): MissingAssetAcquisitionJob {
  const concept =
    value.concept.trim() || value.concept_key;
  const conceptKey =
    normalizePhrase(value.concept_key || concept);
  const stale = activeStatusIsStale(
    value.status,
    value.updated_at,
  );

  return {
    schema_version:
      "myway_missing_asset_acquisition_job_v1",
    job_id:
      value.job_id ||
      `missing_${safeAssetId(conceptKey)}`,
    concept_key: conceptKey,
    requirement_key:
      typeof value.requirement_key === "string" &&
      value.requirement_key.trim()
        ? value.requirement_key.trim()
        : conceptKey,
    concept,
    aliases: uniqueStrings(
      stringArray(value.aliases),
    ),
    semantic_tags: uniqueStrings(
      stringArray(value.semantic_tags),
    ),
    appearance_request:
      normalizeAppearanceRequest(
        value.appearance_request,
      ),
    domain:
      typeof value.domain === "string" &&
      value.domain.trim()
        ? value.domain.trim()
        : "generic",
    target_extent_m:
      Number.isFinite(value.target_extent_m) &&
      value.target_extent_m > 0
        ? value.target_extent_m
        : 1,
    status: stale
      ? "unavailable"
      : value.status,
    active_provider: stale
      ? null
      : value.active_provider ?? null,
    current_candidate_asset_id:
      value.current_candidate_asset_id ?? null,
    candidate_history:
      Array.isArray(value.candidate_history)
        ? value.candidate_history
            .filter(
              (candidate) =>
                candidate &&
                typeof candidate.asset_id ===
                  "string",
            )
            .map(normalizeCandidate)
        : [],
    excluded_source_asset_ids:
      uniqueStrings(
        stringArray(
          value.excluded_source_asset_ids,
        ),
      ),
    scene_references:
      Array.isArray(value.scene_references)
        ? value.scene_references
            .filter(
              (reference) =>
                reference &&
                typeof reference.scene_session_id ===
                  "string" &&
                reference.scene_session_id.trim(),
            )
            .map(normalizedSceneReference)
        : [],
    request_count: Math.max(
      1,
      Math.floor(value.request_count || 1),
    ),
    attempt_count: Math.max(
      0,
      Math.floor(value.attempt_count || 0),
    ),
    last_error: stale
      ? "The previous acquisition stopped before completing. Retry BlendKit or TRELLIS from the Asset Library."
      : value.last_error ?? null,
    created_at: value.created_at || now(),
    updated_at: value.updated_at || now(),
  };
}

async function loadQueueUnlocked():
  Promise<MissingAssetAcquisitionQueueV1> {
  if (process.env.VERCEL === "1") {
    ephemeralQueue ??= emptyQueue();
    return JSON.parse(
      JSON.stringify(ephemeralQueue),
    ) as MissingAssetAcquisitionQueueV1;
  }

  await ensureAssetDirectories();

  try {
    const parsed =
      await readJsonFileWithRetry<
        Partial<MissingAssetAcquisitionQueueV1>
      >(
        projectPath(
          MYWAY_MISSING_ASSET_QUEUE_PROJECT_PATH,
        ),
      );

    return {
      schema_version:
        "myway_missing_asset_acquisition_queue_v1",
      updated_at:
        typeof parsed.updated_at === "string"
          ? parsed.updated_at
          : now(),
      jobs: Array.isArray(parsed.jobs)
        ? parsed.jobs
            .filter(
              (
                job,
              ): job is
                MissingAssetAcquisitionJob =>
                Boolean(
                  job &&
                    typeof job === "object" &&
                    typeof (
                      job as MissingAssetAcquisitionJob
                    ).concept === "string",
                ),
            )
            .map(normalizeJob)
        : [],
    };
  } catch (caught) {
    if (
      (caught as NodeJS.ErrnoException)
        .code !== "ENOENT"
    ) {
      throw caught;
    }

    const queue = emptyQueue();
    await saveQueueUnlocked(queue);
    return queue;
  }
}

async function saveQueueUnlocked(
  queue: MissingAssetAcquisitionQueueV1,
) {
  queue.updated_at = now();

  if (process.env.VERCEL === "1") {
    ephemeralQueue = JSON.parse(
      JSON.stringify(queue),
    ) as MissingAssetAcquisitionQueueV1;
    return;
  }

  const path = projectPath(
    MYWAY_MISSING_ASSET_QUEUE_PROJECT_PATH,
  );

  await writeJsonFileAtomic(
    path,
    queue,
  );
}

async function mutateQueue<T>(
  mutation: (
    queue: MissingAssetAcquisitionQueueV1,
  ) => Promise<T> | T,
) {
  const task = mutationQueue.then(async () => {
    const queue = await loadQueueUnlocked();
    const result = await mutation(queue);
    await saveQueueUnlocked(queue);
    return result;
  });

  mutationQueue = task.catch(() => undefined);
  return task;
}

export async function loadMissingAssetQueue() {
  await mutationQueue.catch(() => undefined);
  return loadQueueUnlocked();
}

export async function listMissingAssetJobs(
  input: {
    sceneSessionId?: string | null;
    statuses?: MissingAssetAcquisitionStatus[];
  } = {},
): Promise<
  MissingAssetAcquisitionJobSummary[]
> {
  const queue = await loadMissingAssetQueue();
  const sceneSessionId =
    input.sceneSessionId?.trim();
  const statuses = new Set(
    input.statuses ?? [],
  );

  return queue.jobs
    .filter(
      (job) =>
        (!sceneSessionId ||
          job.scene_references.some(
            (reference) =>
              reference.scene_session_id ===
              sceneSessionId ||
              reference.scene_id ===
              sceneSessionId,
          )) &&
        (!statuses.size ||
          statuses.has(job.status)),
    )
    .map((job) => ({
      ...job,
      linked_scene_count:
        job.scene_references.length,
      refresh_ready:
        job.status === "approved",
    }))
    .sort(
      (a, b) =>
        b.updated_at.localeCompare(a.updated_at) ||
        a.concept.localeCompare(b.concept),
    );
}

export async function getMissingAssetJob(
  jobId: string,
) {
  const queue = await loadMissingAssetQueue();

  return (
    queue.jobs.find(
      (job) => job.job_id === jobId,
    ) ?? null
  );
}

export async function removeMissingAssetJob(
  jobId: string,
) {
  return mutateQueue((queue) => {
    const index = queue.jobs.findIndex(
      (job) => job.job_id === jobId,
    );

    if (index < 0) {
      throw new Error(
        `Missing-asset job was not found: ${jobId}`,
      );
    }

    const job = queue.jobs[index]!;

    if (job.current_candidate_asset_id) {
      throw new Error(
        "This acquisition already has a review candidate. Remove or reject that candidate from Needs review instead.",
      );
    }

    queue.jobs.splice(index, 1);
    return normalizeJob(job);
  });
}

export async function findMissingAssetJobForAsset(
  assetId: string,
) {
  const queue = await loadMissingAssetQueue();

  return (
    queue.jobs.find(
      (job) =>
        job.current_candidate_asset_id ===
          assetId ||
        job.candidate_history.some(
          (candidate) =>
            candidate.asset_id === assetId,
        ),
    ) ?? null
  );
}

export async function enqueueMissingAssetRequirements(
  input: {
    sceneSessionId: string;
    sceneId?: string | null;
    source:
      | "primitive_builder"
      | "visual_experience";
    title?: string | null;
    originalPrompt?: string | null;
    requirements:
      PrimitiveBuilderAssetRequirement[];
  },
) {
  const sessionId =
    input.sceneSessionId.trim();

  if (!sessionId) {
    throw new Error(
      "sceneSessionId is required for missing-asset acquisition.",
    );
  }

  return mutateQueue((queue) => {
    const queuedJobs:
      MissingAssetAcquisitionJob[] = [];

    for (const requirement of
      input.requirements) {
      const concept =
        requirement.concept.trim();
      const conceptKey =
        normalizePhrase(concept);
      if (!conceptKey) continue;
      const appearanceRequest =
        normalizeAppearanceRequest(
          requirement.appearance_request,
        );
      const requirementKey =
        appearanceRequirementKey({
          concept,
          request: appearanceRequest,
        });

      const existing = queue.jobs.find(
        (job) =>
          (job.requirement_key ||
            job.concept_key) ===
          requirementKey,
      );
      const timestamp = now();
      const reference =
        normalizedSceneReference({
          scene_session_id: sessionId,
          scene_id: input.sceneId ?? null,
          source: input.source,
          title: input.title ?? null,
          original_prompt:
            input.originalPrompt ?? null,
          requirement_instance_ids: [
            requirement.instance_id,
          ],
          requested_at: timestamp,
        });

      if (existing) {
        existing.aliases = uniqueStrings([
          ...existing.aliases,
          ...requirement.aliases,
        ]);
        existing.semantic_tags =
          uniqueStrings([
            ...existing.semantic_tags,
            ...requirement.semantic_tags,
          ]);
        existing.appearance_request =
          normalizeAppearanceRequest({
            visual_brief:
              existing.appearance_request
                ?.visual_brief ||
              appearanceRequest?.visual_brief,
            required_traits: [
              ...(existing.appearance_request
                ?.required_traits ?? []),
              ...(appearanceRequest
                ?.required_traits ?? []),
            ],
            preferred_traits: [
              ...(existing.appearance_request
                ?.preferred_traits ?? []),
              ...(appearanceRequest
                ?.preferred_traits ?? []),
            ],
            avoid_traits: [
              ...(existing.appearance_request
                ?.avoid_traits ?? []),
              ...(appearanceRequest
                ?.avoid_traits ?? []),
            ],
          });
        existing.requirement_key =
          requirementKey;
        existing.target_extent_m =
          Math.max(
            existing.target_extent_m,
            requirement.target_extent_m,
          );

        const linked =
          existing.scene_references.find(
            (candidate) =>
              candidate.scene_session_id ===
              sessionId,
          );

        if (linked) {
          linked.requirement_instance_ids =
            uniqueStrings([
              ...linked.requirement_instance_ids,
              requirement.instance_id,
            ]);
          linked.scene_id =
            input.sceneId ??
            linked.scene_id ??
            null;
          linked.title =
            input.title ??
            linked.title ??
            null;
          linked.original_prompt =
            input.originalPrompt ??
            linked.original_prompt ??
            null;
        } else {
          existing.scene_references.push(
            reference,
          );
          existing.request_count += 1;
        }

        if (
          existing.status === "unavailable" &&
          !existing.current_candidate_asset_id
        ) {
          existing.status = "missing";
          existing.last_error = null;
        }

        existing.updated_at = timestamp;
        queuedJobs.push(
          normalizeJob(existing),
        );
        continue;
      }

      const job: MissingAssetAcquisitionJob = {
        schema_version:
          "myway_missing_asset_acquisition_job_v1",
        job_id:
          `missing_${safeAssetId(
            conceptKey,
          )}_${Date.now().toString(36)}`,
        concept_key: conceptKey,
        requirement_key:
          requirementKey,
        concept,
        aliases: uniqueStrings(
          requirement.aliases,
        ),
        semantic_tags: uniqueStrings(
          requirement.semantic_tags,
        ),
        appearance_request:
          appearanceRequest,
        domain: "primitive_builder_scene",
        target_extent_m:
          requirement.target_extent_m,
        status: "missing",
        active_provider: null,
        current_candidate_asset_id: null,
        candidate_history: [],
        excluded_source_asset_ids: [],
        scene_references: [reference],
        request_count: 1,
        attempt_count: 0,
        last_error: null,
        created_at: timestamp,
        updated_at: timestamp,
      };

      queue.jobs.push(job);
      queuedJobs.push(job);
    }

    return queuedJobs;
  });
}

export async function updateMissingAssetJob(
  jobId: string,
  updater: (
    job: MissingAssetAcquisitionJob,
  ) => void,
) {
  return mutateQueue((queue) => {
    const job = queue.jobs.find(
      (candidate) =>
        candidate.job_id === jobId,
    );

    if (!job) {
      throw new Error(
        `Missing-asset job was not found: ${jobId}`,
      );
    }

    updater(job);
    job.updated_at = now();
    return normalizeJob(job);
  });
}

export async function setMissingAssetJobStatus(
  jobId: string,
  input: {
    status: MissingAssetAcquisitionStatus;
    provider?:
      | MissingAssetAcquisitionProvider
      | null;
    error?: string | null;
    incrementAttempt?: boolean;
  },
) {
  return updateMissingAssetJob(
    jobId,
    (job) => {
      job.status = input.status;
      job.active_provider =
        input.provider ?? null;
      job.last_error =
        input.error ?? null;
      if (input.incrementAttempt) {
        job.attempt_count += 1;
      }
    },
  );
}

export async function registerMissingAssetCandidate(
  jobId: string,
  candidate: {
    assetId: string;
    sourceType:
      | "blenderkit"
      | "trellis"
      | "manual"
      | "procedural";
    sourceAssetId?: string | null;
  },
) {
  return updateMissingAssetJob(
    jobId,
    (job) => {
      if (
        job.current_candidate_asset_id &&
        job.current_candidate_asset_id !==
          candidate.assetId
      ) {
        const previous =
          job.candidate_history.find(
            (entry) =>
              entry.asset_id ===
              job.current_candidate_asset_id,
          );
        if (
          previous &&
          previous.status ===
            "awaiting_review"
        ) {
          previous.status = "superseded";
          previous.reviewed_at = now();
        }
      }

      const existing =
        job.candidate_history.find(
          (entry) =>
            entry.asset_id ===
            candidate.assetId,
        );
      if (existing) {
        existing.status =
          "awaiting_review";
        existing.reviewed_at = null;
        existing.review_note = null;
      } else {
        job.candidate_history.push({
          asset_id: candidate.assetId,
          source_type:
            candidate.sourceType,
          source_asset_id:
            candidate.sourceAssetId ?? null,
          status: "awaiting_review",
          created_at: now(),
          reviewed_at: null,
          review_note: null,
        });
      }

      if (candidate.sourceAssetId) {
        job.excluded_source_asset_ids =
          uniqueStrings([
            ...job.excluded_source_asset_ids,
            candidate.sourceAssetId,
          ]);
      }

      job.current_candidate_asset_id =
        candidate.assetId;
      job.status = "awaiting_review";
      job.active_provider = null;
      job.last_error = null;
    },
  );
}

export async function rejectMissingAssetCandidate(
  jobId: string,
  input: {
    assetId: string;
    note?: string | null;
    nextProvider:
      MissingAssetAcquisitionProvider;
  },
) {
  return updateMissingAssetJob(
    jobId,
    (job) => {
      const candidate =
        job.candidate_history.find(
          (entry) =>
            entry.asset_id === input.assetId,
        );

      if (candidate) {
        candidate.status = "rejected";
        candidate.reviewed_at = now();
        candidate.review_note =
          input.note ?? null;
        if (candidate.source_asset_id) {
          job.excluded_source_asset_ids =
            uniqueStrings([
              ...job.excluded_source_asset_ids,
              candidate.source_asset_id,
            ]);
        }
      }

      if (
        job.current_candidate_asset_id ===
        input.assetId
      ) {
        job.current_candidate_asset_id =
          null;
      }

      job.status =
        input.nextProvider === "trellis"
          ? "generating_trellis"
          : "searching_blenderkit";
      job.active_provider =
        input.nextProvider;
      job.last_error = null;
    },
  );
}

export async function rejectMissingAssetCandidateAndPause(
  jobId: string,
  input: {
    assetId: string;
    note?: string | null;
  },
) {
  return updateMissingAssetJob(
    jobId,
    (job) => {
      const candidate =
        job.candidate_history.find(
          (entry) =>
            entry.asset_id === input.assetId,
        );

      if (candidate) {
        candidate.status = "rejected";
        candidate.reviewed_at = now();
        candidate.review_note =
          input.note?.trim() ||
          "Rejected and removed from the Asset Library.";

        if (candidate.source_asset_id) {
          job.excluded_source_asset_ids =
            uniqueStrings([
              ...job.excluded_source_asset_ids,
              candidate.source_asset_id,
            ]);
        }
      }

      if (
        job.current_candidate_asset_id ===
        input.assetId
      ) {
        job.current_candidate_asset_id = null;
      }

      job.status = "missing";
      job.active_provider = null;
      job.last_error =
        "The previous candidate was rejected and removed. Choose BlendKit or TRELLIS to continue acquisition.";
    },
  );
}

export async function markMissingAssetCandidateApproved(
  assetId: string,
) {
  return mutateQueue((queue) => {
    const updated:
      MissingAssetAcquisitionJob[] = [];

    for (const job of queue.jobs) {
      const candidate =
        job.candidate_history.find(
          (entry) =>
            entry.asset_id === assetId,
        );
      if (!candidate) continue;

      candidate.status = "approved";
      candidate.reviewed_at = now();
      candidate.review_note =
        "Approved for automatic scene use.";
      job.current_candidate_asset_id =
        assetId;
      job.status = "approved";
      job.active_provider = null;
      job.last_error = null;
      job.updated_at = now();
      updated.push(normalizeJob(job));
    }

    return updated;
  });
}

export async function linkMissingAssetJobsToSavedScene(
  sceneSessionId: string,
  sceneId: string,
) {
  return mutateQueue((queue) => {
    for (const job of queue.jobs) {
      for (const reference of
        job.scene_references) {
        if (
          reference.scene_session_id ===
          sceneSessionId
        ) {
          reference.scene_id = sceneId;
        }
      }
    }
  });
}
