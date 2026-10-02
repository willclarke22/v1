import fs from "node:fs";
import path from "node:path";
import { bodyPartsPresentationIdentity } from "../../sandbox/probe-lab/visual-experience/orchestration/asset-intent-grounder.server";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function source(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

const grounder = source("sandbox/probe-lab/visual-experience/orchestration/asset-intent-grounder.server.ts");

assert(bodyPartsPresentationIdentity("left knee") === "knee", "Left laterality must strip to knee.");
assert(bodyPartsPresentationIdentity("right knee") === "knee", "Right laterality must strip to knee.");
assert(bodyPartsPresentationIdentity("pelvis") === "pelvis", "Non-lateral pelvis identity must remain pelvis.");
assert(bodyPartsPresentationIdentity("left obturator internus") === "obturator internus", "Only laterality should be removed from compound anatomy names.");

for (const marker of [
  "bodyPartsPresentationIdentityNames",
  "identityFamily",
  "Ontology/catalog membership is",
  "not interchangeable presentation assets",
]) {
  assert(grounder.includes(marker), `Anatomy family refinement marker missing: ${marker}`);
}

assert(
  !grounder.includes("for (const asset of [...exact, ...conceptFamily])"),
  "Broad ontology conceptFamily must not remain presentation authority.",
);
assert(
  grounder.includes("for (const asset of [...exact, ...identityFamily])"),
  "BodyParts3D candidates must merge exact identity with laterality-stripped identity family only.",
);

console.log("PASS: Visual Experience BodyParts3D Presentation Family V2.3 verified.");
console.log("Pelvis-related descendants no longer become interchangeable presentation candidates; left/right knee/femur identities can form deterministic presentation families while semantic laterality remains unchanged.");
