# Topic Label Generator V2.1 Dataset

This dataset is derived from the V2 topic-labeling splits.

It only includes rows where:

```txt
topic_reference_type = explicit_topic_reference
extracted_label != null
```

## Purpose

Train a label generator:

```txt
message + active_topic_name + previous_user_messages
→ extracted_label
```

## Main V2.1 change

This version removes `current_topic_names` from the label-generator input.

Reason: the first T5 label generator overused `current_topic_names` and sometimes copied an existing topic instead of extracting the explicit topic from the user's message.

The reference-type classifier can still use current topics.  
The label generator should focus on extracting the user's explicit topic phrase.

## Counts

- train: 2000
- validation: 250
- test: 250

## Files

- train.jsonl
- validation.jsonl
- test.jsonl
