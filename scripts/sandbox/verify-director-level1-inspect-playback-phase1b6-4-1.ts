import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const relative =
  "sandbox/probe-lab/motion-camera-library/ui/director-perceptual-capability-audit-viewer.tsx";
const source = readFileSync(join(process.cwd(), relative), "utf8");

assert(
  source.includes(
    "const effectivePlaying = isPlaying && isIntersecting && documentVisible;",
  ),
  "Inspect mode must not suppress the Level 1 playback clock.",
);
assert(
  !source.includes("documentVisible && !inspectMode"),
  "Retired inspect-mode playback gate is still present.",
);
assert(
  source.includes(
    '<button type="button" onClick={() => setIsPlaying((value) => !value)} style={buttonStyle}>',
  ) && !source.includes("disabled={inspectMode}"),
  "Play must remain available while the user is inspecting the scene.",
);
assert(
  source.includes(
    'onClick={() => setInspectMode((value) => !value)} style={{ ...buttonStyle, ...(inspectMode ? activeButtonStyle : null) }}',
  ),
  "Inspect toggle must not forcibly stop playback.",
);
assert(
  source.includes("if (inspectMode) return;"),
  "Inspect playback must preserve the manual observer camera instead of letting the Director camera overwrite it.",
);
assert(
  source.includes("playing · inspect camera") &&
    source.includes("Inspect keeps your manual camera while playback continues"),
  "Inspect playback status/help copy is missing.",
);
assert(
  source.includes('border: "1px solid rgba(56,189,248,0.5)"') &&
    !/const activeButtonStyle:[\s\S]*?borderColor/.test(source.slice(source.indexOf("const activeButtonStyle"), source.indexOf("const toggleLabelStyle"))),
  "Active Inspect button must override border with border, not borderColor.",
);
assert(
  (source.match(/<Canvas/g) ?? []).length === 1 &&
    source.includes('frameloop="demand"') &&
    source.includes('dpr={1}'),
  "Inspect-playback hotfix must preserve the single demand-rendered DPR-1 Canvas.",
);

console.log("Director Level 1 inspect playback Phase 1B.6.4.1 verification passed.");
console.log("Manual OrbitControls camera remains authoritative in Inspect while the capability timeline continues playing; exiting Inspect returns to the Director camera.");
