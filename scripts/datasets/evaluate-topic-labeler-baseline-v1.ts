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

type BaselinePrediction = {
  topic_reference_type: TopicReferenceType;
  extracted_label: string | null;
  confidence: number;
  reason: string;
};

const PROJECT_ROOT = process.cwd();

const DATASET_DIR = path.join(
  PROJECT_ROOT,
  "datasets",
  "topic-labeling-dataset",
  "v1"
);

const TEST_PATH = path.join(DATASET_DIR, "splits", "test.jsonl");

const REPORT_DIR = path.join(DATASET_DIR, "reports");
const REPORT_PATH = path.join(REPORT_DIR, "baseline-test-report.json");
const MISTAKES_PATH = path.join(REPORT_DIR, "baseline-test-mistakes.jsonl");

const TOPIC_TYPES: TopicReferenceType[] = [
  "new_explicit_topic",
  "existing_explicit_topic",
  "active_topic_reference",
  "unclear_topic",
  "no_topic",
];

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

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTopic(value: string) {
  return normalizeText(value)
    .replace(/\b(the|a|an|of|in|for|about)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 3 && /^[A-Z0-9+#]+$/.test(word)) return word;
      if (word.toLowerCase() === "vs") return "vs";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function topicMentioned(message: string, topic: string) {
  const normalizedMessage = normalizeText(message);
  const normalizedTopic = normalizeText(topic);

  if (!normalizedTopic) return false;

  if (normalizedMessage.includes(normalizedTopic)) {
    return true;
  }

  const compactTopic = normalizeTopic(topic);
  if (compactTopic && normalizedMessage.includes(compactTopic)) {
    return true;
  }

  return false;
}

function findMentionedCurrentTopic(
  message: string,
  currentTopicNames: string[]
): string | null {
  const sortedTopics = [...currentTopicNames].sort((a, b) => b.length - a.length);

  for (const topic of sortedTopics) {
    if (topicMentioned(message, topic)) {
      return topic;
    }
  }

  return null;
}

function looksLikeNoTopic(message: string) {
  const text = normalizeText(message);

  const noTopicSignals = [
    "dont even know what",
    "don't even know what",
    "dont know what im asking",
    "don't know what i'm asking",
    "dont know what i am asking",
    "overwhelmed",
    "everything feels blurry",
    "whole thing feels blurry",
    "cant point to one concept",
    "can't point to one concept",
    "not specific enough",
    "no useful question",
    "not a useful question",
    "dont want to fake a topic",
    "don't want to fake a topic",
    "brain just says no",
    "nothing is sticking",
    "all tangled",
    "where to start",
  ];

  return noTopicSignals.some((signal) => text.includes(signal));
}

function looksLikeUnclearTopic(message: string) {
  const text = normalizeText(message);

  const unclearSignals = [
    "might still be",
    "might be a side thing",
    "maybe it's actually",
    "maybe its actually",
    "not sure if it belongs",
    "not sure whether",
    "i can't tell",
    "i cant tell",
    "don't know if this is",
    "dont know if this is",
    "don't know what to call",
    "dont know what to call",
    "don't know the name",
    "dont know the name",
    "one step sideways",
    "maybe this is a subtopic",
    "messy in my head",
    "can't label",
    "cant label",
    "half about this",
    "different thread",
    "same topic or a new one",
  ];

  return unclearSignals.some((signal) => text.includes(signal));
}

function looksLikeActiveTopicReference(message: string) {
  const text = normalizeText(message);

  const activeReferenceSignals = [
    "still don't get it",
    "still dont get it",
    "same thing",
    "same topic",
    "that part",
    "that exact part",
    "that step",
    "why does that",
    "why that",
    "another example",
    "one more example",
    "show me another",
    "test me on that",
    "quiz me on that",
    "can you test me",
    "can you quiz me",
    "not a new topic",
    "can we slow",
    "slow down",
    "break this into",
    "more visual",
    "the words are fine",
    "mental picture",
    "middle step",
    "what stays the same",
    "what changes",
    "could we break",
    "i get the words",
    "i think i understand",
    "i tried the question",
    "stuck between two",
  ];

  return activeReferenceSignals.some((signal) => text.includes(signal));
}

function extractCandidateLabel(message: string): string | null {
  const raw = message.trim();

  const patterns: RegExp[] = [
    /\b(?:actual blocker|real blocker|actual issue|real issue|actual thing|thing i need|thing i need help with|blocker is|target is|topic should be)\s+(?:is\s+)?([^.!?]+)/i,
    /\b(?:help with|work on|understand|learn|reopen|go back to|switch back to|return to)\s+([^.!?]+)/i,
    /\b(?:confused about|stuck on|lost on|messing me up is|throwing me off is)\s+([^.!?]+)/i,
    /\b(?:the label.*?is|best label.*?is)\s+([^.!?]+)/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match?.[1]) continue;

    let candidate = match[1]
      .replace(/\b(but|because|bc|cuz|and|when|where|why|how)\b.*$/i, "")
      .replace(/\b(for a sec|for a minute|right now|tbh|lol|idk)\b.*$/i, "")
      .replace(/[,"“”]+/g, "")
      .trim();

    candidate = candidate
      .split(/\s+/)
      .slice(0, 7)
      .join(" ")
      .trim();

    if (candidate.length >= 3) {
      return titleCase(candidate);
    }
  }

  return null;
}

function baselinePredict(record: TopicLabelRecord): BaselinePrediction {
  const { message, active_topic_name, current_topic_names } = record.input;

  const mentionedCurrentTopic = findMentionedCurrentTopic(
    message,
    current_topic_names
  );

  if (looksLikeNoTopic(message)) {
    return {
      topic_reference_type: "no_topic",
      extracted_label: null,
      confidence: 0.78,
      reason: "Message looks like overwhelm/no usable topic.",
    };
  }

  if (looksLikeUnclearTopic(message)) {
    return {
      topic_reference_type: "unclear_topic",
      extracted_label: null,
      confidence: 0.66,
      reason: "Message explicitly signals uncertainty about whether this is same/new topic.",
    };
  }

  if (mentionedCurrentTopic) {
    return {
      topic_reference_type:
        active_topic_name && mentionedCurrentTopic === active_topic_name
          ? "active_topic_reference"
          : "existing_explicit_topic",
      extracted_label:
        active_topic_name && mentionedCurrentTopic === active_topic_name
          ? null
          : mentionedCurrentTopic,
      confidence: 0.82,
      reason: `Message mentions existing topic: ${mentionedCurrentTopic}.`,
    };
  }

  if (active_topic_name && looksLikeActiveTopicReference(message)) {
    return {
      topic_reference_type: "active_topic_reference",
      extracted_label: null,
      confidence: 0.74,
      reason: "Message looks like a follow-up to active topic.",
    };
  }

  const candidateLabel = extractCandidateLabel(message);

  if (candidateLabel) {
    return {
      topic_reference_type: "new_explicit_topic",
      extracted_label: candidateLabel,
      confidence: 0.68,
      reason: "Extracted a candidate new topic from explicit learning/confusion phrasing.",
    };
  }

  if (active_topic_name) {
    return {
      topic_reference_type: "active_topic_reference",
      extracted_label: null,
      confidence: 0.52,
      reason: "Fallback: active topic exists and no clear new topic was extracted.",
    };
  }

  return {
    topic_reference_type: "unclear_topic",
    extracted_label: null,
    confidence: 0.5,
    reason: "Fallback: no active topic and no clear topic extracted.",
  };
}

function labelsMatch(expected: string | null, predicted: string | null) {
  if (expected === null && predicted === null) return true;
  if (expected === null || predicted === null) return false;

  return normalizeTopic(expected) === normalizeTopic(predicted);
}

function makeConfusionMatrix() {
  const matrix: Record<TopicReferenceType, Record<TopicReferenceType, number>> =
    {} as Record<TopicReferenceType, Record<TopicReferenceType, number>>;

  for (const expected of TOPIC_TYPES) {
    matrix[expected] = {} as Record<TopicReferenceType, number>;
    for (const predicted of TOPIC_TYPES) {
      matrix[expected][predicted] = 0;
    }
  }

  return matrix;
}

function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const records = readJsonl(TEST_PATH);

  const confusionMatrix = makeConfusionMatrix();

  let typeCorrect = 0;
  let labelCorrect = 0;
  let bothCorrect = 0;

  const mistakes: Array<{
    id: string;
    message: string;
    active_topic_name: string | null;
    previous_user_messages: string[];
    expected: TopicLabelRecord["output"];
    predicted: BaselinePrediction;
    error_type: string;
  }> = [];

  for (const record of records) {
    const expected = record.output;
    const predicted = baselinePredict(record);

    confusionMatrix[expected.topic_reference_type][predicted.topic_reference_type] += 1;

    const isTypeCorrect =
      expected.topic_reference_type === predicted.topic_reference_type;

    const isLabelCorrect = labelsMatch(
      expected.extracted_label,
      predicted.extracted_label
    );

    if (isTypeCorrect) typeCorrect += 1;
    if (isLabelCorrect) labelCorrect += 1;
    if (isTypeCorrect && isLabelCorrect) bothCorrect += 1;

    if (!isTypeCorrect || !isLabelCorrect) {
      let errorType = "other";

      if (
        expected.extracted_label === null &&
        predicted.extracted_label !== null
      ) {
        errorType = "fake_topic_creation_risk";
      } else if (
        expected.extracted_label !== null &&
        predicted.extracted_label === null
      ) {
        errorType = "missed_explicit_topic";
      } else if (!isTypeCorrect) {
        errorType = "wrong_reference_type";
      } else if (!isLabelCorrect) {
        errorType = "wrong_extracted_label";
      }

      mistakes.push({
        id: record.id,
        message: record.input.message,
        active_topic_name: record.input.active_topic_name,
        previous_user_messages: record.input.previous_user_messages,
        expected,
        predicted,
        error_type: errorType,
      });
    }
  }

  const total = records.length;

  const report = {
    input_file: TEST_PATH,
    total,
    metrics: {
      topic_reference_type_accuracy: typeCorrect / total,
      extracted_label_accuracy: labelCorrect / total,
      joint_accuracy: bothCorrect / total,
    },
    counts: {
      type_correct: typeCorrect,
      label_correct: labelCorrect,
      both_correct: bothCorrect,
      mistakes: mistakes.length,
    },
    confusion_matrix: confusionMatrix,
    mistake_error_type_counts: mistakes.reduce<Record<string, number>>(
      (acc, mistake) => {
        acc[mistake.error_type] = (acc[mistake.error_type] ?? 0) + 1;
        return acc;
      },
      {}
    ),
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(
    MISTAKES_PATH,
    mistakes.map((mistake) => JSON.stringify(mistake)).join("\n") + "\n",
    "utf8"
  );

  console.log("Baseline evaluation complete.");
  console.log("");
  console.log(`Input: ${TEST_PATH}`);
  console.log(`Total: ${total}`);
  console.log("");
  console.log("Metrics:");
  console.log(
    `topic_reference_type_accuracy: ${report.metrics.topic_reference_type_accuracy.toFixed(3)}`
  );
  console.log(
    `extracted_label_accuracy: ${report.metrics.extracted_label_accuracy.toFixed(3)}`
  );
  console.log(`joint_accuracy: ${report.metrics.joint_accuracy.toFixed(3)}`);
  console.log("");
  console.log("Mistake error type counts:");
  console.log(report.mistake_error_type_counts);
  console.log("");
  console.log(`Wrote report: ${REPORT_PATH}`);
  console.log(`Wrote mistakes: ${MISTAKES_PATH}`);
}

main();