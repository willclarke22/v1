import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bridgePath = resolve(
  process.cwd(),
  "sandbox/probe-lab/assets/blender/scripts/myway-blender-bridge.py",
);
const searchPath = resolve(
  process.cwd(),
  "sandbox/probe-lab/assets/providers/blenderkit-candidate-search.server.ts",
);

const bridge = readFileSync(bridgePath, "utf8");
const search = readFileSync(searchPath, "utf8");

assert.match(bridge, /import urllib\.error/);
assert.match(
  bridge,
  /return os\.environ\.get\("BLENDERKIT_API_KEY", ""\)\.strip\(\)/,
);
assert.doesNotMatch(bridge, /bpy\.context\.preferences\.addons\.items\(\)/);
assert.match(bridge, /def blenderkit_request\(/);
assert.match(bridge, /exc\.code != 401 or not api_key/);
assert.match(bridge, /retrying this public request without Authorization/);
assert.match(bridge, /return open_request\(""\)/);
assert.match(bridge, /with blenderkit_request\(url, api_key, timeout=90, accept_json=True\)/);
assert.match(bridge, /with blenderkit_request\(url, api_key, timeout=600\)/);

assert.match(search, /async function request\(token\?: string\)/);
assert.match(search, /response\.status === 401 && apiKey/);
assert.match(search, /retrying public candidate search without Authorization/);
assert.match(search, /response = await request\(\);/);

// Guard the local/manual normalization branch: this must remain isolated from
// BlenderKit acquisition so a local GLB can never need BlenderKit auth.
assert.match(
  bridge,
  /elif job\["kind"\] == "normalize_asset":\s*\n\s*import_asset\(job\["input_path"\]\)/,
);
assert.match(
  bridge,
  /elif job\["kind"\] == "blenderkit_acquire":\s*\n[\s\S]*?acquire_blenderkit\(/,
);

console.log(
  "BlenderKit auth fallback fixture passed: MyWay-owned env credential, anonymous retry on 401, no Blender add-on credential bleed-through, and local GLB normalization remains isolated.",
);
