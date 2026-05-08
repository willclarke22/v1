# Topic Label Generator V3 — Message-Only Dataset

This dataset is derived from the V3 topic-labeling splits.

It only includes rows where:

```txt
topic_reference_type = explicit_topic_reference
extracted_label != null
```

## Purpose

Train a label generator:

```txt
message → extracted_label
```

## Why message-only?

The reference-type classifier decides whether a message deserves label extraction.

The label generator should not see:

```txt
active_topic_name
current_topic_names
previous_user_messages
```

Those fields belong to the router/matcher stage. Earlier experiments showed that adding contextual topic fields can make the label generator copy the active/current topic instead of extracting the topic explicitly pointed to in the user's message.

## Runtime architecture

```txt
1. Reference-type classifier:
   message + active_topic_name + current_topic_names + previous_user_messages
   → explicit_topic_reference / active_topic_reference / unclear_topic / no_topic

2. Label generator:
   message only
   → extracted_label

3. Router:
   extracted_label + current topics + embeddings/fuzzy matching
   → switch_existing / create_new / clarify / stay_active
```

## Counts

- train: 4000
- validation: 500
- test: 500
- total: 5000

## Top label counts

```json
[
  {
    "label": "Citation Formatting",
    "count": 27
  },
  {
    "label": "Merge Lanes",
    "count": 25
  },
  {
    "label": "Genetic Drift",
    "count": 25
  },
  {
    "label": "Checks and Balances",
    "count": 24
  },
  {
    "label": "Thermal Expansion",
    "count": 23
  },
  {
    "label": "Liability",
    "count": 22
  },
  {
    "label": "Federalism",
    "count": 22
  },
  {
    "label": "Friction",
    "count": 22
  },
  {
    "label": "Exponent Rules",
    "count": 21
  },
  {
    "label": "Utilitarianism",
    "count": 21
  },
  {
    "label": "Problem of Induction",
    "count": 21
  },
  {
    "label": "Reading Comprehension",
    "count": 21
  },
  {
    "label": "Intermolecular Forces",
    "count": 21
  },
  {
    "label": "Stoichiometry",
    "count": 21
  },
  {
    "label": "Electronegativity",
    "count": 21
  },
  {
    "label": "JavaScript Promises",
    "count": 21
  },
  {
    "label": "Synaptic Transmission",
    "count": 21
  },
  {
    "label": "Typography",
    "count": 20
  },
  {
    "label": "Wireframes",
    "count": 20
  },
  {
    "label": "Tire Pressure",
    "count": 20
  },
  {
    "label": "Test Anxiety",
    "count": 20
  },
  {
    "label": "Impulse",
    "count": 20
  },
  {
    "label": "Enzyme Specificity",
    "count": 20
  },
  {
    "label": "Tone Languages",
    "count": 20
  },
  {
    "label": "P-Values",
    "count": 20
  }
]
```

## Files

- train.jsonl
- validation.jsonl
- test.jsonl

## Record shape

```ts
type LabelGeneratorRecord = {
  id: string;
  input_text: string;
  target_text: string;
  metadata: {
    source_record_id: string;
    schema_version: "topic_label_v3_message_only_label_generator";
    source_topic_reference_type: "explicit_topic_reference";
    input_format: "message_only";
  };
};
```

## Important note

This remains synthetic seed data and should be treated as needing human review before production use.
