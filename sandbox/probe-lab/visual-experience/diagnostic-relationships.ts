export type SharedConfusionLabel =
  | "part_without_a_job"
  | "static_thing_not_process"
  | "missing_input_output_change"
  | "missing_cause_chain"
  | "steps_without_reason"
  | "symbol_without_picture"
  | "surface_match_trap"
  | "hidden_force_or_agent"
  | "scale_jump_blur"
  | "too_many_parts_no_structure"
  | "definition_without_use"
  | "other_confusion_pattern";

export type SharedInsightLabel =
  | "purpose_reveals_the_part"
  | "input_becomes_output"
  | "process_chain_clicks"
  | "cause_chain_clicks"
  | "picture_gives_symbol_meaning"
  | "analogy_transfers_structure"
  | "scale_levels_connect"
  | "steps_gain_a_reason"
  | "same_pattern_new_topic"
  | "system_role_clicks"
  | "other_insight_pattern";

export type DiagnosticPatternKind = "confusion" | "insight";

export type DiagnosticPatternCandidate = {
  id: string;
  kind: DiagnosticPatternKind;
  shared_label: SharedConfusionLabel | SharedInsightLabel;
  short_explanation: string;
  evidence: string;
  confidence: number;
};

export type DiagnosticSignal = {
  confusion: {
    score: number;
    confidence: number;
  };
  insight: {
    score: number;
    confidence: number;
  };
  pattern_candidates: DiagnosticPatternCandidate[];
};

export type SandboxTopicDiagnosticState = {
  topic_id: string;
  topic_label: string;
  confusion: {
    score: number;
    confidence: number;
    updated_at?: string;
  };
  insight: {
    score: number;
    confidence: number;
    updated_at?: string;
  };
  pattern_candidates: Array<DiagnosticPatternCandidate & {
    created_at?: string;
    last_seen_at?: string;
  }>;
};

export type SandboxSharedPatternRelationship = {
  relationship_id: string;
  relationship_type: "shared_confusion_pattern" | "shared_insight_pattern";
  source_topic_id: string;
  target_topic_id: string;
  strength: number;
  confidence: number;
  basis: {
    shared_label: SharedConfusionLabel | SharedInsightLabel;
    short_explanation: string;
    source_pattern_id: string;
    target_pattern_id: string;
  };
  display_policy: {
    show_on_focus: boolean;
    priority: number;
    max_opacity: number;
  };
};

export const SHARED_CONFUSION_LABELS: SharedConfusionLabel[] = [
  "part_without_a_job",
  "static_thing_not_process",
  "missing_input_output_change",
  "missing_cause_chain",
  "steps_without_reason",
  "symbol_without_picture",
  "surface_match_trap",
  "hidden_force_or_agent",
  "scale_jump_blur",
  "too_many_parts_no_structure",
  "definition_without_use",
  "other_confusion_pattern",
];

export const SHARED_INSIGHT_LABELS: SharedInsightLabel[] = [
  "purpose_reveals_the_part",
  "input_becomes_output",
  "process_chain_clicks",
  "cause_chain_clicks",
  "picture_gives_symbol_meaning",
  "analogy_transfers_structure",
  "scale_levels_connect",
  "steps_gain_a_reason",
  "same_pattern_new_topic",
  "system_role_clicks",
  "other_insight_pattern",
];

export const SHARED_PATTERN_EXPLANATIONS: Record<SharedConfusionLabel | SharedInsightLabel, string> = {
  part_without_a_job:
    "Both topics may feel confusing because a part or step only makes sense after you see the job it does in the larger system.",
  static_thing_not_process:
    "Both topics may feel confusing because something is being treated like a static object when it is really a process unfolding over time.",
  missing_input_output_change:
    "Both topics involve a hidden transformation: something goes in, changes form, and comes out as something more useful.",
  missing_cause_chain:
    "Both topics may feel confusing because the cause-and-effect chain is not visible yet.",
  steps_without_reason:
    "Both topics may feel like a list of steps until each step is connected to why it is needed.",
  symbol_without_picture:
    "Both topics may involve symbols or terms that need a visual model before they feel meaningful.",
  surface_match_trap:
    "Both topics may feel tricky because a surface feature looks similar, but the real structure underneath is different.",
  hidden_force_or_agent:
    "Both topics may feel confusing because the thing causing the change is hidden or easy to misname.",
  scale_jump_blur:
    "Both topics may feel confusing because the explanation jumps between scales before the connection is visible.",
  too_many_parts_no_structure:
    "Both topics may feel overwhelming because there are many parts but not enough structure showing how they fit together.",
  definition_without_use:
    "Both topics may feel like definitions to memorize until the learner sees what the idea is used for.",
  other_confusion_pattern:
    "These topics appear to share a confusion pattern that MyWay should inspect more carefully before using it strongly.",
  purpose_reveals_the_part:
    "Both topics may become easier if you start with what the larger system needs, then introduce each part as something that solves a problem.",
  input_becomes_output:
    "Both topics become clearer when you track what goes in, what changes, and what comes out.",
  process_chain_clicks:
    "Both topics become clearer when the learner sees the process as a connected chain instead of separate facts.",
  cause_chain_clicks:
    "Both topics become clearer when the cause-and-effect chain is made visible from start to finish.",
  picture_gives_symbol_meaning:
    "Both topics become clearer when a symbol or term is connected to a concrete picture.",
  analogy_transfers_structure:
    "Both topics may benefit from an analogy only when the analogy carries the same underlying structure.",
  scale_levels_connect:
    "Both topics become clearer when the learner can see how one scale connects to another.",
  steps_gain_a_reason:
    "Both topics become clearer when each step is tied to why it is needed.",
  same_pattern_new_topic:
    "The learner may be able to reuse a pattern that worked in one topic to understand a new topic.",
  system_role_clicks:
    "Both topics become clearer when a part's role in the whole system clicks into place.",
  other_insight_pattern:
    "These topics appear to share an insight pattern that MyWay should inspect more carefully before using it strongly.",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function clamp01(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

export function cleanDiagnosticPatternId(value: unknown, fallback: string) {
  const raw = text(value, fallback);
  return raw.replace(/[^a-zA-Z0-9_\-]/g, "_").replace(/_+/g, "_") || fallback;
}

export function isSharedConfusionLabel(value: unknown): value is SharedConfusionLabel {
  return typeof value === "string" && SHARED_CONFUSION_LABELS.includes(value as SharedConfusionLabel);
}

export function isSharedInsightLabel(value: unknown): value is SharedInsightLabel {
  return typeof value === "string" && SHARED_INSIGHT_LABELS.includes(value as SharedInsightLabel);
}

export function getSharedPatternExplanation(label: SharedConfusionLabel | SharedInsightLabel) {
  return SHARED_PATTERN_EXPLANATIONS[label];
}

export function normalizeDiagnosticSignal(value: unknown): DiagnosticSignal {
  const raw = asRecord(value) ?? {};
  const rawConfusion = asRecord(raw.confusion) ?? {};
  const rawInsight = asRecord(raw.insight) ?? {};

  const patternCandidates = asArray(raw.pattern_candidates)
    .map((item, index): DiagnosticPatternCandidate | null => {
      const record = asRecord(item) ?? {};
      const kind = record.kind === "insight" ? "insight" : record.kind === "confusion" ? "confusion" : null;
      if (!kind) return null;

      const sharedLabel = record.shared_label;
      const label =
        kind === "confusion"
          ? isSharedConfusionLabel(sharedLabel)
            ? sharedLabel
            : "other_confusion_pattern"
          : isSharedInsightLabel(sharedLabel)
            ? sharedLabel
            : "other_insight_pattern";

      return {
        id: cleanDiagnosticPatternId(record.id, `${kind}_pattern_${index + 1}`),
        kind,
        shared_label: label,
        short_explanation: text(record.short_explanation, getSharedPatternExplanation(label)),
        evidence: text(record.evidence, "The model identified this as a reusable topic-level diagnostic pattern."),
        confidence: clamp01(record.confidence, 0.55),
      };
    })
    .filter((item): item is DiagnosticPatternCandidate => Boolean(item))
    .slice(0, 6);

  return {
    confusion: {
      score: clamp01(rawConfusion.score, 0.5),
      confidence: clamp01(rawConfusion.confidence, 0.55),
    },
    insight: {
      score: clamp01(rawInsight.score, 0.15),
      confidence: clamp01(rawInsight.confidence, 0.5),
    },
    pattern_candidates: patternCandidates,
  };
}

export function makeSandboxTopicDiagnosticState(args: {
  topic_id: string;
  topic_label: string;
  diagnostic_signal: DiagnosticSignal;
  now?: string;
}): SandboxTopicDiagnosticState {
  const now = args.now ?? new Date().toISOString();

  return {
    topic_id: args.topic_id,
    topic_label: args.topic_label,
    confusion: {
      score: args.diagnostic_signal.confusion.score,
      confidence: args.diagnostic_signal.confusion.confidence,
      updated_at: now,
    },
    insight: {
      score: args.diagnostic_signal.insight.score,
      confidence: args.diagnostic_signal.insight.confidence,
      updated_at: now,
    },
    pattern_candidates: args.diagnostic_signal.pattern_candidates.map((candidate) => ({
      ...candidate,
      created_at: now,
      last_seen_at: now,
    })),
  };
}

function relationshipIdFor(args: {
  sourceTopicId: string;
  targetTopicId: string;
  label: string;
  kind: DiagnosticPatternKind;
}) {
  return cleanDiagnosticPatternId(
    `sandbox_rel_${args.sourceTopicId}_${args.targetTopicId}_${args.kind}_${args.label}`,
    `sandbox_rel_${args.kind}_${args.label}`,
  );
}

function scoreRelationship(source: DiagnosticPatternCandidate, target: DiagnosticPatternCandidate) {
  const confidenceFloor = Math.min(source.confidence, target.confidence);
  const confidenceMean = (source.confidence + target.confidence) / 2;
  return Math.max(0.25, Math.min(1, 0.62 + confidenceFloor * 0.22 + confidenceMean * 0.16));
}

export function buildSandboxSharedPatternRelationships(args: {
  updatedTopic: SandboxTopicDiagnosticState;
  otherTopics: SandboxTopicDiagnosticState[];
  maxPerKind?: number;
}): SandboxSharedPatternRelationship[] {
  const maxPerKind = args.maxPerKind ?? 4;
  const relationships: SandboxSharedPatternRelationship[] = [];

  for (const sourcePattern of args.updatedTopic.pattern_candidates) {
    for (const otherTopic of args.otherTopics) {
      if (otherTopic.topic_id === args.updatedTopic.topic_id) continue;

      for (const targetPattern of otherTopic.pattern_candidates) {
        if (sourcePattern.kind !== targetPattern.kind) continue;
        if (sourcePattern.shared_label !== targetPattern.shared_label) continue;

        const strength = scoreRelationship(sourcePattern, targetPattern);
        const confidence = Math.min(sourcePattern.confidence, targetPattern.confidence);
        const relationshipType =
          sourcePattern.kind === "confusion" ? "shared_confusion_pattern" : "shared_insight_pattern";

        relationships.push({
          relationship_id: relationshipIdFor({
            sourceTopicId: args.updatedTopic.topic_id,
            targetTopicId: otherTopic.topic_id,
            kind: sourcePattern.kind,
            label: sourcePattern.shared_label,
          }),
          relationship_type: relationshipType,
          source_topic_id: args.updatedTopic.topic_id,
          target_topic_id: otherTopic.topic_id,
          strength,
          confidence,
          basis: {
            shared_label: sourcePattern.shared_label,
            short_explanation: getSharedPatternExplanation(sourcePattern.shared_label),
            source_pattern_id: sourcePattern.id,
            target_pattern_id: targetPattern.id,
          },
          display_policy: {
            show_on_focus: true,
            priority: strength,
            max_opacity: sourcePattern.kind === "confusion" ? 0.48 : 0.42,
          },
        });
      }
    }
  }

  const seen = new Set<string>();
  const deduped = relationships
    .sort((a, b) => b.strength + b.confidence - (a.strength + a.confidence))
    .filter((relationship) => {
      const key = `${relationship.relationship_type}|${relationship.target_topic_id}|${relationship.basis.shared_label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const confusion = deduped.filter((relationship) => relationship.relationship_type === "shared_confusion_pattern").slice(0, maxPerKind);
  const insight = deduped.filter((relationship) => relationship.relationship_type === "shared_insight_pattern").slice(0, maxPerKind);

  return [...confusion, ...insight];
}

export function getDefaultSandboxPriorDiagnosticTopics(currentTopicId: string): SandboxTopicDiagnosticState[] {
  const now = new Date().toISOString();
  const topics: SandboxTopicDiagnosticState[] = [
    {
      topic_id: "sandbox_krebs_cycle",
      topic_label: "Krebs cycle",
      confusion: { score: 0.68, confidence: 0.86, updated_at: now },
      insight: { score: 0.18, confidence: 0.68, updated_at: now },
      pattern_candidates: [
        {
          id: "krebs_steps_without_reason",
          kind: "confusion",
          shared_label: "steps_without_reason",
          short_explanation:
            "The cycle can feel like a list of steps before the job of each step is clear.",
          evidence: "The learner cannot picture why the steps matter.",
          confidence: 0.84,
          created_at: now,
          last_seen_at: now,
        },
        {
          id: "krebs_part_without_a_job",
          kind: "confusion",
          shared_label: "part_without_a_job",
          short_explanation:
            "The named steps feel less meaningful until their job in the larger energy system is visible.",
          evidence: "The learner is missing the purpose of the cycle's parts and steps.",
          confidence: 0.72,
          created_at: now,
          last_seen_at: now,
        },
        {
          id: "krebs_purpose_reveals_the_part",
          kind: "insight",
          shared_label: "purpose_reveals_the_part",
          short_explanation: "Start with what the cell needs, then show why each step exists.",
          evidence: "The learner asks why the steps matter.",
          confidence: 0.7,
          created_at: now,
          last_seen_at: now,
        },
      ],
    },
    {
      topic_id: "sandbox_circuits",
      topic_label: "Electric circuits",
      confusion: { score: 0.54, confidence: 0.76, updated_at: now },
      insight: { score: 0.32, confidence: 0.7, updated_at: now },
      pattern_candidates: [
        {
          id: "circuits_missing_input_output_change",
          kind: "confusion",
          shared_label: "missing_input_output_change",
          short_explanation:
            "Circuits can feel confusing until the learner tracks what goes in, what changes, and what comes out.",
          evidence: "The learner tends to name parts without tracking energy transfer.",
          confidence: 0.78,
          created_at: now,
          last_seen_at: now,
        },
        {
          id: "circuits_input_becomes_output",
          kind: "insight",
          shared_label: "input_becomes_output",
          short_explanation: "Track electrical input through the system to useful output.",
          evidence: "The useful reasoning move is to follow the transformation.",
          confidence: 0.74,
          created_at: now,
          last_seen_at: now,
        },
      ],
    },
  ];

  return topics.filter((topic) => topic.topic_id !== currentTopicId);
}

export function buildSandboxDiagnosticRelationshipPreview(args: {
  topic: SandboxTopicDiagnosticState;
  priorTopics?: SandboxTopicDiagnosticState[];
}) {
  const priorTopics = args.priorTopics?.length
    ? args.priorTopics
    : getDefaultSandboxPriorDiagnosticTopics(args.topic.topic_id);
  const relationships = buildSandboxSharedPatternRelationships({
    updatedTopic: args.topic,
    otherTopics: priorTopics,
  });

  return {
    sandbox_only: true,
    note:
      "This preview is sandbox-only. MyWay production Learning Space files are not edited by this patch.",
    current_topic: args.topic,
    compared_topics: priorTopics,
    relationships,
  };
}
