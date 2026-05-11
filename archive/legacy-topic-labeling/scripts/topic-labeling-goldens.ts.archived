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

/**
 * BASELINE GOLDENS
 *
 * These should be strong but not as punishing as the holdout file.
 *
 * The baseline suite protects:
 * - direct topic creation
 * - broad-context -> narrow-bottleneck selection
 * - structured labels such as X of Y, X in Y, and X vs Y
 * - mechanism questions
 * - Spanish / tax language-barrier shaping
 * - null protection
 * - existing topic stay/switch/reuse behavior
 *
 * Notes convention:
 *   Prefix notes with [category:...] so the runner can group failures.
 */

export const TOPIC_LABELING_GOLDENS: TopicGoldenCase[] = [
  // ---------------------------------------------------------------------------
  // CLEAN / SIMPLE BASELINES
  // ---------------------------------------------------------------------------
  {
    id: "direct-001",
    description: "direct learning request with broad concept",
    message: "I want to learn about neurotransmitters, but I don't know where to start.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Neurotransmitters",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:direct_baseline]",
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
    notes: "[category:direct_baseline]",
  },
  {
    id: "direct-003",
    description: "simple direct question",
    message: "Can we go over action potentials?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Action Potentials",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:direct_baseline]",
  },
  {
    id: "direct-004",
    description: "simple polite wrapper",
    message: "Could you help me understand osmosis?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Osmosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:direct_baseline]",
  },
  {
    id: "direct-005",
    description: "casual abbreviation should still recover concept",
    message: "can u help me w mitosis pls",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Mitosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:direct_baseline]",
  },
  {
    id: "direct-006",
    description: "direct real-world concept",
    message: "I need help understanding insurance deductible.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Insurance Deductible",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:direct_baseline]",
  },

  // ---------------------------------------------------------------------------
  // BROAD DOMAIN -> TRUE TARGET LATER
  // ---------------------------------------------------------------------------
  {
    id: "focus-001",
    description: "broad neuroscience context but narrower actual target",
    message:
      "I'm learning about neurotransmitters, receptors, and reuptake, but I'm mainly confused about reuptake.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "focus-002",
    description: "broad chemistry context but exact concept later",
    message:
      "I'm learning chemistry right now and most of it is okay, but the thing I actually need help with is electronegativity.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Electronegativity",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "focus-003",
    description: "broad genetics context then narrow mechanism",
    message:
      "At first I thought meiosis was the hard part, but after looking again I think it's really just crossing over that I don't understand yet.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Crossing Over",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "focus-004",
    description: "broad finance context but true target is late and specific",
    message:
      "I've been reading about budgeting and saving and debt and all of that, but the actual thing that keeps messing me up is compound interest.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Compound Interest",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "focus-005",
    description: "broad neuro anchor but target is refractory period",
    message:
      "I keep saying I am reviewing the nervous system, but the real bottleneck is the refractory period.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Refractory Period",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "focus-006",
    description: "broad programming anchor but target is event loop",
    message:
      "Programming in general is not the issue right now. What I actually need help understanding is the event loop.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Event Loop",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },

  // ---------------------------------------------------------------------------
  // X OF Y / STRUCTURED PHRASES
  // ---------------------------------------------------------------------------
  {
    id: "of-001",
    description: "preserve rules of curling phrase",
    message: "Why can't I understand the rules of curling?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Rules of Curling",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:structured_phrase]",
  },
  {
    id: "of-002",
    description: "preserve phases of mitosis phrase",
    message: "Can you explain the phases of mitosis?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Phases of Mitosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:structured_phrase]",
  },
  {
    id: "of-003",
    description: "preserve layers of the skin phrase",
    message: "I keep mixing up the layers of the skin.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Layers of the Skin",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:structured_phrase]",
  },
  {
    id: "of-004",
    description: "preserve law phrase under wrapper-heavy question",
    message: "I don't get the law of sines at all.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Sines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:structured_phrase]",
  },
  {
    id: "of-005",
    description: "preserve law of cosines phrase",
    message: "The law of cosines is the thing that keeps throwing me off.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:structured_phrase]",
  },
  {
    id: "of-006",
    description: "preserve speed of sound phrase",
    message: "I keep getting confused by the speed of sound formula.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:structured_phrase]",
  },

  // ---------------------------------------------------------------------------
  // QUESTION SUBJECT / MECHANISM EXTRACTION
  // ---------------------------------------------------------------------------
  {
    id: "question-001",
    description: "how-does question",
    message: "How does reuptake work?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:mechanism_question]",
  },
  {
    id: "question-002",
    description: "how-do question with plural concept",
    message: "How do action potentials work?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Action Potentials",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:mechanism_question]",
  },
  {
    id: "question-003",
    description: "everyday sports rule question",
    message: "How does offside work in soccer?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Offside In Soccer",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:mechanism_question]",
  },
  {
    id: "question-004",
    description: "mechanism question for finance",
    message: "I don't get how interest on a credit card actually works.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Credit Card Interest",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:mechanism_question]",
  },
  {
    id: "question-005",
    description: "why question should preserve useful mechanism label",
    message: "Why does negative feedback happen in homeostasis?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Why Negative Feedback Happens",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:mechanism_question]",
  },

  // ---------------------------------------------------------------------------
  // COMPARISON EXTRACTION
  // ---------------------------------------------------------------------------
  {
    id: "compare-001",
    description: "classic biology comparison",
    message: "What's the difference between mitosis and meiosis?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Mitosis vs Meiosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:comparison]",
  },
  {
    id: "compare-002",
    description: "comparison with learner confusion framing",
    message:
      "We started mitosis and meiosis this week and I keep blending the two together. What's actually different between them?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Mitosis vs Meiosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:comparison]",
  },
  {
    id: "compare-003",
    description: "language comparison with everyday framing",
    message: "I keep forgetting when to use your vs you're.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Your vs You're",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:comparison]",
  },
  {
    id: "compare-004",
    description: "physics comparison with short natural wording",
    message: "What's the difference between speed and velocity?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed vs Velocity",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:comparison]",
  },
  {
    id: "compare-005",
    description: "math comparison with decision wording",
    message: "I don't know when to use law of sines vs law of cosines.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Sines vs Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:comparison]",
  },
  {
    id: "compare-006",
    description: "biology phase comparison hidden in plain language",
    message: "Metaphase and anaphase still feel basically the same in my head.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Metaphase vs Anaphase",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:comparison]",
  },

  // ---------------------------------------------------------------------------
  // CONTEXT RECOVERY / EMBEDDED CONCEPTS
  // ---------------------------------------------------------------------------
  {
    id: "context-001",
    description: "textbook context with embedded formula target",
    message: "My textbook has a formula about the speed of sound, but I don't get it.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:context_recovery]",
  },
  {
    id: "context-002",
    description: "lecture context then narrow mechanism",
    message:
      "In lecture we were doing action potentials and threshold and all that, but the part I'm actually confused about is depolarization.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Depolarization",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:context_recovery]",
  },
  {
    id: "context-003",
    description: "math homework context then exact law",
    message:
      "I'm doing homework on triangles right now, but what I'm really not understanding is the law of cosines.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:context_recovery]",
  },
  {
    id: "context-004",
    description: "broad unit context but specific sound target late",
    message:
      "We're doing a section on waves in class. Most of it is okay. The actual thing that confuses me is the speed of sound part.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:context_recovery]",
  },
  {
    id: "context-005",
    description: "class context but target is standard deviation",
    message:
      "We are doing probability in class and most of the examples are fine, but standard deviation is where I stop knowing what I am supposed to picture.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Standard Deviation",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:context_recovery]",
  },

  // ---------------------------------------------------------------------------
  // SPANISH / LANGUAGE / WORD ORDER FAMILY
  // ---------------------------------------------------------------------------
  {
    id: "spanish-001",
    description: "rambling naturalistic spanish message with buried target",
    message:
      "Why can't I get the small words in spanish? It's like the word order is really bothering me, like the word se has so many meanings and I dont knwo where to start.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Word Order In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "spanish-002",
    description: "se should beat broad spanish anchor",
    message:
      "Spanish in general is fine, vocab is mostly fine, but honestly the actual thing throwing me off is se because every time I think I know what it is doing, it kind of does something else.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Se In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "spanish-003",
    description: "word order target from naturalistic complaint",
    message:
      "The weird part is I can know all the spanish words separately, but when the sentence actually happens I stop trusting myself because the word order makes everything feel backwards.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Word Order In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "spanish-004",
    description: "emotionally dense but still topicful spanish message",
    message:
      "Spanish is the only thing lately that has made me feel weirdly helpless, because I can memorize vocab for hours and then one sentence with se shows up and I feel like I understood nothing.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Se In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "spanish-005",
    description: "sentence order wording should map to word order in Spanish",
    message:
      "I can translate the words, but sentence order in Spanish makes me feel like I am reading backwards.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Word Order In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "spanish-006",
    description: "tiny-word wording should still shape se into Spanish",
    message:
      "The tiny word se is what keeps throwing me off in Spanish.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Se In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },

  // ---------------------------------------------------------------------------
  // TAXES / FORMS / TERMINOLOGY FAMILY
  // ---------------------------------------------------------------------------
  {
    id: "tax-001",
    description: "long jargon barrier message",
    message:
      "The whole terminology and jargon of taxes and forms is weird and I want to understand it in my own language but I don't get it or where to even start on how to get it bettter.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Tax Terminology And Forms",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "tax-002",
    description: "forms and language barrier with disinterested tone",
    message:
      "I am not even interested in taxes right now, I just need the terminology to stop sounding like nonsense long enough for me to get through the forms.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Tax Terminology And Forms",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "tax-003",
    description: "terminology alone should win over broad taxes anchor",
    message:
      "Taxes as a subject are whatever, but the actual issue for me is the terminology because I read one line and realize I do not know what half the words mean.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Tax Terminology",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "tax-004",
    description: "emotionally dense language barrier",
    message:
      "I know this sounds dramatic but the tax jargon genuinely makes me feel stupid because I can't tell if I am failing at taxes or just failing at vocabulary.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Tax Jargon",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "tax-005",
    description: "forms should not collapse to broad taxes",
    message:
      "The tax forms are what make me freeze because every line sounds like it assumes I already know five other words.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Tax Terminology And Forms",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },

  // ---------------------------------------------------------------------------
  // MORE DIVERSE ACADEMIC TOPICS
  // ---------------------------------------------------------------------------
  {
    id: "stats-001",
    description: "statistics topic with buried bottleneck",
    message:
      "Probability was mostly manageable until standard deviation showed up, and now I am not even sure what I am supposed to be picturing anymore.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Standard Deviation",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:diverse_academic]",
  },
  {
    id: "econ-001",
    description: "economics with concrete target",
    message:
      "Economics is okay in a broad sense, but the thing I always seem to lose track of is opportunity cost because it sounds simple until I actually try to use it.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Opportunity Cost",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:diverse_academic]",
  },
  {
    id: "earth-001",
    description: "geology topic with natural rambling message",
    message:
      "Plate tectonics is one of those things where I feel like I understand it for five seconds and then I hear subduction again and realize I don't really know what is moving where.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Subduction",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:diverse_academic]",
  },
  {
    id: "bio-001",
    description: "homeostasis family with mechanism target",
    message:
      "I know homeostasis is the bigger topic, but the thing I actually need help with is negative feedback because that is the part that keeps sounding abstract to me.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Negative Feedback",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:diverse_academic]",
  },
  {
    id: "cs-001",
    description: "computer science with buried mechanism label",
    message:
      "Programming is fine until people start talking about the event loop like it is obvious, and then I realize I do not actually know what is happening under the surface.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Event Loop",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:diverse_academic]",
  },
  {
    id: "music-001",
    description: "music theory topic with real-person style complaint",
    message:
      "Music theory overall is not impossible, but secondary dominants are the thing that always make me feel like I missed some earlier explanation everybody else got.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Secondary Dominants",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:diverse_academic]",
  },

  // ---------------------------------------------------------------------------
  // DISINTERESTED / LOW-ENERGY / RESIGNED
  // ---------------------------------------------------------------------------
  {
    id: "disinterest-001",
    description: "disinterested but topicful biology message",
    message:
      "Not gonna lie I am kind of over this unit, but if I have to learn something it is probably membrane potential because that is the thing that still does not click.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Membrane Potential",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:emotion_topicful]",
  },
  {
    id: "disinterest-002",
    description: "disinterested chemistry message with specific target",
    message:
      "I guess I should probably understand equilibrium constant eventually, but right now it just feels like one more symbol-heavy thing I am pretending to follow.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Equilibrium Constant",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:emotion_topicful]",
  },

  // ---------------------------------------------------------------------------
  // EMOTIONALLY DENSE BUT STILL TOPICFUL
  // ---------------------------------------------------------------------------
  {
    id: "emotion-001",
    description: "panic / embarrassment but exact comparison target",
    message:
      "This is embarrassing but I keep messing up mitosis because metaphase and anaphase still feel basically the same in my head and every time I see a question I panic a little.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Metaphase vs Anaphase",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:emotion_topicful]",
  },
  {
    id: "emotion-002",
    description: "irritation with precise mechanism target",
    message:
      "I get so irritated every time the topic of reuptake comes back because I think I finally understand it and then one tiny wording change makes me feel like I never understood it at all.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:emotion_topicful]",
  },
  {
    id: "emotion-003",
    description: "emotionally dense but precise target should win",
    message:
      "I feel dumb saying this, but depolarization is the thing that makes the whole neuron explanation fall apart for me.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Depolarization",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:emotion_topicful]",
  },

  // ---------------------------------------------------------------------------
  // RAMBLING MULTI-SENTENCE / PARAGRAPH-LIKE
  // ---------------------------------------------------------------------------
  {
    id: "paragraph-001",
    description: "paragraph with broad setup and narrow mechanism",
    message:
      "We're doing a unit on neurotransmission right now. I kind of understand the overall idea, but I keep getting lost when people talk about reuptake and what it changes. Could we go over that?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "paragraph-002",
    description: "paragraph with broad sound context and exact formula target",
    message:
      "In class we're doing waves and sound. The worksheet has a formula for the speed of sound and everyone else seems to get what the variables are doing, but I don't. I think that's the part I need help with.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "paragraph-003",
    description: "paragraph with topic self-correction",
    message:
      "I was doing practice questions for bio and I thought I was confused about mitosis generally. But after looking again I think it's really just metaphase vs anaphase that I keep mixing up.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Metaphase vs Anaphase",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "paragraph-004",
    description: "rambling budgeting message with concrete practical target",
    message:
      "My teacher explained budgeting, fixed expenses, variable expenses, debt, and saving, and most of that was okay. But I still don't really know how to make a budget that balances, and that seems to be the part that makes every example fall apart for me.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Balancing a Budget",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "paragraph-005",
    description: "rambling practical finance paragraph",
    message:
      "I thought I was asking about loans in general, but honestly the real issue is principal because every explanation uses the word like I am already supposed to understand what part of the total it refers to.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Loan Principal",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },

  // ---------------------------------------------------------------------------
  // NOISY / COLLOQUIAL / TYPO-TOLERANT
  // ---------------------------------------------------------------------------
  {
    id: "noise-001",
    description: "missing punctuation and lowercase",
    message: "my textbook is talking about the speed of sound and i honestly dont get it",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:noisy_natural_language]",
  },
  {
    id: "noise-002",
    description: "messy punctuation around direct concept request",
    message: "uhh... can we go over action potentials??",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Action Potentials",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:noisy_natural_language]",
  },
  {
    id: "noise-003",
    description: "short typo-heavy naturalistic prompt",
    message: "can u help me w mitosis pls",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Mitosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:noisy_natural_language]",
  },
  {
    id: "noise-004",
    description: "typo-heavy Spanish se message",
    message: "spanish is ok until se shows up n then i dont knwo what is happening",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Se In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:noisy_natural_language]",
  },

  // ---------------------------------------------------------------------------
  // SHOULD STAY NULL / SHOULD NOT CREATE
  // ---------------------------------------------------------------------------
  {
    id: "null-001",
    description: "pure vague confusion",
    message: "I don't get it.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: null,
    expectedResolutionKind: "no_match",
    expectedShouldCreate: false,
    notes: "[category:null_cases]",
  },
  {
    id: "null-002",
    description: "vague help request",
    message: "Can you help me with this?",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: null,
    expectedResolutionKind: "no_match",
    expectedShouldCreate: false,
    notes: "[category:null_cases]",
  },
  {
    id: "null-003",
    description: "emotionally dense but not topic-specific",
    message:
      "I do not know, I am kind of annoyed and tired and this whole thing is just not landing and I feel like I am missing something basic but I cannot even tell what the actual topic is anymore.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: null,
    expectedResolutionKind: "no_match",
    expectedShouldCreate: false,
    notes: "[category:null_cases]",
  },
  {
    id: "null-004",
    description: "rambling but still too vague",
    message:
      "Can you maybe help me but also I do not even know with what exactly, I just know I keep getting stuck and then zoning out.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: null,
    expectedResolutionKind: "no_match",
    expectedShouldCreate: false,
    notes: "[category:null_cases]",
  },
  {
    id: "null-005",
    description: "pure frustration without durable concept",
    message:
      "Ugh I do not even know. I am annoyed and tired and nothing is sticking.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: null,
    expectedResolutionKind: "no_match",
    expectedShouldCreate: false,
    notes: "[category:null_cases]",
  },

  // ---------------------------------------------------------------------------
  // EXISTING-TOPIC STAY / SWITCH / REUSE
  // ---------------------------------------------------------------------------
  {
    id: "stay-001",
    description: "should stay on active topic under direct quiz request",
    message: "Can you quiz me on neurotransmitters?",
    existingTopics: [{ id: "t1", name: "Neurotransmitters" }],
    activeTopicId: "t1",
    expectedLabel: "Neurotransmitters",
    expectedMatchedTopicName: "Neurotransmitters",
    forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
    notes: "[category:reuse_existing]",
  },
  {
    id: "stay-002",
    description: "vague same-topic followup should stay active",
    message: "Can we go over that again?",
    existingTopics: [{ id: "t1", name: "Speed of Sound" }],
    activeTopicId: "t1",
    expectedMatchedTopicName: "Speed of Sound",
    forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
    notes: "[category:reuse_existing]",
  },
  {
    id: "stay-003",
    description: "pronoun-heavy continuation should stay active",
    message: "I still don't really get it.",
    existingTopics: [{ id: "t1", name: "Reuptake" }],
    activeTopicId: "t1",
    expectedMatchedTopicName: "Reuptake",
    forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
    notes: "[category:reuse_existing]",
  },
  {
    id: "switch-001",
    description: "clear switch away from active topic",
    message: "Actually I want to learn about budgeting now.",
    existingTopics: [{ id: "t1", name: "Neurotransmitters" }],
    activeTopicId: "t1",
    expectedLabel: "Budgeting",
    forbiddenResolutionKinds: ["fallback_active_topic"],
    expectedShouldCreate: true,
    notes: "[category:switching]",
  },
  {
    id: "switch-002",
    description: "switch to existing topic instead of duplicate creation",
    message: "Can we go back to mitosis instead?",
    existingTopics: [
      { id: "t1", name: "Meiosis" },
      { id: "t2", name: "Mitosis" },
    ],
    activeTopicId: "t1",
    expectedLabel: "Mitosis",
    expectedMatchedTopicName: "Mitosis",
    forbiddenResolutionKinds: ["created_new_candidate", "fallback_active_topic", "no_match"],
    notes: "[category:switching]",
  },

  // ---------------------------------------------------------------------------
  // EXISTING BROAD TOPIC VS NEW NARROW TOPIC
  // ---------------------------------------------------------------------------
  {
    id: "existing-narrow-001",
    description: "existing broad Spanish topic should not swallow se bottleneck",
    message:
      "Spanish is still the big topic, but the thing I actually need help with is se.",
    existingTopics: [{ id: "t1", name: "Spanish" }],
    activeTopicId: "t1",
    expectedLabel: "Se In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    forbiddenResolutionKinds: ["fallback_active_topic"],
    notes: "[category:existing_vs_new_narrow]",
  },
  {
    id: "existing-narrow-002",
    description: "existing broad Taxes topic should not swallow tax terminology target",
    message:
      "Taxes is still the big topic, but right now the actual blocker is the terminology and forms.",
    existingTopics: [{ id: "t1", name: "Taxes" }],
    activeTopicId: "t1",
    expectedLabel: "Tax Terminology And Forms",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    forbiddenResolutionKinds: ["fallback_active_topic"],
    notes: "[category:existing_vs_new_narrow]",
  },
  {
    id: "existing-narrow-003",
    description: "existing broad Neurotransmitters topic should not swallow reuptake",
    message:
      "We can stay in neurotransmitters generally, but the specific thing I need to understand is reuptake.",
    existingTopics: [{ id: "t1", name: "Neurotransmitters" }],
    activeTopicId: "t1",
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    forbiddenResolutionKinds: ["fallback_active_topic"],
    notes: "[category:existing_vs_new_narrow]",
  },
];

export const TOPIC_LABELING_SEQUENCES: TopicGoldenSequence[] = [
  {
    id: "sequence-001",
    description: "create one topic, switch to another, then stay there",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message: "I want to learn about neurotransmitters.",
        expectedLabel: "Neurotransmitters",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:sequence_baseline]",
      },
      {
        id: "step-2",
        message: "Actually I want to learn about budgeting now.",
        expectedLabel: "Budgeting",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        forbiddenResolutionKinds: ["fallback_active_topic"],
        notes: "[category:sequence_baseline]",
      },
      {
        id: "step-3",
        message: "Can you quiz me on budgeting?",
        expectedLabel: "Budgeting",
        expectedMatchedTopicName: "Budgeting",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:sequence_baseline]",
      },
    ],
    notes: "[category:sequence_baseline]",
  },
  {
    id: "sequence-002",
    description: "context-heavy creation then same-topic continuation",
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
        notes: "[category:sequence_baseline]",
      },
      {
        id: "step-2",
        message: "Yeah, that exact part.",
        expectedMatchedTopicName: "Speed of Sound",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:sequence_baseline]",
      },
    ],
    notes: "[category:sequence_baseline]",
  },
  {
    id: "sequence-003",
    description: "explicit topic then pronoun-heavy continuation",
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
        notes: "[category:sequence_baseline]",
      },
      {
        id: "step-2",
        message: "I think that's the part where I get lost every time.",
        expectedMatchedTopicName: "Reuptake",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:sequence_baseline]",
      },
      {
        id: "step-3",
        message: "Can you quiz me on it?",
        expectedMatchedTopicName: "Reuptake",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:sequence_baseline]",
      },
    ],
    notes: "[category:sequence_baseline]",
  },
  {
    id: "sequence-004",
    description: "create topic from naturalistic spanish complaint then continue on same target",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message:
          "Why can't I get the small words in spanish? It's like the word order is really bothering me, like the word se has so many meanings and I dont knwo where to start.",
        expectedLabel: "Word Order In Spanish",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:sequence_language]",
      },
      {
        id: "step-2",
        message: "Yeah, that exact part. The sentence order part.",
        expectedMatchedTopicName: "Word Order In Spanish",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:sequence_language]",
      },
    ],
    notes:
      "[category:sequence_language] This tests whether a long messy initial message can create a usable topic that later vague followups stay attached to.",
  },
  {
    id: "sequence-005",
    description: "create tax topic from jargon barrier then remain there through pronoun followups",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message:
          "The whole terminology and jargon of taxes and forms is weird and I want to understand it in my own language but I don't get it or where to even start on how to get it bettter.",
        expectedLabel: "Tax Terminology And Forms",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:sequence_language]",
      },
      {
        id: "step-2",
        message: "It just feels like another language.",
        expectedMatchedTopicName: "Tax Terminology And Forms",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:sequence_language]",
      },
      {
        id: "step-3",
        message: "Can we go over that again but slower?",
        expectedMatchedTopicName: "Tax Terminology And Forms",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:sequence_language]",
      },
    ],
    notes: "[category:sequence_language]",
  },
  {
    id: "sequence-006",
    description: "detour to another topic then explicit return",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message: "Can we go over action potentials?",
        expectedLabel: "Action Potentials",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:sequence_switching]",
      },
      {
        id: "step-2",
        message: "Actually I also need help with osmosis.",
        expectedLabel: "Osmosis",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        forbiddenResolutionKinds: ["fallback_active_topic"],
        notes: "[category:sequence_switching]",
      },
      {
        id: "step-3",
        message: "Wait, go back to action potentials.",
        expectedLabel: "Action Potentials",
        expectedMatchedTopicName: "Action Potentials",
        forbiddenResolutionKinds: ["created_new_candidate", "fallback_active_topic", "no_match"],
        notes: "[category:sequence_switching]",
      },
    ],
    notes: "[category:sequence_switching]",
  },
  {
    id: "sequence-007",
    description: "comparison topic then naturalistic same-topic followup",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message: "What's the difference between speed and velocity?",
        expectedLabel: "Speed vs Velocity",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:sequence_comparison]",
      },
      {
        id: "step-2",
        message: "I keep mixing them up in word problems.",
        expectedMatchedTopicName: "Speed vs Velocity",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:sequence_comparison]",
      },
      {
        id: "step-3",
        message: "Quiz me on that.",
        expectedMatchedTopicName: "Speed vs Velocity",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:sequence_comparison]",
      },
    ],
    notes: "[category:sequence_comparison]",
  },
  {
    id: "sequence-008",
    description: "broad existing topic should split to narrow target, then stay on narrow target",
    initialTopics: [{ id: "t1", name: "Spanish" }],
    initialActiveTopicId: "t1",
    steps: [
      {
        id: "step-1",
        message:
          "Spanish is still the big topic, but the thing I actually need help with is se.",
        expectedLabel: "Se In Spanish",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        forbiddenResolutionKinds: ["fallback_active_topic", "no_match"],
        notes: "[category:sequence_existing_vs_new_narrow]",
      },
      {
        id: "step-2",
        message: "Yeah, that tiny word.",
        expectedMatchedTopicName: "Se In Spanish",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:sequence_existing_vs_new_narrow]",
      },
    ],
    notes: "[category:sequence_existing_vs_new_narrow]",
  },
];

export const TOPIC_LABELING_HARD_GOLDENS: TopicGoldenCase[] = [
  {
    id: "hard-001",
    description: "messy neuroscience message with buried target",
    message:
      "Ok so like I was trying to understand dopamine yesterday and I thought that was the issue, but honestly after staring at it again I think the actual thing making everything confusing is reuptake.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:hard_broad_to_narrow]",
  },
  {
    id: "hard-002",
    description: "messy math paragraph with law target late",
    message:
      "Triangles in general are not the problem, and I can usually tell what the question is asking, but once the law of cosines shows up I start second-guessing every step and then I kind of spiral.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:hard_broad_to_narrow]",
  },
  {
    id: "hard-003",
    description: "rambling budgeting paragraph with concrete target",
    message:
      "I thought budgeting was the thing I needed help with, and maybe it still kind of is, but after actually trying the problems I think the real issue is balancing a budget because that is the point where everything stops adding up in my head.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Balancing a Budget",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:hard_broad_to_narrow]",
  },
  {
    id: "hard-004",
    description: "sports rules with conversational naturalism",
    message:
      "I can watch soccer fine, but when somebody asks me to explain offside I realize I do not actually know how the rule works and then I start saying vague nonsense.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Offside In Soccer",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:hard_domain_shaping]",
  },
  {
    id: "hard-005",
    description: "biology paragraph with comparison target",
    message:
      "I was doing practice questions for bio and I thought I was confused about mitosis generally, but after looking again I think it's really just metaphase and anaphase that I keep blending together.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Metaphase vs Anaphase",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:hard_comparison]",
  },
  {
    id: "hard-006",
    description: "real-world finance language barrier",
    message:
      "I know this is not exactly an academic question, but insurance deductible is one of those phrases I keep seeing and pretending I understand, and I really don't.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Insurance Deductible",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:hard_domain_shaping]",
  },
  {
    id: "hard-007",
    description: "programming message with mechanism target",
    message:
      "People keep explaining the event loop like I should already know why it matters, and that somehow makes it worse, because now I feel dumb and also still do not know what it actually is.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Event Loop",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:hard_tail_contamination]",
  },
  {
    id: "hard-008",
    description: "music theory with disinterested but specific tone",
    message:
      "I am not exactly excited about music theory right now, but secondary dominants are the one thing that keep making the whole topic feel fake and overly complicated to me.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Secondary Dominants",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:hard_tail_contamination]",
  },
  {
    id: "hard-009",
    description: "vague emotional message should still not create",
    message:
      "I am just frustrated and tired and this whole thing is making me feel stupid, but I cannot even tell what I am asking about anymore.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: null,
    expectedResolutionKind: "no_match",
    expectedShouldCreate: false,
    notes: "[category:hard_null]",
  },
  {
    id: "hard-010",
    description: "meta continuation should stay anchored",
    message: "Can you say that again but shorter?",
    existingTopics: [{ id: "t1", name: "Speed of Sound" }],
    activeTopicId: "t1",
    expectedMatchedTopicName: "Speed of Sound",
    forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
    notes: "[category:hard_followup]",
  },
  {
    id: "hard-011",
    description: "existing broad topic should not swallow narrow tax target",
    message:
      "Taxes is still the overall thing, but the blocker is the terminology and forms.",
    existingTopics: [{ id: "t1", name: "Taxes" }],
    activeTopicId: "t1",
    expectedLabel: "Tax Terminology And Forms",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    forbiddenResolutionKinds: ["fallback_active_topic"],
    notes: "[category:hard_existing_vs_new_narrow]",
  },
  {
    id: "hard-012",
    description: "existing broad topic should not swallow narrow reuptake target",
    message:
      "Neurotransmitters is the general area, but the actual thing I need to understand is reuptake.",
    existingTopics: [{ id: "t1", name: "Neurotransmitters" }],
    activeTopicId: "t1",
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    forbiddenResolutionKinds: ["fallback_active_topic"],
    notes: "[category:hard_existing_vs_new_narrow]",
  },
];

export const TOPIC_LABELING_HARD_SEQUENCES: TopicGoldenSequence[] = [
  {
    id: "hard-sequence-001",
    description: "topic creation from messy long message, then pronoun-heavy continuation",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message:
          "Spanish is weird because I can kind of know the words, but then the sentence happens and I stop trusting myself. I think the actual issue is the word order more than vocab.",
        expectedLabel: "Word Order In Spanish",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:hard_sequence_language]",
      },
      {
        id: "step-2",
        message: "Yeah, that exact part is what keeps throwing me off.",
        expectedMatchedTopicName: "Word Order In Spanish",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:hard_sequence_language]",
      },
      {
        id: "step-3",
        message: "Quiz me on it.",
        expectedMatchedTopicName: "Word Order In Spanish",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:hard_sequence_language]",
      },
    ],
    notes: "[category:hard_sequence_language]",
  },
  {
    id: "hard-sequence-002",
    description: "tax jargon topic then stay anchored through vague followups",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message:
          "The forms and the tax terminology feel like another language and I keep shutting down right at the beginning because I don't know what half the words are asking for.",
        expectedLabel: "Tax Terminology And Forms",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:hard_sequence_language]",
      },
      {
        id: "step-2",
        message: "It just feels coded.",
        expectedMatchedTopicName: "Tax Terminology And Forms",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:hard_sequence_language]",
      },
      {
        id: "step-3",
        message: "Can we do that again?",
        expectedMatchedTopicName: "Tax Terminology And Forms",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:hard_sequence_language]",
      },
    ],
    notes: "[category:hard_sequence_language]",
  },
  {
    id: "hard-sequence-003",
    description: "existing earlier topic reused on explicit return",
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
        forbiddenResolutionKinds: [
          "created_new_candidate",
          "fallback_active_topic",
          "no_match",
        ],
        notes: "[category:hard_sequence_switching]",
      },
      {
        id: "step-2",
        message: "No, the first part of that.",
        expectedMatchedTopicName: "Action Potentials",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:hard_sequence_switching]",
      },
    ],
    notes: "[category:hard_sequence_switching]",
  },
  {
    id: "hard-sequence-004",
    description: "broad active topic splits into narrow target, then vague followup stays narrow",
    initialTopics: [{ id: "t1", name: "Neurotransmitters" }],
    initialActiveTopicId: "t1",
    steps: [
      {
        id: "step-1",
        message:
          "Neurotransmitters is the general area, but the actual thing I need to understand is reuptake.",
        expectedLabel: "Reuptake",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        forbiddenResolutionKinds: ["fallback_active_topic", "no_match"],
        notes: "[category:hard_sequence_existing_vs_new_narrow]",
      },
      {
        id: "step-2",
        message: "Yeah, that specific part.",
        expectedMatchedTopicName: "Reuptake",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:hard_sequence_existing_vs_new_narrow]",
      },
      {
        id: "step-3",
        message: "Quiz me on it.",
        expectedMatchedTopicName: "Reuptake",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:hard_sequence_existing_vs_new_narrow]",
      },
    ],
    notes: "[category:hard_sequence_existing_vs_new_narrow]",
  },
];
