import { buildProbeContract as buildLegacyProbeContract } from "@/lib/engine/probes";

/**
 * Probe contract runtime bridge.
 *
 * This is the single runtime-facing compatibility boundary for probe contract
 * generation. Today it delegates to the archived legacy probe builder through
 * the temporary engine shim.
 *
 * Later, this file should call the real Probe Contract Model provider instead.
 */
export const buildProbeContract = buildLegacyProbeContract;
