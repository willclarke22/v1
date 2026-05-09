# Topic Label Dataset V3.3 — Discourse Boundary Upgrade

This dataset is derived from `topic_label_dataset_13000_v3_2.csv`.

## Summary

- Base V3.2 rows preserved: 13,000
- New V3.3 rows added: 1,503
- Total rows: 14,503

## New V3.3 addition distribution

```json
{
  "active_topic_reference": 702,
  "explicit_topic_reference": 651,
  "unclear_topic": 100,
  "no_topic": 50
}
```

## Why V3.3 exists

V3.2 fixed many cold-start explicit-topic cases, but direct inference still showed classifier boundary failures around:

1. Active-topic deictic follow-ups, such as `Can you explain that easier?` and `What would that look like?`, which should remain `active_topic_reference` when an active topic exists.
2. Follow-up-looking openers with explicit topic shifts, such as `This helped, but now I want to understand reinforcement learning.`, which should be `explicit_topic_reference`.

V3.3 adds a targeted, diverse discourse-boundary slice so the classifier can learn those patterns from data rather than relying on route-level bandaids.

## Intended taxonomy correction

- `explicit_topic_reference`: concrete named/nameable topic target, including cold-start concept mentions and explicit topic shifts after phrases like "this helped".
- `active_topic_reference`: backward-pointing follow-ups to the current active topic using words like this/that/it/easier/look like/another example.
- `no_topic`: no concrete topic target and no usable active-topic reference, especially cold-start vague messages.
- `unclear_topic`: rare; true ambiguity between multiple named possible topics.

## Files

- `topic_label_dataset_14500_v3_3.csv` — flat CSV for inspection/editing.
- `topic_label_dataset_14500_v3_3.jsonl` — nested JSONL for the split script.
- `topic_label_dataset_14500_v3_3.json` — full JSON array.
- `topic_label_dataset_14500_v3_3_ADDITIONS_ONLY.csv` — only new V3.3 rows.
- `topic_label_dataset_14500_v3_3_ADDITIONS_ONLY.jsonl` — only new V3.3 rows in nested format.
- `topic_label_dataset_14500_v3_3_PROFILE.json` — counts and audit metadata.

## Important next step

Create `datasets/topic-labeling-dataset/v3_3/`, put these files there, then make split/train scripts pointing at:

```txt
datasets/topic-labeling-dataset/v3_3/topic_label_dataset_14500_v3_3.jsonl
```
