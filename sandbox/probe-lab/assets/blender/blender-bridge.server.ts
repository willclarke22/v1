import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

import type { MyWayBlenderJob } from "./blender-job-types";
import {
  moveBlenderJob,
  pruneBlenderJobHistory,
  readBlenderJob,
} from "./blender-job-store.server";
import { projectPath, resolveBlenderExecutable } from "../paths.server";

const DEFAULT_TIMEOUT_MS = 12 * 60 * 1000;

function terminateProcessTree(child: ReturnType<typeof spawn>) {
  return new Promise<void>((resolve) => {
    if (!child.pid) {
      resolve();
      return;
    }

    if (process.platform !== "win32") {
      child.kill("SIGKILL");
      resolve();
      return;
    }

    const killer = spawn(
      "taskkill",
      ["/PID", String(child.pid), "/T", "/F"],
      {
        windowsHide: true,
        stdio: "ignore",
      },
    );
    const fallback = setTimeout(() => {
      child.kill();
      resolve();
    }, 5_000);

    killer.on("error", () => {
      clearTimeout(fallback);
      child.kill();
      resolve();
    });
    killer.on("close", () => {
      clearTimeout(fallback);
      resolve();
    });
  });
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs: number,
) {
  return new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      windowsHide: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;

      void terminateProcessTree(child).finally(() => {
        reject(
          new Error(
            `Blender job exceeded ${Math.round(
              timeoutMs / 1000,
            )} seconds and its process tree was terminated.`,
          ),
        );
      });
    }, timeoutMs);

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1,
      });
    });
  });
}

async function recordFailedRunningJob(
  runningPath: string,
  error: string,
) {
  const job = await readBlenderJob(runningPath).catch(
    () => null,
  );

  if (job) {
    await writeFile(
      runningPath,
      `${JSON.stringify(
        {
          ...job,
          status: "failed",
          error,
          updated_at: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    ).catch(() => undefined);
  }

  await moveBlenderJob(
    runningPath,
    "failed",
  ).catch(() => undefined);
  await pruneBlenderJobHistory().catch(
    () => undefined,
  );
}

export async function runBlenderJob(
  jobPath: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<MyWayBlenderJob> {
  const executable =
    await resolveBlenderExecutable();
  const runningPath = await moveBlenderJob(
    jobPath,
    "running",
  );
  const scriptPath = projectPath(
    "sandbox/probe-lab/assets/blender/scripts/myway-blender-bridge.py",
  );

  try {
    const result = await runProcess(
      executable,
      [
        "--background",
        "--python",
        scriptPath,
        "--",
        "--job",
        runningPath,
      ],
      timeoutMs,
    );

    const job = await readBlenderJob(
      runningPath,
    ).catch(() => null);
    const succeeded =
      result.exitCode === 0 &&
      job?.status === "completed";
    const finalPath = await moveBlenderJob(
      runningPath,
      succeeded ? "completed" : "failed",
    );
    const finalJob = await readBlenderJob(
      finalPath,
    ).catch(() => job);
    await pruneBlenderJobHistory().catch(
      () => undefined,
    );

    if (!succeeded || !finalJob) {
      const detail =
        finalJob?.error ||
        result.stderr ||
        result.stdout ||
        `Blender exited with code ${result.exitCode}`;
      throw new Error(detail.slice(-5000));
    }

    return finalJob;
  } catch (caught) {
    const message =
      caught instanceof Error
        ? caught.message
        : String(caught);
    await recordFailedRunningJob(
      runningPath,
      message,
    );
    throw new Error(message);
  }
}
