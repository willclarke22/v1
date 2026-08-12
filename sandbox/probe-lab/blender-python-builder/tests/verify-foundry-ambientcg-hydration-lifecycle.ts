
import assert from "node:assert/strict";
import {
  access,
  mkdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import {
  randomUUID,
} from "node:crypto";

import {
  ambientCgHydrationScopeExists,
  ambientCgHydrationScopePath,
  beginAmbientCgHydrationScope,
  pruneStaleAmbientCgHydrationCache,
  removeAmbientCgHydrationScope,
} from "../../assets/catalog/ambientcg/ambientcg-hydration.server";

async function exists(
  path: string,
) {
  try {
    await access(path);
    return true;
  }
  catch {
    return false;
  }
}

async function main() {
  const scopeA =
    beginAmbientCgHydrationScope();

  const scopeB =
    beginAmbientCgHydrationScope();

  const scopeAPath =
    ambientCgHydrationScopePath(
      scopeA,
    );

  const scopeBPath =
    ambientCgHydrationScopePath(
      scopeB,
    );

  const staleScope =
    `stale-${randomUUID()}`;

  const stalePath =
    ambientCgHydrationScopePath(
      staleScope,
    );

  try {
    await Promise.all([
      mkdir(
        scopeAPath,
        {
          recursive: true,
        },
      ),
      mkdir(
        scopeBPath,
        {
          recursive: true,
        },
      ),
      mkdir(
        stalePath,
        {
          recursive: true,
        },
      ),
    ]);

    await Promise.all([
      writeFile(
        `${scopeAPath}/a.bin`,
        "a",
        "utf8",
      ),
      writeFile(
        `${scopeBPath}/b.bin`,
        "b",
        "utf8",
      ),
      writeFile(
        `${stalePath}/stale.bin`,
        "stale",
        "utf8",
      ),
    ]);

    assert.equal(
      await ambientCgHydrationScopeExists(
        scopeA,
      ),
      true,
    );

    assert.equal(
      await ambientCgHydrationScopeExists(
        scopeB,
      ),
      true,
    );

    await removeAmbientCgHydrationScope(
      scopeA,
    );

    assert.equal(
      await ambientCgHydrationScopeExists(
        scopeA,
      ),
      false,
      "Cleaning one Foundry scope must remove that scope.",
    );

    assert.equal(
      await ambientCgHydrationScopeExists(
        scopeB,
      ),
      true,
      "Cleaning one Foundry scope must not remove a concurrent scope.",
    );

    const staleDate =
      new Date(
        Date.now() -
          48 *
            60 *
            60 *
            1000,
      );

    await utimes(
      stalePath,
      staleDate,
      staleDate,
    );

    const prune =
      await pruneStaleAmbientCgHydrationCache({
        maxAgeHours:
          24,
        preserveScopeIds: [
          scopeB,
        ],
      });

    assert(
      prune
        .removed_scope_ids
        .includes(
          staleScope,
        ),
      "A stale abandoned Foundry hydration scope should be removed.",
    );

    assert.equal(
      await exists(
        stalePath,
      ),
      false,
    );

    assert.equal(
      await ambientCgHydrationScopeExists(
        scopeB,
      ),
      true,
      "Active/preserved concurrent scopes must survive stale pruning.",
    );

    const {
      readFile,
    } =
      await import(
        "node:fs/promises"
      );

    const hydrationSource =
      await readFile(
        "sandbox/probe-lab/assets/catalog/ambientcg/ambientcg-hydration.server.ts",
        "utf8",
      );

    const resourceService =
      await readFile(
        "sandbox/probe-lab/blender-python-builder/foundry-resource-service.server.ts",
        "utf8",
      );

    const runner =
      await readFile(
        "sandbox/probe-lab/blender-python-builder/blender-python-runner.server.ts",
        "utf8",
      );

    const turbopackMarkers =
      hydrationSource.match(
        /turbopackIgnore:\s*true/g,
      ) ?? [];

    assert(
      turbopackMarkers.length >= 10,
      "ambientCG OS-temp hydration must retain Turbopack/NFT ignore boundaries.",
    );

    assert.match(
      hydrationSource,
      /path\.join\([\s\S]*?turbopackIgnore:\s*true[\s\S]*?tmpdir\(\)/,
      "The ambientCG temp cache root must remain an opaque Turbopack filesystem root.",
    );

    for (const operation of [
      "mkdir",
      "rm",
      "stat",
      "writeFile",
      "readdir",
    ]) {
      assert(
        new RegExp(
          `${operation}\\(\\s*\\/\\*\\s*turbopackIgnore:\\s*true\\s*\\*\\/`,
        ).test(
          hydrationSource,
        ),
        `ambientCG hydration ${operation}() must retain a Turbopack ignore boundary.`,
      );
    }

    assert.match(
      resourceService,
      /beginAmbientCgHydrationScope/,
    );

    assert.match(
      resourceService,
      /scopeId:\s*hydrationScopeId/,
    );

    assert.match(
      resourceService,
      /cleanupFoundryResourceHydration/,
    );

    assert.match(
      runner,
      /finally\s*\{[\s\S]*cleanupFoundryResourceHydration/,
      "Foundry execution must clear hydrated ambientCG resources in finally.",
    );

    assert.doesNotMatch(
      resourceService,
      /return\s*\{\s*\.\.\.manifest,[\s\S]*hydration_scope_id/,
      "The private hydration scope id must not leak through the public resource manifest.",
    );

    console.log(
      "Foundry ambientCG hydration lifecycle verification passed.",
    );
  }
  finally {
    await Promise.all([
      removeAmbientCgHydrationScope(
        scopeA,
      ).catch(
        () => undefined,
      ),
      removeAmbientCgHydrationScope(
        scopeB,
      ).catch(
        () => undefined,
      ),
      rm(
        stalePath,
        {
          recursive: true,
          force: true,
        },
      ).catch(
        () => undefined,
      ),
    ]);
  }
}

void main();
