import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const config = await readFile(
    path.join(process.cwd(), "next.config.ts"),
    "utf8",
  );

  for (const route of [
    "/api/sandbox/probe-lab/blender-python-builder/execute",
    "/api/sandbox/probe-lab/blender-python-builder/execute-with-repair",
    "/api/sandbox/probe-lab/blender-python-builder/generate",
    "/api/sandbox/probe-lab/blender-python-builder/improve",
    "/api/sandbox/probe-lab/blender-python-builder/repair",
    "/api/sandbox/probe-lab/blender-python-builder/plan",
    "/api/sandbox/probe-lab/blender-python-builder/visual-critique",
    "/api/sandbox/probe-lab/assets/import-local",
    "/api/sandbox/probe-lab/assets/library",
    "/api/sandbox/probe-lab/assets/attributions",
  ]) {
    assert.ok(
      config.includes(JSON.stringify(route)),
      `Missing output-file trace exclusion for ${route}.`,
    );
  }

  for (const excludedPath of [
    "./datasets/**/*",
    "./assets/**/*",
    "./public/sandbox-assets/myway/**/*",
    "./sandbox/probe-lab/blender-python-builder/jobs/**/*",
    "./myway-sandbox-active-files-one-notepad.txt",
  ]) {
    assert.ok(
      config.includes(JSON.stringify(excludedPath)),
      `Missing bulky-path trace exclusion ${excludedPath}.`,
    );
  }

  assert.equal(
    config.includes('"./**/*"'),
    false,
    "Do not replace narrow route exclusions with a repository-wide trace pattern.",
  );

  console.log(
    "Vercel Blender Foundry-route trace repair fixture passed.",
  );
}

void main();
