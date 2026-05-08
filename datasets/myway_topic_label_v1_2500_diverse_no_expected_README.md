# MyWay Topic Label V1 — 2,500 Diverse Synthetic Cases, Cleaned

This is the same 2,500-case diverse V1 dataset, but with the `original_expected_label` column removed.

## V1 input schema

```ts
type TopicLabelInput = {
  message: string;
  active_topic_name: string | null;
  current_topic_names: string[];
  previous_user_messages: string[];
};
```

## V1 output schema

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

## Review CSV columns

```txt
id
message
active_topic_name
current_topic_names
previous_user_messages
extracted_label
topic_reference_type
confidence
needs_human_review
reviewer_notes
```

## Distribution

Rows: 2500

Reference type counts:
```json
{
  "active_topic_reference": 625,
  "new_explicit_topic": 875,
  "no_topic": 375,
  "existing_explicit_topic": 375,
  "unclear_topic": 250
}
```

Previous user message length distribution:
```json
{
  "0": 195,
  "1": 376,
  "2": 482,
  "3": 586,
  "4": 505,
  "5": 356
}
```

## Caveat

This remains synthetic seed data and every row is still marked for human review.
