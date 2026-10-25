import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const route = read("app/sandbox/probe-lab/local-assessment/page.tsx");
const ui = read("sandbox/probe-lab/local-assessment/local-assessment-lab.tsx");
const css = read("sandbox/probe-lab/local-assessment/local-assessment-lab.module.css");

assert(route.includes("LocalAssessmentLab"), "route must render LocalAssessmentLab");
assert(route.includes("@/sandbox/probe-lab/local-assessment/local-assessment-lab"), "route import missing");
assert(ui.startsWith('"use client"'), "client boundary missing");
for (const marker of ["LanguageModel", "availability()", "factory.create", "session.prompt", "responseConstraint: SCHEMA", "initialPrompts", "downloadprogress", "JSON.parse(raw)", "topic_name", "root_problem", "confusion", "generationMs", "totalMs", "Export test results as JSON", "no learning-state writes", "session?.destroy?.()"]) {
  assert(ui.includes(marker), `missing functional marker: ${marker}`);
}
for (const bad of [/\bfetch\s*\(/, /\blocalStorage\b/, /\baxios\b/, /\/api\/.*(?:diagnos|score|learn)/i]) {
  assert(!bad.test(ui), `unexpected side effect or network call: ${bad}`);
}
assert(css.includes(".chatColumn"), "stylesheet incomplete");
assert(ui.includes('type: "integer", minimum: -1, maximum: 10'), "score constraint changed");
assert(ui.includes('required: ["topic_name", "evidence_quote", "root_problem", "confusion", "insight", "next_action", "clarifying_question", "root_problem_confidence"]'), "assessment contract changed");
console.log("PASS: MyWay Edge Local Assessment V1 route, standalone browser API, assessment schema, timing diagnostics, and no persistence.");
