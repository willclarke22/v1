import {
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

const DEFAULT_FOUNDRY_WORKSPACE_LIMIT =
  5;
const DEFAULT_FOUNDRY_WORKSPACE_MAX_AGE_HOURS =
  24;

function booleanEnvironment(
  name: string,
) {
  const value =
    process.env[name]
      ?.trim()
      .toLowerCase();

  return (
    value === "true" ||
    value === "1"
  );
}

function integerEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed =
    Number.parseInt(
      process.env[name] ?? "",
      10,
    );

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      parsed,
    ),
  );
}

export function foundryWorkspaceRetentionPolicy() {
  return {
    keep_all:
      booleanEnvironment(
        "MYWAY_KEEP_FOUNDRY_WORKSPACES",
      ),
    max_workspaces:
      integerEnvironment(
        "MYWAY_FOUNDRY_WORKSPACE_LIMIT",
        DEFAULT_FOUNDRY_WORKSPACE_LIMIT,
        0,
        100,
      ),
    max_age_hours:
      integerEnvironment(
        "MYWAY_FOUNDRY_WORKSPACE_MAX_AGE_HOURS",
        DEFAULT_FOUNDRY_WORKSPACE_MAX_AGE_HOURS,
        1,
        720,
      ),
  };
}

function safeJobId(
  value: string,
) {
  return /^[a-z0-9-]{8,80}$/i.test(
    value,
  );
}

async function workspaceIds(
  root: string,
) {
  const entries =
    await readdir(
      root,
      {
        withFileTypes:
          true,
      },
    ).catch(
      () => [],
    );

  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        safeJobId(
          entry.name,
        ),
    )
    .map(
      (entry) =>
        entry.name,
    );
}

async function workspaceMtime(
  root: string,
  jobId: string,
) {
  const info =
    await stat(
      path.join(
        root,
        jobId,
      ),
    ).catch(
      () => null,
    );

  return info?.mtimeMs ??
    null;
}

async function removeWorkspace(
  privateRoot: string,
  publicRoot: string,
  jobId: string,
) {
  await Promise.all([
    rm(
      path.join(
        privateRoot,
        jobId,
      ),
      {
        recursive:
          true,
        force:
          true,
      },
    ).catch(
      () => undefined,
    ),
    rm(
      path.join(
        publicRoot,
        jobId,
      ),
      {
        recursive:
          true,
        force:
          true,
      },
    ).catch(
      () => undefined,
    ),
  ]);
}

export async function pruneFoundryExecutionWorkspaces(
  input: {
    privateRoot: string;
    publicRoot: string;
    reserveSlots?: number;
    preserveJobIds?: string[];
  },
) {
  const policy =
    foundryWorkspaceRetentionPolicy();

  if (policy.keep_all) {
    return {
      policy,
      scanned_job_count:
        0,
      removed_job_ids:
        [] as string[],
    };
  }

  const [
    privateIds,
    publicIds,
  ] = await Promise.all([
    workspaceIds(
      input.privateRoot,
    ),
    workspaceIds(
      input.publicRoot,
    ),
  ]);

  const allIds =
    Array.from(
      new Set([
        ...privateIds,
        ...publicIds,
      ]),
    );

  const rows =
    await Promise.all(
      allIds.map(
        async (jobId) => {
          const [
            privateMtime,
            publicMtime,
          ] = await Promise.all([
            workspaceMtime(
              input.privateRoot,
              jobId,
            ),
            workspaceMtime(
              input.publicRoot,
              jobId,
            ),
          ]);

          return {
            job_id:
              jobId,
            mtime_ms:
              Math.max(
                privateMtime ??
                  0,
                publicMtime ??
                  0,
              ),
          };
        },
      ),
    );

  const preserve =
    new Set(
      (input.preserveJobIds ??
        [])
        .filter(
          safeJobId,
        ),
    );

  const cutoff =
    Date.now() -
    policy.max_age_hours *
      60 *
      60 *
      1000;

  const removeIds =
    new Set<string>();

  for (const row of rows) {
    if (
      preserve.has(
        row.job_id,
      )
    ) {
      continue;
    }

    if (
      row.mtime_ms <
      cutoff
    ) {
      removeIds.add(
        row.job_id,
      );
    }
  }

  const fresh =
    rows
      .filter(
        (row) =>
          !preserve.has(
            row.job_id,
          ) &&
          !removeIds.has(
            row.job_id,
          ),
      )
      .sort(
        (left, right) =>
          right.mtime_ms -
          left.mtime_ms,
      );

  const preservedExistingCount =
    rows.filter(
      (row) =>
        preserve.has(
          row.job_id,
        ),
    ).length;

  const reserveSlots =
    Math.max(
      0,
      Math.floor(
        input.reserveSlots ??
          0,
      ),
    );

  const allowedFresh =
    Math.max(
      0,
      policy.max_workspaces -
        preservedExistingCount -
        reserveSlots,
    );

  for (
    const row of
    fresh.slice(
      allowedFresh,
    )
  ) {
    removeIds.add(
      row.job_id,
    );
  }

  const removedJobIds =
    Array.from(
      removeIds,
    ).sort();

  for (
    const jobId of
    removedJobIds
  ) {
    await removeWorkspace(
      input.privateRoot,
      input.publicRoot,
      jobId,
    );
  }

  return {
    policy,
    scanned_job_count:
      rows.length,
    removed_job_ids:
      removedJobIds,
  };
}
