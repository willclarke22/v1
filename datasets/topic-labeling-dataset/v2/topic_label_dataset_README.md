# MyWay Topic Label V2 Dataset

This dataset was converted from the V1 5,000-row topic-labeling dataset.

## Main conceptual change

V1 asked the model to distinguish:

```ts
"new_explicit_topic" | "existing_explicit_topic"
```

V2 merges both into:

```ts
"explicit_topic_reference"
```

The labeler should identify whether the user explicitly refers to a topic and extract the topic label.  
The router/code should decide whether that extracted label maps to an existing topic or should create a new one.

## V2 input schema

```ts
type TopicLabelInput = {
  message: string;
  active_topic_name: string | null;
  current_topic_names: string[];
  previous_user_messages: string[];
};
```

## V2 output schema

```ts
type TopicLabelOutput = {
  extracted_label: string | null;
  topic_reference_type:
    | "explicit_topic_reference"
    | "active_topic_reference"
    | "unclear_topic"
    | "no_topic";
  confidence: number;
};
```

## Distribution

Rows: 5000

Reference type counts:

```json
{
  "explicit_topic_reference": 2500,
  "active_topic_reference": 1250,
  "no_topic": 750,
  "unclear_topic": 500
}
```

## Files

- `topic_label_dataset_5000_v2.csv`
- `topic_label_dataset_5000_v2.jsonl`
- `topic_label_dataset_5000_v2.json`
- `topic_label_dataset_README.md`

## Caveat

This remains synthetic seed data. All rows should still be treated as needing human review before production use.
