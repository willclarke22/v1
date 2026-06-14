export type {
  DiagnosisState,
} from "@/lib/engine/diagnosis";

export {
  buildTopicRelationships,
  type RelationshipGraphTopic,
} from "@/lib/engine/relationships";

/**
 * Learning-space engine bridge.
 *
 * This is the learning-space projection boundary for legacy engine-derived
 * diagnosis state and relationship graph helpers.
 *
 * build-learning-space.ts should only project stable renderer fields. It should
 * not own diagnosis updates, probe judging, or model decisions.
 *
 * Today this delegates to temporary engine shims that point at archived legacy
 * engine code. Later, this file can be replaced with learning-space-specific
 * projection helpers from the new engine/state model.
 */
