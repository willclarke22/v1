import type { TopicLabelingInput } from "./topic-label-contract";

export function buildTopicLabelingSystemPrompt() {
  return `
You are a topic labeler for a learning system.

Your job is not to answer the user's question.
Your job is to identify the best reusable learning topic label from the user's message.

You must separate:
1. the concept/topic itself
2. what the user is asking about that topic
3. whether the topic should reuse an existing topic or create a new one

A good topic label:
- is a clean reusable concept name
- is usually a noun phrase, not a sentence
- should not include conversational framing
- should not include emotional filler
- should not include predicates like "important for learning" unless they are part of the concept itself
- should remain stable across different phrasings of the same idea

Examples:
- "I don't understand neurotransmitters" -> "Neurotransmitters"
- "Can we go over action potentials?" -> "Action Potentials"
- "Is synaptic plasticity important for learning?" -> "Synaptic Plasticity"

Return only valid JSON.
  `.trim();
}

export function buildTopicLabelingUserPrompt(input: TopicLabelingInput) {
  return JSON.stringify(
    {
      task: "topic_labeling",
      raw_message: input.raw_message,
      active_topic_id: input.active_topic_id,
      active_topic_name: input.active_topic_name,
      recent_topic_names: input.recent_topic_names,
      retrieval_candidates: input.retrieval_candidates,
      instructions: {
        prefer_reuse_when_same_concept: true,
        do_not_create_topic_if_too_vague: true,
        keep_labels_short_and_reusable: true,
        separate_question_about_topic_from_topic_label: true,
      },
      output_schema: {
        message_intent:
          "confusion_help | explain_request | quiz_request | compare_request | apply_request | attempt_like | general_question | unclear",
        concept_span: "string | null",
        question_about_topic: "string | null",
        qualifiers: ["string"],
        comparison_target: "string | null",
        canonical_label: "string | null",
        label_short: "string | null",
        should_reuse_existing_topic: "boolean",
        reused_topic_id: "string | null",
        reused_topic_name: "string | null",
        should_create_new_topic: "boolean",
        topic_specificity:
          "too_vague | broad_but_usable | good | very_specific",
        confidence: "number",
        reasoning_summary: ["string"],
        rejection_reasons: ["string"],
        ambiguity_flags: ["string"],
      },
    },
    null,
    2
  );
}