export {
  buildTopicRelationships,
  type DiagnosisBeliefEntry,
  type DiagnosisBeliefStatus,
  type DiagnosisState,
  type EvidenceJudgingTier,
  type RelationshipGraphTopic,
} from "@/lib/learning-space/relationship-graph";

/**
 * Learning-space engine bridge.
 *
 * This boundary is now untethered from archived engine shims for renderer
 * relationship projection.
 *
 * build-learning-space.ts should only project stable renderer fields. It should
 * not own diagnosis updates, probe judging, or model decisions.
 *
 * Keep this file as a narrow compatibility boundary so current callers can keep
 * importing from "@/lib/learning-space/engine-bridge" while the actual
 * relationship graph implementation lives in:
 *
 *   lib/learning-space/relationship-graph
 */
