export type ChatHistoryTurn = {
  role: "user" | "assistant";
  text: string;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function labelForRole(role: ChatHistoryTurn["role"]) {
  return role === "assistant" ? "MyWay" : "User";
}

export function buildRecentChatHistory(
  turns: ChatHistoryTurn[],
  maxTurns = 6
): string {
  if (!Array.isArray(turns) || turns.length === 0) {
    return "";
  }

  const safeMaxTurns = Number.isFinite(maxTurns) && maxTurns > 0 ? Math.floor(maxTurns) : 6;

  const cleanedTurns = turns
    .filter(
      (turn): turn is ChatHistoryTurn =>
        !!turn &&
        (turn.role === "user" || turn.role === "assistant") &&
        typeof turn.text === "string"
    )
    .map((turn) => ({
      role: turn.role,
      text: normalizeWhitespace(turn.text),
    }))
    .filter((turn) => turn.text.length > 0);

  if (!cleanedTurns.length) {
    return "";
  }

  const slicedTurns = cleanedTurns.slice(-safeMaxTurns);

  return slicedTurns
    .map((turn) => `${labelForRole(turn.role)}: ${turn.text}`)
    .join("\n");
}