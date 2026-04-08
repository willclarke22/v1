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
];