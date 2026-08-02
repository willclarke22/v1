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
    "Vercel Blender execution-route trace repair fixture passed.",
  );
}

void main();
