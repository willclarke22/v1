import { runDeterministicTopicLabeling } from "@/lib/runtime/topic-labeling/topic-label-deterministic";
import { resolveTopicForMessage, type RouteTopic } from "@/lib/runtime/topic-resolution";
import { inferSeededNextStep } from "@/lib/runtime/topic-resolution";
import { TOPIC_LABELING_GOLDENS, type TopicGoldenCase } from "./topic-labeling-goldens";

type ResolutionKind =
  | "matched_existing"
  | "created_new_candidate"
  | "fallback_active_topic"
  | "fallback_existing_topic"
  | "no_match";

type CaseResult = {
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
};

function makeRouteTopics(
  topics: Array<{ id: string; name: string }>
): RouteTopic[] {
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
    lastUpdated: new Date().toISOString(),
    hasAvailableProbe: false,
  })) as RouteTopic[];
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

  const failures: string[] = [];

  if (
    Object.prototype.hasOwnProperty.call(testCase, "expectedLabel") &&
    testCase.expectedLabel !== actualLabel
  ) {
    failures.push(
      `expectedLabel=${JSON.stringify(testCase.expectedLabel)} actualLabel=${JSON.stringify(actualLabel)}`
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(testCase, "expectedResolutionKind") &&
    testCase.expectedResolutionKind !== actualResolutionKind
  ) {
    failures.push(
      `expectedResolutionKind=${testCase.expectedResolutionKind} actualResolutionKind=${actualResolutionKind}`
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(testCase, "expectedShouldCreate") &&
    testCase.expectedShouldCreate !== actualShouldCreate
  ) {
    failures.push(
      `expectedShouldCreate=${testCase.expectedShouldCreate} actualShouldCreate=${actualShouldCreate}`
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(testCase, "expectedMatchedTopicName") &&
    testCase.expectedMatchedTopicName !== actualMatchedTopicName
  ) {
    failures.push(
      `expectedMatchedTopicName=${JSON.stringify(testCase.expectedMatchedTopicName)} actualMatchedTopicName=${JSON.stringify(actualMatchedTopicName)}`
    );
  }

  if (testCase.forbiddenResolutionKinds?.includes(actualResolutionKind)) {
    failures.push(`forbiddenResolutionKindHit=${actualResolutionKind}`);
  }

  return {
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
  };
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

  const tableRows = results.map((r) => ({
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
      console.log(`Failures:`);
      for (const failure of failedCase.failures) {
        console.log(`  - ${failure}`);
      }
    }
  }
}

function main() {
  const results = TOPIC_LABELING_GOLDENS.map(evaluateCase);
  printSummary(results);

  const hasFailure = results.some((r) => !r.pass);
  if (hasFailure) {
    process.exitCode = 1;
  }
}

main();