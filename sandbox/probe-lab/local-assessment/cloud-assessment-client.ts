/** Browser boundary for explicit opt-in cloud requests. No API secrets here. */
const ROUTE = "/api/sandbox/probe-lab/local-assessment/openai";
const CLOUD_CLIENT_TIMEOUT_MS = 42_000;
const CONFIG_TIMEOUT_MS = 8_000;
export type CloudAssessmentRequest = { userPrompt: string; systemPrompt: string; responseSchema: Record<string, unknown>; signal: AbortSignal };
export type CloudAssessmentReply = { raw: string; model: string };
export type CloudSetupInfo = { ready: boolean; model: string; keySource: string | null; endpointHost: string; serverTimeoutSeconds: number };
export class CloudAssessmentError extends Error {
  constructor(message: string, public readonly stage: string, public readonly httpStatus?: number) { super(message); this.name = "CloudAssessmentError"; }
}
function linkedAbort(external: AbortSignal | null, timeoutMs: number) {
  const controller = new AbortController();
  let expired = false;
  const onAbort = () => controller.abort();
  if (external?.aborted) controller.abort();
  else external?.addEventListener("abort", onAbort, { once: true });
  const deadline = setTimeout(() => { expired = true; controller.abort(); }, timeoutMs);
  return { signal: controller.signal, expired: () => expired, close: () => { clearTimeout(deadline); external?.removeEventListener("abort", onAbort); } };
}
async function decodeResponse(response: Response) {
  let body: unknown;
  try { body = await response.json(); } catch { throw new CloudAssessmentError(`MyWay returned HTTP ${response.status} without a JSON body.`, "response", response.status); }
  if (!body || typeof body !== "object") throw new CloudAssessmentError("MyWay returned an invalid JSON payload.", "response", response.status);
  return body as Record<string, unknown>;
}
export async function requestOpenAIAssessment(request: CloudAssessmentRequest): Promise<CloudAssessmentReply> {
  const timer = linkedAbort(request.signal, CLOUD_CLIENT_TIMEOUT_MS);
  try {
    const response = await fetch(ROUTE, {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: timer.signal,
      body: JSON.stringify({ userPrompt: request.userPrompt, systemPrompt: request.systemPrompt, responseSchema: request.responseSchema }),
    });
    const body = await decodeResponse(response);
    if (!response.ok) {
      const stage = typeof body.stage === "string" ? body.stage : "server";
      throw new CloudAssessmentError(typeof body.error === "string" ? `${stage}: ${body.error}` : `Cloud request failed (HTTP ${response.status})`, stage, response.status);
    }
    if (typeof body.raw !== "string" || typeof body.model !== "string") throw new CloudAssessmentError("Cloud assessment returned no structured JSON text.", "response", response.status);
    return { raw: body.raw, model: body.model };
  } catch (error) {
    if (timer.expired()) throw new CloudAssessmentError("Cloud request timed out after 42 seconds (including dev-route startup). Check the development terminal and Diagnostics tab.", "client_timeout");
    if (request.signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (error instanceof CloudAssessmentError) throw error;
    throw new CloudAssessmentError(`Cannot complete the MyWay cloud request: ${error instanceof Error ? error.message : String(error)}`, "network");
  } finally { timer.close(); }
}
export async function checkOpenAISetup(): Promise<CloudSetupInfo> {
  const timer = linkedAbort(null, CONFIG_TIMEOUT_MS);
  try {
    const response = await fetch(ROUTE, { method: "GET", cache: "no-store", signal: timer.signal });
    const info = await decodeResponse(response);
    if (!response.ok) throw new CloudAssessmentError(typeof info.error === "string" ? info.error : `Config check failed (HTTP ${response.status})`, "configuration", response.status);
    if (typeof info.ready !== "boolean" || typeof info.model !== "string" || typeof info.endpointHost !== "string" || typeof info.serverTimeoutSeconds !== "number") throw new CloudAssessmentError("Configuration response missing expected fields.", "configuration");
    return { ready: info.ready, model: info.model, keySource: typeof info.keySource === "string" ? info.keySource : null, endpointHost: info.endpointHost, serverTimeoutSeconds: info.serverTimeoutSeconds };
  } catch (error) {
    if (timer.expired()) throw new CloudAssessmentError("Configuration check timed out after 8 seconds.", "client_timeout");
    if (error instanceof CloudAssessmentError) throw error;
    throw new CloudAssessmentError(`Configuration request failed: ${error instanceof Error ? error.message : String(error)}`, "network");
  } finally { timer.close(); }
}
