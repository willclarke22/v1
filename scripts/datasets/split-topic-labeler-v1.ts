import fs from "node:fs";
import path from "node:path";

type TopicReferenceType =
  | "new_explicit_topic"
  | "existing_explicit_topic"
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

const PROJECT_ROOT = process.cwd();

const DATASET_DIR = path.join(
  PROJECT_ROOT,
  "datasets",
  "topic-labeling-dataset",
  "v1"
);

const INPUT_JSONL = path.join(DATASET_DIR, "topic_label_dataset_5000.jsonl");

const SPLIT_DIR = path.join(DATASET_DIR, "splits");

const TRAIN_PATH = path.join(SPLIT_DIR, "train.jsonl");
const VALIDATION_PATH = path.join(SPLIT_DIR, "validation.jsonl");
const TEST_PATH = path.join(SPLIT_DIR, "test.jsonl");

const TRAIN_RATIO = 0.8;
const VALIDATION_RATIO = 0.1;
const TEST_RATIO = 0.1;

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
        throw new Error(`Invalid JSONL at line ${index + 1}`);
      }
    });
}

function writeJsonl(filePath: string, records: TopicLabelRecord[]) {
  const text = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
  fs.writeFileSync(filePath, text, "utf8");
}

function seededRandom(seed: number) {
  let value = seed;

  return function random() {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function shuffle<T>(items: T[], seed: number): T[] {
  const random = seededRandom(seed);
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function groupByReferenceType(records: TopicLabelRecord[]) {
  const groups = new Map<TopicReferenceType, TopicLabelRecord[]>();

  for (const record of records) {
    const type = record.output.topic_reference_type;

    if (!groups.has(type)) {
      groups.set(type, []);
    }

    groups.get(type)!.push(record);
  }

  return groups;
}

function splitGroup(records: TopicLabelRecord[]) {
  const trainCount = Math.floor(records.length * TRAIN_RATIO);
  const validationCount = Math.floor(records.length * VALIDATION_RATIO);

  const train = records.slice(0, trainCount);
  const validation = records.slice(trainCount, trainCount + validationCount);
  const test = records.slice(trainCount + validationCount);

  return { train, validation, test };
}

function countByReferenceType(records: TopicLabelRecord[]) {
  const counts: Record<string, number> = {};

  for (const record of records) {
    const type = record.output.topic_reference_type;
    counts[type] = (counts[type] ?? 0) + 1;
  }

  return counts;
}

function validateRecord(record: TopicLabelRecord) {
  if (!record.id) return false;
  if (!record.input) return false;
  if (typeof record.input.message !== "string") return false;
  if (!Array.isArray(record.input.current_topic_names)) return false;
  if (!Array.isArray(record.input.previous_user_messages)) return false;
  if (!record.output) return false;
  if (typeof record.output.topic_reference_type !== "string") return false;
  if (typeof record.output.confidence !== "number") return false;

  return true;
}

function main() {
  fs.mkdirSync(SPLIT_DIR, { recursive: true });

  const records = readJsonl(INPUT_JSONL);

  const invalidRecords = records.filter((record) => !validateRecord(record));
  if (invalidRecords.length > 0) {
    throw new Error(`Found ${invalidRecords.length} invalid records.`);
  }

  const groups = groupByReferenceType(records);

  const train: TopicLabelRecord[] = [];
  const validation: TopicLabelRecord[] = [];
  const test: TopicLabelRecord[] = [];

  for (const [type, group] of groups.entries()) {
    const shuffled = shuffle(group, 1000 + type.length);
    const split = splitGroup(shuffled);

    train.push(...split.train);
    validation.push(...split.validation);
    test.push(...split.test);
  }

  const finalTrain = shuffle(train, 2001);
  const finalValidation = shuffle(validation, 2002);
  const finalTest = shuffle(test, 2003);

  writeJsonl(TRAIN_PATH, finalTrain);
  writeJsonl(VALIDATION_PATH, finalValidation);
  writeJsonl(TEST_PATH, finalTest);

  console.log("Topic label dataset split complete.");
  console.log("");
  console.log(`Input: ${INPUT_JSONL}`);
  console.log(`Total records: ${records.length}`);
  console.log("");
  console.log(`Train: ${finalTrain.length}`);
  console.log(countByReferenceType(finalTrain));
  console.log("");
  console.log(`Validation: ${finalValidation.length}`);
  console.log(countByReferenceType(finalValidation));
  console.log("");
  console.log(`Test: ${finalTest.length}`);
  console.log(countByReferenceType(finalTest));
  console.log("");
  console.log(`Wrote: ${TRAIN_PATH}`);
  console.log(`Wrote: ${VALIDATION_PATH}`);
  console.log(`Wrote: ${TEST_PATH}`);
}

main();