export type MessageFrame =
  | "quiz_request"
  | "confusion_help"
  | "explain_request"
  | "compare_request"
  | "apply_request"
  | "attempt_like"
  | "general";

function normalizeMessageFrameText(message: string) {
  return message
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

/**
 * Lightweight runtime message-frame classifier.
 *
 * This intentionally does not call the legacy deterministic topic labeler.
 * It is only used for intervention/modality hints such as:
 * - should a message lean clarify vs. probe?
 * - should explicit quiz/apply language prefer interactive mode?
 *
 * Topic creation/switching remains owned by the V3 model route policy.
 */
export function inferPrimaryMessageFrame(message: string): MessageFrame {
  const lower = normalizeMessageFrameText(message);

  if (!lower) return "general";

  if (
    includesAny(lower, [
      "quiz me",
      "test me",
      "give me a quiz",
      "ask me a question",
      "practice question",
      "practice problems",
      "can you test",
      "let me try",
      "let me test myself",
    ])
  ) {
    return "quiz_request";
  }

  if (
    includesAny(lower, [
      "apply this",
      "apply it",
      "use this in",
      "real situation",
      "real example",
      "real-world",
      "real world",
      "another situation",
      "different situation",
      "new situation",
      "transfer",
      "how would this work if",
    ])
  ) {
    return "apply_request";
  }

  if (
    includesAny(lower, [
      "compare",
      "contrast",
      "difference between",
      "different from",
      "same as",
      "similar to",
      "distinguish",
      "tell apart",
      "versus",
      " vs ",
    ])
  ) {
    return "compare_request";
  }

  if (
    includesAny(lower, [
      "i don't understand",
      "i dont understand",
      "i do not understand",
      "i'm confused",
      "i am confused",
      "confused about",
      "i'm stuck",
      "i am stuck",
      "stuck on",
      "not clicking",
      "doesn't make sense",
      "doesnt make sense",
      "i don't get",
      "i dont get",
      "i can't tell",
      "i cant tell",
      "lost on",
      "lost about",
      "help me understand",
      "help me with",
      "i need help",
      "could use some help",
    ])
  ) {
    return "confusion_help";
  }

  if (
    lower.startsWith("what is ") ||
    lower.startsWith("what are ") ||
    lower.startsWith("how does ") ||
    lower.startsWith("how do ") ||
    lower.startsWith("why does ") ||
    lower.startsWith("why do ") ||
    lower.startsWith("can you explain ") ||
    lower.startsWith("could you explain ") ||
    lower.startsWith("explain ") ||
    includesAny(lower, [
      "walk me through",
      "go over",
      "break down",
      "explain how",
      "explain why",
      "what does that mean",
      "what does it mean",
    ])
  ) {
    return "explain_request";
  }

  if (
    includesAny(lower, [
      "my answer is",
      "i think the answer",
      "i would say",
      "would it be",
      "is it because",
      "so it means",
      "so the answer",
      "here's my attempt",
      "here is my attempt",
      "i tried",
    ])
  ) {
    return "attempt_like";
  }

  return "general";
}
