/** Read-only development experiment; no learner records or production engine writes. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SERVER_TIMEOUT_MS = 30_000;
const FIELDS = ["topic_name", "evidence_quote", "root_problem", "confusion", "insight", "next_action", "clarifying_question", "root_problem_confidence"];
const jsonError = (status: number, error: string, stage: string) => Response.json({ error, stage }, { status, headers: { "Cache-Control": "no-store" } });
const respond = (data: Record<string, unknown>) => Response.json(data, { headers: { "Cache-Control": "no-store" } });
function openAIConfig() {
  const keySource = process.env.MYWAY_OPENAI_API_KEY ? "MYWAY_OPENAI_API_KEY" : process.env.OPENAI_API_KEY ? "OPENAI_API_KEY" : null;
  const apiKey = process.env.MYWAY_OPENAI_API_KEY || process.env.OPENAI_API_KEY || null;
  const model = (process.env.MYWAY_LOCAL_ASSESSMENT_OPENAI_MODEL || process.env.MYWAY_VISUAL_EXPERIENCE_OPENAI_MODEL || process.env.MYWAY_OPENAI_FULL_LOOP_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const endpoint = new URL(`${base}/chat/completions`);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(endpoint.hostname))) throw new Error("OPENAI_BASE_URL must use HTTPS (or local loopback HTTP).");
  return { apiKey, keySource, model, endpoint };
}
function guard(request: Request): Response | null {
  if (process.env.NODE_ENV !== "development") return jsonError(403, "Cloud assessment is restricted to the development server.", "access");
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)) return jsonError(403, "Cloud assessment is available only on localhost.", "access");
  const origin = request.headers.get("origin");
  if (origin) {
    try { if (new URL(origin).origin !== url.origin) return jsonError(403, "Cross-origin assessment rejected.", "access"); }
    catch { return jsonError(403, "Invalid origin.", "access"); }
  }
  return null;
}
function validSchema(raw: unknown): raw is Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const s = raw as Record<string, unknown>;
  if (s.type !== "object" || s.additionalProperties !== false || !Array.isArray(s.required) || !s.properties || typeof s.properties !== "object" || Array.isArray(s.properties)) return false;
  const p = s.properties as Record<string, unknown>;
  if (Object.keys(p).sort().join("|") !== [...FIELDS].sort().join("|") || [...s.required].sort().join("|") !== [...FIELDS].sort().join("|")) return false;
  for (const name of FIELDS) {
    const x = p[name]; if (!x || typeof x !== "object" || Array.isArray(x)) return false;
    const field = x as Record<string, unknown>;
    if (field.type !== (name === "confusion" || name === "insight" ? "integer" : name === "root_problem_confidence" ? "number" : "string")) return false;
    if ((name === "confusion" || name === "insight") && (field.minimum !== -1 || field.maximum !== 10)) return false;
    if (name === "root_problem_confidence" && (field.minimum !== 0 || field.maximum !== 1)) return false;
    if (name === "next_action" && (!Array.isArray(field.enum) || [...field.enum].sort().join("|") !== "clarify|proceed")) return false;
  }
  return true;
}
export async function GET(request: Request) {
  const blocked = guard(request); if (blocked) return blocked;
  try {
    const cfg = openAIConfig();
    return respond({ ready: Boolean(cfg.apiKey), keySource: cfg.keySource, model: cfg.model, endpointHost: cfg.endpoint.hostname, serverTimeoutSeconds: SERVER_TIMEOUT_MS / 1000 });
  } catch { return jsonError(503, "Invalid cloud provider configuration; check OPENAI_BASE_URL.", "configuration"); }
}
export async function POST(request: Request) {
  const blocked = guard(request); if (blocked) return blocked;
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return jsonError(415, "Expected application/json.", "validation");
  const advertisedLength = Number(request.headers.get("content-length") || 0);
  if (advertisedLength > 14000) return jsonError(413, "Request is too large.", "validation");
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError(400, "Malformed JSON body.", "validation"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError(400, "Expected an object.", "validation");
  const data = body as Record<string, unknown>;
  if (typeof data.userPrompt !== "string" || !data.userPrompt.trim() || data.userPrompt.length > 4000 ||
      typeof data.systemPrompt !== "string" || !data.systemPrompt.trim() || data.systemPrompt.length > 5000 ||
      !validSchema(data.responseSchema) || JSON.stringify(data.responseSchema).length > 9000) return jsonError(400, "Invalid assessment prompt or schema.", "validation");
  let cfg: ReturnType<typeof openAIConfig>;
  try { cfg = openAIConfig(); } catch { return jsonError(503, "Invalid provider base URL; inspect OPENAI_BASE_URL.", "configuration"); }
  if (!cfg.apiKey) return jsonError(503, "Missing MYWAY_OPENAI_API_KEY or OPENAI_API_KEY on server.", "configuration");
  const aborter = new AbortController();
  const deadline = setTimeout(() => aborter.abort(), SERVER_TIMEOUT_MS);
  const began = Date.now();
  try {
    const result = await fetch(cfg.endpoint.toString(), {
      method: "POST", signal: aborter.signal, cache: "no-store",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.model, store: false, messages: [
        { role: "system", content: data.systemPrompt }, { role: "user", content: data.userPrompt },
      ], response_format: { type: "json_schema", json_schema: { name: "myway_assessment_v3_4_1", strict: true, schema: data.responseSchema } } }),
    });
    if (!result.ok) return jsonError(result.status === 429 ? 429 : result.status === 400 ? 422 : 502, `OpenAI returned HTTP ${result.status}; check model support for structured JSON and your API access.`, "provider_response");
    const response: unknown = await result.json();
    if (!response || typeof response !== "object") return jsonError(502, "Invalid provider JSON response.", "provider_response");
    const obj = response as Record<string, unknown>;
    const choices = obj.choices;
    const first = Array.isArray(choices) ? choices[0] : null;
    const message = first && typeof first === "object" ? (first as Record<string, unknown>).message : null;
    const raw = message && typeof message === "object" ? (message as Record<string, unknown>).content : null;
    if (typeof raw !== "string") return jsonError(502, "Provider returned no assessment JSON (possibly a refusal or unsupported schema).", "provider_response");
    return respond({ raw, model: typeof obj.model === "string" ? obj.model : cfg.model, providerMs: Date.now() - began });
  } catch (error) {
    return jsonError(502, aborter.signal.aborted ? "OpenAI request reached the 30-second server timeout." : `Transport failure: ${error instanceof Error ? error.message : "Unknown error"}`, aborter.signal.aborted ? "server_timeout" : "transport");
  } finally { clearTimeout(deadline); }
}
