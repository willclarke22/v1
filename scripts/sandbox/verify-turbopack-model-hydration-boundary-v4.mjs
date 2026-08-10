import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(
  root,
  "sandbox/probe-lab/resource-runtime/hydrate-resolved-model-for-blender.server.ts",
);
const source = await readFile(sourcePath, "utf8");

assert.equal(
  source.includes('../assets/content-hash.server'),
  false,
  "Model hydration must not import the generic asset hash helper.",
);
assert.equal(
  source.includes("hashFile("),
  false,
  "Model hydration must not call generic hashFile() on a runtime temp path.",
);
for (const required of [
  'createReadStream',
  'hashHydratedTemporaryFile',
  'removeHydrationTemporaryDirectory',
  'traceSafeLocalPath',
  'traceSafeHydratedPath',
  'turbopackIgnore: true',
]) {
  assert.ok(
    source.includes(required),
    `Model hydration trace boundary is missing ${required}.`,
  );
}

console.log(
  "Model hydration Turbopack boundary v4 source verification passed.",
);
