import fs from "node:fs";
import path from "node:path";

type TopicReferenceType =
  | "explicit_topic_reference"
  | "active_topic_reference"
  | "unclear_topic"
  | "no_topic";

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
    topic_reference_type: TopicReferenceType;
    confidence: number;
  };
  metadata?: Record<string, unknown>;
};

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

const PROJECT_ROOT = process.cwd();

const DATASET_DIR = path.join(
  PROJECT_ROOT,
  "datasets",
  "topic-labeling-dataset",
  "v3"
);

const SPLIT_DIR = path.join(DATASET_DIR, "splits");

const TRAIN_PATH = path.join(SPLIT_DIR, "train.jsonl");
const VALIDATION_PATH = path.join(SPLIT_DIR, "validation.jsonl");
const TEST_PATH = path.join(SPLIT_DIR, "test.jsonl");

const LABEL_GENERATOR_DIR = path.join(
  DATASET_DIR,
  "label-generator-message-only"
);

const OUT_TRAIN = path.join(LABEL_GENERATOR_DIR, "train.jsonl");
const OUT_VALIDATION = path.join(LABEL_GENERATOR_DIR, "validation.jsonl");
const OUT_TEST = path.join(LABEL_GENERATOR_DIR, "test.jsonl");
const OUT_README = path.join(LABEL_GENERATOR_DIR, "README.md");

function readJsonl(filePath: string): TopicLabelRecord[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as TopicLabelRecord;
      } catch {
        throw new Error(`Invalid JSONL at line ${index + 1}: ${filePath}`);
      }
    });
}

function writeJsonl(filePath: string, records: LabelGeneratorRecord[]) {
  const text = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
  fs.writeFileSync(filePath, text, "utf8");
}

function formatInputText(record: TopicLabelRecord): string {
  const { message } = record.input;

  return [
    "Task: Extract the best concise topic label from the user's message.",
    "",
    `message: ${message}`,
    "",
    "Return only the topic label.",
  ].join("\n");
}

function convertRecords(records: TopicLabelRecord[]): LabelGeneratorRecord[] {
  const explicitRecords = records.filter((record) => {
    return (
      record.output.topic_reference_type === "explicit_topic_reference" &&
      typeof record.output.extracted_label === "string" &&
      record.output.extracted_label.trim().length > 0
    );
  });

  return explicitRecords.map((record) => {
    return {
      id: record.id,
      input_text: formatInputText(record),
      target_text: record.output.extracted_label!.trim(),
      metadata: {
        source_record_id: record.id,
        schema_version: "topic_label_v3_message_only_label_generator",
        source_topic_reference_type: "explicit_topic_reference",
        input_format: "message_only",
      },
    };
  });
}

function topLabelCounts(records: LabelGeneratorRecord[], limit = 25) {
  const counts: Record<string, number> = {};

  for (const record of records) {
    counts[record.target_text] = (counts[record.target_text] ?? 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function writeReadme(
  train: LabelGeneratorRecord[],
  validation: LabelGeneratorRecord[],
  test: LabelGeneratorRecord[]
) {
  const all = [...train, ...validation, ...test];

  const readme = `# Topic Label Generator V3 — Message-Only Dataset

This dataset is derived from the V3 topic-labeling splits.

It only includes rows where:

\`\`\`txt
topic_reference_type = explicit_topic_reference
extracted_label != null
\`\`\`

## Purpose

Train a label generator:

\`\`\`txt
message → extracted_label
\`\`\`

## Why message-only?

The reference-type classifier decides whether a message deserves label extraction.

The label generator should not see:

\`\`\`txt
active_topic_name
current_topic_names
previous_user_messages
\`\`\`

Those fields belong to the router/matcher stage. Earlier experiments showed that adding contextual topic fields can make the label generator copy the active/current topic instead of extracting the topic explicitly pointed to in the user's message.

## Runtime architecture

\`\`\`txt
1. Reference-type classifier:
   message + active_topic_name + current_topic_names + previous_user_messages
   → explicit_topic_reference / active_topic_reference / unclear_topic / no_topic

2. Label generator:
   message only
   → extracted_label

3. Router:
   extracted_label + current topics + embeddings/fuzzy matching
   → switch_existing / create_new / clarify / stay_active
\`\`\`

## Counts

- train: ${train.length}
- validation: ${validation.length}
- test: ${test.length}
- total: ${all.length}

## Top label counts

\`\`\`json
${JSON.stringify(topLabelCounts(all), null, 2)}
\`\`\`

## Files

- train.jsonl
- validation.jsonl
- test.jsonl

## Record shape

\`\`\`ts
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
\`\`\`

## Important note

This remains synthetic seed data and should be treated as needing human review before production use.
`;

  fs.writeFileSync(OUT_README, readme, "utf8");
}

function main() {
  fs.mkdirSync(LABEL_GENERATOR_DIR, { recursive: true });

  const trainRecords = convertRecords(readJsonl(TRAIN_PATH));
  const validationRecords = convertRecords(readJsonl(VALIDATION_PATH));
  const testRecords = convertRecords(readJsonl(TEST_PATH));

  writeJsonl(OUT_TRAIN, trainRecords);
  writeJsonl(OUT_VALIDATION, validationRecords);
  writeJsonl(OUT_TEST, testRecords);
  writeReadme(trainRecords, validationRecords, testRecords);

  console.log("Prepared V3 message-only topic-label generator dataset.");
  console.log("");
  console.log(`Train: ${trainRecords.length}`);
  console.log(`Validation: ${validationRecords.length}`);
  console.log(`Test: ${testRecords.length}`);
  console.log("");
  console.log(`Wrote: ${OUT_TRAIN}`);
  console.log(`Wrote: ${OUT_VALIDATION}`);
  console.log(`Wrote: ${OUT_TEST}`);
  console.log(`Wrote: ${OUT_README}`);
}

main();