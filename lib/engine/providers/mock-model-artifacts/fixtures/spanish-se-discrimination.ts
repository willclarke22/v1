const artifact = {
  artifact_kind: "mock_diagnosis_model_output",
  artifact_version: "mock_v0",
  scenario_id: "spanish_se_discrimination",
  description:
    "Mock diagnosis for a learner who treats Spanish se as one fixed translation instead of a pattern-sensitive pronoun/marker.",
  input_hint: {
    schema_version: "diagnosis_model_input_v1",
    input_kind: "user_message",
    user_message: {
      text: "I keep thinking se just means itself, but the examples don't all work.",
    },
  },
  output: {
    schema_version: "diagnosis_model_output_v1",
    diagnosis: "discrimination_gap",
    diagnosis_confidence: 0.86,
    next_action: "generate_probe",
    next_action_confidence: 0.82,
    suggested_question:
      "Can the learner tell which job se is doing in different sentence patterns?",
  },
} as const;

export default artifact;
