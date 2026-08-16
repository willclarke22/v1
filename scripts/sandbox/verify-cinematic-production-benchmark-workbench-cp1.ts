import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BURGER_ASSEMBLY_BENCHMARK } from "../../sandbox/probe-lab/cinematic-production/benchmark-burger-assembly";
import { CINEMATIC_PRODUCTION_SCHEMA_VERSION } from "../../sandbox/probe-lab/cinematic-production/cinematic-production-contract";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

assert(
  String(CINEMATIC_PRODUCTION_SCHEMA_VERSION).startsWith("myway_cinematic_production_cp1"),
  `CP.1 schema family drifted: ${CINEMATIC_PRODUCTION_SCHEMA_VERSION}.`,
);
assert(
  BURGER_ASSEMBLY_BENCHMARK.shots.length === 8,
  `Expected 8 benchmark shots; found ${BURGER_ASSEMBLY_BENCHMARK.shots.length}.`,
);
assert(
  BURGER_ASSEMBLY_BENCHMARK.aspect_ratio === "9:16",
  "Benchmark must remain vertical-first in the CP.1 family.",
);
assert(
  BURGER_ASSEMBLY_BENCHMARK.shots.some(
    (shot) => shot.execution_lane === "skeletal_animation",
  ),
  "CP.1 family must keep the rigged-hand execution lane visible.",
);
assert(
  BURGER_ASSEMBLY_BENCHMARK.shots.some(
    (shot) => shot.execution_lane === "blender_procedural",
  ),
  "CP.1 family must keep the Blender hero-render lane visible.",
);
assert(
  BURGER_ASSEMBLY_BENCHMARK.shots.some(
    (shot) => shot.visible_gaps.length > 0,
  ),
  "CP.1 family must continue to expose visible production gaps rather than declaring the benchmark universally complete.",
);

const page = source("app/sandbox/probe-lab/cinematic-production/page.tsx");
assert(
  page.includes("CinematicProductionLab"),
  "Cinematic Production route is not wired to the benchmark workbench.",
);

const lab = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx",
);
for (const marker of [
  "Golden benchmark",
  "Selected shot",
  "Visible gaps",
  "Existing-system bridges",
  "/sandbox/probe-lab/director-capability-library",
  "/sandbox/probe-lab/directable-assets",
  "/sandbox/probe-lab/asset-library",
  "/sandbox/probe-lab/primitive-builder",
  "/sandbox/probe-lab/blender-python-builder",
]) {
  assert(lab.includes(marker), `CP.1 workbench marker missing: ${marker}.`);
}

const probeIndex = source("app/sandbox/probe-lab/page.tsx");
assert(
  probeIndex.includes('href: "/sandbox/probe-lab/cinematic-production"'),
  "Probe Lab index is missing Cinematic Production.",
);

const readme = source("sandbox/probe-lab/cinematic-production/README.md").toLowerCase();
assert(
  readme.includes("golden benchmark 01") &&
    readme.includes("does not add a second director") &&
    readme.includes("non-goals"),
  "CP.1-family documentation must preserve the benchmark-first architecture and non-duplication boundary.",
);

console.log("Cinematic Production Benchmark Workbench CP.1-family verification passed.");
console.log("Benchmark 01 still contains 8 vertical-first shots with explicit camera/action/execution-lane records, visible gaps, and bridges to existing sandbox authorities.");
