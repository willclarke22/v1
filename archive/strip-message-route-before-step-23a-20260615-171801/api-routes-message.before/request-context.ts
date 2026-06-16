import type {
  ImportantRunInputs,
  MessageRouteRequest,
} from "@/types/contracts";

export type IncomingChatTurn = {
  role?: string;
  text?: string;
  content?: string;
};

export type IncomingViewportContext = {
  focusedTopicId?: unknown;
  selectedTopicId?: unknown;
  activeTopicIdForMessage?: unknown;
};

export type MessageRouteBody = MessageRouteRequest & {
  message?: string;
  chat_history?: string;
  recent_turns?: IncomingChatTurn[];
  conversation_turns?: IncomingChatTurn[];
  viewportContext?: IncomingViewportContext;
};

export type NormalizedRecentTurn = {
  role: "user" | "assistant";
  text: string;
};

export function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeRecentTurns(
  body: MessageRouteBody,
): NormalizedRecentTurn[] {
  const rawTurns = Array.isArray(body.recent_turns)
    ? body.recent_turns
    : Array.isArray(body.conversation_turns)
      ? body.conversation_turns
      : [];

  return rawTurns
    .map((turn) => {
      const rawRole = typeof turn.role === "string" ? turn.role : "user";
      const role = rawRole === "assistant" ? "assistant" : "user";
      const text =
        typeof turn.text === "string"
          ? turn.text
          : typeof turn.content === "string"
            ? turn.content
            : "";

      return {
        role,
        text: text.trim(),
      };
    })
    .filter((turn) => turn.text.length > 0) as NormalizedRecentTurn[];
}

export function buildChatHistoryLinesForModelSignals(args: {
  body: MessageRouteBody;
  recentTurns: NormalizedRecentTurn[];
}) {
  const explicitChatHistory =
    typeof args.body.chat_history === "string" && args.body.chat_history.trim()
      ? args.body.chat_history.trim()
      : null;

  if (explicitChatHistory) {
    return [explicitChatHistory];
  }

  return args.recentTurns
    .slice(-8)
    .map(
      (turn) =>
        `${turn.role === "assistant" ? "Assistant" : "User"}: ${turn.text}`,
    )
    .filter(Boolean);
}

export function inferMessageRouteRunKind(args: {
  recentTurns: NormalizedRecentTurn[];
  hasActiveTopicId: boolean;
  clarifySeeking: boolean;
}): ImportantRunInputs["current_interaction_context"]["run_kind"] {
  const { recentTurns, hasActiveTopicId, clarifySeeking } = args;

  if (clarifySeeking) {
    return hasActiveTopicId || recentTurns.length > 0
      ? "clarify_followup"
      : "initial_question";
  }

  const userTurnCount = recentTurns.filter(
    (turn) => turn.role === "user",
  ).length;
  const assistantTurnCount = recentTurns.filter(
    (turn) => turn.role === "assistant",
  ).length;

  if (hasActiveTopicId && assistantTurnCount > 0 && userTurnCount > 0) {
    return "mixed";
  }

  return "initial_question";
}

export function buildRecentUserMessagesForTopicLabeler(
  recentTurns: NormalizedRecentTurn[],
) {
  return recentTurns
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.text.trim())
    .filter(Boolean)
    .slice(-5);
}
