export const TOPIC_LABEL_GOLDENS = [
  {
    message: "I don't really understand neurotransmitters at all",
    expected_label: "Neurotransmitters",
    expected_intent: "confusion_help",
    should_create_or_reuse: true,
  },
  {
    message: "Can we go over action potentials?",
    expected_label: "Action Potentials",
    expected_intent: "explain_request",
    should_create_or_reuse: true,
  },
  {
    message: "Is synaptic plasticity important for learning?",
    expected_label: "Synaptic Plasticity",
    expected_intent: "general_question",
    should_create_or_reuse: true,
  },
  {
    message: "Quiz me on neurotransmitters",
    expected_label: "Neurotransmitters",
    expected_intent: "quiz_request",
    should_create_or_reuse: true,
  },
  {
    message: "Compare excitatory and inhibitory neurotransmitters",
    expected_label: "Excitatory vs Inhibitory Neurotransmitters",
    expected_intent: "compare_request",
    should_create_or_reuse: true,
  },
  {
    message: "I’m confused about this part",
    expected_label: null,
    expected_intent: "confusion_help",
    should_create_or_reuse: false,
  },
  {
    message: "Walk me through long-term potentiation",
    expected_label: "Long-Term Potentiation",
    expected_intent: "explain_request",
    should_create_or_reuse: true,
  },
  {
    message: "Does dopamine affect motivation?",
    expected_label: "Dopamine",
    expected_intent: "general_question",
    should_create_or_reuse: true,
  },

  // Strong direct requests
  {
    message: "I want to learn about budgeting",
    expected_label: "Budgeting",
    expected_intent: "explain_request",
    should_create_or_reuse: true,
  },
  {
    message: "I need help with budgeting",
    expected_label: "Budgeting",
    expected_intent: "unclear",
    should_create_or_reuse: true,
  },
  {
    message: "Explain mitosis",
    expected_label: "Mitosis",
    expected_intent: "explain_request",
    should_create_or_reuse: true,
  },
  {
    message: "Can you explain photosynthesis?",
    expected_label: "Photosynthesis",
    expected_intent: "explain_request",
    should_create_or_reuse: true,
  },

  // Focus-target cases
  {
    message:
      "I'm learning about neurotransmitters, receptors, and reuptake, but I'm mainly confused about reuptake.",
    expected_label: "Reuptake",
    expected_intent: "confusion_help",
    should_create_or_reuse: true,
  },
  {
    message:
      "I get neurotransmitters, but the part I don't understand is reuptake.",
    expected_label: "Reuptake",
    expected_intent: "confusion_help",
    should_create_or_reuse: true,
  },
  {
    message:
      "We're covering neurotransmitters in class, but specifically I don't get receptors.",
    expected_label: "Receptors",
    expected_intent: "confusion_help",
    should_create_or_reuse: true,
  },
  {
    message:
      "I understand the basics of memory, but I'm especially confused about consolidation.",
    expected_label: "Consolidation",
    expected_intent: "confusion_help",
    should_create_or_reuse: true,
  },

  // Textbook / notes / formula extraction
  {
    message:
      "My textbook has a formula about the speed of sound, but I don't get it.",
    expected_label: "Speed Of Sound",
    expected_intent: "unclear",
    should_create_or_reuse: true,
  },
  {
    message: "My notes mention classical conditioning",
    expected_label: "Classical Conditioning",
    expected_intent: "unclear",
    should_create_or_reuse: true,
  },
  {
    message: "We learned about operant conditioning today",
    expected_label: "Operant Conditioning",
    expected_intent: "unclear",
    should_create_or_reuse: true,
  },
  {
    message: "It talks about entropy in the chapter, but I don't understand it",
    expected_label: "Entropy",
    expected_intent: "confusion_help",
    should_create_or_reuse: true,
  },

  // Question subject extraction
  {
    message: "How does reuptake work?",
    expected_label: "Reuptake",
    expected_intent: "general_question",
    should_create_or_reuse: true,
  },
  {
    message: "How do action potentials work?",
    expected_label: "Action Potentials",
    expected_intent: "general_question",
    should_create_or_reuse: true,
  },
  {
    message: "What is long-term potentiation?",
    expected_label: "Long-Term Potentiation",
    expected_intent: "general_question",
    should_create_or_reuse: true,
  },
  {
    message: "Why is synaptic transmission important?",
    expected_label: "Synaptic Transmission",
    expected_intent: "general_question",
    should_create_or_reuse: true,
  },
  {
    message: "Does cortisol affect memory?",
    expected_label: "Cortisol",
    expected_intent: "general_question",
    should_create_or_reuse: true,
  },
  {
    message: "How does dopamine affect motivation?",
    expected_label: "Dopamine",
    expected_intent: "general_question",
    should_create_or_reuse: true,
  },

  // Comparison extraction
  {
    message: "What is the difference between mitosis and meiosis?",
    expected_label: "Mitosis vs Meiosis",
    expected_intent: "compare_request",
    should_create_or_reuse: true,
  },
  {
    message: "Contrast classical and operant conditioning",
    expected_label: "Classical vs Operant Conditioning",
    expected_intent: "compare_request",
    should_create_or_reuse: true,
  },
  {
    message: "Compare recall and recognition",
    expected_label: "Recall vs Recognition",
    expected_intent: "compare_request",
    should_create_or_reuse: true,
  },

  // Broad but usable single-topic cases
  {
    message: "Dopamine",
    expected_label: "Dopamine",
    expected_intent: "unclear",
    should_create_or_reuse: true,
  },
  {
    message: "Reuptake",
    expected_label: "Reuptake",
    expected_intent: "unclear",
    should_create_or_reuse: true,
  },
  {
    message: "Budgeting",
    expected_label: "Budgeting",
    expected_intent: "unclear",
    should_create_or_reuse: true,
  },

  // Vague / should not create
  {
    message: "I don't get it",
    expected_label: null,
    expected_intent: "confusion_help",
    should_create_or_reuse: false,
  },
  {
    message: "Can you help me with this?",
    expected_label: null,
    expected_intent: "unclear",
    should_create_or_reuse: false,
  },
  {
    message: "I'm confused about the problem",
    expected_label: null,
    expected_intent: "confusion_help",
    should_create_or_reuse: false,
  },
  {
    message: "I don't understand that part",
    expected_label: null,
    expected_intent: "confusion_help",
    should_create_or_reuse: false,
  },

  // Cases that should avoid sentence-fragment labels
  {
    message: "Can we go over action potentials",
    expected_label: "Action Potentials",
    expected_intent: "explain_request",
    should_create_or_reuse: true,
  },
  {
    message: "I need help with how reuptake works",
    expected_label: "Reuptake",
    expected_intent: "unclear",
    should_create_or_reuse: true,
  },
  {
    message: "I'm confused about how the law works",
    expected_label: "Law",
    expected_intent: "confusion_help",
    should_create_or_reuse: true,
  },
  {
    message: "The thing I don't get is the action potential spike",
    expected_label: "Action Potential Spike",
    expected_intent: "confusion_help",
    should_create_or_reuse: true,
  },

  // Existing behavior you already added special handling for
  {
    message: "Is the price of a barrel of oil going up?",
    expected_label: "Oil Prices",
    expected_intent: "general_question",
    should_create_or_reuse: true,
  },
  {
  message: "Can I get some help with neurotransmitters?",
  expected_label: "Neurotransmitters",
  expected_intent: "confusion_help",
  should_create_or_reuse: true,
  },
  {
  message: "Could I get some help with action potentials?",
  expected_label: "Action Potentials",
  expected_intent: "confusion_help",
  should_create_or_reuse: true,
  },
  {
  message: "Can you help me with synaptic transmission?",
  expected_label: "Synaptic Transmission",
  expected_intent: "confusion_help",
  should_create_or_reuse: true,
  },
  {
  message: "I could use some help with dopamine",
  expected_label: "Dopamine",
  expected_intent: "confusion_help",
  should_create_or_reuse: true,
  },
];