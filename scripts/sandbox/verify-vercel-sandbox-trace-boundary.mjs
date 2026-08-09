import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const maxBytes = 250 * 1024 * 1024;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relative) {
  return readFile(path.join(root, relative), "utf8");
}

async function walk(directory) {
  const output = [];
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return output;
  }
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await walk(full)));
    else output.push(full);
  }
  return output;
}

async function tracedBytes(nftPath) {
  const raw = JSON.parse(await readFile(nftPath, "utf8"));
  const base = path.dirname(nftPath);
  let bytes = 0;
  let files = 0;
  for (const relative of Array.isArray(raw.files) ? raw.files : []) {
    const full = path.resolve(base, relative);
    try {
      const info = await stat(full);
      if (info.isFile()) {
        bytes += info.size;
        files += 1;
      }
    } catch {
      // A trace can contain entries not materialized in the local build tree.
    }
  }
  return { bytes, files };
}

const config = await read("next.config.ts");
for (const required of [
  '"/api/sandbox/probe-lab/**"',
  '"./models/**/*"',
  '"./datasets/**/*"',
  '"./archive/**/*"',
  '"./public/sandbox-assets/myway/**/*"',
  '"./sandbox/probe-lab/blender-python-builder/jobs/**/*"',
]) {
  assert(config.includes(required), `Missing deployment trace boundary: ${required}`);
}

for (const relative of [
  "sandbox/probe-lab/resource-runtime/hydrate-resolved-model-for-blender.server.ts",
  "sandbox/probe-lab/resource-runtime/hydrate-runtime-material-for-blender.server.ts",
  "sandbox/probe-lab/resource-runtime/hydrate-runtime-environment-for-blender.server.ts",
]) {
  const source = await read(relative);
  assert(
    source.includes("/* turbopackIgnore: true */\n      temporaryDirectory") ||
      source.includes("/* turbopackIgnore: true */\n            temporaryDirectory"),
    `${relative} is missing the OS-temp Turbopack tracing guard.`,
  );
}

const nftRoot = path.join(root, ".next", "server", "app", "api", "sandbox", "probe-lab");
const nftFiles = (await walk(nftRoot)).filter((file) => file.endsWith(".nft.json"));
if (nftFiles.length === 0) {
  console.log("Static source checks passed. No built sandbox NFT traces were found; run pnpm build and verify again.");
  process.exit(0);
}

const rows = [];
for (const file of nftFiles) {
  const result = await tracedBytes(file);
  rows.push({
    route: path.relative(path.join(root, ".next", "server"), file).replaceAll("\\", "/"),
    ...result,
  });
}
rows.sort((a, b) => b.bytes - a.bytes);

const oversized = rows.filter((row) => row.bytes > maxBytes);
console.log(`Sandbox server traces checked: ${rows.length}`);
console.log(`Largest trace: ${(rows[0]?.bytes ?? 0) / 1024 / 1024} MB`);
if (oversized.length) {
  console.error("Sandbox traces still over 250 MB:");
  for (const row of oversized) {
    console.error(`- ${(row.bytes / 1024 / 1024).toFixed(2)} MB | ${row.files} files | ${row.route}`);
  }
  process.exitCode = 1;
} else {
  console.log("Vercel sandbox trace boundary verification passed: no local sandbox server trace exceeds 250 MB.");
}
