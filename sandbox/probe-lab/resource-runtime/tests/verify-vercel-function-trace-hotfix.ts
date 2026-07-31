import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import path from "node:path";

import {
  resolveRuntimeHydrationSource,
} from "../hydrate-runtime-url.server";

async function main() {
  const remote =
    resolveRuntimeHydrationSource(
      "/sandbox-assets/myway/hdri/studio.hdr",
      {
        hosted_runtime: true,
        runtime_origin:
          "https://myway-preview.vercel.app",
      },
    );

  assert.deepEqual(remote, {
    kind: "remote",
    url: "https://myway-preview.vercel.app/sandbox-assets/myway/hdri/studio.hdr",
  });

  const r2 =
    resolveRuntimeHydrationSource(
      "https://assets.example.com/runtime/studio.hdr",
      {
        hosted_runtime: true,
      },
    );

  assert.deepEqual(r2, {
    kind: "remote",
    url: "https://assets.example.com/runtime/studio.hdr",
  });

  const local =
    resolveRuntimeHydrationSource(
      "/sandbox-assets/myway/models/apple.glb",
      {
        hosted_runtime: false,
      },
    );

  assert.equal(local.kind, "local");
  if (local.kind === "local") {
    assert.equal(
      local.file_path,
      path.join(
        process.cwd(),
        "public",
        "sandbox-assets",
        "myway",
        "models",
        "apple.glb",
      ),
    );
  }

  assert.throws(
    () =>
      resolveRuntimeHydrationSource(
        "/sandbox-assets/myway/../secret.txt",
        {
          hosted_runtime: false,
        },
      ),
    /unsafe path segment/,
  );

  const config = await readFile(
    path.join(
      process.cwd(),
      "next.config.ts",
    ),
    "utf8",
  );

  for (const route of [
    "/api/sandbox/probe-lab/resource-runtime/blender-hydrate",
    "/api/sandbox/probe-lab/resource-runtime/materials/blender-hydrate",
    "/api/sandbox/probe-lab/resource-runtime/environments/blender-hydrate",
  ]) {
    assert.ok(
      config.includes(route),
      `Missing trace exclusion for ${route}.`,
    );
  }

  for (const excludedPath of [
    "./.git/**/*",
    "./datasets/**/*",
    "./assets/**/*",
    "./public/sandbox-assets/myway/**/*",
  ]) {
    assert.ok(
      config.includes(excludedPath),
      `Missing trace exclusion ${excludedPath}.`,
    );
  }

  for (const relativePath of [
    "sandbox/probe-lab/resource-runtime/hydrate-resolved-model-for-blender.server.ts",
    "sandbox/probe-lab/resource-runtime/hydrate-runtime-material-for-blender.server.ts",
    "sandbox/probe-lab/resource-runtime/hydrate-runtime-environment-for-blender.server.ts",
  ]) {
    const source = await readFile(
      path.join(
        process.cwd(),
        relativePath,
      ),
      "utf8",
    );

    assert.equal(
      source.includes(
        "publicUrlToProjectPath",
      ),
      false,
      `${relativePath} still imports the broad project path resolver.`,
    );
    assert.ok(
      source.includes(
        "hydrateRuntimeUrlToFile",
      ),
      `${relativePath} does not use the trace-safe hydration helper.`,
    );
  }

  const helper = await readFile(
    path.join(
      process.cwd(),
      "sandbox/probe-lab/resource-runtime/hydrate-runtime-url.server.ts",
    ),
    "utf8",
  );

  assert.ok(
    helper.includes(
      "turbopackIgnore: true",
    ),
    "Trace-safe local path must retain the Turbopack ignore marker.",
  );

  console.log(
    "Phase 2 Vercel function trace hotfix fixture passed.",
  );
}

void main();
