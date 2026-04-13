export type GoldensTopic = {
  id: string;
  name: string;
};

export type ResolutionKind =
  | "matched_existing"
  | "created_new_candidate"
  | "fallback_active_topic"
  | "fallback_existing_topic"
  | "no_match";

export type TopicGoldenCase = {
  id: string;
  description: string;
  message: string;
  existingTopics: GoldensTopic[];
  activeTopicId: string | null;

  expectedLabel?: string | null;
  expectedResolutionKind?: ResolutionKind;
  expectedShouldCreate?: boolean;
  expectedMatchedTopicName?: string | null;

  forbiddenResolutionKinds?: ResolutionKind[];

  notes?: string;
};

export type TopicGoldenSequenceStep = {
  id: string;
  message: string;

  expectedLabel?: string | null;
  expectedResolutionKind?: ResolutionKind;
  expectedShouldCreate?: boolean;
  expectedMatchedTopicName?: string | null;
  forbiddenResolutionKinds?: ResolutionKind[];
};

export type TopicGoldenSequence = {
  id: string;
  description: string;
  initialTopics: GoldensTopic[];
  initialActiveTopicId: string | null;
  steps: TopicGoldenSequenceStep[];
};

export const TOPIC_LABELING_GOLDENS: TopicGoldenCase[] = [
  {
    id: "direct-001",
    description: "direct learning request",
    message: "I want to learn about neurotransmitters, but I don't know where to start.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Neurotransmitters",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "switch-001",
    description: "should switch away from active topic",
    message: "If I want to learn about budgeting where should I start?",
    existingTopics: [{ id: "t1", name: "Neurotransmitters" }],
    activeTopicId: "t1",
    expectedLabel: "Budgeting",
    forbiddenResolutionKinds: ["fallback_active_topic"],
    expectedShouldCreate: true,
  },
  {
    id: "direct-002",
    description: "single-word concept",
    message: "Dopamine",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Dopamine",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "multi-001",
    description: "struggle phrasing with real concept",
    message: "I can't figure out how the quadrants of the visual system work.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Quadrants Of The Visual System",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "multi-002",
    description: "broad context then narrow confusion",
    message: "I'm learning about neurotransmitters, receptors, and reuptake, but I'm mainly confused about reuptake.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "context-001",
    description: "textbook context with embedded concept",
    message: "My textbook has a formula about the speed of sound, but I don't get it.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed Of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "stay-001",
    description: "should stay on active topic",
    message: "Can you quiz me on neurotransmitters?",
    existingTopics: [{ id: "t1", name: "Neurotransmitters" }],
    activeTopicId: "t1",
    expectedLabel: "Neurotransmitters",
    expectedMatchedTopicName: "Neurotransmitters",
    forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
  },
  {
    id: "switch-002",
    description: "clear switch to unrelated topic",
    message: "Actually I want to learn about budgeting now.",
    existingTopics: [{ id: "t1", name: "Neurotransmitters" }],
    activeTopicId: "t1",
    expectedLabel: "Budgeting",
    forbiddenResolutionKinds: ["fallback_active_topic"],
    expectedShouldCreate: true,
  },
  {
    id: "compare-001",
    description: "comparison request",
    message: "What's the difference between mitosis and meiosis?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Mitosis vs Meiosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
];

export const TOPIC_LABELING_SEQUENCES: TopicGoldenSequence[] = [
  {
    id: "sequence-001",
    description: "create first topic then switch to a new one and stay there",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message: "I want to learn about neurotransmitters.",
        expectedLabel: "Neurotransmitters",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
      },
      {
        id: "step-2",
        message: "Actually I want to learn about budgeting now.",
        expectedLabel: "Budgeting",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        forbiddenResolutionKinds: ["fallback_active_topic"],
      },
      {
        id: "step-3",
        message: "Can you quiz me on budgeting?",
        expectedLabel: "Budgeting",
        expectedMatchedTopicName: "Budgeting",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
    ],
  },
  {
    id: "sequence-002",
    description: "context sentence then focused follow-up on same concept",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message: "My textbook has a formula about the speed of sound, but I don't get it.",
        expectedLabel: "Speed Of Sound",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
      },
      {
        id: "step-2",
        message: "Can we go over speed of sound again?",
        expectedLabel: "Speed Of Sound",
        expectedMatchedTopicName: "Speed Of Sound",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
    ],
  },
];