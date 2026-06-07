import type { EngineFuel, RunMetadata } from "@/types/contracts";
import { nowIso } from "@/lib/runtime/shared";

export type ProbeSubmitRouteTimingStep = {
  label: string;
  elapsed_ms: number;
};

export type ProbeSubmitRouteLatencyDebug = {
  total_ms: number;
  steps: ProbeSubmitRouteTimingStep[];
};

export function createProbeSubmitRouteTimer() {
  const start = Date.now();
  let previous = start;
  const steps: ProbeSubmitRouteTimingStep[] = [];

  return {
    mark(label: string) {
      const now = Date.now();
      steps.push({
        label,
        elapsed_ms: now - previous,
      });
      previous = now;
    },

    finish(): ProbeSubmitRouteLatencyDebug {
      return {
        total_ms: Date.now() - start,
        steps,
      };
    },
  };
}

export function buildRunMetadata(
  engineFuel: EngineFuel,
  runId: string,
): RunMetadata {
  return {
    run_id: runId,
    timestamp: nowIso(),
    engine_version:
      "runtime-v1_1-probe-submit-contract-judging-worker-backed-confusion-insight",
    previous_run_id: null,
    topic_count: engineFuel.topics.length,
    cluster_count: engineFuel.clusters.length,
    linked_pair_count: engineFuel.linked_pairs.length,
  };
}
