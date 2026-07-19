import { spawn } from "node:child_process";

import type { MyWayBlenderJob } from "./blender-job-types";
import { moveBlenderJob, readBlenderJob } from "./blender-job-store.server";
import { projectPath, resolveBlenderExecutable } from "../paths.server";

const DEFAULT_TIMEOUT_MS = 12 * 60 * 1000;

function runProcess(command: string, args: string[], timeoutMs: number) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      windowsHide: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    // Leave the stream chunk type inferred by Node. Depending on the stream
    // typings, it may be represented as Buffer or string | Buffer.
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Blender job exceeded ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}

export async function runBlenderJob(jobPath: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<MyWayBlenderJob> {
  const executable = await resolveBlenderExecutable();
  const runningPath = await moveBlenderJob(jobPath, "running");
  const scriptPath = projectPath("sandbox/probe-lab/assets/blender/scripts/myway-blender-bridge.py");
  const result = await runProcess(
    executable,
    ["--background", "--python", scriptPath, "--", "--job", runningPath],
    timeoutMs,
  );

  const job = await readBlenderJob(runningPath).catch(() => null);
  const succeeded = result.exitCode === 0 && job?.status === "completed";
  const finalPath = await moveBlenderJob(runningPath, succeeded ? "completed" : "failed");
  const finalJob = await readBlenderJob(finalPath).catch(() => job);
  if (!succeeded || !finalJob) {
    const detail = finalJob?.error || result.stderr || result.stdout || `Blender exited with code ${result.exitCode}`;
    throw new Error(detail.slice(-5000));
  }
  return finalJob;
}
