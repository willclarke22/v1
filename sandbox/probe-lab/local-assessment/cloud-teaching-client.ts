import type { TeachingInput } from "./learning-plan";
const ROUTE = "/api/sandbox/probe-lab/local-assessment/teaching";
export async function requestOpenAITeaching(input: TeachingInput, signal: AbortSignal): Promise<{ raw: string; model: string }> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 42_000);
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch(ROUTE, { method: "POST", cache: "no-store", signal: controller.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: input }) });
    const data: unknown = await response.json();
    const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
    if (!response.ok) throw new Error(`${typeof result.stage === "string" ? result.stage : "teaching"}: ${typeof result.error === "string" ? result.error : `HTTP ${response.status}`}`);
    if (typeof result.raw !== "string" || typeof result.model !== "string") throw new Error("Teaching endpoint returned no structured response.");
    return { raw: result.raw, model: result.model };
  } catch (error) {
    if (signal.aborted) throw new DOMException("Stopped by user", "AbortError");
    if (timedOut) throw new Error("Teaching request timed out after 42 seconds.");
    throw error;
  } finally { clearTimeout(timeout); signal.removeEventListener("abort", onAbort); }
}
