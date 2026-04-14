// scripts/topic-labeling-goldens.ts

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

  notes?: string;
};

export type TopicGoldenSequence = {
  id: string;
  description: string;
  initialTopics: GoldensTopic[];
  initialActiveTopicId: string | null;
  steps: TopicGoldenSequenceStep[];
  notes?: string;
};

export const TOPIC_LABELING_GOLDENS: TopicGoldenCase[] = [
  // ---------------------------------------------------------------------------
  // Baseline direct / simple creation
  // ---------------------------------------------------------------------------
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
    id: "direct-003",
    description: "simple concept request phrased as a question",
    message: "Can we go over action potentials?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Action Potentials",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "direct-004",
    description: "simple topic request with polite wrapper",
    message: "Could you help me understand osmosis?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Osmosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },

  // ---------------------------------------------------------------------------
  // Existing baseline switch / stay / comparison
  // ---------------------------------------------------------------------------
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
  {
    id: "compare-002",
    description: "comparison request with extra learner framing",
    message:
      "We started talking about mitosis and meiosis today and I keep mixing them up. What's actually different between them?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Mitosis vs Meiosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },

  // ---------------------------------------------------------------------------
  // Struggle phrasing / wrapper-heavy questions
  // ---------------------------------------------------------------------------
  {
    id: "multi-001",
    description: "struggle phrasing with real concept",
    message: "I can't figure out how the quadrants of the visual system work.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Quadrants of the Visual System",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "multi-002",
    description: "broad context then narrow confusion",
    message:
      "I'm learning about neurotransmitters, receptors, and reuptake, but I'm mainly confused about reuptake.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "wrapper-001",
    description: "why-cant-i-understand wrapper should preserve X of Y phrase",
    message: "Why can't I understand the rules of curling?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Rules of Curling",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes:
      "This specifically guards against collapsing to a generic head noun like 'Rules'.",
  },
  {
    id: "wrapper-002",
    description: "stuck-on wrapper around a concrete concept",
    message: "I'm really stuck on the phases of mitosis.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Phases of Mitosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "wrapper-003",
    description: "dont-get wrapper with concrete concept later in sentence",
    message: "I don't get the law of sines at all.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Sines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "wrapper-004",
    description: "please-help wrapper around topic name",
    message: "Please help me with cell respiration.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Cell Respiration",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },

  // ---------------------------------------------------------------------------
  // Context recovery / embedded concept extraction
  // ---------------------------------------------------------------------------
  {
    id: "context-001",
    description: "textbook context with embedded concept",
    message: "My textbook has a formula about the speed of sound, but I don't get it.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "context-002",
    description: "lecture context with target concept near the end",
    message:
      "In lecture we started talking about action potentials and threshold and all that, but the part I'm actually confused about is depolarization.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Depolarization",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "context-003",
    description: "homework context with concrete sub-concept",
    message:
      "I'm doing homework on triangles right now, but what I'm really not understanding is the law of cosines.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "context-004",
    description: "classroom context with broad topic then narrow mechanism",
    message:
      "We were covering neurotransmission today. I sort of follow the big picture, but I don't understand reuptake.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },

  // ---------------------------------------------------------------------------
  // X of Y / concept phrase preservation
  // ---------------------------------------------------------------------------
  {
    id: "of-001",
    description: "should preserve rules of curling phrase",
    message: "Can we go over the rules of curling?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Rules of Curling",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "of-002",
    description: "should preserve phases of mitosis phrase",
    message: "Can you explain the phases of mitosis?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Phases of Mitosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "of-003",
    description: "should preserve layers of the skin phrase",
    message: "I keep mixing up the layers of the skin.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Layers of the Skin",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "of-004",
    description: "should preserve speed of sound phrase with noisy wrapper",
    message: "Could we maybe go over the speed of sound again?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },

  // ---------------------------------------------------------------------------
  // Broader topic mentioned first, true target later
  // ---------------------------------------------------------------------------
  {
    id: "focus-001",
    description: "broad domain first, actual target later",
    message:
      "I'm studying the nervous system right now, but the specific thing that's confusing me is the refractory period.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Refractory Period",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "focus-002",
    description: "broad topic then narrower subtopic in same sentence",
    message:
      "I'm learning about chemistry, but the thing I need help with is electronegativity.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Electronegativity",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "focus-003",
    description: "broad topic list then singled-out confusion",
    message:
      "We've gone through neurotransmitters, receptors, action potentials, and reuptake, but reuptake is still the part that doesn't click for me.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },

  // ---------------------------------------------------------------------------
  // Noisy punctuation / casing / minor spelling issues
  // ---------------------------------------------------------------------------
  {
    id: "noise-001",
    description: "missing punctuation and lowercase should still find concept",
    message: "my textbook is talking about the speed of sound and i honestly dont get it",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "noise-002",
    description: "messy punctuation around direct topic request",
    message: "uhh... can we go over action potentials??",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Action Potentials",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "noise-003",
    description: "minor spelling issue in learner phrasing",
    message: "Im confused about reuptaek in neurons",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes:
      "This may still fail depending on whether the system chooses a compact label like 'Reuptake' or a narrower label like 'Reuptake in Neurons'.",
  },
  {
    id: "noise-004",
    description: "short natural typo-heavy prompt",
    message: "can u help me w mitosis pls",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Mitosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes:
      "This is intentionally colloquial and may expose weakness in abbreviation / slang tolerance.",
  },

  // ---------------------------------------------------------------------------
  // Paragraph-like prompts
  // ---------------------------------------------------------------------------
  {
    id: "paragraph-001",
    description: "short paragraph where the real concept is sentence two",
    message:
      "We're doing a unit on neurotransmission right now. I kind of understand the overall idea, but I keep getting lost when people talk about reuptake and what it changes. Could we go over that?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "paragraph-002",
    description: "short paragraph with broad context and specific formula target",
    message:
      "In class we're doing waves and sound. The worksheet has a formula for the speed of sound and everyone else seems to get what the variables are doing, but I don't. I think that's the part I need help with.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "paragraph-003",
    description: "paragraph with comparison target",
    message:
      "We covered both mitosis and meiosis this week. I thought I understood it during class, but when I got home I realized I keep blending the two together. I need to understand the difference between them better.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Mitosis vs Meiosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "paragraph-004",
    description: "paragraph preserving rules of curling concept",
    message:
      "I'm trying to follow curling because people keep talking about it, but I seriously don't understand what's going on. The part that seems to stop me every time is the rules of curling, especially scoring and what makes a shot count.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Rules of Curling",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },

  // ---------------------------------------------------------------------------
  // Existing-topic stay / switch under more natural phrasing
  // ---------------------------------------------------------------------------
  {
    id: "stay-002",
    description: "vague follow-up should stay on active topic",
    message: "Can we go over that again?",
    existingTopics: [{ id: "t1", name: "Speed of Sound" }],
    activeTopicId: "t1",
    expectedMatchedTopicName: "Speed of Sound",
    forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
    notes:
      "The labeler may not produce the active topic label itself here, but resolver behavior should avoid needless new-topic creation.",
  },
  {
    id: "stay-003",
    description: "pronoun follow-up should stay on active topic",
    message: "I still don't really get it.",
    existingTopics: [{ id: "t1", name: "Reuptake" }],
    activeTopicId: "t1",
    expectedMatchedTopicName: "Reuptake",
    forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
  },
  {
    id: "switch-003",
    description: "clear domain shift from active topic to new topic",
    message: "Actually never mind, I want to work on osmosis now.",
    existingTopics: [{ id: "t1", name: "Action Potentials" }],
    activeTopicId: "t1",
    expectedLabel: "Osmosis",
    forbiddenResolutionKinds: ["fallback_active_topic"],
    expectedShouldCreate: true,
  },
  {
    id: "switch-004",
    description: "clear switch from existing topic to a different existing one if it already exists",
    message: "Can we go back to mitosis instead?",
    existingTopics: [
      { id: "t1", name: "Meiosis" },
      { id: "t2", name: "Mitosis" },
    ],
    activeTopicId: "t1",
    expectedLabel: "Mitosis",
    expectedMatchedTopicName: "Mitosis",
    forbiddenResolutionKinds: ["created_new_candidate", "fallback_active_topic", "no_match"],
  },

  // ---------------------------------------------------------------------------
  // Additional concept-specific prompts that feel like real learner input
  // ---------------------------------------------------------------------------
  {
    id: "natural-001",
    description: "natural learner request for a specific mechanism",
    message: "I need help understanding depolarization.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Depolarization",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "natural-002",
    description: "natural learner request for a named law",
    message: "Can you explain the law of cosines in a simpler way?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "natural-003",
    description: "natural learner request for budgeting topic",
    message: "I want to get better at budgeting because I never know where my money is going.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Budgeting",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "natural-004",
    description: "natural learner request for concept embedded in explanation of problem",
    message:
      "Every time I try those triangle problems I get stuck when the law of sines comes up.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Sines",
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
        expectedLabel: "Speed of Sound",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
      },
      {
        id: "step-2",
        message: "Can we go over speed of sound again?",
        expectedLabel: "Speed of Sound",
        expectedMatchedTopicName: "Speed of Sound",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // More conversational / realistic sequences
  // ---------------------------------------------------------------------------
  {
    id: "sequence-003",
    description: "broad topic mention then narrowed target then vague same-topic follow-up",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message:
          "I'm learning about neurotransmitters, receptors, and reuptake, but I'm mainly confused about reuptake.",
        expectedLabel: "Reuptake",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
      },
      {
        id: "step-2",
        message: "I think that's the part where I get lost every time.",
        expectedMatchedTopicName: "Reuptake",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
      {
        id: "step-3",
        message: "Can you quiz me on it?",
        expectedMatchedTopicName: "Reuptake",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
    ],
    notes:
      "This sequence tests pronoun-heavy continuation after an initially explicit message.",
  },
  {
    id: "sequence-004",
    description: "rules of curling creation then same-topic follow-up then explicit switch",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message: "Why can't I understand the rules of curling?",
        expectedLabel: "Rules of Curling",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
      },
      {
        id: "step-2",
        message: "Can we go over that again, especially the scoring part?",
        expectedMatchedTopicName: "Rules of Curling",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
      {
        id: "step-3",
        message: "Actually I want to switch to budgeting.",
        expectedLabel: "Budgeting",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        forbiddenResolutionKinds: ["fallback_active_topic"],
      },
    ],
  },
  {
    id: "sequence-005",
    description: "existing-topic switch back to earlier topic rather than creating duplicate",
    initialTopics: [
      { id: "t1", name: "Neurotransmitters" },
      { id: "t2", name: "Budgeting" },
    ],
    initialActiveTopicId: "t2",
    steps: [
      {
        id: "step-1",
        message: "Actually can we go back to neurotransmitters?",
        expectedLabel: "Neurotransmitters",
        expectedMatchedTopicName: "Neurotransmitters",
        forbiddenResolutionKinds: ["created_new_candidate", "fallback_active_topic", "no_match"],
      },
      {
        id: "step-2",
        message: "Quiz me on that.",
        expectedMatchedTopicName: "Neurotransmitters",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
    ],
  },
  {
    id: "sequence-006",
    description: "paragraph creation followed by a vague same-topic continuation",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message:
          "In class we're doing waves and sound. The worksheet has a formula for the speed of sound and everyone else seems to get what the variables are doing, but I don't. I think that's the part I need help with.",
        expectedLabel: "Speed of Sound",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
      },
      {
        id: "step-2",
        message: "Yeah, that exact part.",
        expectedMatchedTopicName: "Speed of Sound",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
    ],
  },
  {
    id: "sequence-007",
    description: "create topic from direct request then explicit return to same topic after detour",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message: "Can we go over action potentials?",
        expectedLabel: "Action Potentials",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
      },
      {
        id: "step-2",
        message: "Actually I also need help with osmosis.",
        expectedLabel: "Osmosis",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        forbiddenResolutionKinds: ["fallback_active_topic"],
      },
      {
        id: "step-3",
        message: "Wait, go back to action potentials.",
        expectedLabel: "Action Potentials",
        expectedMatchedTopicName: "Action Potentials",
        forbiddenResolutionKinds: ["created_new_candidate", "fallback_active_topic", "no_match"],
      },
    ],
  },
];

// =============================================================================
// HARD SUITE
// =============================================================================

export const TOPIC_LABELING_HARD_GOLDENS: TopicGoldenCase[] = [
  // ---------------------------------------------------------------------------
  // Messy real-user wording
  // ---------------------------------------------------------------------------
  {
    id: "hard-messy-001",
    description: "messy conversational wrapper around concrete bio topic",
    message: "ok so like i was trying to learn action potentials yesterday and now i'm lost again",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Action Potentials",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-messy-002",
    description: "messy casual phrasing with targeted confusion phrase",
    message: "dopamine kinda makes sense but reuptake is where i start getting confused",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-messy-003",
    description: "colloquial physics prompt with junk wrappers",
    message: "can you help me with that speed of sound thing from physics because i keep mixing it up",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-messy-004",
    description: "messy math phrasing should still keep named law",
    message: "ugh i swear i knew the law of cosines before but now it is not clicking",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },

  // ---------------------------------------------------------------------------
  // Broad context, narrow true target
  // ---------------------------------------------------------------------------
  {
    id: "hard-focus-001",
    description: "broad neuroscience context but specific mechanism is target",
    message:
      "I'm reviewing neurons, synapses, neurotransmitters, receptors, and reuptake, but the thing I actually don't get is reuptake.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-focus-002",
    description: "broad trig context but specific law is target",
    message:
      "I'm studying triangles, sine, cosine, tangent, and all of that, but I'm specifically stuck on the law of sines.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Sines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-focus-003",
    description: "broad genetics context but subtopic should win",
    message:
      "We're doing genetics broadly, but the part that is messing me up is Punnett squares.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Punnett Squares",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-focus-004",
    description: "broad finance context with specific target late",
    message:
      "I've been reading about budgeting, saving, debt, and credit cards, but I mainly need help with compound interest.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Compound Interest",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },

  // ---------------------------------------------------------------------------
  // Late target reveal
  // ---------------------------------------------------------------------------
  {
    id: "hard-late-001",
    description: "late reveal with reversal from broad topic to precise target",
    message:
      "At first I thought the hard part was meiosis, but actually what I need help with is crossing over.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Crossing Over",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-late-002",
    description: "chapter-level context followed by exact chemistry target",
    message:
      "This whole chapter has a lot going on, but the real issue for me is equilibrium constant.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Equilibrium Constant",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-late-003",
    description: "problem solving context with exact math operation target late",
    message:
      "The example looked fine until the last step, and now I think what I actually don't understand is factoring.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Factoring",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-late-004",
    description: "topic shift inside sentence to narrower subtopic",
    message:
      "I was talking about neurotransmitters earlier, but the specific thing I want to go over now is serotonin reuptake.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Serotonin Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },

  // ---------------------------------------------------------------------------
  // Comparison pressure
  // ---------------------------------------------------------------------------
  {
    id: "hard-compare-001",
    description: "law comparison should produce stable vs label",
    message: "Can you compare the law of sines and the law of cosines?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Sines vs Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-compare-002",
    description: "everyday finance comparison",
    message: "I keep mixing up savings accounts and chequing accounts.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Savings Accounts vs Chequing Accounts",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-compare-003",
    description: "simple physics comparison",
    message: "What's the difference between speed and velocity?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed vs Velocity",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },

  // ---------------------------------------------------------------------------
  // Real-world non-academic domains
  // ---------------------------------------------------------------------------
  {
    id: "hard-real-001",
    description: "sports rules with named sub-concept",
    message: "How does offside work in soccer?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Offside in Soccer",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-real-002",
    description: "practical finance concept",
    message: "I don't get how interest on a credit card actually works.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Credit Card Interest",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-real-003",
    description: "insurance concept with simple everyday framing",
    message: "Can you explain what a deductible is in insurance?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Insurance Deductibles",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-real-004",
    description: "language comparison in everyday grammar",
    message: "I keep forgetting when to use your vs you're.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Your vs You're",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },

  // ---------------------------------------------------------------------------
  // Paragraph stress
  // ---------------------------------------------------------------------------
  {
    id: "hard-paragraph-001",
    description: "longer paragraph with specific sound target",
    message:
      "So in class today we were talking about sound and waves and resonance and all of that, and I kind of followed at first, but then once the formula stuff started I realized I don't actually understand the speed of sound part.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-paragraph-002",
    description: "longer paragraph with comparison target late",
    message:
      "I was doing practice questions for bio and I thought I was confused about mitosis generally, but after looking again I think it's really just metaphase vs anaphase that I keep mixing up.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Metaphase vs Anaphase",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },
  {
    id: "hard-paragraph-003",
    description: "longer paragraph with practical finance target",
    message:
      "My teacher explained budgeting, fixed expenses, variable expenses, debt, and saving, and most of that was okay, but I still don't really know how to make a budget that balances.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Balancing a Budget",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
  },

  // ---------------------------------------------------------------------------
  // Negative / meta / admin cases
  // ---------------------------------------------------------------------------
  {
    id: "hard-negative-001",
    description: "pure gratitude should not invent a new topic",
    message: "Thanks, that helped.",
    existingTopics: [{ id: "t1", name: "Reuptake" }],
    activeTopicId: "t1",
    expectedMatchedTopicName: "Reuptake",
    forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
    notes:
      "Meta/closing utterance should normally stay anchored rather than create a junk topic.",
  },
  {
    id: "hard-negative-002",
    description: "style request should not invent a new topic",
    message: "Can you say that again but shorter?",
    existingTopics: [{ id: "t1", name: "Speed of Sound" }],
    activeTopicId: "t1",
    expectedMatchedTopicName: "Speed of Sound",
    forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
  },
  {
    id: "hard-negative-003",
    description: "very vague continuation should not invent a new topic",
    message: "Wait, what do you mean?",
    existingTopics: [{ id: "t1", name: "Action Potentials" }],
    activeTopicId: "t1",
    expectedMatchedTopicName: "Action Potentials",
    forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
  },
  {
    id: "hard-negative-004",
    description: "another-example request should stay on active topic",
    message: "Show me another example.",
    existingTopics: [{ id: "t1", name: "Law of Cosines" }],
    activeTopicId: "t1",
    expectedMatchedTopicName: "Law of Cosines",
    forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
  },

  // ---------------------------------------------------------------------------
  // Anti-junk regressions
  // ---------------------------------------------------------------------------
  {
    id: "hard-antijunk-001",
    description: "should not collapse to generic noun from rules sentence",
    message: "Why can't I understand the rules of curling?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Rules of Curling",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "Regression guard against labels like 'Rules'.",
  },
  {
    id: "hard-antijunk-002",
    description: "should not collapse to generic verb wrapper",
    message: "I need help with the speed of sound.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "Regression guard against labels like 'Need' or 'Help'.",
  },
  {
    id: "hard-antijunk-003",
    description: "comparison should not collapse to generic adjective",
    message: "What's different between mitosis and meiosis?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Mitosis vs Meiosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "Regression guard against labels like 'Different'.",
  },
];

export const TOPIC_LABELING_HARD_SEQUENCES: TopicGoldenSequence[] = [
  {
    id: "hard-sequence-001",
    description: "pronoun-heavy continuation on same topic after explicit creation",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message: "Can we go over action potentials?",
        expectedLabel: "Action Potentials",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
      },
      {
        id: "step-2",
        message: "Wait, what happens right before that?",
        expectedMatchedTopicName: "Action Potentials",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
      {
        id: "step-3",
        message: "No, the second part.",
        expectedMatchedTopicName: "Action Potentials",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
      {
        id: "step-4",
        message: "Quiz me on it.",
        expectedMatchedTopicName: "Action Potentials",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
    ],
    notes:
      "This sequence stresses pronoun-heavy follow-ups that should stay anchored to the active topic.",
  },
  {
    id: "hard-sequence-002",
    description: "curling topic with narrower same-topic follow-ups",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message: "I'm confused about the rules of curling.",
        expectedLabel: "Rules of Curling",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
      },
      {
        id: "step-2",
        message: "What about the scoring part?",
        expectedMatchedTopicName: "Rules of Curling",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
      {
        id: "step-3",
        message: "No, I meant the sweeping part.",
        expectedMatchedTopicName: "Rules of Curling",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
      {
        id: "step-4",
        message: "Can we do that again?",
        expectedMatchedTopicName: "Rules of Curling",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
    ],
  },
  {
    id: "hard-sequence-003",
    description: "detour to a second topic then explicit return to first topic",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message: "Help me with dopamine.",
        expectedLabel: "Dopamine",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
      },
      {
        id: "step-2",
        message: "Actually quick side question, what's serotonin?",
        expectedLabel: "Serotonin",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        forbiddenResolutionKinds: ["fallback_active_topic"],
      },
      {
        id: "step-3",
        message: "Ok back to the first one.",
        expectedMatchedTopicName: "Dopamine",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
    ],
    notes:
      "This may expose whether your resolver has enough logic for 'first one' style recovery.",
  },
  {
    id: "hard-sequence-004",
    description: "budgeting then compound interest detour then go back",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message: "Can we go over budgeting?",
        expectedLabel: "Budgeting",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
      },
      {
        id: "step-2",
        message: "Wait also what's compound interest?",
        expectedLabel: "Compound Interest",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        forbiddenResolutionKinds: ["fallback_active_topic"],
      },
      {
        id: "step-3",
        message: "Never mind, go back.",
        expectedMatchedTopicName: "Budgeting",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
    ],
    notes:
      "Another explicit detour-and-return pattern that is likely harder than your current baseline sequences.",
  },
  {
    id: "hard-sequence-005",
    description: "meta/admin utterances should not produce junk topics mid-thread",
    initialTopics: [{ id: "t1", name: "Speed of Sound" }],
    initialActiveTopicId: "t1",
    steps: [
      {
        id: "step-1",
        message: "Can you say that again?",
        expectedMatchedTopicName: "Speed of Sound",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
      {
        id: "step-2",
        message: "Wait.",
        expectedMatchedTopicName: "Speed of Sound",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
      {
        id: "step-3",
        message: "Show me another example.",
        expectedMatchedTopicName: "Speed of Sound",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
    ],
  },
  {
    id: "hard-sequence-006",
    description: "comparison topic then vague same-topic follow-up",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message: "What's the difference between speed and velocity?",
        expectedLabel: "Speed vs Velocity",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
      },
      {
        id: "step-2",
        message: "I keep mixing them up in word problems.",
        expectedMatchedTopicName: "Speed vs Velocity",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
      {
        id: "step-3",
        message: "Quiz me on that.",
        expectedMatchedTopicName: "Speed vs Velocity",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
    ],
  },
  {
    id: "hard-sequence-007",
    description: "broad-to-narrow first message then repeated pronoun continuation",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message:
          "I'm studying triangles, sine, cosine, tangent, and all of that, but I'm specifically stuck on the law of sines.",
        expectedLabel: "Law of Sines",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
      },
      {
        id: "step-2",
        message: "Yeah, it's that one that keeps messing me up.",
        expectedMatchedTopicName: "Law of Sines",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
      {
        id: "step-3",
        message: "Can we go over it again?",
        expectedMatchedTopicName: "Law of Sines",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
    ],
  },
  {
    id: "hard-sequence-008",
    description: "existing earlier topic should be reused instead of duplicated on explicit return",
    initialTopics: [
      { id: "t1", name: "Action Potentials" },
      { id: "t2", name: "Osmosis" },
      { id: "t3", name: "Budgeting" },
    ],
    initialActiveTopicId: "t3",
    steps: [
      {
        id: "step-1",
        message: "Actually go back to action potentials.",
        expectedLabel: "Action Potentials",
        expectedMatchedTopicName: "Action Potentials",
        forbiddenResolutionKinds: ["created_new_candidate", "fallback_active_topic", "no_match"],
      },
      {
        id: "step-2",
        message: "No, the first part of that.",
        expectedMatchedTopicName: "Action Potentials",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
      },
    ],
  },
];