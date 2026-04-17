// scripts/run-topic-labeling-goldens.ts

import { runDeterministicTopicLabeling } from "../lib/runtime/topic-labeling/topic-label-deterministic";
import {
  resolveTopicForMessage,
  inferSeededNextStep,
  type RouteTopic,
} from "../lib/runtime/topic-resolution";
import {
  TOPIC_LABELING_GOLDENS,
  TOPIC_LABELING_SEQUENCES,
  TOPIC_LABELING_HARD_GOLDENS,
  TOPIC_LABELING_HARD_SEQUENCES,
  type GoldensTopic,
  type ResolutionKind,
  type TopicGoldenCase,
  type TopicGoldenSequence,
  type TopicGoldenSequenceStep,
} from "./topic-labeling-goldens";
import {
  TOPIC_LABELING_HOLDOUT_GOLDENS,
  TOPIC_LABELING_HOLDOUT_SEQUENCES,
} from "./topic-labeling-holdout";
import {
  blindV2Isolated,
  blindV2Sequence,
} from "./topic-labeling-goldens-blind-v2";

type ResultScope =
  | "baseline-isolated"
  | "baseline-sequence"
  | "hard-isolated"
  | "hard-sequence"
  | "holdout-isolated"
  | "holdout-sequence"
  | "blindv2-isolated"
  | "blindv2-sequence";

type CaseResult = {
  suite: "isolated" | "sequence";
  scope: ResultScope;
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
  category: string | null;
};

type CliOptions = {
  suite:
    | "all"
    | "baseline"
    | "hard"
    | "holdout"
    | "blindv2"
    | "isolated"
    | "sequence"
    | "baseline-isolated"
    | "baseline-sequence"
    | "hard-isolated"
    | "hard-sequence"
    | "holdout-isolated"
    | "holdout-sequence"
    | "blindv2-isolated"
    | "blindv2-sequence";
  grep: string | null;
  onlyFailures: boolean;
};

type BlindV2Case = {
  id: string;
  category?: string;
  description: string;
  message: string;
  expectedLabel?: string;
  expectedResolution?: ResolutionKind;
  expectedMatchedTopic?: string;
  expectedShouldCreate?: boolean;
  activeTopicName?: string;
  existingTopics?: string[];
  notes?: string;
};

type BlindV2SequenceStep = {
  id: string;
  category?: string;
  description: string;
  message: string;
  expectedLabel?: string;
  expectedResolution?: ResolutionKind;
  expectedMatchedTopic?: string;
  expectedShouldCreate?: boolean;
  existingTopics?: string[];
  activeTopicName?: string;
  notes?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    suite: "all",
    grep: null,
    onlyFailures: false,
  };

  for (const arg of argv) {
    if (arg === "--suite=baseline") {
      options.suite = "baseline";
    } else if (arg === "--suite=hard") {
      options.suite = "hard";
    } else if (arg === "--suite=holdout") {
      options.suite = "holdout";
    } else if (arg === "--suite=blindv2") {
      options.suite = "blindv2";
    } else if (arg === "--suite=isolated") {
      options.suite = "isolated";
    } else if (arg === "--suite=sequence") {
      options.suite = "sequence";
    } else if (arg === "--suite=baseline-isolated") {
      options.suite = "baseline-isolated";
    } else if (arg === "--suite=baseline-sequence") {
      options.suite = "baseline-sequence";
    } else if (arg === "--suite=hard-isolated") {
      options.suite = "hard-isolated";
    } else if (arg === "--suite=hard-sequence") {
      options.suite = "hard-sequence";
    } else if (arg === "--suite=holdout-isolated") {
      options.suite = "holdout-isolated";
    } else if (arg === "--suite=holdout-sequence") {
      options.suite = "holdout-sequence";
    } else if (arg === "--suite=blindv2-isolated") {
      options.suite = "blindv2-isolated";
    } else if (arg === "--suite=blindv2-sequence") {
      options.suite = "blindv2-sequence";
    } else if (arg.startsWith("--grep=")) {
      options.grep = arg.slice("--grep=".length).trim() || null;
    } else if (arg === "--only-failures") {
      options.onlyFailures = true;
    }
  }

  return options;
}

function extractCategory(notes?: string, explicitCategory?: string): string | null {
  if (explicitCategory?.trim()) {
    return explicitCategory.trim().toLowerCase();
  }

  if (!notes) return null;

  const match = notes.match(/\[category:([^\]]+)\]/i);
  if (!match?.[1]) return null;

  return match[1].trim().toLowerCase();
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

function makeRouteTopicsFromNames(names: string[]): RouteTopic[] {
  return names.map((name, index) => ({
    id: `seed-${index}-${name.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-")}`,
    name,
    diagnosis: "representation_gap",
    nextStep: inferSeededNextStep(name),
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

function normalizeBlindV2ExpectedResolution(
  source: BlindV2Case | BlindV2SequenceStep
): ResolutionKind | undefined {
  return source.expectedResolution;
}

function normalizeBlindV2ExpectedMatchedTopic(
  source: BlindV2Case | BlindV2SequenceStep
): string | null | undefined {
  if (!hasOwn(source, "expectedMatchedTopic")) return undefined;
  return source.expectedMatchedTopic ?? null;
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

function evaluateBlindV2Expectations(
  source: BlindV2Case | BlindV2SequenceStep,
  actual: {
    actualLabel: string | null;
    actualResolutionKind: ResolutionKind;
    actualShouldCreate: boolean;
    actualMatchedTopicName: string | null;
  }
): string[] {
  const failures: string[] = [];

  if (hasOwn(source, "expectedLabel")) {
    const expected = source.expectedLabel ?? null;
    const actualLabel = actual.actualLabel ?? null;
    if (expected !== actualLabel) {
      failures.push(
        `expectedLabel=${JSON.stringify(expected)} actualLabel=${JSON.stringify(actualLabel)}`
      );
    }
  }

  const expectedResolution = normalizeBlindV2ExpectedResolution(source);
  if (expectedResolution != null && expectedResolution !== actual.actualResolutionKind) {
    failures.push(
      `expectedResolution=${expectedResolution} actualResolutionKind=${actual.actualResolutionKind}`
    );
  }

  if (hasOwn(source, "expectedShouldCreate")) {
    const expected = source.expectedShouldCreate ?? false;
    if (expected !== actual.actualShouldCreate) {
      failures.push(
        `expectedShouldCreate=${expected} actualShouldCreate=${actual.actualShouldCreate}`
      );
    }
  }

  const expectedMatchedTopic = normalizeBlindV2ExpectedMatchedTopic(source);
  if (expectedMatchedTopic !== undefined) {
    const actualMatched = actual.actualMatchedTopicName ?? null;
    if (expectedMatchedTopic !== actualMatched) {
      failures.push(
        `expectedMatchedTopic=${JSON.stringify(expectedMatchedTopic)} actualMatchedTopicName=${JSON.stringify(actualMatched)}`
      );
    }
  }

  return failures;
}

function evaluateCase(
  testCase: TopicGoldenCase,
  scope: "baseline-isolated" | "hard-isolated" | "holdout-isolated"
): CaseResult {
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
    scope,
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
    category: extractCategory(testCase.notes),
  };
}

function evaluateBlindV2Case(
  testCase: BlindV2Case,
  scope: "blindv2-isolated"
): CaseResult {
  const existingTopics = makeRouteTopicsFromNames(testCase.existingTopics ?? []);
  const activeTopic =
    testCase.activeTopicName == null
      ? null
      : existingTopics.find((topic) => topic.name === testCase.activeTopicName) ?? null;

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

  const failures = evaluateBlindV2Expectations(testCase, {
    actualLabel,
    actualResolutionKind,
    actualShouldCreate,
    actualMatchedTopicName,
  });

  return {
    suite: "isolated",
    scope,
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
    category: extractCategory(testCase.notes, testCase.category),
  };
}

function evaluateSequence(
  sequence: TopicGoldenSequence,
  scope: "baseline-sequence" | "hard-sequence" | "holdout-sequence"
): CaseResult[] {
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
      scope,
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
      category: extractCategory(step.notes ?? sequence.notes),
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

function evaluateBlindV2Sequence(
  steps: BlindV2SequenceStep[],
  scope: "blindv2-sequence"
): CaseResult[] {
  let existingTopics: RouteTopic[] = [];
  let activeTopic: RouteTopic | null = null;
  const results: CaseResult[] = [];

  steps.forEach((step, index) => {
    if (Array.isArray(step.existingTopics) && step.existingTopics.length > 0) {
      existingTopics = makeRouteTopicsFromNames(step.existingTopics);
    }

    if (step.activeTopicName != null) {
      activeTopic =
        existingTopics.find((topic) => topic.name === step.activeTopicName) ?? null;
    }

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

    const failures = evaluateBlindV2Expectations(step, {
      actualLabel,
      actualResolutionKind,
      actualShouldCreate,
      actualMatchedTopicName,
    });

    results.push({
      suite: "sequence",
      scope,
      id: step.id,
      description: step.description,
      message: step.message,
      actualLabel,
      actualResolutionKind,
      actualShouldCreate,
      actualMatchedTopicName,
      actualConfidence,
      pass: failures.length === 0,
      failures,
      notes: step.notes,
      category: extractCategory(step.notes, step.category),
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
    if (options.suite === "baseline") {
      if (!result.scope.startsWith("baseline")) return false;
    } else if (options.suite === "hard") {
      if (!result.scope.startsWith("hard")) return false;
    } else if (options.suite === "holdout") {
      if (!result.scope.startsWith("holdout")) return false;
    } else if (options.suite === "blindv2") {
      if (!result.scope.startsWith("blindv2")) return false;
    } else if (options.suite === "isolated") {
      if (result.suite !== "isolated") return false;
    } else if (options.suite === "sequence") {
      if (result.suite !== "sequence") return false;
    } else if (options.suite === "baseline-isolated") {
      if (result.scope !== "baseline-isolated") return false;
    } else if (options.suite === "baseline-sequence") {
      if (result.scope !== "baseline-sequence") return false;
    } else if (options.suite === "hard-isolated") {
      if (result.scope !== "hard-isolated") return false;
    } else if (options.suite === "hard-sequence") {
      if (result.scope !== "hard-sequence") return false;
    } else if (options.suite === "holdout-isolated") {
      if (result.scope !== "holdout-isolated") return false;
    } else if (options.suite === "holdout-sequence") {
      if (result.scope !== "holdout-sequence") return false;
    } else if (options.suite === "blindv2-isolated") {
      if (result.scope !== "blindv2-isolated") return false;
    } else if (options.suite === "blindv2-sequence") {
      if (result.scope !== "blindv2-sequence") return false;
    }

    if (options.grep) {
      const haystack = [
        result.id,
        result.description,
        result.message,
        result.actualLabel ?? "",
        result.actualMatchedTopicName ?? "",
        result.scope,
        result.category ?? "",
        result.notes ?? "",
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

function printScopeBreakdown(results: CaseResult[]) {
  const scopes: ResultScope[] = [
    "baseline-isolated",
    "baseline-sequence",
    "hard-isolated",
    "hard-sequence",
    "holdout-isolated",
    "holdout-sequence",
    "blindv2-isolated",
    "blindv2-sequence",
  ];

  console.log("=== Scope Breakdown ===");
  for (const scope of scopes) {
    const scopeResults = results.filter((r) => r.scope === scope);
    const passed = scopeResults.filter((r) => r.pass).length;
    const failed = scopeResults.length - passed;
    console.log(`${scope}: total=${scopeResults.length} passed=${passed} failed=${failed}`);
  }
  console.log("");
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

function printFamilyBreakdown(results: CaseResult[]) {
  const categorized = results.filter((r) => r.category);

  if (categorized.length === 0) {
    return;
  }

  const families = Array.from(
    new Set(categorized.map((r) => r.category).filter(Boolean))
  ).sort();

  console.log("=== Category Breakdown ===");
  for (const family of families) {
    const familyResults = categorized.filter((r) => r.category === family);
    const passed = familyResults.filter((r) => r.pass).length;
    const failed = familyResults.length - passed;
    console.log(`${family}: total=${familyResults.length} passed=${passed} failed=${failed}`);
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

  printScopeBreakdown(results);
  printSuiteBreakdown(results);
  printFamilyBreakdown(results);

  const tableRows = results.map((r) => ({
    scope: r.scope,
    suite: r.suite,
    category: r.category ?? "",
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
      console.log(`\n[${failedCase.scope}] [${failedCase.id}] ${failedCase.description}`);
      console.log(`Message: ${failedCase.message}`);
      console.log(`Actual label: ${failedCase.actualLabel}`);
      console.log(`Actual resolution: ${failedCase.actualResolutionKind}`);
      console.log(`Actual matched topic: ${failedCase.actualMatchedTopicName}`);
      console.log(`Actual should create: ${failedCase.actualShouldCreate}`);
      console.log(`Actual confidence: ${failedCase.actualConfidence.toFixed(2)}`);
      if (failedCase.category) {
        console.log(`Category: ${failedCase.category}`);
      }
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

  const baselineIsolatedResults = TOPIC_LABELING_GOLDENS.map((testCase) =>
    evaluateCase(testCase, "baseline-isolated")
  );
  const baselineSequenceResults = TOPIC_LABELING_SEQUENCES.flatMap((sequence) =>
    evaluateSequence(sequence, "baseline-sequence")
  );

  const hardIsolatedResults = TOPIC_LABELING_HARD_GOLDENS.map((testCase) =>
    evaluateCase(testCase, "hard-isolated")
  );
  const hardSequenceResults = TOPIC_LABELING_HARD_SEQUENCES.flatMap((sequence) =>
    evaluateSequence(sequence, "hard-sequence")
  );

  const holdoutIsolatedResults = TOPIC_LABELING_HOLDOUT_GOLDENS.map((testCase) =>
    evaluateCase(testCase, "holdout-isolated")
  );
  const holdoutSequenceResults = TOPIC_LABELING_HOLDOUT_SEQUENCES.flatMap((sequence) =>
    evaluateSequence(sequence, "holdout-sequence")
  );

  const blindV2IsolatedResults = (blindV2Isolated as BlindV2Case[]).map((testCase) =>
    evaluateBlindV2Case(testCase, "blindv2-isolated")
  );
  const blindV2SequenceResults = evaluateBlindV2Sequence(
    blindV2Sequence as BlindV2SequenceStep[],
    "blindv2-sequence"
  );

  const allResults = [
    ...baselineIsolatedResults,
    ...baselineSequenceResults,
    ...hardIsolatedResults,
    ...hardSequenceResults,
    ...holdoutIsolatedResults,
    ...holdoutSequenceResults,
    ...blindV2IsolatedResults,
    ...blindV2SequenceResults,
  ];

  const filteredResults = filterResults(allResults, options);

  if (filteredResults.length === 0) {
    console.log("No topic-labeling golden cases matched the current filters.");
    console.log(
      "Try without filters, or use something like --suite=blindv2 --grep=paragraph --only-failures."
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