# MyWay Topic Label V1 — 5,000 Diverse Synthetic Cases

This combines:
- the original 2,500 cleaned V1 rows
- an additional 2,500 new rows with fresh non-overlapping extracted-label topics where possible

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

## Topic non-overlap note

The additional 2,500 extracted-label topics were generated from a fresh bank and filtered against topics present in the original 2,500-row dataset.

Additional extracted-label overlaps detected with original topic set: 0
[]

## Caveat

This remains synthetic seed data. Every row is marked `needs_human_review = True`.
