import { randomUUID } from "node:crypto";
import {
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type {
  BlenderAnalysisRenderJob,
  BlenderGeometryProfileJob,
  BlenderKitAcquireJob,
  BlenderNormalizeJob,
  MyWayBlenderJob,
} from "./blender-job-types";
import { ensureAssetDirectories, MYWAY_ASSET_JOB_PROJECT_PATH, projectPath } from "../paths.server";

function now() {
  return new Date().toISOString();
}

const DEFAULT_TERMINAL_JOB_HISTORY_LIMIT = 100;

function keepAllBlenderJobHistory() {
  const value =
    process.env.MYWAY_KEEP_BLENDER_JOB_HISTORY
      ?.trim()
      .toLowerCase();
  return value === "true" || value === "1";
}

function terminalJobHistoryLimit() {
  const configured = Number(
    process.env.MYWAY_BLENDER_JOB_HISTORY_LIMIT ??
      DEFAULT_TERMINAL_JOB_HISTORY_LIMIT,
  );
  if (!Number.isFinite(configured)) {
    return DEFAULT_TERMINAL_JOB_HISTORY_LIMIT;
  }
  return Math.max(0, Math.floor(configured));
}

export async function createGeometryProfileJob(
  input: Omit<
    BlenderGeometryProfileJob,
    "schema_version" | "job_id" | "status" | "created_at" | "updated_at"
  >,
) {
  const timestamp = now();
  const job: BlenderGeometryProfileJob = {
    ...input,
    schema_version: "myway_blender_job_v1",
    job_id: randomUUID(),
    status: "pending",
    created_at: timestamp,
    updated_at: timestamp,
  };
  return writePendingJob(job);
}

export async function createNormalizeJob(input: Omit<BlenderNormalizeJob, "schema_version" | "job_id" | "status" | "created_at" | "updated_at">) {
  const timestamp = now();
  const job: BlenderNormalizeJob = {
    ...input,
    schema_version: "myway_blender_job_v1",
    job_id: randomUUID(),
    status: "pending",
    created_at: timestamp,
    updated_at: timestamp,
  };
  return writePendingJob(job);
}

export async function createBlenderKitJob(input: Omit<BlenderKitAcquireJob, "schema_version" | "job_id" | "status" | "created_at" | "updated_at">) {
  const timestamp = now();
  const job: BlenderKitAcquireJob = {
    ...input,
    schema_version: "myway_blender_job_v1",
    job_id: randomUUID(),
    status: "pending",
    created_at: timestamp,
    updated_at: timestamp,
  };
  return writePendingJob(job);
}

export async function createAnalysisRenderJob(
  input: Omit<
    BlenderAnalysisRenderJob,
    "schema_version" | "job_id" | "status" | "created_at" | "updated_at"
  >,
) {
  const timestamp = now();
  const job: BlenderAnalysisRenderJob = {
    ...input,
    schema_version: "myway_blender_job_v1",
    job_id: randomUUID(),
    status: "pending",
    created_at: timestamp,
    updated_at: timestamp,
  };
  return writePendingJob(job);
}

async function writePendingJob<T extends MyWayBlenderJob>(job: T) {
  await ensureAssetDirectories();
  const jobPath = projectPath(MYWAY_ASSET_JOB_PROJECT_PATH, "pending", `${job.job_id}.json`);
  await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`, "utf8");
  return { job, jobPath };
}

export async function readBlenderJob(jobPath: string) {
  return JSON.parse(await readFile(jobPath, "utf8")) as MyWayBlenderJob;
}

export async function moveBlenderJob(jobPath: string, status: "running" | "completed" | "failed") {
  const destination = projectPath(MYWAY_ASSET_JOB_PROJECT_PATH, status, path.basename(jobPath));
  await rename(jobPath, destination);
  return destination;
}

export async function pruneBlenderJobHistory() {
  if (keepAllBlenderJobHistory()) {
    return;
  }

  await ensureAssetDirectories();
  const limit = terminalJobHistoryLimit();

  for (const status of [
    "completed",
    "failed",
  ] as const) {
    const directory = projectPath(
      MYWAY_ASSET_JOB_PROJECT_PATH,
      status,
    );
    const entries = (
      await readdir(directory, {
        withFileTypes: true,
      }).catch(() => [])
    ).filter(
      (entry) =>
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".json"),
    );

    const ranked = (
      await Promise.all(
        entries.map(async (entry) => {
          const filePath = path.join(
            directory,
            entry.name,
          );
          const info = await stat(filePath).catch(
            () => null,
          );
          return {
            filePath,
            modifiedAt:
              info?.mtimeMs ?? 0,
          };
        }),
      )
    ).sort(
      (a, b) =>
        b.modifiedAt - a.modifiedAt,
    );

    await Promise.all(
      ranked
        .slice(limit)
        .map((item) =>
          rm(item.filePath, {
            force: true,
          }).catch(() => undefined),
        ),
    );
  }
}

