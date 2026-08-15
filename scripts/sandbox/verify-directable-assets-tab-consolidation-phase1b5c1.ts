import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const canonicalPage = source(
  "app/sandbox/probe-lab/directable-assets/page.tsx",
);
const legacyPage = source(
  "app/sandbox/probe-lab/directable-interactions/page.tsx",
);
const workbench = source(
  "sandbox/probe-lab/directability/ui/directable-assets-workbench.tsx",
);
const qualificationLab = source(
  "sandbox/probe-lab/directability/ui/directable-asset-qualification-lab.tsx",
);
const pairLab = source(
  "sandbox/probe-lab/directability/ui/directable-asset-pair-lab.tsx",
);
const uiIndex = source(
  "sandbox/probe-lab/directability/ui/index.ts",
);
const probeLabPage = source("app/sandbox/probe-lab/page.tsx");
const readme = source("sandbox/probe-lab/directability/README.md");
const phaseDoc = source(
  "sandbox/probe-lab/directability/PHASE1B5C_ASSET_PAIR_INTERACTIONS.md",
);

assert(
  canonicalPage.includes("DirectableAssetsWorkbench"),
  "Canonical /directable-assets page must render the shared tabbed workbench.",
);
assert(
  uiIndex.includes("DirectableAssetsWorkbench"),
  "Directability UI index must export DirectableAssetsWorkbench.",
);
assert(
  workbench.includes("Asset Qualification") &&
    workbench.includes("Asset Interactions") &&
    workbench.includes("DirectableAssetQualificationLab") &&
    workbench.includes("DirectableAssetPairLab"),
  "Directable Assets workbench must expose both qualification and interaction tabs using the existing labs.",
);
assert(
  workbench.includes('const CANONICAL_PATH = "/sandbox/probe-lab/directable-assets"') &&
    workbench.includes("?tab=interactions") &&
    workbench.includes("pushState") &&
    workbench.includes("popstate"),
  "Tabbed workbench must keep a copyable canonical URL and browser back/forward synchronization.",
);
assert(
  legacyPage.includes("redirect") &&
    legacyPage.includes("/sandbox/probe-lab/directable-assets?tab=interactions"),
  "Legacy /directable-interactions route must redirect to the canonical interactions tab.",
);
assert(
  !probeLabPage.includes('href: "/sandbox/probe-lab/directable-interactions"') &&
    probeLabPage.includes('href: "/sandbox/probe-lab/directable-assets"') &&
    probeLabPage.includes('title: "Directable Assets"'),
  "Probe Lab must expose one Directable Assets entry rather than duplicate qualification/pair pages.",
);
assert(
  !qualificationLab.includes('href="/sandbox/probe-lab/directable-interactions"'),
  "Qualification tab must not keep a competing navigation link to the legacy pair route.",
);
assert(
  pairLab.includes("resolveAllDirectableAssetPairInteractions") &&
    pairLab.includes("inspectBrowserAssetStructure"),
  "Tab consolidation must retain the canonical Phase 1B.5C pair implementation.",
);
for (const sourceText of [workbench, qualificationLab, pairLab]) {
  assert(
    !sourceText.includes("<Canvas") &&
      !sourceText.includes("@react-three/fiber"),
    "Directable Assets tab consolidation must not introduce another WebGL Canvas.",
  );
}
for (const text of [readme, phaseDoc]) {
  assert(
    text.includes("/sandbox/probe-lab/directable-assets?tab=interactions") &&
      text.includes("/sandbox/probe-lab/directable-interactions") &&
      text.toLowerCase().includes("redirect"),
    "Documentation must identify the canonical interactions deep-link and legacy redirect.",
  );
}

console.log(
  "Directable Assets tab consolidation Phase 1B.5C.1 verification passed.",
);
console.log(
  "Qualification and pair resolution now share one canonical /directable-assets workbench; the legacy /directable-interactions URL redirects to the interactions tab.",
);
