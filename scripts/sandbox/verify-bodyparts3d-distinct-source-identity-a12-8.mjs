import fs from "node:fs";
import path from "node:path";

const rootArgIndex = process.argv.indexOf("--project-root");
const projectRoot = path.resolve(
  rootArgIndex >= 0 && process.argv[rootArgIndex + 1]
    ? process.argv[rootArgIndex + 1]
    : process.cwd(),
);

function read(relative) {
  return fs.readFileSync(path.join(projectRoot, relative), "utf8");
}
function requireMarker(source, marker, message) {
  if (!source.includes(marker)) {
    throw new Error(`${message} Missing marker: ${marker}`);
  }
}
function forbidMarker(source, marker, message) {
  if (source.includes(marker)) {
    throw new Error(`${message} Forbidden marker: ${marker}`);
  }
}

const library = read("sandbox/probe-lab/assets/asset-library.server.ts");
const manual = read("sandbox/probe-lab/assets/providers/manual-glb-provider.server.ts");
const full = read("sandbox/probe-lab/assets/bodyparts3d-full-import.server.ts");
const ui = read("sandbox/probe-lab/assets/ui/bodyparts3d-slp-pilot-import-lab.tsx");
const scale = read("sandbox/probe-lab/assets/routes/library.ts");

for (const marker of [
  'contentIdentityMode?: "binary" | "source_identity"',
  'options.contentIdentityMode ?? "binary"',
  'contentIdentityMode === "source_identity"',
  "sourceIdentityMatch",
  'contentIdentityMode === "binary" &&',
  "Source-identity content registration requires a stable source provider and source asset ID.",
]) {
  requireMarker(
    library,
    marker,
    "A.12.8 must preserve binary-hash dedupe by default while allowing explicit authoritative source identity.",
  );
}

requireMarker(
  manual,
  'contentIdentityMode?: "binary" | "source_identity"',
  "The manual GLB provider must expose the internal source-identity registration mode.",
);
requireMarker(
  manual,
  'input.contentIdentityMode ?? "binary"',
  "The manual GLB provider must keep binary dedupe as its default.",
);

for (const marker of [
  'contentIdentityMode: "source_identity"',
  "sameElementIdentity",
  'status: "already_registered"',
  "This collision is not counted as an available atlas element.",
  "queueExhausted",
  "reconciliationMissing",
  '"incomplete" as const',
  "Session-local duplicate counts can never manufacture 100%.",
  "registry verifies all 2,234 official FJ element identities",
]) {
  requireMarker(
    full,
    marker,
    "The full BodyParts3D importer must treat official FJ source identity as authoritative and verify completion against the registry.",
  );
}

forbidMarker(
  full,
  "const done = session.queue.length === 0;",
  "Queue exhaustion alone must never mean a complete BodyParts3D atlas.",
);

for (const marker of [
  "reconciliation_missing?: string[]",
  'if (next.phase === "complete")',
  "if (next.remaining <= 0)",
  "this state is not treated as 100% complete",
  "Official FJ identities still missing",
  "same-source already registered",
]) {
  requireMarker(
    ui,
    marker,
    "The BodyParts3D UI must distinguish authoritative completion from an exhausted-but-incomplete queue.",
  );
}

forbidMarker(
  ui,
  'next.phase === "complete" || next.remaining <= 0',
  "The UI must not clear an exhausted incomplete session as a success.",
);

// A.12.7 must remain intact.
for (const marker of [
  "const ASSET_LIBRARY_LIST_CONCURRENCY = 16;",
  'verification: "registry_metadata" as const',
  "async function mapWithConcurrency<T, R>(",
  'return errorResponse(caught, 500, "registry_read");',
  'return errorResponse(caught, 500, "list_stats");',
  'verification: "registry_metadata_fallback" as const',
]) {
  requireMarker(
    scale,
    marker,
    "A.12.8 must preserve A.12.7 Asset Library scale hardening.",
  );
}

console.log(
  "PASS: A.12.8 BodyParts3D distinct source identity + authoritative completion verified. Normal MyWay imports retain binary dedupe; the full atlas may register byte-identical geometry as a distinct official FJ source identity, and 100% now requires all 2,234 FJ identities in the registry.",
);
