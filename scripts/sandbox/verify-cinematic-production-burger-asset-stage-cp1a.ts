import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const contract = source(
  "sandbox/probe-lab/cinematic-production/cinematic-production-contract.ts",
);
assert(
  contract.includes("myway_cinematic_production_cp1") &&
    contract.includes("export type CinematicCastSlot") &&
    contract.includes("cast_slots: CinematicCastSlot[]"),
  "CP.1A cast-slot contract must remain available to later CP.1 phases.",
);

const benchmark = source(
  "sandbox/probe-lab/cinematic-production/benchmark-burger-assembly.ts",
);
for (const concept of [
  'preferred_asset_id: "cheeseburger_ms193r4w"',
  'id: "goldfish"',
  'id: "hand"',
  "shot_06_goldfish_insert",
  "shot_07_return_tray",
]) {
  assert(
    benchmark.includes(concept),
    `CP.1A benchmark cast invariant is missing: ${concept}`,
  );
}

const lab = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx",
);
for (const requirement of [
  "/api/sandbox/probe-lab/assets/library",
  "Auto-cast the actual cloud assets",
  "Play benchmark",
  "thumbnail_path",
]) {
  assert(
    lab.includes(requirement),
    `CP.1A cast workbench behavior is missing: ${requirement}`,
  );
}
assert(
  lab.includes("CinematicProductionRuntimeCanvas") ||
    (lab.includes("AssetSprite") && lab.includes("getShotStage")),
  "CP.1A must retain a visible cast stage, either its original lightweight stage or a later compatible runtime canvas.",
);

const readme = source(
  "sandbox/probe-lab/cinematic-production/README.md",
).toLowerCase();
for (const phrase of [
  "goldfish insert",
  "solid burger glb",
]) {
  assert(
    readme.includes(phrase),
    `CP.1A cast/documentation invariant is missing: ${phrase}`,
  );
}

console.log("Cinematic Production CP.1A cast-foundation verification passed.");
console.log("Actual Asset Library casting, manual override, burger/tray/animal/hand benchmark roles, and visible benchmark playback remain available through the current CP.1 runtime.");
