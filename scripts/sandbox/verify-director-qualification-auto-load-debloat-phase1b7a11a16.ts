import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const shell = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
for (const marker of [
  'import dynamic from "next/dynamic";',
  'import("./director-qualification-room")',
  'const DirectorQualificationRoom = dynamic(',
  'ssr: false',
  'const qualificationAssets = useMemo(',
  'assets.filter(isLoadableLibraryAsset)',
  'activeTab !== "qualification"',
  'void loadAssets("qualification")',
  'assets={qualificationAssets}',
  'loadAssets("full")',
  'DIRECTOR_ASSET_LIBRARY_CACHE',
  'DIRECTOR_ASSET_LIBRARY_INFLIGHT',
]) {
  assert(shell.includes(marker), `A.11A.16 Director shell marker missing: ${marker}`);
}
assert(
  !shell.includes('import { DirectorQualificationRoom } from "./director-qualification-room";'),
  "A.11A.16 must code-split the 200KB+ Qualification Room out of the initial Capabilities client chunk.",
);
assert(
  (shell.match(/fetch\("\/api\/sandbox\/probe-lab\/assets\/library"/g) ?? []).length === 1,
  "A.11A.16 must retain exactly one shared Asset Library fetch implementation.",
);
assert(
  !shell.includes("<Canvas"),
  "A.11A.16 must not move WebGL ownership into the Director shell.",
);

const autoLoadStart = shell.indexOf("// A.11A.16: entering Qualification owns the lightweight request lifecycle.");
const qualificationReturn = shell.indexOf('if (activeTab === "qualification")');
assert(
  autoLoadStart >= 0 && qualificationReturn > autoLoadStart,
  "A.11A.16 auto-load effect must be established before the Qualification branch renders.",
);
const autoLoadSection = shell.slice(autoLoadStart, qualificationReturn);
assert(
  autoLoadSection.includes('qualificationAssetsLoaded') &&
    autoLoadSection.includes('isLoadingAssets') &&
    autoLoadSection.includes('assetError') &&
    autoLoadSection.includes('void loadAssets("qualification")'),
  "A.11A.16 auto-load must be guarded against duplicate/infinite requests and preserve visible retry on failure.",
);

const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
for (const marker of [
  ".filter(isLoadableLibraryAsset)",
  "assetsLoaded ? resolveQualificationPools(loadableAssets, castOverrides) : []",
  "Loading qualification asset index…",
  "Starting qualification asset request…",
  "DIRECTOR_QUALIFICATION_SUPPORT_CONTAINMENT_INSPECTION_LIMIT",
  "Math.min(2, Math.max(1, candidates.length))",
  "QUALIFICATION_RESIDENT_GLTF_URLS",
]) {
  assert(room.includes(marker), `A.11A.16 Qualification Room marker missing: ${marker}`);
}
assert(
  !room.includes("Preparing qualification pools…"),
  "A.11A.16 must retire the dead-state label that looked like long-running work when no request was active.",
);
assert(
  (room.match(/<Canvas/g) ?? []).length === 1,
  "A.11A.16 must retain exactly one Qualification WebGL Canvas.",
);

const route = source("sandbox/probe-lab/assets/routes/library.ts");
const filterIndex = route.indexOf("const selectedAssets");
const statIndex = route.indexOf("selectedAssets.map(assetWithFileStats)");
assert(
  route.includes('view === "qualification"') &&
    filterIndex >= 0 &&
    statIndex > filterIndex,
  "A.11A.16 must preserve A.11A.15 qualification filtering before file-stat work.",
);

console.log(
  "Director Qualification Room Phase 1B.7A.11A.16 auto-load + de-bloat verification passed.",
);
console.log(
  "Qualification now auto-requests the filtered shared asset snapshot on tab entry, code-splits the Room from the initial Capabilities bundle, passes only loadable GLBs into planning, and does not resolve pools before the snapshot is loaded.",
);
