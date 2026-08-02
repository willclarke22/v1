import type {
  AssetDesignBriefV2,
} from "./asset-design-brief";
import {
  FOUNDRY_HELPER_CONTRACT,
  type FoundryHelperContractEntry,
} from "./blender-helper-contract";
import {
  normalizeSemanticPartName,
} from "./semantic-name";

export const FOUNDRY_PREFLIGHT_VERSION =
  "myway_blender_python_preflight_v1" as const;

export type BlenderPythonPreflightIssue = {
  severity: "error" | "warning";
  code: string;
  line: number | null;
  helper: string | null;
  message: string;
};

export type BlenderPythonPreflightResult = {
  schema_version:
    typeof FOUNDRY_PREFLIGHT_VERSION;
  valid: boolean;
  errors: BlenderPythonPreflightIssue[];
  warnings: BlenderPythonPreflightIssue[];
  calls_checked: number;
  approved_material_slot_ids: string[];
  required_part_ids: string[];
};

type ParsedCall = {
  helper: string;
  start: number;
  end: number;
  line: number;
  args: string[];
  positional: string[];
  named: Map<string, string>;
  assigned_variable: string | null;
};

function lineNumberAt(
  source: string,
  index: number,
) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === "\n") line += 1;
  }
  return line;
}

function isIdentifierStart(
  value: string,
) {
  return /[A-Za-z_]/.test(value);
}

function isIdentifierPart(
  value: string,
) {
  return /[A-Za-z0-9_]/.test(value);
}

function skipPythonString(
  source: string,
  start: number,
) {
  let cursor = start;
  let quote = source[cursor];
  if (
    (source.slice(cursor, cursor + 3) === "'''" ||
      source.slice(cursor, cursor + 3) === '\"\"\"')
  ) {
    quote = source.slice(cursor, cursor + 3);
    cursor += 3;
  } else {
    cursor += 1;
  }

  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (source.slice(cursor, cursor + quote.length) === quote) {
      return cursor + quote.length;
    }
    cursor += 1;
  }
  return source.length;
}

function findClosingParen(
  source: string,
  openIndex: number,
) {
  let depth = 0;
  for (let cursor = openIndex; cursor < source.length; cursor += 1) {
    const char = source[cursor] ?? "";
    if (char === "#") {
      const newline = source.indexOf("\n", cursor);
      if (newline < 0) return -1;
      cursor = newline;
      continue;
    }
    if (char === "'" || char === '"') {
      cursor = skipPythonString(source, cursor) - 1;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function splitTopLevelArguments(
  source: string,
) {
  const args: string[] = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;

  for (let cursor = 0; cursor < source.length; cursor += 1) {
    const char = source[cursor] ?? "";
    if (char === "#") {
      const newline = source.indexOf("\n", cursor);
      cursor = newline < 0 ? source.length : newline;
      continue;
    }
    if (char === "'" || char === '"') {
      cursor = skipPythonString(source, cursor) - 1;
      continue;
    }
    if (char === "(") round += 1;
    if (char === ")") round -= 1;
    if (char === "[") square += 1;
    if (char === "]") square -= 1;
    if (char === "{") curly += 1;
    if (char === "}") curly -= 1;
    if (
      char === "," &&
      round === 0 &&
      square === 0 &&
      curly === 0
    ) {
      const value = source.slice(start, cursor).trim();
      if (value) args.push(value);
      start = cursor + 1;
    }
  }

  const finalValue = source.slice(start).trim();
  if (finalValue) args.push(finalValue);
  return args;
}

function topLevelKeyword(
  value: string,
) {
  let round = 0;
  let square = 0;
  let curly = 0;
  for (let cursor = 0; cursor < value.length; cursor += 1) {
    const char = value[cursor] ?? "";
    if (char === "'" || char === '"') {
      cursor = skipPythonString(value, cursor) - 1;
      continue;
    }
    if (char === "(") round += 1;
    if (char === ")") round -= 1;
    if (char === "[") square += 1;
    if (char === "]") square -= 1;
    if (char === "{") curly += 1;
    if (char === "}") curly -= 1;
    if (
      char === "=" &&
      round === 0 &&
      square === 0 &&
      curly === 0 &&
      value[cursor - 1] !== "=" &&
      value[cursor + 1] !== "="
    ) {
      const name = value.slice(0, cursor).trim();
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        return {
          name,
          value: value.slice(cursor + 1).trim(),
        };
      }
    }
  }
  return null;
}

function assignedVariableBefore(
  source: string,
  callStart: number,
) {
  const lineStart = source.lastIndexOf("\n", callStart - 1) + 1;
  const prefix = source.slice(lineStart, callStart);
  return prefix.match(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*$/)?.[1] ?? null;
}

function parseMyWayCalls(
  source: string,
) {
  const calls: ParsedCall[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const char = source[cursor] ?? "";
    if (char === "#") {
      const newline = source.indexOf("\n", cursor);
      cursor = newline < 0 ? source.length : newline + 1;
      continue;
    }
    if (char === "'" || char === '"') {
      cursor = skipPythonString(source, cursor);
      continue;
    }
    if (!isIdentifierStart(char)) {
      cursor += 1;
      continue;
    }

    const start = cursor;
    cursor += 1;
    while (
      cursor < source.length &&
      isIdentifierPart(source[cursor] ?? "")
    ) {
      cursor += 1;
    }
    const identifier = source.slice(start, cursor);
    if (!identifier.startsWith("myway_")) continue;

    let open = cursor;
    while (/\s/.test(source[open] ?? "")) open += 1;
    if (source[open] !== "(") continue;

    const lineStart = source.lastIndexOf("\n", start - 1) + 1;
    const prefix = source.slice(lineStart, start);
    if (/\bdef\s+$/.test(prefix)) continue;

    const close = findClosingParen(source, open);
    if (close < 0) break;
    const args = splitTopLevelArguments(source.slice(open + 1, close));
    const positional: string[] = [];
    const named = new Map<string, string>();
    for (const arg of args) {
      const keyword = topLevelKeyword(arg);
      if (keyword) named.set(keyword.name, keyword.value);
      else positional.push(arg);
    }
    calls.push({
      helper: identifier,
      start,
      end: close + 1,
      line: lineNumberAt(source, start),
      args,
      positional,
      named,
      assigned_variable: assignedVariableBefore(source, start),
    });
    cursor = close + 1;
  }

  return calls;
}

function stringLiteralValue(
  expression: string | undefined,
) {
  if (!expression) return null;
  const trimmed = expression.trim();
  const match = trimmed.match(/^(?:[rubfRUBF]*)(["'])([\s\S]*)\1$/);
  if (!match || /^[fF]/.test(trimmed)) return null;
  return match[2] ?? null;
}

function plausibleNameExpression(
  expression: string | undefined,
) {
  if (!expression) return false;
  const trimmed = expression.trim();
  if (/^(?:[rubRUB]*)(["'])/.test(trimmed)) return true;
  if (/^[fF](["'])/.test(trimmed)) return true;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    return /(?:name|id|label)$/i.test(trimmed) || trimmed === "name";
  }
  if (/\.(?:name|part_id|object_name)$/i.test(trimmed)) return true;
  if (/\[\s*["'][^"']*(?:name|id|label)[^"']*["']\s*\]$/i.test(trimmed)) return true;
  return false;
}

function helperArgumentExpression(
  call: ParsedCall,
  contract: FoundryHelperContractEntry,
  parameter: string,
) {
  const named = call.named.get(parameter);
  if (named != null) return named;
  const index = contract.positional.indexOf(parameter);
  return index >= 0 ? call.positional[index] : undefined;
}

function numericLiteral(
  expression: string | undefined,
) {
  if (!expression) return null;
  const cleaned = expression.trim().replace(/_/g, "");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function issue(
  severity: "error" | "warning",
  code: string,
  message: string,
  call?: ParsedCall,
): BlenderPythonPreflightIssue {
  return {
    severity,
    code,
    line: call?.line ?? null,
    helper: call?.helper ?? null,
    message,
  };
}

function validateHelperCall(
  call: ParsedCall,
) {
  const issues: BlenderPythonPreflightIssue[] = [];
  const contract = FOUNDRY_HELPER_CONTRACT[call.helper];
  if (!contract) {
    issues.push(
      issue(
        "error",
        "unknown_helper",
        `${call.helper} is not part of the trusted MyWay helper contract.`,
        call,
      ),
    );
    return issues;
  }

  if (call.positional.length > contract.positional.length) {
    issues.push(
      issue(
        "error",
        "too_many_positional_arguments",
        `${call.helper} received ${call.positional.length} positional arguments, but its signature is ${contract.signature}.`,
        call,
      ),
    );
  }

  for (const keyword of call.named.keys()) {
    if (!contract.keywords.includes(keyword)) {
      issues.push(
        issue(
          "error",
          "unexpected_keyword_argument",
          `${call.helper} does not accept keyword ${keyword}. Use ${contract.signature}.`,
          call,
        ),
      );
    }
  }

  const assigned = new Set<string>();
  call.positional.forEach((_, index) => {
    const parameter = contract.positional[index];
    if (parameter) assigned.add(parameter);
  });
  for (const keyword of call.named.keys()) assigned.add(keyword);
  for (const required of contract.required) {
    if (!assigned.has(required)) {
      issues.push(
        issue(
          "error",
          "missing_required_argument",
          `${call.helper} is missing required argument ${required}. Use ${contract.signature}.`,
          call,
        ),
      );
    }
  }

  for (let index = 0; index < call.positional.length; index += 1) {
    const parameter = contract.positional[index];
    if (parameter && call.named.has(parameter)) {
      issues.push(
        issue(
          "error",
          "duplicate_argument",
          `${call.helper} supplies ${parameter} both positionally and by keyword.`,
          call,
        ),
      );
    }
  }

  if (contract.name_first) {
    const nameExpression = helperArgumentExpression(call, contract, "name");
    if (!plausibleNameExpression(nameExpression)) {
      issues.push(
        issue(
          "error",
          "constructor_name_missing_or_misplaced",
          `${call.helper}'s first argument must be an object-name string or a name variable. Use ${contract.signature}.`,
          call,
        ),
      );
    }
  }

  if (call.helper === "myway_print_progress") {
    const expression = helperArgumentExpression(call, contract, "message");
    if (/MYWAY_PROGRESS\s*:/i.test(expression ?? "")) {
      issues.push(
        issue(
          "warning",
          "duplicate_progress_prefix",
          "myway_print_progress already adds MYWAY_PROGRESS:. Pass only the human-readable message.",
          call,
        ),
      );
    }
  }

  return issues;
}

function exactStringArguments(
  calls: ParsedCall[],
  helper: string,
  parameter: string,
) {
  const values: Array<{ value: string; call: ParsedCall }> = [];
  const contract = FOUNDRY_HELPER_CONTRACT[helper];
  if (!contract) return values;
  for (const call of calls) {
    if (call.helper !== helper) continue;
    const value = stringLiteralValue(
      helperArgumentExpression(call, contract, parameter),
    );
    if (value != null) values.push({ value, call });
  }
  return values;
}

function validateMaterialSlots(
  calls: ParsedCall[],
  brief: AssetDesignBriefV2,
) {
  const issues: BlenderPythonPreflightIssue[] = [];
  const approved = new Set(
    brief.material_slots.map((slot) => slot.slot_id),
  );
  const references = [
    ...exactStringArguments(calls, "myway_material_slot", "slot_id"),
    ...exactStringArguments(calls, "myway_assign_material_slot", "slot_id"),
  ];
  const used = new Set(references.map((item) => item.value));

  for (const reference of references) {
    if (!approved.has(reference.value)) {
      issues.push(
        issue(
          "error",
          "unapproved_material_slot",
          `Material slot ${reference.value} is not in the approved design brief. Approved ids: ${Array.from(approved).join(", ") || "none"}.`,
          reference.call,
        ),
      );
    }
  }

  for (const slot of approved) {
    if (!used.has(slot)) {
      issues.push(
        issue(
          "warning",
          "approved_material_slot_not_referenced",
          `Approved material slot ${slot} is never referenced by myway_material_slot or myway_assign_material_slot.`,
        ),
      );
    }
  }
  return issues;
}

function validateRequiredPartIds(
  code: string,
  brief: AssetDesignBriefV2,
) {
  const issues: BlenderPythonPreflightIssue[] = [];
  const stringLiterals =
    Array.from(
      code.matchAll(
        /(?:[rubRUB]*)(["'])([^"'\n]+)\1/g,
      ),
    ).map((match) =>
      normalizeSemanticPartName(
        match[2] ?? "",
      ),
    );
  const declared =
    new Set(
      stringLiterals.filter(Boolean),
    );

  for (const part of brief.parts.filter((item) => item.required)) {
    if (
      !declared.has(
        normalizeSemanticPartName(
          part.part_id,
        ),
      )
    ) {
      issues.push(
        issue(
          "error",
          "required_part_id_not_declared",
          `Required part id ${part.part_id} does not appear as a semantically equivalent object-name string in the script.`,
        ),
      );
    }
  }
  return issues;
}

function validateTargetExtent(
  calls: ParsedCall[],
  brief: AssetDesignBriefV2,
) {
  const issues: BlenderPythonPreflightIssue[] = [];
  const contract = FOUNDRY_HELPER_CONTRACT.myway_normalize_extent;
  for (const call of calls) {
    if (call.helper !== "myway_normalize_extent") continue;
    const literal = numericLiteral(
      helperArgumentExpression(call, contract, "target_extent"),
    );
    if (
      literal != null &&
      Math.abs(literal - brief.target_extent_m) > 0.0001
    ) {
      issues.push(
        issue(
          "error",
          "hardcoded_target_extent_mismatch",
          `myway_normalize_extent uses ${literal}, but the approved target_extent_m is ${brief.target_extent_m}.`,
          call,
        ),
      );
    }
  }
  return issues;
}

function validateTorusOrientationHeuristics(
  code: string,
  calls: ParsedCall[],
) {
  const issues: BlenderPythonPreflightIssue[] = [];
  for (const call of calls) {
    if (call.helper !== "myway_torus" || !call.assigned_variable) continue;
    const after = code.slice(call.end, call.end + 700);
    const variable = call.assigned_variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const suspicious = new RegExp(
      `${variable}\\.rotation_euler\\s*=\\s*\\(\\s*math\\.radians\\(\\s*90(?:\\.0)?\\s*\\)\\s*,\\s*0(?:\\.0)?\\s*,\\s*0(?:\\.0)?\\s*\\)`,
    );
    if (suspicious.test(after)) {
      issues.push(
        issue(
          "warning",
          "torus_x_rotation_orientation_check",
          `${call.assigned_variable} rotates a default XY-plane torus around X, producing a Y-axis normal. For a conventional wheelchair wheel with an X-axis axle, rotate around Y instead and keep spokes in the YZ plane.`,
          call,
        ),
      );
    }
  }
  return issues;
}

export function validateBlenderPythonPreflight(
  code: string,
  options: {
    designBrief?: AssetDesignBriefV2 | null;
    enforceDesignBrief?: boolean;
  } = {},
): BlenderPythonPreflightResult {
  const calls = parseMyWayCalls(code);
  const issues: BlenderPythonPreflightIssue[] = [];

  for (const call of calls) {
    issues.push(...validateHelperCall(call));
  }
  issues.push(...validateTorusOrientationHeuristics(code, calls));

  const brief = options.designBrief ?? null;
  if (brief && options.enforceDesignBrief !== false) {
    issues.push(...validateMaterialSlots(calls, brief));
    issues.push(...validateRequiredPartIds(code, brief));
    issues.push(...validateTargetExtent(calls, brief));
  }

  const deduplicated = Array.from(
    new Map(
      issues.map((item) => [
        `${item.severity}:${item.code}:${item.line}:${item.helper}:${item.message}`,
        item,
      ]),
    ).values(),
  );
  const errors = deduplicated.filter((item) => item.severity === "error");
  const warnings = deduplicated.filter((item) => item.severity === "warning");

  return {
    schema_version: FOUNDRY_PREFLIGHT_VERSION,
    valid: errors.length === 0,
    errors,
    warnings,
    calls_checked: calls.length,
    approved_material_slot_ids:
      brief?.material_slots.map((slot) => slot.slot_id) ?? [],
    required_part_ids:
      brief?.parts.filter((part) => part.required).map((part) => part.part_id) ?? [],
  };
}

export function formatBlenderPythonPreflightFailure(
  result: BlenderPythonPreflightResult,
) {
  const lines = result.errors.map((item, index) => {
    const location = item.line != null ? ` line ${item.line}` : "";
    return `${index + 1}. [${item.code}]${location}: ${item.message}`;
  });
  return `MyWay Blender Python preflight found ${result.errors.length} error(s) before Blender launch:\n${lines.join("\n")}`;
}
