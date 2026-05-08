# Topic Label Generator V2 Dataset

This dataset is derived from the V2 topic-labeling splits.

It only includes rows where:

```txt
topic_reference_type = explicit_topic_reference
extracted_label != null
```

## Purpose

Train a label generator:

```txt
message + active_topic_name + current_topic_names + previous_user_messages
→ extracted_label
```

The reference-type classifier should run first.  
The label generator should only run when the classifier predicts:

```txt
explicit_topic_reference
```

## Counts

- train: 2000
- validation: 250
- test: 250

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
    schema_version: "topic_label_v2_label_generator";
    source_topic_reference_type: "explicit_topic_reference";
  };
};
```
