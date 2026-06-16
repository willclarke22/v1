const artifact = {
  artifact_kind: "mock_probe_attempt_evaluator_output",
  artifact_version: "mock_v0",
  scenario_id: "spanish_se_discrimination",
  description:
    "Mock evaluator output for a learner who picked the fixed/reflexive interpretation.",
  input_hint: {
    schema_version: "probe_attempt_evaluator_input_v1",
    attempt: {
      attempt_type: "single_choice",
      selected_option_id: "houses_sell_themselves",
      self_reported_confidence: 0.58,
    },
  },
  output: {
    schema_version: "probe_attempt_evaluator_output_v1",
    correctness: 0.12,
    correctness_summary:
      "The selected answer treats se as if the houses sell themselves, which suggests a fixed/reflexive reading rather than using the sentence pattern.",
    understanding_evidence: {
      evidence_strength: 0.71,
      supports_understanding: false,
      supports_gap: true,
      may_be_lucky_guess: false,
      possible_guess: false,
      needs_verification_probe: true,
      informational_only: false,
      verification_reason:
        "The learner selected the fixed/reflexive option, so MyWay should verify after a targeted follow-up.",
    },
    misconception_hits: [
      {
        misconception_id: "always_reflexive",
        label: "se always means itself",
        confidence: 0.82,
      },
    ],
    diagnosis_delta: {
      discrimination_gap: 0.18,
      representation_gap: 0.06,
    },
    personalization_delta: {
      schema_version: "personalization_profile_delta_v1",
      summary:
        "A no-jargon contrast probe exposed the fixed-meaning misconception, so MyWay should keep using targeted contrasts for this diagnosis while verifying transfer.",
      teaching_signal_updates: [
        {
          signal_id: "support_kind:contrast:diagnosis:discrimination_gap",
          kind: "support_kind",
          value: "contrast",
          direction: "prefer",
          scope: "diagnosis_label",
          scope_key: "discrimination_gap",
          outcome_tag: "misconception_persisted",
          update_reason: "try_more_targeted_probe",
          preference_score_delta: 0.05,
          confidence_delta: 0.08,
          evidence_count_delta: 1,
          summary:
            "Contrast did not repair the gap yet, but it exposed a specific misconception to target.",
        },
      ],
    },
    next_action: "generate_followup_probe",
    next_action_confidence: 0.83,
  },
} as const;

export default artifact;

