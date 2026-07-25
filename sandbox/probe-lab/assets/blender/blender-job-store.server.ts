import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
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
