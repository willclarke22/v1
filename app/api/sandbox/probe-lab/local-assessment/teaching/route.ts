/** Sandbox-only teaching stage; never writes learning state or calls production engines. */
import { TEACH_SCHEMA, TEACH_SYSTEM_PROMPT, type TeachingInput } from "../../../../../../sandbox/probe-lab/local-assessment/learning-plan";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const timeoutMs = 30_000;
const fail = (status: number, error: string, stage: string) => Response.json({ error, stage }, { status, headers: { "Cache-Control": "no-store" } });
function checkOrigin(request: Request): Response | null {
  if (process.env.NODE_ENV !== "development") return fail(403, "Teaching is development-only.", "access");
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)) return fail(403, "Teaching is localhost-only.", "access");
  const origin = request.headers.get("origin");
  if (origin) { try { if (new URL(origin).origin !== url.origin) return fail(403, "Cross-origin request rejected.", "access"); }
    catch { return fail(403, "Invalid origin.", "access"); } }
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
  if (Number(request.headers.get("content-length") || 0) > 5000) return fail(413, "Payload too large.", "validation");
  let payload: unknown;
  try { payload = await request.json(); } catch { return fail(400, "Invalid JSON.", "validation"); }
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  if (!validContext(body.context) || JSON.stringify(body.context).length > 4500) return fail(400, "Invalid teaching context.", "validation");
  let config: ReturnType<typeof readConfig>;
  try { config = readConfig(); } catch { return fail(503, "Bad cloud configuration.", "configuration"); }
  if (!config.apiKey) return fail(503, "Missing server-side OpenAI key.", "configuration");
  const aborter = new AbortController();
  const timer = setTimeout(() => aborter.abort(), timeoutMs);
  try {
    const response = await fetch(config.endpoint.toString(), {
      method: "POST", signal: aborter.signal, cache: "no-store",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, store: false, messages: [
        { role: "system", content: TEACH_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(body.context) },
      ], response_format: { type: "json_schema", json_schema: { name: "myway_teaching_v3_5", strict: true, schema: TEACH_SCHEMA } } }),
    });
    if (!response.ok) return fail(response.status === 429 ? 429 : 502, `OpenAI HTTP ${response.status}.`, "provider_response");
    const data: unknown = await response.json();
    const obj = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const choices = Array.isArray(obj.choices) ? obj.choices : [];
    const first = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
    const msg = first.message && typeof first.message === "object" ? first.message as Record<string, unknown> : {};
    if (typeof msg.content !== "string") return fail(502, "No teaching JSON returned.", "provider_response");
    return Response.json({ raw: msg.content, model: typeof obj.model === "string" ? obj.model : config.model }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(502, aborter.signal.aborted ? "Teaching provider reached the 30-second deadline." : (error instanceof Error ? error.message : "Transport failed"), aborter.signal.aborted ? "server_timeout" : "transport"); }
  finally { clearTimeout(timer); }
}
