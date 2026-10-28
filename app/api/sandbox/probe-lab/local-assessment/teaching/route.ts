import {VERIFIER_FORMAT,VERIFIER_SYSTEM_PROMPT,VERIFIER_SCHEMA,validVerifierInput} from "@/sandbox/probe-lab/learning-space/topic-association-verifier";
import {COMPACT_TEACHING_FORMAT,COMPACT_TEACH_SCHEMA,COMPACT_TEACH_SYSTEM_PROMPT,validCompactTeachingInput} from "@/sandbox/probe-lab/local-assessment/compact-teaching";
import { readOpenAIUsage } from "@/sandbox/probe-lab/local-assessment/model-token-usage";
/** Sandbox-only teaching stage; never writes learning state or calls production engines. */
import { TEACH_SCHEMA, TEACH_SYSTEM_PROMPT, type TeachingInput } from "../../../../../../sandbox/probe-lab/local-assessment/learning-plan";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const timeoutMs = 30_000;
const ALLOWED_MODELS = new Set(["gpt-4o-mini", "gpt-4.1-mini"]);
const fail = (status: number, error: string, stage: string) => Response.json({ error, stage }, { status, headers: { "Cache-Control": "no-store" } });
function checkOrigin(request: Request): Response | null {
  if (process.env.NODE_ENV !== "development") return fail(403, "Teaching is development-only.", "access");
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)) return fail(403, "Teaching is localhost-only.", "access");
  // Bind the request origin to the validated local browser Host, not Next's internal URL.
  const localHost = (request.headers.get("host") || "").trim().toLowerCase();
  if (!new Set(["127.0.0.1:3001", "localhost:3001"]).has(localHost)) return fail(403, "Teaching host must be local port 3001.", "access");
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const supplied = new URL(origin);
      if (supplied.username || supplied.password || supplied.origin !== `http://${localHost}`)
        return fail(403, "Cross-origin request rejected.", "access");
    } catch { return fail(403, "Invalid origin.", "access"); }
  }
  return null;
}
function readConfig() {
  const apiKey = process.env.MYWAY_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const model = (process.env.MYWAY_LOCAL_ASSESSMENT_OPENAI_MODEL || process.env.MYWAY_VISUAL_EXPERIENCE_OPENAI_MODEL || process.env.MYWAY_OPENAI_FULL_LOOP_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const endpoint = new URL(`${base}/chat/completions`);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(endpoint.hostname))) throw new Error("Invalid OpenAI base URL");
  return { apiKey, model, endpoint };
}
function validContext(v: unknown): v is TeachingInput {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const x = v as Record<string, unknown>;
  if (typeof x.topic !== "string" || x.topic.length > 110 || typeof x.root_problem !== "string" || !x.root_problem.trim() || x.root_problem.length > 500 || typeof x.evidence_quote !== "string" || x.evidence_quote.length > 450 ||
    typeof x.learner_statement !== "string" || !x.learner_statement.trim() || x.learner_statement.length > 2500 ||
    typeof x.clarification_answer !== "string" || x.clarification_answer.length > 2500 ||
    typeof x.prior_clarifying_question !== "string" || x.prior_clarifying_question.length > 400 ||
    typeof x.root_problem_confidence !== "number" || x.root_problem_confidence < 0 || x.root_problem_confidence > 1 ||
    !Array.isArray(x.related_subjects) || x.related_subjects.length > 3 || !Array.isArray(x.candidate_relationships) || x.candidate_relationships.length > 2) return false;
  const p = x.profile;
  if (!p || typeof p !== "object" || Array.isArray(p)) return false;
  const profile = p as Record<string, unknown>;
  if (!Array.isArray(profile.interests) || profile.interests.length > 5 || !profile.interests.every(i => typeof i === "string" && i.length <= 45) ||
      typeof profile.goal !== "string" || profile.goal.length > 140 || typeof profile.preferred_style !== "string" || !["unsure", "examples_first", "rules_first", "visual_first", "step_by_step"].includes(profile.preferred_style)) return false;
  return x.related_subjects.every(s => s && typeof s === "object" && typeof s.label === "string" && s.label.length < 200 && typeof s.similarity === "number" && Number.isFinite(s.similarity)) &&
    x.candidate_relationships.every(s => s && typeof s === "object" && typeof s.label === "string" && s.label.length < 200 && typeof s.description === "string" && s.description.length < 300 && typeof s.similarity === "number" && Number.isFinite(s.similarity) && s.status === "candidate");
}
export async function POST(request: Request) {
  const denied = checkOrigin(request); if (denied) return denied;
  if (!request.headers.get("content-type")?.includes("application/json")) return fail(415, "JSON required.", "validation");
  if (Number(request.headers.get("content-length") || 0) > 12500) return fail(413, "Payload too large.", "validation");
  let payload: unknown;
  try { payload = await request.json(); } catch { return fail(400, "Invalid JSON.", "validation"); }
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const verifying=body.format===VERIFIER_FORMAT;
  const compact=body.format===COMPACT_TEACHING_FORMAT;
  if(body.format!==undefined&&!compact&&!verifying)return fail(400,"Unrecognized teaching format.","validation");
  if (!(verifying?validVerifierInput(body.context):compact?validCompactTeachingInput(body.context):validContext(body.context)) || JSON.stringify(body.context).length > 10500) return fail(400, "Invalid teaching context.", "validation");
  let config: ReturnType<typeof readConfig>;
  try { config = readConfig(); } catch { return fail(503, "Bad cloud configuration.", "configuration"); }
  if (!config.apiKey) return fail(503, "Missing server-side OpenAI key.", "configuration");
  const selectedModel = body.model === undefined ? config.model : body.model;
  if (typeof selectedModel !== "string" || !ALLOWED_MODELS.has(selectedModel)) return fail(422, "Unsupported teaching model choice.", "validation");
  const aborter = new AbortController();
  const timer = setTimeout(() => aborter.abort(), timeoutMs);
  try {
    const response = await fetch(config.endpoint.toString(), {
      method: "POST", signal: aborter.signal, cache: "no-store",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: selectedModel, store: false, messages: [
        { role: "system", content: verifying?VERIFIER_SYSTEM_PROMPT:compact?COMPACT_TEACH_SYSTEM_PROMPT:TEACH_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(body.context) },
      ], response_format: { type: "json_schema", json_schema: { name: verifying?"myway_topic_association_verifier_v1":compact?"myway_learning_space_teaching_v1":"myway_teaching_v3_5", strict: true, schema: verifying?VERIFIER_SCHEMA:compact?COMPACT_TEACH_SCHEMA:TEACH_SCHEMA } } }),
    });
    if (!response.ok) return fail(response.status === 429 ? 429 : 502, `OpenAI HTTP ${response.status}.`, "provider_response");
    const data: unknown = await response.json();
    const obj = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const choices = Array.isArray(obj.choices) ? obj.choices : [];
    const first = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
    const msg = first.message && typeof first.message === "object" ? first.message as Record<string, unknown> : {};
    if (typeof msg.content !== "string") return fail(502, "No teaching JSON returned.", "provider_response");
    return Response.json({ raw: msg.content, model: typeof obj.model === "string" ? obj.model : selectedModel, usage: readOpenAIUsage(obj) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(502, aborter.signal.aborted ? "Teaching provider reached the 30-second deadline." : (error instanceof Error ? error.message : "Transport failed"), aborter.signal.aborted ? "server_timeout" : "transport"); }
  finally { clearTimeout(timer); }
}
