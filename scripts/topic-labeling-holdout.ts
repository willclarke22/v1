// scripts/topic-labeling-holdout.ts

import type {
  TopicGoldenCase,
  TopicGoldenSequence,
} from "./topic-labeling-goldens";

/**
 * HOLDOUT PRINCIPLES
 *
 * - These cases should not be the same literal cases you used to drive recent fixes.
 * - They should stress the same failure families:
 *   1) paragraph context recovery
 *   2) vague same-topic follow-up continuity
 *   3) broad-context -> narrow-target extraction
 *   4) tail / wrapper contamination
 *   5) noisy natural language
 *   6) comparison / contrast
 *   7) domain-shaped labels
 *
 * Notes convention:
 *   Prefix notes with [category:...] so the harness can later parse category
 *   without changing the golden type system yet.
 */

export const TOPIC_LABELING_HOLDOUT_GOLDENS: TopicGoldenCase[] = [
  // ---------------------------------------------------------------------------
  // Paragraph context recovery
  // ---------------------------------------------------------------------------
  {
    id: "holdout-paragraph-001",
    description: "paragraph with earlier concept and vague final sentence should recover speed of sound",
    message:
      "We started a section on waves and sound this week. Reflection and refraction were mostly okay, but when the worksheet switched to the speed of sound formula, that was where I stopped following. I think that's the part I need help with.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "holdout-paragraph-002",
    description: "paragraph with earlier named concept and later vague reference should recover reuptake",
    message:
      "We're doing neurotransmission right now. I can kind of follow the big picture, but when people start talking about reuptake, I lose the thread. That's the part I want to go over.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "holdout-paragraph-003",
    description: "paragraph with broad class context but specific mechanism should win",
    message:
      "In biology we've been covering membrane transport. Osmosis made some sense at first, but once the examples got more detailed, that was the piece I stopped understanding.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Osmosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "holdout-paragraph-004",
    description: "paragraph with explicit law name and vague tail should preserve law of cosines",
    message:
      "I was doing triangle problems for homework tonight. Most of them were manageable until the law of cosines showed up, and then I realized that is the part I do not really understand.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "holdout-paragraph-005",
    description: "paragraph with curling context should preserve rules of curling",
    message:
      "I've been trying to follow curling when it's on TV. I can kind of tell when a shot is good, but the rules of curling are still what make the whole thing confusing to me. That's the part I'm stuck on.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Rules of Curling",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "holdout-paragraph-006",
    description: "paragraph should recover action potentials from earlier sentence",
    message:
      "In lecture we covered neurons, threshold, and firing. I thought I was following until action potentials came up in more detail, and that is where I started getting lost.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Action Potentials",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },

  // ---------------------------------------------------------------------------
  // Broad context -> narrow target
  // ---------------------------------------------------------------------------
  {
    id: "holdout-focus-001",
    description: "broad chemistry context then narrow target electronegativity",
    message:
      "I'm reviewing chemistry right now, but the actual thing I need help with is electronegativity.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Electronegativity",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "holdout-focus-002",
    description: "broad list then singled-out target should choose depolarization",
    message:
      "We've gone over threshold, depolarization, repolarization, and refractory period, but depolarization is still the one I don't really get.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Depolarization",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "holdout-focus-003",
    description: "broad finance context then narrow target compound interest",
    message:
      "I'm trying to get better at personal finance, but the part I actually need help understanding is compound interest.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Compound Interest",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "holdout-focus-004",
    description: "broad genetics context then narrow target crossing over",
    message:
      "We're doing meiosis and inheritance in class, but the specific thing that's confusing me is crossing over.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Crossing Over",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "holdout-focus-005",
    description: "broad neuro context then narrow target refractory period",
    message:
      "I'm studying the nervous system right now, but the main thing I need help with is the refractory period.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Refractory Period",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },

  // ---------------------------------------------------------------------------
  // Tail / wrapper contamination
  // ---------------------------------------------------------------------------
  {
    id: "holdout-tail-001",
    description: "should strip learner-state tail after speed of sound",
    message:
      "I need help with the speed of sound and I don't really get that part yet.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:tail_contamination]",
  },
  {
    id: "holdout-tail-002",
    description: "should strip wrapper after law of sines",
    message:
      "The law of sines is what I'm confused about, not the rest of it.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Sines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:tail_contamination]",
  },
  {
    id: "holdout-tail-003",
    description: "should not include trailing wording after reuptake",
    message:
      "Reuptake is the thing that keeps messing me up every time.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:tail_contamination]",
  },
  {
    id: "holdout-tail-004",
    description: "should trim contamination after rules of curling",
    message:
      "It's really the rules of curling that I don't get, especially once scoring comes up.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Rules of Curling",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:tail_contamination]",
  },
  {
    id: "holdout-tail-005",
    description: "should preserve phases of mitosis without learner-state residue",
    message:
      "The phases of mitosis are what I keep getting stuck on.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Phases of Mitosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:tail_contamination]",
  },

  // ---------------------------------------------------------------------------
  // Noisy natural language
  // ---------------------------------------------------------------------------
  {
    id: "holdout-noise-001",
    description: "lowercase messy request should still find action potentials",
    message: "ok can u help me with action potentials bc im lost again",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Action Potentials",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:noisy_natural_language]",
  },
  {
    id: "holdout-noise-002",
    description: "typo-heavy reuptake prompt",
    message: "im confused about reuptaek again",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:noisy_natural_language]",
  },
  {
    id: "holdout-noise-003",
    description: "messy osmosis request",
    message: "uhh could we maybe go over osmosis??",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Osmosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:noisy_natural_language]",
  },
  {
    id: "holdout-noise-004",
    description: "messy law of cosines prompt",
    message: "law of cosines is not clicking rn",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:noisy_natural_language]",
  },

  // ---------------------------------------------------------------------------
  // Comparison / contrast
  // ---------------------------------------------------------------------------
  {
    id: "holdout-compare-001",
    description: "mixing two concepts should become comparison label",
    message:
      "I keep mixing up metaphase and anaphase. What's the difference between them?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Metaphase vs Anaphase",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:comparison]",
  },
  {
    id: "holdout-compare-002",
    description: "wrapper-heavy comparison should still produce comparison label",
    message:
      "I keep forgetting when to use your vs you're.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Your vs You're",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:comparison]",
  },
  {
    id: "holdout-compare-003",
    description: "math comparison with wrapper should remain comparison label",
    message:
      "I need help understanding when to use law of sines vs law of cosines.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Sines vs Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:comparison]",
  },

  // ---------------------------------------------------------------------------
  // Domain-shaped labels
  // ---------------------------------------------------------------------------
  {
    id: "holdout-domain-001",
    description: "domain shaping should preserve insurance deductible",
    message:
      "What is a deductible in insurance?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Insurance Deductible",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:domain_shaping]",
  },
  {
    id: "holdout-domain-002",
    description: "domain shaping should preserve offside in soccer",
    message:
      "Can you explain how offside works in soccer?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Offside in Soccer",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:domain_shaping]",
  },
  {
    id: "holdout-domain-003",
    description: "domain shaping should preserve credit card interest",
    message:
      "I don't understand how credit card interest works.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Credit Card Interest",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:domain_shaping]",
  },
];

export const TOPIC_LABELING_HOLDOUT_SEQUENCES: TopicGoldenSequence[] = [
  {
    id: "holdout-sequence-001",
    description: "paragraph-created topic followed by vague same-topic follow-up",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message:
          "In physics we're working on waves and sound. I was okay until the speed of sound formula came up, and now that's the part I need help with.",
        expectedLabel: "Speed of Sound",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-2",
        message: "Yeah, that exact part.",
        expectedMatchedTopicName: "Speed of Sound",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
    ],
    notes: "[category:followup_continuity]",
  },
  {
    id: "holdout-sequence-002",
    description: "rules of curling continuity with subpart follow-up",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message: "Why can't I understand the rules of curling?",
        expectedLabel: "Rules of Curling",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-2",
        message: "Especially the scoring part.",
        expectedMatchedTopicName: "Rules of Curling",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
    ],
    notes: "[category:followup_continuity]",
  },
  {
    id: "holdout-sequence-003",
    description: "create reuptake then pronoun-heavy continuation should stay",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message:
          "I'm learning about neurons, receptors, and reuptake, but reuptake is the part I'm actually confused about.",
        expectedLabel: "Reuptake",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-2",
        message: "I still don't really get it.",
        expectedMatchedTopicName: "Reuptake",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-3",
        message: "Can you quiz me on it?",
        expectedMatchedTopicName: "Reuptake",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
    ],
    notes: "[category:followup_continuity]",
  },
  {
    id: "holdout-sequence-004",
    description: "existing-topic switch to another existing topic should not create duplicate",
    initialTopics: [
      { id: "t1", name: "Budgeting" },
      { id: "t2", name: "Osmosis" },
    ],
    initialActiveTopicId: "t1",
    steps: [
      {
        id: "step-1",
        message: "Actually go back to osmosis.",
        expectedLabel: "Osmosis",
        expectedMatchedTopicName: "Osmosis",
        forbiddenResolutionKinds: ["created_new_candidate", "fallback_active_topic", "no_match"],
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-2",
        message: "Can we go over that again?",
        expectedMatchedTopicName: "Osmosis",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
    ],
    notes: "[category:followup_continuity]",
  },
];