// scripts/topic-labeling-holdout.ts

import type {
  TopicGoldenCase,
  TopicGoldenSequence,
} from "./topic-labeling-goldens";

/**
 * HOLDOUT PRINCIPLES
 *
 * This file is intentionally harder and more naturalistic than the baseline goldens.
 *
 * It should stress:
 *   1) multi-sentence paragraph recovery
 *   2) buried or implicit instructional targets
 *   3) broad-context -> narrow-bottleneck selection
 *   4) wrapper / residue contamination resistance
 *   5) typo-tolerant and spoken-language tolerance
 *   6) emotionally dense but still topicful messages
 *   7) vague follow-up continuity
 *   8) cases that should still stay null despite emotional complexity
 *   9) discourse-role separation:
 *      - background/domain anchor
 *      - learner-state residue
 *      - narrowing/contrast clause
 *      - true instructional target/bottleneck
 *
 * Notes convention:
 *   Prefix notes with [category:...] so the harness can parse category
 *   without changing the golden type system.
 */

export const TOPIC_LABELING_HOLDOUT_GOLDENS: TopicGoldenCase[] = [
  // ---------------------------------------------------------------------------
  // MULTI-SENTENCE / PARAGRAPH CONTEXT RECOVERY
  // ---------------------------------------------------------------------------
  {
    id: "holdout-paragraph-001",
    description: "paragraph with broad sound context and buried speed of sound target",
    message:
      "We started a section on waves and sound this week. Reflection and refraction were mostly okay for me, or at least okay enough. But once the worksheet switched to the speed of sound formula, that was where I stopped following what the variables were even supposed to mean.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "holdout-paragraph-002",
    description: "paragraph with neuroscience setup and implicit reuptake bottleneck",
    message:
      "We're doing neurotransmission right now. I can kind of repeat the big-picture story back if I need to, so it sounds like I understand it. But when reuptake comes up, that is the point where I realize I do not really know what changes and why it matters.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "holdout-paragraph-003",
    description: "paragraph with broad biology setup and depolarization target late",
    message:
      "In class we were doing neurons, threshold, membrane potential, and firing. At first I thought I was confused about action potentials in general, but after trying the practice questions I think it is really depolarization that keeps breaking my understanding.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Depolarization",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "holdout-paragraph-004",
    description: "paragraph with broad triangle context and law of cosines target",
    message:
      "I was doing triangle homework tonight and most of it was manageable in a fake way where I sort of convince myself I am following. Then law of cosines came up and suddenly I realized that was actually the thing I never properly understood.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "holdout-paragraph-005",
    description: "paragraph with broad sports viewing context and rules of curling target",
    message:
      "I've been trying to follow curling when it is on TV because people around me act like the strategy is obvious. I can kind of tell when a shot looks good, but the rules of curling are still what make the whole thing feel slippery and confusing to me.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Rules of Curling",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "holdout-paragraph-006",
    description: "paragraph with budgeting context but balancing a budget buried later",
    message:
      "My teacher explained budgeting, fixed expenses, variable expenses, debt, and saving, and I nodded through most of it. But when I actually try to put the numbers together myself, making a budget that balances is the point where it stops feeling real to me and starts feeling fake.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Balancing a Budget",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "holdout-paragraph-007",
    description: "long paragraph with domain anchor, emotional residue, and late formula target",
    message:
      "I feel like I mostly understand waves when the examples are just pictures of crests and troughs. The second numbers show up, though, I start guessing. The specific thing I want to fix is the speed of sound formula because I cannot tell what the variables are doing.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "holdout-paragraph-008",
    description: "paragraph with broad action potential anchor and narrow refractory period target",
    message:
      "Action potentials are kind of making sense in the broad story version. I know there is depolarization and repolarization and all of that. But the refractory period is where I lose the logic of why the neuron cannot just fire again immediately.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Refractory Period",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },
  {
    id: "holdout-paragraph-009",
    description: "multi-sentence topic self-correction from broad mitosis to phase comparison",
    message:
      "At first I thought I needed help with mitosis in general. But when I looked at the questions I got wrong, it was not all of mitosis. It was metaphase and anaphase that still felt basically the same to me.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Metaphase vs Anaphase",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:paragraph_context]",
  },

  // ---------------------------------------------------------------------------
  // BROAD CONTEXT -> NARROW BURIED TARGET
  // ---------------------------------------------------------------------------
  {
    id: "holdout-buried-001",
    description: "broad genetics context but actual target is crossing over",
    message:
      "We're doing meiosis and inheritance and chromosome stuff right now, and at first I thought the whole unit was just generally confusing. But after sitting with it longer I think crossing over is the specific point where things stop making sense for me.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Crossing Over",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "holdout-buried-002",
    description: "broad finance domain but target is compound interest",
    message:
      "Personal finance overall is not really what I am asking about, even though that is the umbrella. The part I actually need help understanding is compound interest, because that is the point where numbers stop feeling intuitive to me.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Compound Interest",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "holdout-buried-003",
    description: "broad chemistry domain but target is electronegativity",
    message:
      "Chemistry is not even the problem in the broad sense. It is more that electronegativity is the thing that keeps showing up and making me realize I never built a stable understanding of it.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Electronegativity",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "holdout-buried-004",
    description: "broad neuro domain but target is refractory period",
    message:
      "I keep telling myself I am reviewing the nervous system, but that is too broad to even be useful. The real bottleneck is the refractory period, because every explanation of it feels clear for ten seconds and then disappears on me.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Refractory Period",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "holdout-buried-005",
    description: "broad homeostasis anchor but true target is negative feedback",
    message:
      "Homeostasis is the bigger topic on the slide, but that is not exactly what I need. The thing that keeps sounding abstract is negative feedback because I cannot picture how the system knows to reverse itself.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Negative Feedback",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "holdout-buried-006",
    description: "broad programming anchor but true target is event loop",
    message:
      "Programming is not the whole problem right now. I can write small bits of code. What I actually keep getting stuck on is the event loop because people describe it like it is obvious and I cannot picture what is waiting for what.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Event Loop",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },
  {
    id: "holdout-buried-007",
    description: "broad economics anchor but true target is opportunity cost",
    message:
      "Economics as a subject is not what I am asking about. The actual thing that keeps feeling too simple and too confusing at the same time is opportunity cost.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Opportunity Cost",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:broad_to_narrow]",
  },

  // ---------------------------------------------------------------------------
  // SPANISH / WORD ORDER / SE
  // ---------------------------------------------------------------------------
  {
    id: "holdout-spanish-001",
    description: "rambling spanish message where word order is buried in complaint",
    message:
      "Spanish keeps doing this thing where I know the words separately and I sort of know what the sentence is about, but then the sentence order itself starts making me distrust my own reading. So I guess what I am saying is the word order is probably the real issue, not vocab.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Word Order In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "holdout-spanish-002",
    description: "emotionally dense spanish message with se target implicit but recoverable",
    message:
      "I can deal with spanish until se shows up again, and then suddenly I am back in that feeling of not knowing what any part of the sentence is doing. It is frustrating because it is such a tiny word and somehow it controls whether I trust my understanding or not.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Se In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "holdout-spanish-003",
    description: "rambling multi-sentence spanish complaint with buried se target",
    message:
      "I thought my problem with spanish was just that I needed more vocab, which maybe is still true in some boring general way. But the actual thing that keeps making me feel lost is se, because every time I think I know what it is doing the sentence seems to bend around it in a different way.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Se In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "holdout-spanish-004",
    description: "small words anchor should become se in Spanish when se is the bottleneck",
    message:
      "I keep saying my problem is the small words in Spanish, but that is too vague. It is really se that keeps ruining my confidence because it looks tiny and then changes the whole sentence.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Se In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "holdout-spanish-005",
    description: "sentence order wording should map to word order in Spanish",
    message:
      "I can translate individual Spanish words, but the sentence order makes me feel like I am reading backwards. I think word order is the actual thing I need to fix.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Word Order In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "holdout-spanish-006",
    description: "emotionally dense but precise se target",
    message:
      "Spanish makes me feel so dumb sometimes because one sentence will be fine and then se appears and suddenly I do not trust anything I thought I understood.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Se In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },

  // ---------------------------------------------------------------------------
  // TAX / FORMS / TERMINOLOGY
  // ---------------------------------------------------------------------------
  {
    id: "holdout-tax-001",
    description: "rambling tax message with language barrier target implicit",
    message:
      "It is not even that taxes are automatically impossible, which I keep trying to remind myself of. The thing that makes me shut down is that the forms and the vocabulary feel like they were written for somebody who already knows the whole system, and then I start feeling behind before I even begin.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Tax Terminology And Forms",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "holdout-tax-002",
    description: "emotionally dense jargon barrier with buried terminology target",
    message:
      "I know this sounds dramatic but tax jargon makes me feel stupid in a very specific way, because I can usually tell when I do not understand a concept, but here I cannot even tell what the words are asking me to know first.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Tax Jargon",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "holdout-tax-003",
    description: "low-energy tax message where terminology should beat broad taxes",
    message:
      "I do not even really care about taxes right now if I am being honest. I just need the terminology to stop feeling like coded language long enough for the forms to feel human.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Tax Terminology And Forms",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "holdout-tax-004",
    description: "forms target should not collapse to taxes",
    message:
      "Taxes are the class topic, but the forms are what make me freeze because every box sounds like it assumes I already know five other words.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Tax Terminology And Forms",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },
  {
    id: "holdout-tax-005",
    description: "terminology-only target with taxes as broad anchor",
    message:
      "The tax part is whatever. The terminology is the actual blocker because I cannot even tell what the sentence wants me to understand.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Tax Terminology",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:buried_language_target]",
  },

  // ---------------------------------------------------------------------------
  // WRAPPER / RESIDUE / TAIL CONTAMINATION
  // ---------------------------------------------------------------------------
  {
    id: "holdout-tail-001",
    description: "should strip learner-state residue after speed of sound target",
    message:
      "I need help with the speed of sound because that is the point where I stop pretending I understand what is happening.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:tail_contamination]",
  },
  {
    id: "holdout-tail-002",
    description: "should strip contamination after reuptake",
    message:
      "Reuptake is the thing that keeps messing me up every single time and I am getting kind of annoyed about it now.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:tail_contamination]",
  },
  {
    id: "holdout-tail-003",
    description: "should preserve rules of curling despite long residue tail",
    message:
      "It is really the rules of curling that I do not get, not the general sport vibe, especially once scoring comes up and I start feeling like I missed some earlier explanation.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Rules of Curling",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:tail_contamination]",
  },
  {
    id: "holdout-tail-004",
    description: "should strip residue after law of cosines",
    message:
      "Law of cosines is where my brain starts doing that annoying thing where I pretend I know the next step but I really do not.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:tail_contamination]",
  },
  {
    id: "holdout-tail-005",
    description: "should strip residue after event loop",
    message:
      "The event loop is what keeps making programming feel fake to me because I can write the code but I cannot picture what is happening under it.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Event Loop",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:tail_contamination]",
  },
  {
    id: "holdout-tail-006",
    description: "should not label learner-state tail after standard deviation",
    message:
      "Standard deviation is the thing that makes me lose track and then I start feeling like maybe I never understood probability at all.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Standard Deviation",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:tail_contamination]",
  },

  // ---------------------------------------------------------------------------
  // NOISY / SPOKEN / TYPO-TOLERANT
  // ---------------------------------------------------------------------------
  {
    id: "holdout-noise-001",
    description: "typo-heavy naturalistic spanish message",
    message:
      "ok so spanish is fine till se shows up n then i kind of dont knwo what the sentence is doing anymore",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Se In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:noisy_natural_language]",
  },
  {
    id: "holdout-noise-002",
    description: "messy low-energy law of cosines complaint",
    message:
      "ugh law of cosines was maybe in my head at one point but rn it is just not clicking at all",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:noisy_natural_language]",
  },
  {
    id: "holdout-noise-003",
    description: "messy colloquial budget message",
    message:
      "i get budgeting in theory i guess but making a budget that balances is where it starts falling apart for me",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Balancing a Budget",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:noisy_natural_language]",
  },
  {
    id: "holdout-noise-004",
    description: "messy abbreviated se message",
    message:
      "spanish isnt awful but se keeps showing up and idk what its doing tbh",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Se In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:noisy_natural_language]",
  },
  {
    id: "holdout-noise-005",
    description: "casual speed of sound message with low punctuation",
    message:
      "we did waves today and i was ok until speed of sound came up then i was totally guessing",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed of Sound",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:noisy_natural_language]",
  },
  {
    id: "holdout-noise-006",
    description: "casual tax terminology message",
    message:
      "tax forms are whatever but the terminology is like coded language and i hate it",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Tax Terminology And Forms",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:noisy_natural_language]",
  },

  // ---------------------------------------------------------------------------
  // COMPARISON / CONTRAST UNDER RAMBLING LANGUAGE
  // ---------------------------------------------------------------------------
  {
    id: "holdout-compare-001",
    description: "rambling comparison with buried target",
    message:
      "I thought I was confused about mitosis overall, but after doing more questions I think the real problem is that metaphase and anaphase still feel basically interchangeable in my head.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Metaphase vs Anaphase",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:comparison]",
  },
  {
    id: "holdout-compare-002",
    description: "comparison from everyday grammar with extra emotional framing",
    message:
      "This is such a dumb thing to keep getting wrong, but your and you're still blur together for me when I have to decide fast.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Your vs You're",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:comparison]",
  },
  {
    id: "holdout-compare-003",
    description: "math comparison with rambling setup",
    message:
      "When I do triangle questions I do not usually panic at the beginning. The panic starts when I realize I have to decide between law of sines and law of cosines and I do not actually know what tells me which one belongs.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Law of Sines vs Law of Cosines",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:comparison]",
  },
  {
    id: "holdout-compare-004",
    description: "comparison through interchangeable language",
    message:
      "I can say the words speed and velocity, but in questions they still feel interchangeable and I do not know what clue is supposed to separate them.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Speed vs Velocity",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:comparison]",
  },
  {
    id: "holdout-compare-005",
    description: "biology comparison hidden in emotional wording",
    message:
      "This is embarrassing but mitosis and meiosis still blur together for me, especially when the question stops using the exact wording from the notes.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Mitosis vs Meiosis",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:comparison]",
  },

  // ---------------------------------------------------------------------------
  // DOMAIN-SHAPED LABELS
  // ---------------------------------------------------------------------------
  {
    id: "holdout-domain-001",
    description: "insurance deductible from a more human message",
    message:
      "I keep seeing deductible in insurance stuff and I keep pretending I know what it means from context, but I really do not.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Insurance Deductible",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:domain_shaping]",
  },
  {
    id: "holdout-domain-002",
    description: "offside in soccer with rambling setup",
    message:
      "I can watch soccer and enjoy it fine, but if somebody asks me to explain offside I suddenly realize I never actually learned how the rule works in a stable way.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Offside in Soccer",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:domain_shaping]",
  },
  {
    id: "holdout-domain-003",
    description: "credit card interest from practical real-life framing",
    message:
      "The thing I keep meaning to understand is how credit card interest works, because I know it matters and yet every explanation somehow makes it feel more abstract instead of less.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Credit Card Interest",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:domain_shaping]",
  },
  {
    id: "holdout-domain-004",
    description: "premium should become insurance premium",
    message:
      "I know this is basic but premium keeps showing up in insurance explanations and I do not actually know what it means.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Insurance Premium",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:domain_shaping]",
  },
  {
    id: "holdout-domain-005",
    description: "principal should become loan principal",
    message:
      "When people talk about loans I keep losing track of principal, because I thought it just meant important but clearly it means something more specific here.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: "Loan Principal",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    notes: "[category:domain_shaping]",
  },

  // ---------------------------------------------------------------------------
  // EXISTING TOPIC REUSE VS NEW NARROW TOPIC
  // ---------------------------------------------------------------------------
  {
    id: "holdout-existing-001",
    description: "existing broad Spanish topic should not swallow new se bottleneck",
    message:
      "Spanish is still the class, but the thing I actually need help with now is se because it keeps changing what I think the sentence means.",
    existingTopics: [{ id: "t1", name: "Spanish" }],
    activeTopicId: "t1",
    expectedLabel: "Se In Spanish",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    forbiddenResolutionKinds: ["fallback_active_topic"],
    notes: "[category:existing_vs_new_narrow]",
  },
  {
    id: "holdout-existing-002",
    description: "existing broad Taxes topic should not swallow tax terminology target",
    message:
      "Taxes is still the big topic, but right now the actual blocker is the terminology and forms because I do not understand the language on the page.",
    existingTopics: [{ id: "t1", name: "Taxes" }],
    activeTopicId: "t1",
    expectedLabel: "Tax Terminology And Forms",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    forbiddenResolutionKinds: ["fallback_active_topic"],
    notes: "[category:existing_vs_new_narrow]",
  },
  {
    id: "holdout-existing-003",
    description: "existing broad Neurotransmitters topic should not swallow reuptake bottleneck",
    message:
      "We can stay in neurotransmitters generally, but the specific thing I need to understand is reuptake and why it changes the signal.",
    existingTopics: [{ id: "t1", name: "Neurotransmitters" }],
    activeTopicId: "t1",
    expectedLabel: "Reuptake",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    forbiddenResolutionKinds: ["fallback_active_topic"],
    notes: "[category:existing_vs_new_narrow]",
  },
  {
    id: "holdout-existing-004",
    description: "existing Budgeting topic should not swallow balancing a budget",
    message:
      "Budgeting is the general topic, but I specifically get stuck when I have to make the budget balance instead of just naming expenses.",
    existingTopics: [{ id: "t1", name: "Budgeting" }],
    activeTopicId: "t1",
    expectedLabel: "Balancing a Budget",
    expectedResolutionKind: "created_new_candidate",
    expectedShouldCreate: true,
    forbiddenResolutionKinds: ["fallback_active_topic"],
    notes: "[category:existing_vs_new_narrow]",
  },

  // ---------------------------------------------------------------------------
  // SHOULD STILL STAY NULL
  // ---------------------------------------------------------------------------
  {
    id: "holdout-null-001",
    description: "emotionally dense but no recoverable topic",
    message:
      "I am tired and irritated and I feel like there is some missing piece somewhere, but I genuinely cannot tell whether I am confused about the lesson, the wording, or just my own brain right now.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: null,
    expectedResolutionKind: "no_match",
    expectedShouldCreate: false,
    notes: "[category:null_cases]",
  },
  {
    id: "holdout-null-002",
    description: "rambling vague request should still not create",
    message:
      "Can you maybe help me but I am not saying that in a useful way because I do not really know what I am asking about, I just know I keep stalling out.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: null,
    expectedResolutionKind: "no_match",
    expectedShouldCreate: false,
    notes: "[category:null_cases]",
  },
  {
    id: "holdout-null-003",
    description: "overwhelmed message with no durable concept should stay null",
    message:
      "I feel overwhelmed and behind and I cannot tell what the problem even is, I just know the whole thing is making me shut down.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: null,
    expectedResolutionKind: "no_match",
    expectedShouldCreate: false,
    notes: "[category:null_cases]",
  },
  {
    id: "holdout-null-004",
    description: "meta-learning complaint with no actual topic should stay null",
    message:
      "I think I am bad at learning things because I keep needing someone to explain stuff twice and it makes me feel slow.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: null,
    expectedResolutionKind: "no_match",
    expectedShouldCreate: false,
    notes: "[category:null_cases]",
  },
  {
    id: "holdout-null-005",
    description: "pure frustration without concept should stay null",
    message:
      "Ugh I do not even know. I am annoyed and tired and I feel like nothing is sticking.",
    existingTopics: [],
    activeTopicId: null,
    expectedLabel: null,
    expectedResolutionKind: "no_match",
    expectedShouldCreate: false,
    notes: "[category:null_cases]",
  },
];

export const TOPIC_LABELING_HOLDOUT_SEQUENCES: TopicGoldenSequence[] = [
  {
    id: "holdout-sequence-001",
    description:
      "paragraph-created speed of sound topic followed by emotional vague same-topic followups",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message:
          "We started a section on waves and sound this week. Reflection and refraction were mostly okay for me. But when the worksheet switched to the speed of sound formula, that was where I stopped following what the variables were even doing.",
        expectedLabel: "Speed of Sound",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-2",
        message: "Yeah, that exact part is what made me feel lost.",
        expectedMatchedTopicName: "Speed of Sound",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-3",
        message: "Can we go over it again, but slower this time?",
        expectedMatchedTopicName: "Speed of Sound",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
    ],
    notes: "[category:followup_continuity]",
  },
  {
    id: "holdout-sequence-002",
    description: "tax terminology topic then pronoun-heavy emotional continuity",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message:
          "The forms and the tax terminology feel like another language, and I keep shutting down before I even really begin because the words already make me feel behind.",
        expectedLabel: "Tax Terminology And Forms",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-2",
        message: "It just feels coded, honestly.",
        expectedMatchedTopicName: "Tax Terminology And Forms",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-3",
        message: "Can we do that again?",
        expectedMatchedTopicName: "Tax Terminology And Forms",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
    ],
    notes: "[category:followup_continuity]",
  },
  {
    id: "holdout-sequence-003",
    description: "spanish se topic then same-topic continuation through vague emotional messages",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message:
          "I can deal with spanish until se shows up again, and then suddenly I am back in that feeling of not knowing what any part of the sentence is doing.",
        expectedLabel: "Se In Spanish",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-2",
        message: "Yes, that tiny word is the thing that breaks my confidence.",
        expectedMatchedTopicName: "Se In Spanish",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-3",
        message: "Quiz me on it, I guess.",
        expectedMatchedTopicName: "Se In Spanish",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
    ],
    notes: "[category:followup_continuity]",
  },
  {
    id: "holdout-sequence-004",
    description: "existing-topic switch to earlier topic instead of duplicate creation",
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
        forbiddenResolutionKinds: [
          "created_new_candidate",
          "fallback_active_topic",
          "no_match",
        ],
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
  {
    id: "holdout-sequence-005",
    description: "buried metaphase/anaphase comparison then same-topic continuity",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message:
          "I thought mitosis overall was the problem, but now I think it is really just metaphase and anaphase still feeling interchangeable in my head.",
        expectedLabel: "Metaphase vs Anaphase",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-2",
        message: "That is the exact mix-up, yeah.",
        expectedMatchedTopicName: "Metaphase vs Anaphase",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-3",
        message: "Can you test me on that?",
        expectedMatchedTopicName: "Metaphase vs Anaphase",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
    ],
    notes: "[category:followup_continuity]",
  },
  {
    id: "holdout-sequence-006",
    description: "broad topic exists, narrow topic should be created, then followed",
    initialTopics: [{ id: "t1", name: "Spanish" }],
    initialActiveTopicId: "t1",
    steps: [
      {
        id: "step-1",
        message:
          "Spanish is still what we are doing, but the thing I need help with now is se because it keeps changing what I think the sentence means.",
        expectedLabel: "Se In Spanish",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        forbiddenResolutionKinds: ["fallback_active_topic", "no_match"],
        notes: "[category:existing_vs_new_narrow]",
      },
      {
        id: "step-2",
        message: "Yeah, that tiny word is what I mean.",
        expectedMatchedTopicName: "Se In Spanish",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-3",
        message: "Can you quiz me on it?",
        expectedMatchedTopicName: "Se In Spanish",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
    ],
    notes: "[category:existing_vs_new_narrow]",
  },
  {
    id: "holdout-sequence-007",
    description: "null first message should not create, then clear topic should create",
    initialTopics: [],
    initialActiveTopicId: null,
    steps: [
      {
        id: "step-1",
        message:
          "I am just overwhelmed and I cannot tell what the actual problem is yet.",
        expectedLabel: null,
        expectedResolutionKind: "no_match",
        expectedShouldCreate: false,
        notes: "[category:null_cases]",
      },
      {
        id: "step-2",
        message:
          "Actually, after looking again, the thing I need help with is standard deviation.",
        expectedLabel: "Standard Deviation",
        expectedResolutionKind: "created_new_candidate",
        expectedShouldCreate: true,
        notes: "[category:followup_continuity]",
      },
      {
        id: "step-3",
        message: "Can we do another example of that?",
        expectedMatchedTopicName: "Standard Deviation",
        forbiddenResolutionKinds: ["created_new_candidate", "no_match"],
        notes: "[category:followup_continuity]",
      },
    ],
    notes: "[category:null_cases]",
  },
];