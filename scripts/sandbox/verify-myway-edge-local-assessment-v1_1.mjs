import fs from "node:fs";
import assert from "node:assert/strict";
const ui = fs.readFileSync("sandbox/probe-lab/local-assessment/local-assessment-lab.tsx", "utf8");
const originalCheck = fs.readFileSync("scripts/sandbox/verify-myway-edge-local-assessment-v1.mjs", "utf8");
assert(ui.startsWith('"use client"'), "must remain a browser client component");
assert(ui.includes('clone?: () => Promise<PromptSession>'), "clone type missing");
assert(ui.includes('await base.clone()'), "no independent clone per message");
assert(ui.includes('baseSession.current = { session: base, systemPrompt }'), "base session is not retained");
assert(ui.includes('sessionMode = baseSessionMs > 0 ? "cold clone" : "warm clone"'), "warm/cold diagnostic missing");
assert(ui.includes('sessionMode = "fresh fallback"'), "fallback for unsupported clone missing");
assert(ui.includes('changeSystemPrompt(event.target.value)'), "system-prompt edit must invalidate cache");
assert(ui.includes('baseSession.current?.session.destroy?.()'), "cleanup of cached session missing");
assert(ui.includes('session?.destroy?.()'), "per-turn clone cleanup missing");
assert(ui.includes('responseConstraint: SCHEMA'), "schema output constraint missing");
assert(ui.includes('required: ["topic_name", "evidence_quote", "root_problem", "confusion", "insight", "next_action", "clarifying_question", "root_problem_confidence"]'), "assessment schema changed");
assert(ui.includes('type: "integer", minimum: -1, maximum: 10'), "score bounds changed");
assert(ui.includes('Last mode:'), "timing diagnostics missing");
for (const unwanted of [/\bfetch\s*\(/, /\blocalStorage\b/, /\/api\/.*(?:score|diagnos|learn)/i]) {
 assert(!unwanted.test(ui), 'unexpected network call or persistence '+unwanted);
}
assert(originalCheck.includes('session?.destroy?.()'), "original V1 verifier unexpectedly changed");
console.log("PASS: Edge Lab V1.1 caches unprompted base, clones for independent assessments, invalidates prompt edits, retains V3 schema and has no learning-state writes.");
