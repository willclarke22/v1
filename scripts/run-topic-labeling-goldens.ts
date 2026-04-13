import { runDeterministicTopicLabeling } from "../lib/runtime/topic-labeling/topic-label-deterministic";
import {
  resolveTopicForMessage,
  inferSeededNextStep,
  type RouteTopic,
} from "../lib/runtime/topic-resolution";
import {
  TOPIC_LABELING_GOLDENS,
  TOPIC_LABELING_SEQUENCES,
  type GoldensTopic,
  type ResolutionKind,
  type TopicGoldenCase,
  type TopicGoldenSequence,
  type TopicGoldenSequenceStep,
} from "./topic-labeling-goldens";

type CaseResult = {
  suite: "isolated" | "sequence";
  id: string;
  description: string;
  message: string;

  actualLabel: string | null;
  actualResolutionKind: ResolutionKind;
  actualShouldCreate: boolean;
  actualMatchedTopicName: string | null;
  actualConfidence: number;

  pass: boolean;
  failures: string[];
  notes?: string;
};

type CliOptions = {
  suite: "all" | "isolated" | "sequence";
  grep: string | null;
  onlyFailures: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    suite: "all",
    grep: null,
    onlyFailures: false,
  };

  for (const arg of argv) {
    if (arg === "--suite=isolated") {
      options.suite = "isolated";
    } else if (arg === "--suite=sequence") {
      options.suite = "sequence";
    } else if (arg.startsWith("--grep=")) {
      options.grep = arg.slice("--grep=".length).trim() || null;
    } else if (arg === "--only-failures") {
      options.onlyFailures = true;
    }
  }

  return options;
}

function makeRouteTopics(topics: GoldensTopic[]): RouteTopic[] {
  return topics.map((topic, index) => ({
    id: topic.id,
    name: topic.name,
    diagnosis: "representation_gap",
    nextStep: inferSeededNextStep(topic.name),
    confusion: 0.5,
    insight: 0.3,
    learningScore: 0.2,
    position: [index * 2, 0, 0] as [number, number, number],
    scale: 1,
    messageCount: 1,
    lastUpdated: "2026-01-01T00:00:00.000Z",
    hasAvailableProbe: false,
  })) as RouteTopic[];
}

function makeCreatedTopic(label: string, index: number): RouteTopic {
  return {
    id: `created-${index}-${label.toLowerCase().replace(/\s+/g, "-")}`,
    name: label,
    diagnosis: "representation_gap",
    nextStep: inferSeededNextStep(label),
    confusion: 0.5,
    insight: 0.3,
    learningScore: 0.2,
    position: [index * 2, 0, 0] as [number, number, number],
    scale: 1,
    messageCount: 1,
    lastUpdated: "2026-01-01T00:00:00.000Z",
    hasAvailableProbe: false,
  } as RouteTopic;
}

function hasOwn<T extends object>(obj: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function evaluateExpectations(
  source: TopicGoldenCase | TopicGoldenSequenceStep,
  actual: {
    actualLabel: string | null;
    actualResolutionKind: ResolutionKind;
    actualShouldCreate: boolean;
    actualMatchedTopicName: string | null;
  }
): string[] {
  const failures: string[] = [];

  if (hasOwn(source, "expectedLabel")) {
    if (source.expectedLabel !== actual.actualLabel) {
      failures.push(
        `expectedLabel=${JSON.stringify(source.expectedLabel)} actualLabel=${JSON.stringify(actual.actualLabel)}`
      );
    }
  }

  if (hasOwn(source, "expectedResolutionKind")) {
    if (source.expectedResolutionKind !== actual.actualResolutionKind) {
      failures.push(
        `expectedResolutionKind=${source.expectedResolutionKind} actualResolutionKind=${actual.actualResolutionKind}`
      );
    }
  }

  if (hasOwn(source, "expectedShouldCreate")) {
    if (source.expectedShouldCreate !== actual.actualShouldCreate) {
      failures.push(
        `expectedShouldCreate=${source.expectedShouldCreate} actualShouldCreate=${actual.actualShouldCreate}`
      );
    }
  }

  if (hasOwn(source, "expectedMatchedTopicName")) {
    if (source.expectedMatchedTopicName !== actual.actualMatchedTopicName) {
      failures.push(
        `expectedMatchedTopicName=${JSON.stringify(source.expectedMatchedTopicName)} actualMatchedTopicName=${JSON.stringify(actual.actualMatchedTopicName)}`
      );
    }
  }

  if (
    Array.isArray(source.forbiddenResolutionKinds) &&
    source.forbiddenResolutionKinds.includes(actual.actualResolutionKind)
  ) {
    failures.push(`forbiddenResolutionKindHit=${actual.actualResolutionKind}`);
  }

  return failures;
}

function evaluateCase(testCase: TopicGoldenCase): CaseResult {
  const existingTopics = makeRouteTopics(testCase.existingTopics);
  const activeTopic =
    testCase.activeTopicId == null
      ? null
      : existingTopics.find((topic) => topic.id === testCase.activeTopicId) ?? null;

  const labeling = runDeterministicTopicLabeling({
    raw_message: testCase.message,
    active_topic_id: activeTopic?.id ?? null,
    active_topic_name: activeTopic?.name ?? null,
    recent_topic_names: existingTopics.map((t) => t.name),
    retrieval_candidates: existingTopics.map((topic) => ({
      topic_id: topic.id,
      topic_name: topic.name,
      similarity: 0,
    })),
  });

  const resolution = resolveTopicForMessage(
    testCase.message,
    existingTopics,
    activeTopic
  );

  const actualLabel = labeling.topic_decision.canonical_label ?? null;
  const actualResolutionKind = resolution.resolutionKind;
  const actualShouldCreate = resolution.shouldCreateNewTopic;
  const actualMatchedTopicName = resolution.matchedTopic?.name ?? null;
  const actualConfidence = resolution.matchConfidence;

  const failures = evaluateExpectations(testCase, {
    actualLabel,
    actualResolutionKind,
    actualShouldCreate,
    actualMatchedTopicName,
  });

  return {
    suite: "isolated",
    id: testCase.id,
    description: testCase.description,
    message: testCase.message,
    actualLabel,
    actualResolutionKind,
    actualShouldCreate,
    actualMatchedTopicName,
    actualConfidence,
    pass: failures.length === 0,
    failures,
    notes: testCase.notes,
  };
}

function evaluateSequence(sequence: TopicGoldenSequence): CaseResult[] {
  let existingTopics = makeRouteTopics(sequence.initialTopics);
  let activeTopic =
    sequence.initialActiveTopicId == null
      ? null
      : existingTopics.find((topic) => topic.id === sequence.initialActiveTopicId) ?? null;

  const results: CaseResult[] = [];

  sequence.steps.forEach((step, index) => {
    const labeling = runDeterministicTopicLabeling({
      raw_message: step.message,
      active_topic_id: activeTopic?.id ?? null,
      active_topic_name: activeTopic?.name ?? null,
      recent_topic_names: existingTopics.map((t) => t.name),
      retrieval_candidates: existingTopics.map((topic) => ({
        topic_id: topic.id,
        topic_name: topic.name,
        similarity: 0,
      })),
    });

    const resolution = resolveTopicForMessage(step.message, existingTopics, activeTopic);

    const actualLabel = labeling.topic_decision.canonical_label ?? null;
    const actualResolutionKind = resolution.resolutionKind;
    const actualShouldCreate = resolution.shouldCreateNewTopic;
    const actualMatchedTopicName = resolution.matchedTopic?.name ?? null;
    const actualConfidence = resolution.matchConfidence;

    const failures = evaluateExpectations(step, {
      actualLabel,
      actualResolutionKind,
      actualShouldCreate,
      actualMatchedTopicName,
    });

    results.push({
      suite: "sequence",
      id: `${sequence.id}:${step.id}`,
      description: `${sequence.description} :: ${step.id}`,
      message: step.message,
      actualLabel,
      actualResolutionKind,
      actualShouldCreate,
      actualMatchedTopicName,
      actualConfidence,
      pass: failures.length === 0,
      failures,
      notes: step.notes ?? sequence.notes,
    });

    if (resolution.matchedTopic) {
      activeTopic = resolution.matchedTopic;
    } else if (resolution.shouldCreateNewTopic && actualLabel) {
      const createdTopic = makeCreatedTopic(actualLabel, existingTopics.length + index);
      existingTopics = [...existingTopics, createdTopic];
      activeTopic = createdTopic;
    }
  });

  return results;
}

function filterResults(results: CaseResult[], options: CliOptions): CaseResult[] {
  return results.filter((result) => {
    if (options.suite !== "all" && result.suite !== options.suite) {
      return false;
    }

    if (options.grep) {
      const haystack = [
        result.id,
        result.description,
        result.message,
        result.actualLabel ?? "",
        result.actualMatchedTopicName ?? "",
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(options.grep.toLowerCase())) {
        return false;
      }
    }

    if (options.onlyFailures && result.pass) {
      return false;
    }

    return true;
  });
}

function printSuiteBreakdown(results: CaseResult[]) {
  const suites: Array<CaseResult["suite"]> = ["isolated", "sequence"];

  console.log("=== Suite Breakdown ===");
  for (const suite of suites) {
    const suiteResults = results.filter((r) => r.suite === suite);
    const passed = suiteResults.filter((r) => r.pass).length;
    const failed = suiteResults.length - passed;
    console.log(`${suite}: total=${suiteResults.length} passed=${passed} failed=${failed}`);
  }
  console.log("");
}

function printSummary(results: CaseResult[]) {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;

  console.log("");
  console.log("=== Topic Labeling Goldens Summary ===");
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log("");

  printSuiteBreakdown(results);

  const tableRows = results.map((r) => ({
    suite: r.suite,
    id: r.id,
    pass: r.pass ? "PASS" : "FAIL",
    label: r.actualLabel ?? "",
    resolution: r.actualResolutionKind,
    matched: r.actualMatchedTopicName ?? "",
    create: r.actualShouldCreate,
    confidence: r.actualConfidence.toFixed(2),
  }));

  console.table(tableRows);

  const failedCases = results.filter((r) => !r.pass);
  if (failedCases.length > 0) {
    console.log("");
    console.log("=== Failed Cases ===");
    for (const failedCase of failedCases) {
      console.log(`\n[${failedCase.id}] ${failedCase.description}`);
      console.log(`Message: ${failedCase.message}`);
      console.log(`Actual label: ${failedCase.actualLabel}`);
      console.log(`Actual resolution: ${failedCase.actualResolutionKind}`);
      console.log(`Actual matched topic: ${failedCase.actualMatchedTopicName}`);
      console.log(`Actual should create: ${failedCase.actualShouldCreate}`);
      console.log(`Actual confidence: ${failedCase.actualConfidence.toFixed(2)}`);
      if (failedCase.notes) {
        console.log(`Notes: ${failedCase.notes}`);
      }
      console.log("Failures:");
      for (const failure of failedCase.failures) {
        console.log(`  - ${failure}`);
      }
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  const isolatedResults = TOPIC_LABELING_GOLDENS.map(evaluateCase);
  const sequenceResults = TOPIC_LABELING_SEQUENCES.flatMap(evaluateSequence);
  const allResults = [...isolatedResults, ...sequenceResults];
  const filteredResults = filterResults(allResults, options);

  if (filteredResults.length === 0) {
    console.log("No topic-labeling golden cases matched the current filters.");
    console.log(
      "Try without filters, or use something like --suite=isolated --grep=curling --only-failures."
    );
    process.exitCode = 1;
    return;
  }

  printSummary(filteredResults);

  const hasFailure = filteredResults.some((r) => !r.pass);
  if (hasFailure) {
    process.exitCode = 1;
  }
}

main();