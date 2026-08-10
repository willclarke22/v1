import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const criticPath = path.join(
  root,
  "sandbox",
  "probe-lab",
  "blender-python-builder",
  "foundry-visual-critic.server.ts",
);

const source = await readFile(criticPath, "utf8");

assert.equal(
  /\bprojectPath\s*\(/.test(source),
  false,
  "Foundry visual critic must not use the generic projectPath(...parts) helper.",
);
assert.equal(
  source.includes('from "../assets/paths.server"'),
  false,
  "Foundry visual critic must not import the generic asset project-path helper module.",
);

for (const segment of [
  '"sandbox"',
  '"probe-lab"',
  '"blender-python-builder"',
  '"jobs"',
  '"public"',
  '"sandbox-assets"',
  '"myway"',
]) {
  assert.ok(
    source.includes(segment),
    `Foundry visual critic is missing fixed path segment ${segment}.`,
  );
}

const ignoreMarkers = source.match(/turbopackIgnore:\s*true/g) ?? [];
assert.ok(
  ignoreMarkers.length >= 2,
  "Expected Turbopack ignore markers on both fixed Foundry job-root joins.",
);

assert.match(
  source,
  /path\.join\([\s\S]*?turbopackIgnore:\s*true[\s\S]*?process\.cwd\(\)[\s\S]*?"sandbox"[\s\S]*?"probe-lab"[\s\S]*?"blender-python-builder"[\s\S]*?"jobs"[\s\S]*?jobId[\s\S]*?\);/,
  "Private Foundry job path must be statically scoped below sandbox/probe-lab/blender-python-builder/jobs.",
);
assert.match(
  source,
  /path\.join\([\s\S]*?turbopackIgnore:\s*true[\s\S]*?process\.cwd\(\)[\s\S]*?"public"[\s\S]*?"sandbox-assets"[\s\S]*?"myway"[\s\S]*?"blender-python-builder"[\s\S]*?jobId[\s\S]*?\);/,
  "Public Foundry job path must be statically scoped below public/sandbox-assets/myway/blender-python-builder.",
);

console.log(
  "Foundry static-root Turbopack boundary source verification passed.",
);
