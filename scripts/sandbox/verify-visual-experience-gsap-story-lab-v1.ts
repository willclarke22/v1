import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const labPath = "sandbox/probe-lab/visual-experience/ui/visual-experience-lab.tsx";
const storyPath = "sandbox/probe-lab/visual-experience/ui/gsap-story-lab.tsx";

for (const relative of [labPath, storyPath]) {
  assert(fs.existsSync(path.join(process.cwd(), relative)), `Missing 2D Story Lab dependency: ${relative}`);
}

const lab = source(labPath);
const story = source(storyPath);

for (const marker of [
  'import { GsapStoryLab } from "./gsap-story-lab";',
  '"full-turn" | "orchestration" | "2d-story"',
  'params.get("tab") === "2d-story"',
  'chooseTab("2d-story")',
  "2D Story Lab",
  "<GsapStoryLab />",
]) {
  assert(lab.includes(marker), `Visual Experience 2D Story tab marker missing: ${marker}`);
}

assert(
  lab.includes("<OrchestrationLab />") && lab.includes("Full Turn") && lab.includes("Orchestration Lab"),
  "2D Story Lab must remain a sibling addition and preserve the existing Full Turn + Orchestration workbench.",
);

for (const marker of [
  "2D STORY LAB · SVG + GSAP",
  "Generated code",
  "Visual output",
  'aria-label="GSAP story code"',
  'sandbox="allow-scripts"',
  'srcDoc={runtimeDocument}',
  "postMessage",
  'const GSAP_CDN_URL = "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js";',
  'new Function("stage", "gsap", "story"',
  "story.timeline",
  "Reset example",
  "Restart",
  "Pause",
  "aspectRatio: \"16 / 9\"",
  "Se</text>",
  "me</text>",
  "cayó</text>",
  "el vaso</text>",
  "AFFECTED PERSON",
  "THING THAT FELL",
  "SPANISH CUES",
  "EVENT MODEL",
  "MEANING",
]) {
  assert(story.includes(marker), `2D Story Lab runtime/story marker missing: ${marker}`);
}

assert(
  !story.includes('sandbox="allow-scripts allow-same-origin"') &&
    !story.includes('sandbox="allow-same-origin allow-scripts"'),
  "Generated code preview must not receive same-origin access.",
);

assert(
  story.includes("No generated code runs in the MyWay parent document.") &&
    story.includes("sandboxed iframe with scripts enabled and same-origin access denied"),
  "The UI must make the generated-code isolation boundary explicit.",
);

assert(
  story.includes("const DEFAULT_STORY_CODE = `") &&
    story.includes("gsap.timeline") &&
    story.includes("strokeDashoffset") &&
    story.includes("#glass"),
  "The default Spanish benchmark must demonstrate a timed story rather than a static poster.",
);

console.log("PASS: Visual Experience 2D Story Lab + isolated GSAP runtime V1 verified.");
console.log("Full Turn and Orchestration remain intact; a third 2D Story Lab tab accepts generated SVG/GSAP programs and executes them only inside an opaque sandboxed iframe.");
