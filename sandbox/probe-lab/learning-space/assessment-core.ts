import { parseModelJson } from "@/sandbox/probe-lab/local-assessment/parse-model-json";
/** V3.7C.3: concise evidence-first assessment; retain V3.6 rubric and strict validator. */
export type Assessment = {
  topic_name: string;
  evidence_quote: string;
  root_problem: string;
  confusion: number; // -1 = insufficient evidence; 0..10 is the original 0.1 rubric
  insight: number;
  next_action: "clarify" | "proceed";
  clarifying_question: string;
  root_problem_confidence: number; // Uncalibrated model-estimated evidence confidence, 0..1; never mastery.
};
export type ClarificationContext = { originalMessage: string; question: string; depth: number };
export type Resolution = "clarify" | "proceed" | "provisional" | "unresolved";
const MAX_CLARIFICATION_DEPTH = 1;
const PROMPT_VERSION = "myway_assessment_provider_confidence_v3_4";
type AssessmentProvider = "edge" | "openai";
export function buildUserPrompt(message: string, context: ClarificationContext | null) {
  if (!context) return message;
  return [
    "LATEST LEARNER ANSWER:", message,
    "EARLIER LEARNER STATEMENT:", context.originalMessage,
    "MYWAY'S PREVIOUS CLARIFYING QUESTION (not learner evidence):", context.question,
    "Identify the enduring conceptual difficulty in the EARLIER learner statement. Use the LATEST answer to refine it, not to erase the original expectation unless it directly contradicts it. MyWay's question is not learner evidence.",
  ].join("\n");
}
export const ASSESSMENT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    topic_name: { type: "string", description: "Specific, reusable subject label (2-5 words), not a learner-difficulty sentence." },
    evidence_quote: { type: "string", description: "Exact substring from the learner's own words, or empty if none." },
    root_problem: { type: "string", description: "Concise evidence-grounded conceptual hypothesis, or empty if unknown." },
    confusion: { type: "integer", minimum: -1, maximum: 10, description: "0..10 confusion rubric; -1 means insufficient evidence." },
    insight: { type: "integer", minimum: -1, maximum: 10, description: "0..10 insight rubric; -1 means insufficient evidence." },
    next_action: { type: "string", enum: ["clarify", "proceed"] },
    clarifying_question: { type: "string", description: "One targeted question if clarifying; otherwise empty string." },
    root_problem_confidence: { type: "number", minimum: 0, maximum: 1, description: "How well learner evidence supports the specific root problem; estimate, not a probability." },
  },
  required: ["topic_name", "evidence_quote", "root_problem", "confusion", "insight", "next_action", "clarifying_question", "root_problem_confidence"],
  additionalProperties: false,
};

const SCHEMA_FIELDS = ["topic_name", "evidence_quote", "root_problem", "confusion", "insight", "next_action", "clarifying_question", "root_problem_confidence"];
export const ASSESSMENT_SYSTEM_PROMPT = `Assess learner statements only. Return the JSON fields, no teaching.
Topic_name: a concrete, reusable subject label (2-5 words), not a broad discipline, vague umbrella or a difficulty sentence. Separate the topic from the root_problem. Root_problem: in <=30 words, state the narrowest difficulty supported by exact learner evidence, without exaggerating its strength (e.g. an expectation is not necessarily an absolute belief). Describe the gap, not the correct explanation. Evidence_quote: exact learner words or "". Never invent examples, beliefs, emotions or certainty. Use an empty root_problem if unsupported.
Confusion (-1 if unclear; otherwise 0..10):
0 complete clarity; 1 almost full clarity but slight checking; 2 light uncertainty; 3 mild confusion, small gaps; 4 noticeable confusion; 5 moderate confusion, incomplete model; 6 strong confusion; 7 significant confusion, major misinterpretations; 8 deep confusion; 9 severe confusion, close to giving up; 10 total confusion or frustration.
Insight (-1 if unclear; otherwise 0..10):
0 no insight (acknowledgment, filler); 1 extremely minimal curiosity; 2 slight engagement: factual follow-up; 3 basic noticing; 4 shallow connection; 5 clear realization; 6 reframing / analogy; 7 strong integration of multiple ideas; 8 cross-domain integration; 9 breakthrough synthesis; 10 profound/original insight.
Score independently from the learner's own evidence. Naming a difficulty alone is not an insight. Do not turn interest or curiosity into a confident diagnosis. Root_problem_confidence (0..1): estimate how strongly learner evidence supports the specific difficulty, not topic knowledge or mastery; use 0 without a grounded root problem. Use proceed only if a specific evidence-backed difficulty is supported. Otherwise ask ONE short question that distinguishes plausible difficulties, not a quiz. On proceed, give an empty question. On follow-up, integrate BOTH learner statements: preserve the original conceptual mismatch, using the new answer to refine or correct it. A vague answer must not erase an earlier evidence-grounded difficulty. MyWay's question is not learner evidence.`;

/** Match learner word sequences, ignoring harmless quotation and spacing differences.
 * Apostrophes INSIDE words remain significant: "we'll" cannot match "well".
 * Recovery always returns the source's exact original substring.
 */
function evidenceTokens(input: string): { word: string; start: number; end: number }[] {
  const words: { word: string; start: number; end: number }[] = [];
  for (const match of input.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)) {
    words.push({ word: match[0].toLowerCase().replaceAll("’", "'"), start: match.index, end: match.index + match[0].length });
  }
  return words;
}
function recoverEvidenceQuote(quote: string, learnerStatements: string[]): string | null {
  if (!quote.trim()) return null;
  const sought = evidenceTokens(quote);
  if (!sought.length) return null;
  for (const statement of learnerStatements) {
    if (statement.includes(quote)) return quote;
    const words = evidenceTokens(statement);
    for (let start = 0; start <= words.length - sought.length; start++) {
      if (sought.every((token, offset) => token.word === words[start + offset].word)) {
        return statement.slice(words[start].start, words[start + sought.length - 1].end);
      }
    }
  }
  return null;
}

/** Keep structural failures strict; recover harmless quotes without accepting new words.
 * A matched quote DOES NOT prove the model's inferred root problem is correct.
 */
export function validateAssessment(raw: string, learnerEvidence: string | string[]): { assessment?: Assessment; error?: string; warnings?: string[] } {
  try {
    const input: unknown = parseModelJson(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Response was not a JSON object." };
    const value = input as Record<string, unknown>;
    if (Object.keys(value).sort().join("|") !== [...SCHEMA_FIELDS].sort().join("|")) return { error: "Output must contain exactly the eight expected fields." };
    for (const field of ["topic_name", "evidence_quote", "root_problem", "clarifying_question"]) {
      if (typeof value[field] !== "string") return { error: `${field} must be a string.` };
    }
    if (!(value.topic_name as string).trim()) return { error: "topic_name cannot be empty." };
    for (const score of ["confusion", "insight"]) {
      const n = value[score];
      if (typeof n !== "number" || !Number.isInteger(n) || n < -1 || n > 10) return { error: `${score} must be an integer -1..10.` };
    }
    if (value.next_action !== "clarify" && value.next_action !== "proceed") return { error: "Invalid next_action." };
    if (typeof value.root_problem_confidence !== "number" || !Number.isFinite(value.root_problem_confidence) || value.root_problem_confidence < 0 || value.root_problem_confidence > 1) return { error: "root_problem_confidence must be 0..1." };
    const assessment = { ...(value as unknown as Assessment) };
    const warnings: string[] = [];
    const statements = Array.isArray(learnerEvidence) ? learnerEvidence : [learnerEvidence];
    const quote = assessment.evidence_quote.trim();
    const recovered = recoverEvidenceQuote(quote, statements);
    if (quote && recovered === null) {
      assessment.evidence_quote = "";
      assessment.root_problem = "";
      assessment.next_action = "clarify";
      warnings.push("Model quoted words not present in a learner statement; withheld quote and root-problem hypothesis.");
    } else if (quote && recovered !== null && recovered !== assessment.evidence_quote) {
      assessment.evidence_quote = recovered;
      warnings.push("Recovered verbatim learner evidence after a harmless punctuation or spacing difference.");
    } else if (!quote && assessment.root_problem.trim()) {
      assessment.root_problem = "";
      assessment.next_action = "clarify";
      warnings.push("Root problem lacked supporting quoted learner evidence; withheld until clarification.");
    }
    if (assessment.root_problem && /\be\.g\.|\bfor example\b/i.test(assessment.root_problem) &&
        !statements.some((line) => /\be\.g\.|\bfor example\b/i.test(line))) {
      assessment.root_problem = "";
      assessment.next_action = "clarify";
      warnings.push("Model supplied examples not stated by the learner; withheld speculative root problem.");
    }
    if (!assessment.root_problem.trim() && assessment.root_problem_confidence !== 0) {
      assessment.root_problem_confidence = 0;
      warnings.push("No supported root problem; confidence set to zero.");
    }
    if (assessment.next_action === "proceed" && assessment.clarifying_question.trim()) {
      assessment.clarifying_question = "";
      warnings.push("Removed a stray clarifying question because the model selected proceed.");
    }
    if (assessment.next_action === "clarify" && !assessment.clarifying_question.trim()) {
      assessment.clarifying_question = "What specifically feels difficult about this topic?";
      warnings.push("The model omitted its clarification question; using a neutral fallback question.");
    }
    if (assessment.topic_name.trim().endsWith("?") || /^(why|how|what|when|where|can|does|do|is|are|should|would|could)\b/i.test(assessment.topic_name.trim())) {
      assessment.topic_name = "unspecified topic";
      warnings.push("The model returned a question instead of a subject label. Retrieval uses the learner message as fallback evidence; no topic is created.");
    }
    return { assessment, warnings };
  } catch (error) {
    return { error: `Model response could not be parsed as JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** After one clarification, stop repeating questions. An evidence-backed hypothesis
 * may proceed provisionally; otherwise the learning difficulty stays unresolved.
 */
export function resolveAssessmentRoute(assessment: Assessment, context: ClarificationContext | null, confidenceThreshold = 0.65): Resolution {
  if (context && context.depth >= MAX_CLARIFICATION_DEPTH) {
    return assessment.root_problem.trim() && assessment.evidence_quote.trim() ? "provisional" : "unresolved";
  }
  if (!assessment.root_problem.trim() || assessment.root_problem_confidence < confidenceThreshold) return "clarify";
  return assessment.next_action;
}
