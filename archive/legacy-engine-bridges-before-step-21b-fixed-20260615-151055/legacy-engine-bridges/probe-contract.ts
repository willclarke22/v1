import {
  buildLegacyCompatibleProbeContract,
  type LegacyCompatibleProbeContractInput,
  type LegacyCompatibleProbeContractResult,
} from "@/lib/engine/probe-delivery";

/**
 * Probe contract runtime bridge.
 *
 * This is still the compatibility import path used by existing probe-planning
 * code, but it no longer reaches into archive/old-engine through lib/engine/probes.
 *
 * Current behavior:
 * - returns a JSON-safe ProbeContractSnapshot-compatible object
 * - embeds the new ProbeContractModelOutput shape
 * - embeds EngineRenderableProbe for the UI migration path
 *
 * Later:
 * - replace buildLegacyCompatibleProbeContract with runProbeContract(provider)
 *   once the live planning path is async/provider-owned.
 */
export function buildProbeContract(
  input: LegacyCompatibleProbeContractInput,
): LegacyCompatibleProbeContractResult {
  return buildLegacyCompatibleProbeContract(input);
}

export type {
  LegacyCompatibleProbeContractInput,
  LegacyCompatibleProbeContractResult,
};

