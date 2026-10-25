import assert from "node:assert/strict";
import fs from "node:fs";
import { MOCK_TOPICS } from "../../public/myway-local-embedding-lab-v2/mock-topics.mjs";
const ui=fs.readFileSync("sandbox/probe-lab/local-assessment/local-assessment-lab.tsx","utf8");
const css=fs.readFileSync("sandbox/probe-lab/local-assessment/local-assessment-lab.module.css","utf8");
assert.equal(MOCK_TOPICS.length,50);
for(const key of ["topic_name", "evidence_quote", "root_problem", "confusion", "insight", "next_action", "clarifying_question", "root_problem_confidence"])assert(ui.includes(key),`missing ${key}`);
for(const marker of [
  'const PROMPT_VERSION = "myway_assessment_provider_confidence_v3_4"',
  'const MAX_CLARIFICATION_DEPTH = 1',
  'const DEFAULT_SCHEMA_TEXT = JSON.stringify(SCHEMA, null, 2)',
  'function parseEditableSchema(', 'function validateAssessment(',
  'schemaValidation.error', 'responseConstraint: SCHEMA',
  'buildUserPrompt(text, context)', 'recoverEvidenceQuote(',
  'const evidenceText = context ?',
  'setPendingClarification({', 'setPendingClarification(null)',
  'originalMessage: context ?',
  'MYWAY\'S PREVIOUS CLARIFYING QUESTION (not learner evidence)',
  'MAX_CLARIFICATION_DEPTH', 'promptInput: userPrompt', 'responseSchemaUsed: parsedSchema.schema',
  'systemPromptUsed: systemPrompt',
  'Assessment JSON schema', 'Assessment system prompt',
  'CONFUSION', 'INSIGHT', 'CLARIFICATION RECOMMENDED',
  'await runConnectedComparison(id, parsed.assessment.topic_name, rootProblem)',
  'connectedPendingReject.current?.(new DOMException(',
  'workflowStage: aborted ? "cancelled" : "embedding_error"',
  'Advanced · Legacy manual benchmark'
])assert(ui.includes(marker),`missing ${marker}`);
for(const txt of [
 '0 complete clarity', '1 almost full clarity but slight checking', '2 light uncertainty',
 '3 mild confusion, small gaps', '4 noticeable confusion', '5 moderate confusion, incomplete model',
 '6 strong confusion', '7 significant confusion, major misinterpretations', '8 deep confusion',
 '9 severe confusion, close to giving up', '10 total confusion or frustration',
 '0 no insight (acknowledgment, filler)', '1 extremely minimal curiosity',
 '2 slight engagement: factual follow-up', '3 basic noticing', '4 shallow connection',
 '5 clear realization', '6 reframing / analogy',
 '7 strong integration of multiple ideas', '8 cross-domain integration',
 '9 breakthrough synthesis', '10 profound/original insight'
])assert(ui.includes(txt),`rubric anchor missing: ${txt}`);
assert(ui.includes('if (!text || busy || embedBusy) return;'));
assert(ui.includes('event.key === "Enter" && !event.shiftKey'));
assert(css.includes('.promptDock') && css.includes('.pendingClarify'));
assert(!/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/.test(ui));
assert(!/\blocalStorage\s*\.|indexedDB\.open|\.from\(\s*['"]topic_state|\/api\/semantic-enrichment/.test(ui));
console.log('PASS: V3 original rubric, grounding, clarification, editable guarded schema, prompt transparency, cached two-way retrieval and sandbox-only scope.');
