import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { DIRECTOR_CAPABILITIES } from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";

const root = process.cwd();
const requiredFiles = [
  "app/sandbox/probe-lab/director-capability-library/page.tsx",
  "app/sandbox/probe-lab/motion-camera-library/page.tsx",
  "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  "sandbox/probe-lab/motion-camera-library/ui/director-audit-viewer.tsx",
];

for (const relative of requiredFiles) {
  if (!existsSync(resolve(root, relative))) {
    throw new Error(`Missing required Director Capability Library file: ${relative}`);
  }
}

const ids = DIRECTOR_CAPABILITIES.map((capability) => capability.id);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) {
  throw new Error(`Duplicate capability ids: ${Array.from(new Set(duplicateIds)).join(", ")}`);
}
if (DIRECTOR_CAPABILITIES.length < 70) {
  throw new Error(`Expected at least 70 capabilities; found ${DIRECTOR_CAPABILITIES.length}.`);
}

const registry = readFileSync(
  resolve(root, "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts"),
  "utf8",
);
if (!registry.includes('preferred_asset_ids: ["soldier_polyp_ul46oxezyk"]')) {
  throw new Error("The secondary fixture does not deterministically prefer the Soldier asset.");
}

const lab = readFileSync(
  resolve(root, "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx"),
  "utf8",
);
for (const marker of [
  "capabilitySidebarStyle",
  "sidebarCatalogueStyle",
  "Visible capabilities",
  "Capability inspector",
  "DirectorAuditViewer",
]) {
  if (!lab.includes(marker)) throw new Error(`Missing layout marker: ${marker}`);
}

const labCanvasCount = (lab.match(/<Canvas/g) ?? []).length;
if (labCanvasCount !== 0) {
  throw new Error(
    `The Phase 1B.2 library shell must not own a direct Canvas; found ${labCanvasCount}.`,
  );
}

const auditViewerCount = (lab.match(/<DirectorAuditViewer/g) ?? []).length;
if (auditViewerCount !== 1) {
  throw new Error(
    `Expected exactly one active DirectorAuditViewer in the library shell; found ${auditViewerCount}.`,
  );
}

const auditViewer = readFileSync(
  resolve(root, "sandbox/probe-lab/motion-camera-library/ui/director-audit-viewer.tsx"),
  "utf8",
);
const canvasCount = (auditViewer.match(/<Canvas/g) ?? []).length;
if (canvasCount !== 1) {
  throw new Error(
    `Expected exactly one Canvas declaration in the isolated audit viewer; found ${canvasCount}.`,
  );
}
if (!auditViewer.includes('frameloop="demand"')) {
  throw new Error("The isolated audit Canvas must remain demand-rendered.");
}

const legacyRoute = readFileSync(
  resolve(root, "app/sandbox/probe-lab/motion-camera-library/page.tsx"),
  "utf8",
);
if (!legacyRoute.includes('redirect("/sandbox/probe-lab/director-capability-library")')) {
  throw new Error("The legacy route does not redirect to the canonical Director Capability Library URL.");
}

const probeIndex = readFileSync(resolve(root, "app/sandbox/probe-lab/page.tsx"), "utf8");
if (!probeIndex.includes("/sandbox/probe-lab/director-capability-library")) {
  throw new Error("Probe Lab still points to the legacy Motion & Camera Library URL.");
}

console.log(
  `Director Capability Library verification passed: ${DIRECTOR_CAPABILITIES.length} unique capabilities, canonical route, Soldier fixture, one isolated demand-rendered audit Canvas, scrollable capability sidebar, and relocated inspector.`,
);
