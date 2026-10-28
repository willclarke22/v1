/** MyWay V3.7D.2A cost observability. Pricing snapshot: 2026-10-27.
 * Source: https://developers.openai.com/api/docs/models/gpt-4.1-mini
 *         https://developers.openai.com/api/docs/models/gpt-4o-mini
 * Figures are standard USD per 1M tokens; NOT an invoice or a provider's billing ledger.
 */
export type ModelTokenUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
};
export type StageProvider = "openai" | "glm" | "edge";
export type CostStageStatus = "estimated" | "on_device" | "unpriced" | "missing_usage" | "not_run";
export type StageCost = {
  status: CostStageStatus;
  estimatedUsd: number | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  rateInput: number | null;
  rateCached: number | null;
  rateOutput: number | null;
};
export type TurnCost = {
  assessment: StageCost;
  teaching: StageCost;
  verifier?: StageCost;
  totalEstimatedUsd: number | null;
  knownSubtotalUsd: number | null;
  complete: boolean;
};
const RATINGS: Record<string, {input: number;cached: number;output: number}> = {
  "gpt-4o-mini": { input: 0.15, cached: 0.075, output: 0.60 },
  "gpt-4o-mini-2024-07-18": { input: 0.15, cached: 0.075, output: 0.60 },
  "gpt-4.1-mini": { input: 0.40, cached: 0.10, output: 1.60 },
  "gpt-4.1-mini-2025-04-14": { input: 0.40, cached: 0.10, output: 1.60 },
};
const safeInt = (n: unknown): number | null => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;

/** Only counts returned by the billing provider, NEVER inferred from characters. */
export function readOpenAIUsage(payload: unknown): ModelTokenUsage | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  if (!p.usage || typeof p.usage !== "object" || Array.isArray(p.usage)) return null;
  const u = p.usage as Record<string, unknown>;
  const input = safeInt(u.prompt_tokens), output = safeInt(u.completion_tokens);
  if (input === null || output === null) return null;
  const total = safeInt(u.total_tokens);
  const details = u.prompt_tokens_details && typeof u.prompt_tokens_details === "object" && !Array.isArray(u.prompt_tokens_details)
    ? u.prompt_tokens_details as Record<string, unknown> : null;
  const cached = safeInt(details?.cached_tokens);
  if (cached !== null && cached > input) return null;
  return {promptTokens: input,completionTokens: output,totalTokens: total ?? input + output,cachedTokens: cached};
}
function base(status: CostStageStatus, model: string | null, usage?: ModelTokenUsage | null): StageCost {
  return {status,model,estimatedUsd:null,inputTokens:usage?.promptTokens??null,outputTokens:usage?.completionTokens??null,
    cachedTokens:usage?.cachedTokens??null,rateInput:null,rateCached:null,rateOutput:null};
}
export function calculateStageCost(args: {
  provider: StageProvider; model: string | null; usage?: ModelTokenUsage | null; called: boolean;
}): StageCost {
  const {provider,model,usage,called} = args;
  if (!called) return {...base("not_run",model),estimatedUsd:0};
  if (provider === "edge") return {...base("on_device",model,usage),estimatedUsd:0};
  if (provider !== "openai") return base("unpriced",model,usage);
  const rate = model ? RATINGS[model] : undefined;
  if (!rate) return base("unpriced",model,usage);
  if (!usage || safeInt(usage.promptTokens) === null || safeInt(usage.completionTokens) === null)
    return base("missing_usage",model,usage);
  const input = usage.promptTokens as number, output = usage.completionTokens as number;
  const cached = usage.cachedTokens ?? 0;
  if (safeInt(cached) === null || cached > input) return base("missing_usage",model,usage);
  const usd = ((input - cached) * rate.input + cached * rate.cached + output * rate.output) / 1_000_000;
  return {...base("estimated",model,usage),estimatedUsd:usd,rateInput:rate.input,rateCached:rate.cached,rateOutput:rate.output};
}
export function calculateTurnCost(args: {
  assessmentProvider: StageProvider; teachingProvider: StageProvider; verifierProvider?:StageProvider; verifierModel?:string|null; verifier?:{status:string};
  assessmentModel: string | null; teachingModel: string | null;
  io?: {assessment?: {usage?: ModelTokenUsage};teaching?: {usage?: ModelTokenUsage};verifier?: {usage?: ModelTokenUsage}};
  status?: string;
}): TurnCost {
  const assess = calculateStageCost({provider:args.assessmentProvider,model:args.assessmentModel,
    usage:args.io?.assessment?.usage,called:!!args.io?.assessment});
  const teach = calculateStageCost({provider:args.teachingProvider,model:args.teachingModel,
    usage:args.io?.teaching?.usage,called:!!args.io?.teaching});
  const verify=args.verifierProvider?calculateStageCost({provider:args.verifierProvider,model:args.verifierModel??null,
    usage:args.io?.verifier?.usage,called:args.verifier?.status==="complete"||!!args.io?.verifier}):undefined;
  // Failed model calls can be billable even when the trace could not capture the response.
  // A missing stage after a failed turn is therefore not proof of zero charge.
  const mayHaveUnknownCall = args.status === "error" || args.verifier?.status === "error";
  const complete = !mayHaveUnknownCall && assess.estimatedUsd !== null && teach.estimatedUsd !== null && (!verify || verify.estimatedUsd !== null);
  const known = [assess.estimatedUsd,teach.estimatedUsd,verify?.estimatedUsd].filter((x):x is number=>x!==null);
  const subtotal = known.length ? known.reduce((x,y)=>x+y,0) : null;
  return {assessment:assess,teaching:teach,verifier:verify,totalEstimatedUsd:complete?subtotal:null,knownSubtotalUsd:subtotal,complete};
}
export function formatUsd(usd: number | null): string {
  return usd === null || !Number.isFinite(usd) ? "Unavailable" : `US$${usd.toFixed(6)}`;
}
