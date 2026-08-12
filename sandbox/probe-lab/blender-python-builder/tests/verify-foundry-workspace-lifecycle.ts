import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  foundryWorkspaceRetentionPolicy,
  pruneFoundryExecutionWorkspaces,
} from "../foundry-workspace-lifecycle.server";

async function createWorkspace(
  privateRoot: string,
  publicRoot: string,
  jobId: string,
  ageHours: number,
) {
  const privateDir =
    path.join(
      privateRoot,
      jobId,
    );
  const publicDir =
    path.join(
      publicRoot,
      jobId,
    );

  await Promise.all([
    mkdir(
      privateDir,
      {
        recursive:
          true,
      },
    ),
    mkdir(
      publicDir,
      {
        recursive:
          true,
      },
    ),
  ]);

  await Promise.all([
    writeFile(
      path.join(
        privateDir,
        "request.json",
      ),
      "{}",
      "utf8",
    ),
    writeFile(
      path.join(
        publicDir,
        "manifest.json",
      ),
      "{}",
      "utf8",
    ),
  ]);

  const time =
    new Date(
      Date.now() -
        ageHours *
          60 *
          60 *
          1000,
    );

  await Promise.all([
    utimes(
      privateDir,
      time,
      time,
    ),
    utimes(
      publicDir,
      time,
      time,
    ),
  ]);
}

async function ids(
  root: string,
) {
  return (
    await readdir(
      root,
      {
        withFileTypes:
          true,
      },
    )
  )
    .filter(
      (entry) =>
        entry.isDirectory(),
    )
    .map(
      (entry) =>
        entry.name,
    )
    .sort();
}

async function main() {
  const priorLimit =
    process.env
      .MYWAY_FOUNDRY_WORKSPACE_LIMIT;
  const priorAge =
    process.env
      .MYWAY_FOUNDRY_WORKSPACE_MAX_AGE_HOURS;
  const priorKeep =
    process.env
      .MYWAY_KEEP_FOUNDRY_WORKSPACES;

  const root =
    await mkdtemp(
      path.join(
        os.tmpdir(),
        "myway-foundry-workspace-test-",
      ),
    );

  const privateRoot =
    path.join(
      root,
      "private",
    );
  const publicRoot =
    path.join(
      root,
      "public",
    );

  try {
    process.env
      .MYWAY_FOUNDRY_WORKSPACE_LIMIT =
      "3";
    process.env
      .MYWAY_FOUNDRY_WORKSPACE_MAX_AGE_HOURS =
      "24";
    delete process.env
      .MYWAY_KEEP_FOUNDRY_WORKSPACES;

    await Promise.all([
      mkdir(
        privateRoot,
        {
          recursive:
            true,
        },
      ),
      mkdir(
        publicRoot,
        {
          recursive:
            true,
        },
      ),
    ]);

    await createWorkspace(
      privateRoot,
      publicRoot,
      "job-0001",
      0.1,
    );
    await createWorkspace(
      privateRoot,
      publicRoot,
      "job-0002",
      0.2,
    );
    await createWorkspace(
      privateRoot,
      publicRoot,
      "job-0003",
      0.3,
    );
    await createWorkspace(
      privateRoot,
      publicRoot,
      "job-0004",
      0.4,
    );

    const first =
      await pruneFoundryExecutionWorkspaces({
        privateRoot,
        publicRoot,
        reserveSlots:
          1,
      });

    assert.equal(
      foundryWorkspaceRetentionPolicy()
        .max_workspaces,
      3,
    );

    assert.equal(
      first.removed_job_ids.length,
      2,
    );

    assert.deepEqual(
      await ids(
        privateRoot,
      ),
      [
        "job-0001",
        "job-0002",
      ],
    );

    assert.deepEqual(
      await ids(
        publicRoot,
      ),
      [
        "job-0001",
        "job-0002",
      ],
    );

    await createWorkspace(
      privateRoot,
      publicRoot,
      "job-old1",
      48,
    );

    const second =
      await pruneFoundryExecutionWorkspaces({
        privateRoot,
        publicRoot,
      });

    assert(
      second.removed_job_ids.includes(
        "job-old1",
      ),
      "The stale workspace should be removed.",
    );

    assert(
      !(
        await ids(
          privateRoot,
        )
      ).includes(
        "job-old1",
      ),
    );

    assert(
      !(
        await ids(
          publicRoot,
        )
      ).includes(
        "job-old1",
      ),
    );

    console.log(
      "Foundry workspace lifecycle verification passed.",
    );
  }
  finally {
    if (priorLimit == null) {
      delete process.env
        .MYWAY_FOUNDRY_WORKSPACE_LIMIT;
    }
    else {
      process.env
        .MYWAY_FOUNDRY_WORKSPACE_LIMIT =
        priorLimit;
    }

    if (priorAge == null) {
      delete process.env
        .MYWAY_FOUNDRY_WORKSPACE_MAX_AGE_HOURS;
    }
    else {
      process.env
        .MYWAY_FOUNDRY_WORKSPACE_MAX_AGE_HOURS =
        priorAge;
    }

    if (priorKeep == null) {
      delete process.env
        .MYWAY_KEEP_FOUNDRY_WORKSPACES;
    }
    else {
      process.env
        .MYWAY_KEEP_FOUNDRY_WORKSPACES =
        priorKeep;
    }

    await rm(
      root,
      {
        recursive:
          true,
        force:
          true,
      },
    );
  }
}

void main();
