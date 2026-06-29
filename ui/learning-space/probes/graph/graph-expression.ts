"use client";

import type {
  ProbeGraphFunctionDraft,
  ProbeGraphModeDraft,
  ProbeGraphParameterDraft,
  ProbeGraphPoint3DDraft,
  ProbeGraphPointDraft,
  ProbeGraphView3DDraft,
  ProbeGraphWindow3DDraft,
  ProbeGraphWindowDraft,
} from "../probe-ui-types";
import {
  DEFAULT_FUNCTIONS,
  DEFAULT_PARAMETERS,
  DEFAULT_VIEW_3D,
  DEFAULT_WINDOW_2D,
  DEFAULT_WINDOW_3D,
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  SAMPLE_COUNT_2D,
  type GraphExpressionStatus,
  type GraphVariables,
} from "./graph-types";

type ParseResult = {
  value: number;
  index: number;
};

type Token = {
  type: "number" | "name" | "operator" | "open" | "close";
  value: string;
};

const FUNCTION_NAMES = new Set([
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "abs",
  "sqrt",
  "cbrt",
  "ln",
  "log",
  "exp",
  "floor",
  "ceil",
  "round",
]);

const CONSTANT_NAMES = new Set(["pi", "e"]);
const SINGLE_VARIABLE_NAMES = new Set(["x", "y", "a", "b", "c"]);

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function roundForStorage(value: number, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "?";
  const fixed = value.toFixed(digits);
  return fixed.replace(/\.00$/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function normalizeWindow2D(inputWindow?: ProbeGraphWindowDraft): ProbeGraphWindowDraft {
  const rawXMin = Number.isFinite(inputWindow?.xMin)
    ? inputWindow!.xMin
    : DEFAULT_WINDOW_2D.xMin;
  const rawXMax = Number.isFinite(inputWindow?.xMax)
    ? inputWindow!.xMax
    : DEFAULT_WINDOW_2D.xMax;
  const rawYMin = Number.isFinite(inputWindow?.yMin)
    ? inputWindow!.yMin
    : DEFAULT_WINDOW_2D.yMin;
  const rawYMax = Number.isFinite(inputWindow?.yMax)
    ? inputWindow!.yMax
    : DEFAULT_WINDOW_2D.yMax;

  const xMin = Math.min(rawXMin, rawXMax - 0.01);
  const xMax = Math.max(rawXMax, rawXMin + 0.01);
  const yMin = Math.min(rawYMin, rawYMax - 0.01);
  const yMax = Math.max(rawYMax, rawYMin + 0.01);

  return { xMin, xMax, yMin, yMax };
}

export function normalizeWindow3D(inputWindow?: ProbeGraphWindow3DDraft): ProbeGraphWindow3DDraft {
  const rawXMin = Number.isFinite(inputWindow?.xMin)
    ? inputWindow!.xMin
    : DEFAULT_WINDOW_3D.xMin;
  const rawXMax = Number.isFinite(inputWindow?.xMax)
    ? inputWindow!.xMax
    : DEFAULT_WINDOW_3D.xMax;
  const rawYMin = Number.isFinite(inputWindow?.yMin)
    ? inputWindow!.yMin
    : DEFAULT_WINDOW_3D.yMin;
  const rawYMax = Number.isFinite(inputWindow?.yMax)
    ? inputWindow!.yMax
    : DEFAULT_WINDOW_3D.yMax;
  const rawZMin = Number.isFinite(inputWindow?.zMin)
    ? inputWindow!.zMin
    : DEFAULT_WINDOW_3D.zMin;
  const rawZMax = Number.isFinite(inputWindow?.zMax)
    ? inputWindow!.zMax
    : DEFAULT_WINDOW_3D.zMax;

  return {
    xMin: Math.min(rawXMin, rawXMax - 0.01),
    xMax: Math.max(rawXMax, rawXMin + 0.01),
    yMin: Math.min(rawYMin, rawYMax - 0.01),
    yMax: Math.max(rawYMax, rawYMin + 0.01),
    zMin: Math.min(rawZMin, rawZMax - 0.01),
    zMax: Math.max(rawZMax, rawZMin + 0.01),
  };
}

export function normalizeView3D(view?: ProbeGraphView3DDraft): ProbeGraphView3DDraft {
  return {
    yaw: Number.isFinite(view?.yaw) ? view!.yaw : DEFAULT_VIEW_3D.yaw,
    pitch: Number.isFinite(view?.pitch)
      ? clamp(view!.pitch, -78, 78)
      : DEFAULT_VIEW_3D.pitch,
    zoom: Number.isFinite(view?.zoom)
      ? clamp(view!.zoom, 0.55, 1.85)
      : DEFAULT_VIEW_3D.zoom,
  };
}

export function normalizeFunctions(
  functions?: ProbeGraphFunctionDraft[],
): ProbeGraphFunctionDraft[] {
  if (!functions?.length) return DEFAULT_FUNCTIONS.map((fn) => ({ ...fn }));

  return functions.map((fn, index) => ({
    id: fn.id || `f${index + 1}`,
    label: fn.label || `f${index + 1}(x)`,
    expression: fn.expression || "x",
    enabled: fn.enabled !== false,
  }));
}

export function normalizeParameters(
  parameters?: ProbeGraphParameterDraft[],
): ProbeGraphParameterDraft[] {
  if (!parameters?.length) {
    return DEFAULT_PARAMETERS.map((parameter) => ({ ...parameter }));
  }

  const seen = new Set<string>();

  const normalizedParameters: ProbeGraphParameterDraft[] = parameters
    .filter((parameter) => /^[a-z]$/i.test(parameter.name.trim()))
    .map((parameter): ProbeGraphParameterDraft => {
      const name = parameter.name.trim().toLowerCase();
      seen.add(name);

      const min = Number.isFinite(parameter.min) ? parameter.min! : -10;
      const max = Number.isFinite(parameter.max) ? parameter.max! : 10;
      const safeMin = Math.min(min, max - 0.01);
      const safeMax = Math.max(max, min + 0.01);
      const step = Number.isFinite(parameter.step) ? parameter.step! : 0.01;
      const rawValue = Number.isFinite(parameter.value) ? parameter.value : 0;

      return {
        name,
        value: clamp(rawValue, safeMin, safeMax),
        min: safeMin,
        max: safeMax,
        step,
      };
    });

  const missingDefaultParameters: ProbeGraphParameterDraft[] =
    DEFAULT_PARAMETERS.filter((parameter) => !seen.has(parameter.name)).map(
      (parameter) => ({ ...parameter }),
    );

  return [...normalizedParameters, ...missingDefaultParameters];
}

export function parametersToVariables(parameters: ProbeGraphParameterDraft[]): GraphVariables {
  return Object.fromEntries(
    parameters.map((parameter) => [parameter.name, parameter.value]),
  );
}

function rawTokenize(expression: string): Token[] {
  const source = expression
    .replaceAll("π", "pi")
    .replaceAll("−", "-")
    .replace(/\s+/g, "")
    .toLowerCase();

  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const rest = source.slice(index);
    const number = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(rest);
    if (number?.[0]) {
      tokens.push({ type: "number", value: number[0] });
      index += number[0].length;
      continue;
    }

    const name = /^[a-z]+/i.exec(rest);
    if (name?.[0]) {
      const value = name[0].toLowerCase();

      if (
        value.length > 1 &&
        !FUNCTION_NAMES.has(value) &&
        !CONSTANT_NAMES.has(value) &&
        [...value].every((letter) => SINGLE_VARIABLE_NAMES.has(letter))
      ) {
        for (const letter of value) {
          tokens.push({ type: "name", value: letter });
        }
      } else {
        tokens.push({ type: "name", value });
      }

      index += name[0].length;
      continue;
    }

    const char = source[index];
    if (char === "(") tokens.push({ type: "open", value: char });
    else if (char === ")") tokens.push({ type: "close", value: char });
    else if ("+-*/^".includes(char)) tokens.push({ type: "operator", value: char });
    else tokens.push({ type: "operator", value: char });

    index += 1;
  }

  return tokens;
}

function isValueEnd(token: Token) {
  if (token.type === "number" || token.type === "close") return true;
  if (token.type !== "name") return false;
  return SINGLE_VARIABLE_NAMES.has(token.value) || CONSTANT_NAMES.has(token.value);
}

function isValueStart(token: Token) {
  return token.type === "number" || token.type === "open" || token.type === "name";
}

export function preprocessExpression(expression: string) {
  const tokens = rawTokenize(expression);
  let source = "";

  tokens.forEach((token, index) => {
    const previous = tokens[index - 1];

    if (previous && isValueEnd(previous) && isValueStart(token)) {
      const isFunctionCall = previous.type === "name" && FUNCTION_NAMES.has(previous.value) && token.type === "open";
      if (!isFunctionCall) source += "*";
    }

    source += token.value;
  });

  return source;
}

function skipSpaces(source: string, index: number) {
  let next = index;
  while (source[next] === " ") next += 1;
  return next;
}

function parseNumber(source: string, index: number): ParseResult | null {
  const match = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(source.slice(index));
  if (!match) return null;

  return {
    value: Number(match[0]),
    index: index + match[0].length,
  };
}

function parseName(source: string, index: number) {
  const match = /^[a-z]+/i.exec(source.slice(index));
  if (!match) return null;

  return {
    name: match[0].toLowerCase(),
    index: index + match[0].length,
  };
}

function applyFunction(name: string, value: number) {
  switch (name) {
    case "sin":
      return Math.sin(value);
    case "cos":
      return Math.cos(value);
    case "tan":
      return Math.tan(value);
    case "asin":
      return Math.asin(value);
    case "acos":
      return Math.acos(value);
    case "atan":
      return Math.atan(value);
    case "sinh":
      return Math.sinh(value);
    case "cosh":
      return Math.cosh(value);
    case "tanh":
      return Math.tanh(value);
    case "abs":
      return Math.abs(value);
    case "sqrt":
      return value >= 0 ? Math.sqrt(value) : Number.NaN;
    case "cbrt":
      return Math.cbrt(value);
    case "ln":
      return value > 0 ? Math.log(value) : Number.NaN;
    case "log":
      return value > 0 ? Math.log10(value) : Number.NaN;
    case "exp":
      return Math.exp(value);
    case "floor":
      return Math.floor(value);
    case "ceil":
      return Math.ceil(value);
    case "round":
      return Math.round(value);
    default:
      return Number.NaN;
  }
}

export function evaluateExpression(expression: string, variables: GraphVariables): number | null {
  const source = preprocessExpression(expression);

  function parseExpression(index: number): ParseResult {
    let left = parseTerm(index);
    let next = skipSpaces(source, left.index);

    while (source[next] === "+" || source[next] === "-") {
      const operator = source[next];
      const right = parseTerm(next + 1);
      left = {
        value: operator === "+" ? left.value + right.value : left.value - right.value,
        index: right.index,
      };
      next = skipSpaces(source, left.index);
    }

    return left;
  }

  function parseTerm(index: number): ParseResult {
    let left = parsePower(index);
    let next = skipSpaces(source, left.index);

    while (source[next] === "*" || source[next] === "/") {
      const operator = source[next];
      const right = parsePower(next + 1);
      left = {
        value: operator === "*" ? left.value * right.value : left.value / right.value,
        index: right.index,
      };
      next = skipSpaces(source, left.index);
    }

    return left;
  }

  function parsePower(index: number): ParseResult {
    let left = parseUnary(index);
    let next = skipSpaces(source, left.index);

    while (source[next] === "^") {
      const right = parseUnary(next + 1);
      left = {
        value: Math.pow(left.value, right.value),
        index: right.index,
      };
      next = skipSpaces(source, left.index);
    }

    return left;
  }

  function parseUnary(index: number): ParseResult {
    const next = skipSpaces(source, index);

    if (source[next] === "+") return parseUnary(next + 1);
    if (source[next] === "-") {
      const parsed = parseUnary(next + 1);
      return { value: -parsed.value, index: parsed.index };
    }

    return parsePrimary(next);
  }

  function parsePrimary(index: number): ParseResult {
    const next = skipSpaces(source, index);

    if (source[next] === "(") {
      const parsed = parseExpression(next + 1);
      const closeIndex = skipSpaces(source, parsed.index);
      if (source[closeIndex] !== ")") throw new Error("Missing closing parenthesis");
      return { value: parsed.value, index: closeIndex + 1 };
    }

    const number = parseNumber(source, next);
    if (number) return number;

    const name = parseName(source, next);
    if (!name) throw new Error("Expected number, variable, function, or parenthesis");

    if (name.name === "pi") return { value: Math.PI, index: name.index };
    if (name.name === "e") return { value: Math.E, index: name.index };
    if (typeof variables[name.name] === "number") {
      return { value: variables[name.name], index: name.index };
    }

    const afterName = skipSpaces(source, name.index);
    if (source[afterName] !== "(") {
      throw new Error("Functions need parentheses, like sin(x)");
    }

    const argument = parseExpression(afterName + 1);
    const closeIndex = skipSpaces(source, argument.index);
    if (source[closeIndex] !== ")") throw new Error("Missing function close");

    return {
      value: applyFunction(name.name, argument.value),
      index: closeIndex + 1,
    };
  }

  try {
    const parsed = parseExpression(0);
    const end = skipSpaces(source, parsed.index);

    if (end !== source.length || !Number.isFinite(parsed.value)) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

export function getExpressionStatus(args: {
  expression: string;
  variables: GraphVariables;
  mode: ProbeGraphModeDraft;
}): GraphExpressionStatus {
  const value =
    args.mode === "3d"
      ? evaluateExpression(args.expression, { ...args.variables, x: 0, y: 0 })
      : evaluateExpression(args.expression, { ...args.variables, x: 0 });

  if (value === null) {
    return {
      isValid: false,
      message: "Not graphing yet. Try x^2, 2x+1, sin(x), or a*x^2 + b*x + c.",
    };
  }

  return {
    isValid: true,
    message: "Graphing",
  };
}

export function xToScreen(x: number, graphWindow: ProbeGraphWindowDraft) {
  return ((x - graphWindow.xMin) / (graphWindow.xMax - graphWindow.xMin)) * GRAPH_WIDTH;
}

export function yToScreen(y: number, graphWindow: ProbeGraphWindowDraft) {
  return GRAPH_HEIGHT - ((y - graphWindow.yMin) / (graphWindow.yMax - graphWindow.yMin)) * GRAPH_HEIGHT;
}

export function screenToX(screenX: number, graphWindow: ProbeGraphWindowDraft) {
  return graphWindow.xMin + (screenX / GRAPH_WIDTH) * (graphWindow.xMax - graphWindow.xMin);
}

export function screenToY(screenY: number, graphWindow: ProbeGraphWindowDraft) {
  return graphWindow.yMax - (screenY / GRAPH_HEIGHT) * (graphWindow.yMax - graphWindow.yMin);
}

export function buildPath(expression: string, graphWindow: ProbeGraphWindowDraft, variables: GraphVariables) {
  let path = "";
  let isDrawing = false;

  for (let index = 0; index <= SAMPLE_COUNT_2D; index += 1) {
    const x =
      graphWindow.xMin +
      ((graphWindow.xMax - graphWindow.xMin) * index) / SAMPLE_COUNT_2D;
    const y = evaluateExpression(expression, { ...variables, x });

    if (y === null || y < graphWindow.yMin - 20 || y > graphWindow.yMax + 20) {
      isDrawing = false;
      continue;
    }

    const px = xToScreen(x, graphWindow);
    const py = yToScreen(y, graphWindow);

    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      isDrawing = false;
      continue;
    }

    path += `${isDrawing ? "L" : "M"}${px.toFixed(2)} ${py.toFixed(2)} `;
    isDrawing = true;
  }

  return path.trim();
}

export function formatPoint(point: ProbeGraphPointDraft | null | undefined) {
  if (!point) return "No point selected";
  return `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`;
}

export function formatPoint3D(point: ProbeGraphPoint3DDraft | null | undefined) {
  if (!point) return "No point selected";
  return `(${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`;
}

export function buildGraphFeatures(args: {
  mode: ProbeGraphModeDraft;
  functions: ProbeGraphFunctionDraft[];
  parameters: ProbeGraphParameterDraft[];
  graphWindow: ProbeGraphWindowDraft;
  surfaceExpression: string;
  graph3DWindow: ProbeGraphWindow3DDraft;
  graph3DView: ProbeGraphView3DDraft;
  selectedPoint: ProbeGraphPointDraft | null;
  selectedPoint3D: ProbeGraphPoint3DDraft | null;
  notes: string;
}) {
  const parametersLine = args.parameters.length
    ? `parameters: ${args.parameters
        .map((parameter) => `${parameter.name}=${formatNumber(parameter.value, 2)}`)
        .join(", ")}`
    : null;

  const noteLines = args.notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (args.mode === "3d") {
    return [
      "graph mode: 3d surface",
      `surface: z = ${args.surfaceExpression}`,
      parametersLine,
      `window: x ${args.graph3DWindow.xMin} to ${args.graph3DWindow.xMax}, y ${args.graph3DWindow.yMin} to ${args.graph3DWindow.yMax}, z ${args.graph3DWindow.zMin} to ${args.graph3DWindow.zMax}`,
      `view preset: yaw ${formatNumber(args.graph3DView.yaw, 0)}, pitch ${formatNumber(args.graph3DView.pitch, 0)}, zoom ${formatNumber(args.graph3DView.zoom, 2)}`,
      args.selectedPoint3D ? `selected 3d point: ${formatPoint3D(args.selectedPoint3D)}` : null,
      ...noteLines,
    ].filter(Boolean) as string[];
  }

  const functionLines = args.functions
    .filter((fn) => fn.enabled !== false && fn.expression.trim())
    .map((fn) => `${fn.label ?? "f(x)"} = ${fn.expression.trim()}`);

  return [
    "graph mode: 2d function",
    ...functionLines,
    parametersLine,
    `window: x ${args.graphWindow.xMin} to ${args.graphWindow.xMax}, y ${args.graphWindow.yMin} to ${args.graphWindow.yMax}`,
    args.selectedPoint ? `selected point: ${formatPoint(args.selectedPoint)}` : null,
    ...noteLines,
  ].filter(Boolean) as string[];
}
