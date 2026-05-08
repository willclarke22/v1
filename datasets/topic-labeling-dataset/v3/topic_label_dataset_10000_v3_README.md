# MyWay Topic Label Dataset V2.4 — Max Diversity 10,000

This is a higher-diversity V2-style synthetic dataset built from the same schema as the V2.3 reference file.

## V2 schema

```ts
type TopicLabelInput = {
  message: string;
  active_topic_name: string | null;
  current_topic_names: string[];
  previous_user_messages: string[];
};

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

```json
{
  "explicit_topic_reference": 5000,
  "no_topic": 1500,
  "active_topic_reference": 2500,
  "unclear_topic": 1000
}
```

## V2.4 improvements

- Much wider variation in how messages start.
- More who/what/when/where/why/how questions.
- Question words appear not only at the beginning, but also in second/later sentences.
- More indirect topic mentions and learner paraphrases.
- More short fragments, medium natural questions, and long rambly multi-sentence messages.
- Lower duplicate rate.
- More typo/slang/casual grammar variation without making every row noisy.
- More realistic learner uncertainty and topic-drift phrasing.

## Profile summary

```json
{
  "rows": 10000,
  "case_counts": {
    "explicit_topic_reference": 5000,
    "no_topic": 1500,
    "active_topic_reference": 2500,
    "unclear_topic": 1000
  },
  "previous_message_count_distribution": {
    "0": 886,
    "1": 1420,
    "2": 2151,
    "3": 2427,
    "4": 1927,
    "5": 1189
  },
  "message_exact_duplicate_extra_count": 10,
  "unique_messages": 9990,
  "word_count": {
    "mean": 25.8655,
    "median": 24,
    "p10": 14,
    "p90": 41,
    "max": 59
  },
  "multi_sentence_messages": 5977,
  "lowercase_message_starts": 8218,
  "question_mark_messages": 4974,
  "question_word_anywhere_messages": 6925,
  "question_word_later_sentence_messages": 3882,
  "typo_or_slang_marker_rows": 2552,
  "top_20_four_word_openings": [
    [
      "can i ask it",
      445
    ],
    [
      "this is hard to",
      442
    ],
    [
      "i wrote it down",
      426
    ],
    [
      "i might be mixing",
      417
    ],
    [
      "i keep circling around",
      379
    ],
    [
      "maybe this is obvious,",
      373
    ],
    [
      "not gonna lie, i",
      151
    ],
    [
      "at first i thought",
      77
    ],
    [
      "i was trying to",
      62
    ],
    [
      "this might be too",
      58
    ],
    [
      "i know we're still",
      57
    ],
    [
      "i keep calling it",
      56
    ],
    [
      "can we not move",
      52
    ],
    [
      "not gonna lie, can",
      50
    ],
    [
      "i got through the",
      49
    ],
    [
      "i tried to answer",
      45
    ],
    [
      "can we work on",
      41
    ],
    [
      "not the whole chapter.",
      40
    ],
    [
      "if the answer is",
      40
    ],
    [
      "could we switch to",
      38
    ]
  ]
}
```

## Important note

This remains synthetic seed data and every row is marked `needs_human_review = True`.

For the message-only label generator, derive rows where:

```txt
topic_reference_type = explicit_topic_reference
```

and train:

```txt
message → extracted_label
```

The reference-type classifier and router can use active topic, current topics, and previous messages.
