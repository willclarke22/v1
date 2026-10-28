import type { ModelTokenUsage } from "./model-token-usage";
import type { TeachingInput } from "./learning-plan";
import type { CompactTeachingInput } from "./compact-teaching";
const ROUTE = "/api/sandbox/probe-lab/local-assessment/teaching";
export async function requestOpenAITeaching(input: TeachingInput|CompactTeachingInput, signal: AbortSignal, model?: string, format?: "myway_learning_space_teaching_v1"): Promise<{ raw: string; model: string; usage: ModelTokenUsage | null }> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 42_000);
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch(ROUTE, { method: "POST", cache: "no-store", signal: controller.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: input, model, ...(format?{format}:{}) }) });
    const data: unknown = await response.json();
    const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
    if (!response.ok) throw new Error(`${typeof result.stage === "string" ? result.stage : "teaching"}: ${typeof result.error === "string" ? result.error : `HTTP ${response.status}`}`);
    if (typeof result.raw !== "string" || typeof result.model !== "string") throw new Error("Teaching endpoint returned no structured response.");
    return { raw: result.raw, model: result.model, usage: parseUsage(result.usage) };
  } catch (error) {
    if (signal.aborted) throw new DOMException("Stopped by user", "AbortError");
    if (timedOut) throw new Error("Teaching request timed out after 42 seconds.");
    throw error;
  } finally { clearTimeout(timeout); signal.removeEventListener("abort", onAbort); }
}

function parseUsage(value: unknown): ModelTokenUsage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const num = (x: unknown): number | null => typeof x === "number" && Number.isSafeInteger(x) && x >= 0 ? x : null;
  const input = num(v.promptTokens), output = num(v.completionTokens);
  if (input === null || output === null) return null;
  const cached = num(v.cachedTokens);
  if (cached !== null && cached > input) return null;
  return {promptTokens:input,completionTokens:output,totalTokens:num(v.totalTokens)??input+output,cachedTokens:cached};
}
