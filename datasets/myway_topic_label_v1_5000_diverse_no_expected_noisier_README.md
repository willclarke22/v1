# MyWay Topic Label V1 — 5,000 Diverse Synthetic Cases, Noisier Text Variant

This is a transformed copy of the 5,000-row V1 dataset.

The labels and schema are unchanged. The text fields were made more realistic/noisy.

## Same V1 input schema

```ts
type TopicLabelInput = {
  message: string;
  active_topic_name: string | null;
  current_topic_names: string[];
  previous_user_messages: string[];
};
```

## Same V1 output schema

```ts
type TopicLabelOutput = {
  extracted_label: string | null;
  topic_reference_type:
    | "new_explicit_topic"
    | "existing_explicit_topic"
    | "active_topic_reference"
    | "unclear_topic"
    | "no_topic";
  confidence: number;
};
```

## Changes from prior 5,000-row file

- Added more spelling mistakes and casual grammar.
- Lowercased topic mentions inside the `message` column more often.
- Added more multi-sentence and longer user messages.
- Made previous-user-message histories noisier and more natural.
- Preserved canonical labels in `extracted_label`.
- Preserved the same output classes and row count.

## Stats

Rows: 5000

Reference type counts:
```json
{
  "new_explicit_topic": 1750,
  "active_topic_reference": 1250,
  "no_topic": 750,
  "existing_explicit_topic": 750,
  "unclear_topic": 500
}
```

Previous user message length distribution:
```json
{
  "0": 368,
  "1": 745,
  "2": 974,
  "3": 1209,
  "4": 988,
  "5": 716
}
```

Additional text-noise indicators:
```json
{
  "multi_sentence_messages": 2668,
  "lowercase_message_starts": 1985,
  "rows_with_explicit_typo_markers": 2766
}
```

## Caveat

This remains synthetic seed data and is still marked `needs_human_review = True`.
