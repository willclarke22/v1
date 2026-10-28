/** V3.7C.3: Accept a single COMPLETE markdown-fenced JSON object, but never embedded prose.
 * The schema validators remain the authority. No JSON repair or lenient field coercion.
 */
export function parseModelJson(raw: string): unknown {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  return JSON.parse(match ? match[1].trim() : trimmed) as unknown;
}
