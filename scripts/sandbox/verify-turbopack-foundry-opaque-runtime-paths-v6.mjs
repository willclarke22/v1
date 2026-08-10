import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const criticPath = path.join(
  root,
  "sandbox/probe-lab/blender-python-builder/foundry-visual-critic.server.ts",
);
const configPath = path.join(root, "next.config.ts");

const [source, config] = await Promise.all([
  readFile(criticPath, "utf8"),
  readFile(configPath, "utf8"),
]);

const requiredCriticTokens = [
  "FOUNDRY_PRIVATE_JOB_ROOT",
  "FOUNDRY_PUBLIC_JOB_ROOT",
  "runtimeChildPath",
  "traceSafeFilePath",
  "traceSafeViewPath",
  "traceSafePrivateDir",
  "traceSafePublicReportPath",
  "traceSafePrivateReportPath",
  "traceSafeManifestPath",
  "turbopackIgnore: true",
];
for (const token of requiredCriticTokens) {
  if (!source.includes(token)) {
    throw new Error(`Missing Foundry v6 boundary token: ${token}`);
  }
}

if (source.includes("projectPath")) {
  throw new Error("Foundry critic still imports/uses the broad projectPath helper.");
}

const joinCount = (source.match(/path\.join\s*\(/g) ?? []).length;
if (joinCount !== 2) {
  throw new Error(
    `Foundry v6 expects exactly two path.join() calls (the two static roots); found ${joinCount}.`,
  );
}

for (const forbidden of [
  "path.join(\n        publicDir",
  "path.join(\n      publicDir",
  "path.join(\n      privateDir",
  "path.join(\n      /* turbopackIgnore: true */\n      process.cwd(),\n      \"sandbox\",\n      \"probe-lab\",\n      \"blender-python-builder\",\n      \"jobs\",\n      jobId",
  "path.join(\n      /* turbopackIgnore: true */\n      process.cwd(),\n      \"public\",\n      \"sandbox-assets\",\n      \"myway\",\n      \"blender-python-builder\",\n      jobId",
]) {
  if (source.includes(forbidden)) {
    throw new Error(`Foundry v6 still contains a dynamic path.join() form: ${forbidden}`);
  }
}

for (const requiredBoundary of [
  "await access(\n      /* turbopackIgnore: true */",
  "await readFile(\n      /* turbopackIgnore: true */",
  "await readFile(\n              /* turbopackIgnore: true */",
  "await mkdir(\n    /* turbopackIgnore: true */",
  "writeFile(\n      /* turbopackIgnore: true */",
  "await writeFile(\n    /* turbopackIgnore: true */",
]) {
  if (!source.includes(requiredBoundary)) {
    throw new Error(`Missing trace-safe filesystem boundary: ${requiredBoundary}`);
  }
}

for (const excluded of [
  '"./.myway-patch-backups/**/*"',
  '"./myway-sandbox-selected-files-notepad/**/*"',
  '"./scripts-assets-dump.txt"',
]) {
  if (!config.includes(excluded)) {
    throw new Error(`Missing defensive Probe Lab trace exclusion ${excluded}.`);
  }
}

if (!config.includes('"/api/sandbox/probe-lab/**"')) {
  throw new Error("Probe Lab outputFileTracingExcludes route boundary is missing.");
}

console.log(
  "Foundry opaque runtime paths v6 source verification passed: only two static path.join roots remain.",
);
