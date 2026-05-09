# Topic Label Dataset 13000 V3.2

This package is a V3.2 taxonomy-correction / early-activity augmentation of the prior `topic_label_dataset_12000_v3_1` dataset.

## Summary

- Base rows preserved from V3.1: **12,000**
- New V3.2 rows added: **1,000**
- Total rows: **13,000**

## Final label distribution

```json
{
  "explicit_topic_reference": 6450,
  "no_topic": 1980,
  "active_topic_reference": 3350,
  "unclear_topic": 1220
}
```

## Added-row distribution

```json
{
  "explicit_topic_reference": 450,
  "active_topic_reference": 350,
  "no_topic": 180,
  "unclear_topic": 20
}
```

## Added scenario distribution

```json
{
  "cold_start_concrete_explicit_topic": 220,
  "one_topic_explicit_shift": 80,
  "few_or_many_topic_explicit_shift": 80,
  "return_to_existing_explicit_topic": 70,
  "active_deictic_or_simplify_followup": 350,
  "no_active_no_concrete_topic_even_with_prior_topic_list": 33,
  "cold_start_no_concrete_topic": 147,
  "true_ambiguous_between_named_topics": 20
}
```

## Taxonomy correction

V3.2 tightens the boundary between `no_topic`, `unclear_topic`, `active_topic_reference`, and `explicit_topic_reference`.

### explicit_topic_reference

Use this when the user names or clearly points to a concrete learnable topic, concept, object, skill, field, or target.

Important cold-start rule:

```txt
active_topic_name = null
current_topic_names = []
previous_user_messages = []
concrete concept present
→ explicit_topic_reference
```

Examples added include:

```txt
I am confused about engines.
Where would someone even start with derivatives?
If there is a way to learn about trigonometry in an easy way, I'd love to know.
The actual concept of light being a wave and a particle doesn't make sense to me.
```

### active_topic_reference

Use this when the user points back to the current active topic without naming a new topic.

Examples added include:

```txt
Can you explain that easier?
What would that look like?
I still don't get it.
Could you say the same idea in a simpler way?
```

These examples require an active topic context and should not invoke the message-only label generator.

### no_topic

Use this when there is no concrete topic and no resolvable active-topic reference.

Examples added include:

```txt
I don't know what I want to learn.
I'm just confused and can't name the thing.
I need help, but I don't know with what yet.
Could you ask me a grounding question first?
```

### unclear_topic

Use this rarely. In V3.2, `unclear_topic` is intended only for true ambiguous target selection, usually when multiple named possible topics are present and the system cannot safely choose one.

Examples added include:

```txt
I think this is either dopamine or motivation, but I don't know which one is the real issue.
I can't tell whether my confusion belongs under derivatives or integrals.
```

Many older vague `unclear_topic`-style cases should conceptually be treated as `no_topic` unless there are multiple possible named targets.

## Files

- `topic_label_dataset_13000_v3_2.csv`
- `topic_label_dataset_13000_v3_2.jsonl`
- `topic_label_dataset_13000_v3_2.json`
- `topic_label_dataset_13000_v3_2_PROFILE.json`
- `topic_label_dataset_13000_v3_2_ADDITIONS_ONLY.csv`
- `topic_label_dataset_13000_v3_2_ADDITIONS_ONLY.jsonl`

## Recommended next step

Copy this folder to:

```txt
datasets/topic-labeling-dataset/v3_2/
```

Then create/update split and training scripts to point at:

```txt
datasets/topic-labeling-dataset/v3_2/topic_label_dataset_13000_v3_2.jsonl
```

For the first experiment, retrain only the reference-type classifier. Do not retrain the T5 label generator until you verify whether the classifier now correctly predicts `explicit_topic_reference` for the failure cases.
