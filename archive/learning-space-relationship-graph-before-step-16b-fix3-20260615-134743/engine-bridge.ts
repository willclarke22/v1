import type { DiagnosisType } from "@/types/contracts";

/**
 * Learning-space-local view of diagnosis state.
 *
 * build-learning-space only needs a stable projection shape:
 * - active diagnosis label
 * - diagnosis beliefs object
 * - history array
 *
 * The runtime diagnosis updater still owns the full persistence/update schema.
 */
export type DiagnosisBeliefEntry = {
  belief?: number | null;
  confidence?: number | null;
  evidence_count?: number | null;
  resolution_pressure?: number | null;
  status?: string | null;
  evidence_judging_tier?: string | null;
  [key: string]: unknown;
};

export type DiagnosisState = {
  version: string;
  active_diagnosis: DiagnosisType | null;
  beliefs: Record<string, DiagnosisBeliefEntry | undefined>;
  history: unknown[];
  [key: string]: unknown;
};

export {
  buildTopicRelationships,
  type RelationshipGraphTopic,
} from "@/lib/learning-space/relationship-graph";

/**
 * Learning-space engine bridge.
 *
 * This boundary is now untethered from the archived engine shims for renderer
 * relationship projection. build-learning-space.ts should only project stable
 * renderer fields; it should not own diagnosis updates, probe judging, or model
 * decisions.
 */


