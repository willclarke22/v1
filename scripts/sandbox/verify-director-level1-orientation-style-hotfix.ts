import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const source = readFileSync(
  join(
    process.cwd(),
    "sandbox/probe-lab/motion-camera-library/ui/director-level1-capability-visualization.tsx",
  ),
  "utf8",
);

const startMarker = "const activeMiniButtonStyle: CSSProperties = {";
const start = source.indexOf(startMarker);
assert(start >= 0, "Active orientation button style block is missing.");
const end = source.indexOf("};", start);
assert(end >= 0, "Active orientation button style block is malformed.");
const block = source.slice(start, end + 2);

assert(
  block.includes('border: "1px solid rgba(125,211,252,0.36)"'),
  "Active orientation style must override the full border shorthand.",
);
assert(
  !block.includes("borderColor"),
  "Active orientation style must not mix borderColor with the base border shorthand.",
);

console.log("Director Level 1 orientation style hotfix verification passed.");
console.log("Active orientation buttons now override border with border, avoiding React shorthand/longhand rerender warnings.");
