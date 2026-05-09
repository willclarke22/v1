# Topic Label Dataset 12000 V3.1 — Early Activity Augmented

This dataset is an augmented continuation of `topic_label_dataset_10000_v3`.

## Purpose

V3.1 adds realistic early MyWay runtime states that were underrepresented in the original V3 dataset:

- cold-start messages with no active topic, no current topics, and no previous user messages
- first-topic creation from naturalistic confusion messages
- early-session states with one current topic
- few-topic states where the model should not over-anchor to the active topic
- many-topic states where the model must distinguish explicit topic shift, existing-topic return, active follow-up, no-topic, and unclear-topic intent

The motivating failures were cases where `topic_labeler_v3` predicted `clarify_no_topic` for messages that contained a concrete topic, such as trigonometry or light being both a wave and a particle.

## Files

- `topic_label_dataset_12000_v3_1.csv` — flat CSV version using the same columns as the V3 CSV
- `topic_label_dataset_12000_v3_1.jsonl` — nested JSONL version expected by the split script
- `topic_label_dataset_12000_v3_1.json` — nested JSON array version
- `topic_label_dataset_12000_v3_1_PROFILE.json` — counts and dataset profile
- `topic_label_dataset_12000_v3_1_ADDITIONS_ONLY.csv` — only the 2,000 appended rows, for auditing

## Row counts

- Original V3 rows preserved: 10000
- Added V3.1 rows: 2000
- Total rows: 12000

## Total class counts

```json
{
  "explicit_topic_reference": 6000,
  "no_topic": 1800,
  "active_topic_reference": 3000,
  "unclear_topic": 1200
}
```

## Added-row class counts

```json
{
  "explicit_topic_reference": 1000,
  "active_topic_reference": 500,
  "no_topic": 300,
  "unclear_topic": 200
}
```

## Added scenario counts

```json
{
  "cold_start_explicit_topic": 330,
  "one_topic_explicit_shift": 210,
  "few_topic_explicit_shift": 210,
  "many_topic_explicit_shift_or_return": 170,
  "existing_topic_explicit_return": 80,
  "one_topic_active_followup": 190,
  "few_topic_active_followup": 190,
  "many_topic_active_followup": 120,
  "cold_start_no_topic": 160,
  "early_state_no_topic_with_topic_list": 90,
  "many_topic_no_topic": 50,
  "cold_start_unclear_topic": 60,
  "one_or_few_topic_unclear": 90,
  "many_topic_unclear": 50
}
```

## Added current-topic count bins

```json
{
  "0": 550,
  "1": 448,
  "2-5": 589,
  "16-30": 218,
  "6-15": 195
}
```

## Flat CSV schema

```txt
id,message,active_topic_name,current_topic_names,previous_user_messages,extracted_label,topic_reference_type,confidence,needs_human_review,reviewer_notes
```

`current_topic_names` and `previous_user_messages` are pipe-delimited in the CSV.

## Nested JSONL schema

```ts
type TopicLabelRecord = {
  id: string;
  input: {
    message: string;
    active_topic_name: string | null;
    current_topic_names: string[];
    previous_user_messages: string[];
  };
  output: {
    extracted_label: string | null;
    topic_reference_type: "explicit_topic_reference" | "active_topic_reference" | "unclear_topic" | "no_topic";
    confidence: number;
  };
  metadata: {
    needs_human_review: boolean;
    reviewer_notes: string | null;
    source_dataset: "topic_label_dataset_12000_v3_1";
    schema_version: "topic_label_v3_1_early_activity_augmented";
    is_v3_1_addition: boolean;
  };
};
```

## Recommended next use

1. Copy these files into `datasets/topic-labeling-dataset/v3_1/`.
2. Update the split script input path to point at `topic_label_dataset_12000_v3_1.jsonl`, or duplicate the split script for V3.1.
3. Retrain the reference-type classifier first.
4. Restart `services.topic_labeler_v3`.
5. Retest the known failure messages:
   - `If there is a way to learn about trigonometry in an easy way, I'd love to know.`
   - `The actual concept of light being a wave and a particle doesn't make sense to me. Like how can it be both. What would that even look like?`
   - `I am confused about engines.`

## Important note

This is still synthetic seed data. The added rows are designed to improve runtime coverage, not to be treated as a perfect production-labeled dataset. Keep `needs_human_review = True` until you manually review or build a formal validation process.
