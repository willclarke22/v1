const artifact = {
  artifact_kind: "mock_probe_contract_model_output",
  artifact_version: "mock_v0",
  scenario_id: "spanish_se_discrimination",
  description:
    "Mock single-choice probe contract that should render through EngineRenderableProbe.",
  input_hint: {
    schema_version: "probe_contract_model_input_v1",
    target_topic: {
      topic_id: "topic_spanish_se",
      topic_label: "Spanish se",
    },
    target_diagnosis: "discrimination_gap",
    learner_signal: {
      signal_kind: "user_message",
      user_message:
        "I keep thinking se just means itself, but the examples don't all work.",
    },
    personalization_context: {
      bridge_level: "bridge_0",
      language_policy: {
        jargon_level: "none",
      },
    },
  },
  output: {
    schema_version: "probe_contract_model_output_v1",
    probe_type: "single_choice",
    expected_attempt_type: "single_choice",
    prompt: {
      root_problem_explanation:
        "The issue may be that se is being treated like it always has one fixed meaning.",
      reshaping_explanation:
        "This checks whether you can use the sentence pattern to decide what se is doing.",
      task: "In the sentence 'Se venden casas', what is se doing?",
      full_prompt:
        "In the sentence 'Se venden casas', what is se doing?\n\nA. It means the houses sell themselves.\nB. It helps say that houses are sold, without naming exactly who sells them.\nC. It always means people in general.\nD. It can be ignored.",
    },
    presentation_support: [
      {
        kind: "contrast",
        style_used: "concrete_examples",
        text:
          "Compare 'se lava' with 'se venden casas': the pattern changes the job se is doing.",
      },
    ],
    answer_key: {
      kind: "single_choice",
      correct_option_id: "passive_like_no_named_seller",
      acceptable_option_ids: ["passive_like_no_named_seller"],
      success_markers: [
        "Learner chooses the option where se helps avoid naming the seller.",
        "Learner avoids treating se as always reflexive.",
      ],
    },
    misconception_markers: [
      {
        misconception_id: "always_reflexive",
        label: "se always means itself",
        marker: "Learner treats se as if it always means itself.",
        description: "Learner treats every se sentence as reflexive.",
        confidence: 0.74,
      },
      {
        misconception_id: "ignore_se",
        label: "se can be ignored",
        marker: "Learner says se can be ignored or does not change the sentence.",
        description:
          "Learner treats se as decoration rather than a meaning-changing signal.",
        confidence: 0.48,
      },
    ],
    renderer_params: {
      options: [
        {
          id: "houses_sell_themselves",
          label: "A",
          text: "It means the houses sell themselves.",
        },
        {
          id: "passive_like_no_named_seller",
          label: "B",
          text:
            "It helps say that houses are sold, without naming exactly who sells them.",
        },
        {
          id: "always_people",
          label: "C",
          text: "It always means people in general.",
        },
        {
          id: "ignore_se",
          label: "D",
          text: "It can be ignored.",
        },
      ],
    },
    delivery_context: {
      bridge_level: "bridge_0",
      language_policy: {
        jargon_level: "none",
      },
      presentation_styles_used: ["concrete_examples"],
      support_kinds_used: ["contrast"],
      example_domains_used: ["Spanish sentences"],
      personalization_signals_used: [],
    },
    confidence: 0.91,
  },
} as const;

export default artifact;

