import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_FILM_POLICIES,
  DIRECTOR_PERCEPTUAL_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-perceptual-capabilities";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const total =
  DIRECTOR_CAPABILITIES.length +
  DIRECTOR_PERCEPTUAL_CAPABILITIES.length +
  DIRECTOR_FILM_POLICIES.length;

assert(
  total > DIRECTOR_CAPABILITIES.length,
  "Phase 1B.6.1 combined catalogue must include the higher-level Director hierarchy, not only the atomic registry.",
);

const library = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);

for (const marker of [
  'useState<LibraryCategoryFilter>("level2_all")',
  "Visible capabilities",
  "All levels ·",
  "All Level 1 capabilities",
  "All Level 2 capabilities",
  "All Level 3 policies",
  "One workbench for perceptual/composite direction",
  "Real-asset proof & qualification",
  "Review & visual audit",
  "Advanced inspector & diagnostics",
  "const totalCapabilityCount = libraryEntries.length",
  "{totalCapabilityCount} capabilities",
  "match the current filters",
]) {
  assert(
    library.includes(marker),
    `Phase 1B.6.1 simplified Director layout is missing marker: ${marker}.`,
  );
}

for (const retiredMarker of [
  "setLibraryLayer(",
  "hierarchyLayerGridStyle",
  "Christopher Nolan Principle",
  "<section style={statsGridStyle}>",
  "<section style={inspectorSectionStyle}>",
  "Load optional Asset Library",
  "capabilityCountStyle",
  "{totalCapabilityCount} total",
]) {
  assert(
    !library.includes(retiredMarker),
    `Phase 1B.6.1 should remove default-page clutter marker: ${retiredMarker}.`,
  );
}

assert(
  !library.includes("195 capabilities") && !library.includes("195 total"),
  "Phase 1B.6.1.1 must not hardcode the current combined capability count in the UI.",
);

assert(
  !library.includes("<Canvas"),
  "The Director Capability Library shell must still own zero direct WebGL Canvas elements.",
);

assert(
  (library.match(/<aside style=\{capabilitySidebarStyle\}>/g) ?? []).length === 1,
  "Phase 1B.6.1 must keep exactly one right-hand Visible capabilities rail.",
);

console.log("Director Capability Library layout Phase 1B.6.1 verification passed.");
console.log(`One-page atomic-style workbench preserved; ${total} live hierarchy entries are derived from the combined catalogue.`);
console.log("Top hierarchy tabs, large stat row, Nolan principle card, bottom full-width inspector, and sidebar asset-loader clutter are removed from the default view.");
