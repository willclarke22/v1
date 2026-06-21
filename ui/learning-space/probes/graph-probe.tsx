"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { TrackballControls } from "@react-three/drei";
import * as THREE from "three";
import { ProbeShell } from "./probe-shell";
import type {
  GenericProbeComponentProps,
  ProbeGraphFunctionDraft,
  ProbeGraphModeDraft,
  ProbeGraphParameterDraft,
  ProbeGraphPointDraft,
  ProbeGraphPoint3DDraft,
  ProbeGraphView3DDraft,
  ProbeGraphWindow3DDraft,
  ProbeGraphWindowDraft,
} from "./probe-ui-types";

const DEFAULT_WINDOW_2D: ProbeGraphWindowDraft = {
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10,
};

const DEFAULT_WINDOW_3D: ProbeGraphWindow3DDraft = {
  xMin: -5,
  xMax: 5,
  yMin: -5,
  yMax: 5,
  zMin: -6,
  zMax: 12,
};

const DEFAULT_VIEW_3D: ProbeGraphView3DDraft = {
  yaw: 42,
  pitch: 28,
  zoom: 1,
};

const DEFAULT_FUNCTIONS: ProbeGraphFunctionDraft[] = [
  { id: "f1", label: "f(x)", expression: "x", enabled: true },
];

const DEFAULT_PARAMETERS: ProbeGraphParameterDraft[] = [
  { name: "a", value: 1, min: -5, max: 5, step: 0.01 },
  { name: "b", value: 0, min: -5, max: 5, step: 0.01 },
  { name: "c", value: 0, min: -10, max: 10, step: 0.01 },
];

const DEFAULT_SURFACE_EXPRESSION = "a*x^2 + b*y^2 + c";

const GRAPH_WIDTH = 760;
const GRAPH_HEIGHT = 430;
const SAMPLE_COUNT_2D = 260;
const SURFACE_RESOLUTION = 44;
const SCENE_X_SIZE = 7.5;
const SCENE_Y_SIZE = 4.5;
const SCENE_Z_SIZE = 7.5;

type ParseResult = {
  value: number;
  index: number;
};

type Variables = Record<string, number>;

type SurfaceGeometryData = {
  meshGeometry: THREE.BufferGeometry;
  wireGeometry: THREE.BufferGeometry;
  validSampleCount: number;
  totalSampleCount: number;
};

type ExpressionStatus = {
  isValid: boolean;
  message: string;
};

type ViewPreset = {
  id: string;
  label: string;
  view: ProbeGraphView3DDraft;
};

const VIEW_PRESETS: ViewPreset[] = [
  { id: "home", label: "Home", view: { yaw: 42, pitch: 28, zoom: 1 } },
  { id: "top", label: "Top", view: { yaw: 0, pitch: 74, zoom: 1.05 } },
  { id: "front", label: "Front", view: { yaw: 0, pitch: 5, zoom: 1.05 } },
  { id: "side", label: "Side", view: { yaw: 90, pitch: 8, zoom: 1.05 } },
];

const FUNCTION_EXAMPLES = [
  { label: "line", expression: "a*x + c" },
  { label: "quadratic", expression: "a*x^2 + b*x + c" },
  { label: "sine", expression: "a*sin(b*x) + c" },
  { label: "root", expression: "sqrt(x)" },
  { label: "reciprocal", expression: "1/x" },
];

const SURFACE_EXAMPLES = [
  { label: "bowl", expression: "a*x^2 + b*y^2 + c" },
  { label: "saddle", expression: "a*x^2 - b*y^2 + c" },
  { label: "wave", expression: "a*sin(x) + b*cos(y) + c" },
  { label: "ridge", expression: "a*x*y + c" },
  { label: "cone", expression: "a*sqrt(x^2 + y^2) + c" },
];

const QUICK_INSERTS_2D = ["x", "x^2", "sin(x)", "cos(x)", "sqrt(x)", "abs(x)", "ln(x)", "pi"];
const QUICK_INSERTS_3D = ["x", "y", "x^2", "y^2", "sin(x)", "cos(y)", "sqrt(x^2+y^2)", "a", "b", "c"];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundForStorage(value: number, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "?";
  const fixed = value.toFixed(digits);
  return fixed.replace(/\.00$/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function normalizeWindow2D(inputWindow?: ProbeGraphWindowDraft): ProbeGraphWindowDraft {
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

function normalizeWindow3D(inputWindow?: ProbeGraphWindow3DDraft): ProbeGraphWindow3DDraft {
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

function normalizeView3D(view?: ProbeGraphView3DDraft): ProbeGraphView3DDraft {
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

function normalizeFunctions(
  functions?: ProbeGraphFunctionDraft[],
): ProbeGraphFunctionDraft[] {
  if (!functions?.length) return DEFAULT_FUNCTIONS;

  return functions.map((fn, index) => ({
    id: fn.id || `f${index + 1}`,
    label: fn.label || `f${index + 1}(x)`,
    expression: fn.expression || "x",
    enabled: fn.enabled !== false,
  }));
}

function normalizeParameters(
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

function parametersToVariables(parameters: ProbeGraphParameterDraft[]): Variables {
  return Object.fromEntries(
    parameters.map((parameter) => [parameter.name, parameter.value]),
  );
}

function preprocessExpression(expression: string) {
  const source = expression
    .replaceAll("π", "pi")
    .replaceAll("−", "-")
    .replace(/\s+/g, "")
    .toLowerCase();

  let result = "";
  const variableLetters = new Set(["x", "y", "a", "b", "c"]);

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    result += current;

    if (!next) continue;

    const currentCanMultiply =
      /\d/.test(current) || current === ")" || variableLetters.has(current);
    const nextCanMultiply = next === "(" || variableLetters.has(next) || next === "p";

    if (currentCanMultiply && nextCanMultiply) {
      if (current === "e" || current === "p") continue;
      result += "*";
    }
  }

  return result;
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

function evaluateExpression(expression: string, variables: Variables): number | null {
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

function getExpressionStatus(args: {
  expression: string;
  variables: Variables;
  mode: ProbeGraphModeDraft;
}) : ExpressionStatus {
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

function xToScreen(x: number, window: ProbeGraphWindowDraft) {
  return ((x - window.xMin) / (window.xMax - window.xMin)) * GRAPH_WIDTH;
}

function yToScreen(y: number, window: ProbeGraphWindowDraft) {
  return GRAPH_HEIGHT - ((y - window.yMin) / (window.yMax - window.yMin)) * GRAPH_HEIGHT;
}

function screenToX(screenX: number, window: ProbeGraphWindowDraft) {
  return window.xMin + (screenX / GRAPH_WIDTH) * (window.xMax - window.xMin);
}

function screenToY(screenY: number, window: ProbeGraphWindowDraft) {
  return window.yMax - (screenY / GRAPH_HEIGHT) * (window.yMax - window.yMin);
}

function buildPath(expression: string, window: ProbeGraphWindowDraft, variables: Variables) {
  let path = "";
  let isDrawing = false;

  for (let index = 0; index <= SAMPLE_COUNT_2D; index += 1) {
    const x = window.xMin + ((window.xMax - window.xMin) * index) / SAMPLE_COUNT_2D;
    const y = evaluateExpression(expression, { ...variables, x });

    if (y === null || y < window.yMin - 20 || y > window.yMax + 20) {
      isDrawing = false;
      continue;
    }

    const px = xToScreen(x, window);
    const py = yToScreen(y, window);

    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      isDrawing = false;
      continue;
    }

    path += `${isDrawing ? "L" : "M"}${px.toFixed(2)} ${py.toFixed(2)} `;
    isDrawing = true;
  }

  return path.trim();
}

function formatPoint(point: ProbeGraphPointDraft | null | undefined) {
  if (!point) return "No 2D point selected";
  return `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`;
}

function formatPoint3D(point: ProbeGraphPoint3DDraft | null | undefined) {
  if (!point) return "No 3D point selected";
  return `(${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`;
}

function mapGraphToScene(args: {
  x: number;
  y: number;
  z: number;
  window: ProbeGraphWindow3DDraft;
}) {
  const sceneX =
    ((args.x - args.window.xMin) / (args.window.xMax - args.window.xMin) - 0.5) *
    SCENE_X_SIZE;
  const sceneZ =
    ((args.y - args.window.yMin) / (args.window.yMax - args.window.yMin) - 0.5) *
    SCENE_Z_SIZE;
  const sceneY =
    ((clamp(args.z, args.window.zMin, args.window.zMax) - args.window.zMin) /
      (args.window.zMax - args.window.zMin) -
      0.5) *
    SCENE_Y_SIZE;

  return new THREE.Vector3(sceneX, sceneY, sceneZ);
}

function mapSceneToGraphXZ(args: {
  sceneX: number;
  sceneZ: number;
  window: ProbeGraphWindow3DDraft;
}) {
  const x =
    args.window.xMin +
    ((args.sceneX / SCENE_X_SIZE) + 0.5) * (args.window.xMax - args.window.xMin);
  const y =
    args.window.yMin +
    ((args.sceneZ / SCENE_Z_SIZE) + 0.5) * (args.window.yMax - args.window.yMin);

  return { x, y };
}

function buildSurfaceGeometry(args: {
  expression: string;
  window: ProbeGraphWindow3DDraft;
  variables: Variables;
}): SurfaceGeometryData {
  const vertices: number[] = [];
  const indices: number[] = [];
  const lineVertices: number[] = [];
  const indexGrid: Array<Array<number | null>> = [];
  let validSampleCount = 0;
  let totalSampleCount = 0;

  for (let row = 0; row <= SURFACE_RESOLUTION; row += 1) {
    const y =
      args.window.yMin +
      ((args.window.yMax - args.window.yMin) * row) / SURFACE_RESOLUTION;
    const nextRow: Array<number | null> = [];

    for (let column = 0; column <= SURFACE_RESOLUTION; column += 1) {
      totalSampleCount += 1;
      const x =
        args.window.xMin +
        ((args.window.xMax - args.window.xMin) * column) / SURFACE_RESOLUTION;
      const z = evaluateExpression(args.expression, {
        ...args.variables,
        x,
        y,
      });

      if (z === null || z < args.window.zMin - 40 || z > args.window.zMax + 40) {
        nextRow.push(null);
        continue;
      }

      const point = mapGraphToScene({ x, y, z, window: args.window });
      const vertexIndex = vertices.length / 3;
      vertices.push(point.x, point.y, point.z);
      nextRow.push(vertexIndex);
      validSampleCount += 1;
    }

    indexGrid.push(nextRow);
  }

  for (let row = 0; row < SURFACE_RESOLUTION; row += 1) {
    for (let column = 0; column < SURFACE_RESOLUTION; column += 1) {
      const a = indexGrid[row]?.[column];
      const b = indexGrid[row]?.[column + 1];
      const c = indexGrid[row + 1]?.[column];
      const d = indexGrid[row + 1]?.[column + 1];

      if (a !== null && b !== null && c !== null && d !== null) {
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  function addLineSegment(first: number | null | undefined, second: number | null | undefined) {
    if (first === null || first === undefined || second === null || second === undefined) return;

    lineVertices.push(
      vertices[first * 3],
      vertices[first * 3 + 1],
      vertices[first * 3 + 2],
      vertices[second * 3],
      vertices[second * 3 + 1],
      vertices[second * 3 + 2],
    );
  }

  for (let row = 0; row <= SURFACE_RESOLUTION; row += 1) {
    for (let column = 0; column < SURFACE_RESOLUTION; column += 1) {
      addLineSegment(indexGrid[row]?.[column], indexGrid[row]?.[column + 1]);
    }
  }

  for (let column = 0; column <= SURFACE_RESOLUTION; column += 1) {
    for (let row = 0; row < SURFACE_RESOLUTION; row += 1) {
      addLineSegment(indexGrid[row]?.[column], indexGrid[row + 1]?.[column]);
    }
  }

  const meshGeometry = new THREE.BufferGeometry();
  meshGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  meshGeometry.setIndex(indices);
  meshGeometry.computeVertexNormals();

  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(lineVertices, 3),
  );

  return {
    meshGeometry,
    wireGeometry,
    validSampleCount,
    totalSampleCount,
  };
}

function buildAxisGeometry(points: THREE.Vector3[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      points.flatMap((point) => [point.x, point.y, point.z]),
      3,
    ),
  );
  return geometry;
}

function buildGraphFeatures(args: {
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

function NumberField({
  label,
  value,
  step = 1,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "grid", gap: "0.28rem" }}>
      <span style={{ color: "rgba(255,255,255,0.62)", fontSize: "0.72rem" }}>
        {label}
      </span>
      <input
        type="number"
        disabled={disabled}
        value={value}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "12px",
          background: "rgba(255,255,255,0.06)",
          color: "white",
          padding: "0.5rem",
          outline: "none",
        }}
      />
    </label>
  );
}

function ParameterControl({
  parameter,
  disabled,
  onChange,
}: {
  parameter: ProbeGraphParameterDraft;
  disabled?: boolean;
  onChange: (next: ProbeGraphParameterDraft) => void;
}) {
  const min = parameter.min ?? -10;
  const max = parameter.max ?? 10;
  const step = parameter.step ?? 0.01;

  return (
    <label
      style={{
        display: "grid",
        gap: "0.45rem",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "18px",
        padding: "0.68rem",
        background: "rgba(255,255,255,0.045)",
      }}
    >
      <span
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
          color: "rgba(255,255,255,0.8)",
          fontSize: "0.82rem",
          fontWeight: 850,
        }}
      >
        <span>{parameter.name}</span>
        <span>{formatNumber(parameter.value, 2)}</span>
      </span>
      <input
        type="range"
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        value={parameter.value}
        onChange={(event) => onChange({ ...parameter, value: Number(event.target.value) })}
      />
      <input
        type="number"
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        value={parameter.value}
        onChange={(event) => onChange({ ...parameter, value: Number(event.target.value) })}
        style={{
          width: "100%",
          border: "1px solid rgba(255,255,255,0.11)",
          borderRadius: "12px",
          background: "rgba(0,0,0,0.15)",
          color: "white",
          padding: "0.44rem 0.52rem",
          outline: "none",
        }}
      />
    </label>
  );
}

function ExpressionInput({
  label,
  prefix,
  value,
  status,
  disabled,
  quickInserts,
  examples,
  onChange,
  onInsert,
}: {
  label: string;
  prefix: string;
  value: string;
  status: ExpressionStatus;
  disabled?: boolean;
  quickInserts: string[];
  examples: { label: string; expression: string }[];
  onChange: (value: string) => void;
  onInsert: (value: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: "0.65rem",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "22px",
        padding: "0.85rem",
        background: "rgba(0,0,0,0.14)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.8rem",
          alignItems: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "rgba(255,255,255,0.78)",
            fontSize: "0.76rem",
            fontWeight: 900,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </p>
        <span
          style={{
            border: status.isValid
              ? "1px solid rgba(187,247,208,0.24)"
              : "1px solid rgba(253,186,116,0.28)",
            borderRadius: "999px",
            padding: "0.22rem 0.48rem",
            background: status.isValid
              ? "rgba(34,197,94,0.09)"
              : "rgba(251,146,60,0.1)",
            color: status.isValid
              ? "rgba(220,252,231,0.88)"
              : "rgba(254,215,170,0.9)",
            fontSize: "0.68rem",
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          {status.isValid ? "Graphing" : "Check input"}
        </span>
      </div>

      <label
        style={{
          display: "grid",
          gridTemplateColumns: "auto minmax(0, 1fr)",
          alignItems: "center",
          gap: "0.55rem",
        }}
      >
        <span
          style={{
            border: "1px solid rgba(221,214,254,0.18)",
            borderRadius: "999px",
            padding: "0.48rem 0.62rem",
            background: "rgba(221,214,254,0.09)",
            color: "rgba(255,255,255,0.9)",
            fontWeight: 900,
          }}
        >
          {prefix}
        </span>
        <input
          value={value}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(event) => onChange(event.target.value)}
          placeholder={prefix === "y =" ? "a*x^2 + b*x + c" : "a*x^2 + b*y^2 + c"}
          style={{
            width: "100%",
            border: "1px solid rgba(255,255,255,0.13)",
            borderRadius: "16px",
            background: "rgba(255,255,255,0.07)",
            color: "white",
            padding: "0.74rem 0.82rem",
            outline: "none",
            fontSize: "0.96rem",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          }}
        />
      </label>

      {!status.isValid ? (
        <p style={{ margin: 0, color: "rgba(254,215,170,0.88)", fontSize: "0.76rem", lineHeight: 1.45 }}>
          {status.message}
        </p>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.42rem" }}>
        {examples.map((example) => (
          <button
            key={example.label}
            type="button"
            disabled={disabled}
            onClick={() => onChange(example.expression)}
            style={{
              border: "1px solid rgba(255,255,255,0.13)",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.82)",
              padding: "0.34rem 0.58rem",
              fontSize: "0.72rem",
              fontWeight: 750,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {example.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
        {quickInserts.map((insert) => (
          <button
            key={insert}
            type="button"
            disabled={disabled}
            onClick={() => onInsert(insert)}
            style={{
              border: "1px solid rgba(221,214,254,0.13)",
              borderRadius: "999px",
              background: "rgba(221,214,254,0.055)",
              color: "rgba(233,213,255,0.84)",
              padding: "0.28rem 0.48rem",
              fontSize: "0.68rem",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            + {insert}
          </button>
        ))}
      </div>
    </div>
  );
}

function AxisLine({ points, opacity = 0.45 }: { points: THREE.Vector3[]; opacity?: number }) {
  const geometry = useMemo(() => buildAxisGeometry(points), [points]);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity,
      }),
    [opacity],
  );

  const lineObject = useMemo(
    () => new THREE.Line(geometry, material),
    [geometry, material],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <primitive object={lineObject} />;
}

function SurfaceMesh({
  expression,
  window,
  variables,
  disabled,
  onPointSelect,
}: {
  expression: string;
  window: ProbeGraphWindow3DDraft;
  variables: Variables;
  disabled?: boolean;
  onPointSelect: (point: ProbeGraphPoint3DDraft) => void;
}) {
  const surfaceData = useMemo(
    () => buildSurfaceGeometry({ expression, window, variables }),
    [expression, window, variables],
  );

  useEffect(() => {
    return () => {
      surfaceData.meshGeometry.dispose();
      surfaceData.wireGeometry.dispose();
    };
  }, [surfaceData]);

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (disabled) return;
    event.stopPropagation();

    const graphXY = mapSceneToGraphXZ({
      sceneX: event.point.x,
      sceneZ: event.point.z,
      window,
    });
    const z =
      evaluateExpression(expression, {
        ...variables,
        x: graphXY.x,
        y: graphXY.y,
      }) ?? event.point.y;

    onPointSelect({
      x: roundForStorage(graphXY.x, 3),
      y: roundForStorage(graphXY.y, 3),
      z: roundForStorage(z, 3),
      expression,
    });
  }

  return (
    <group>
      <mesh geometry={surfaceData.meshGeometry} onPointerDown={handlePointerDown}>
        <meshStandardMaterial
          color="#8b5cf6"
          emissive="#2e1065"
          roughness={0.62}
          metalness={0.08}
          side={THREE.DoubleSide}
          transparent
          opacity={0.72}
        />
      </mesh>
      <lineSegments geometry={surfaceData.wireGeometry}>
        <lineBasicMaterial color="#d8b4fe" transparent opacity={0.36} />
      </lineSegments>
    </group>
  );
}

function SelectedPoint3DMarker({
  point,
  window,
}: {
  point: ProbeGraphPoint3DDraft | null;
  window: ProbeGraphWindow3DDraft;
}) {
  if (!point) return null;

  const position = mapGraphToScene({
    x: point.x,
    y: point.y,
    z: point.z,
    window,
  });

  return (
    <mesh position={position}>
      <sphereGeometry args={[0.12, 24, 24]} />
      <meshStandardMaterial color="#ffffff" emissive="#a855f7" emissiveIntensity={0.7} />
    </mesh>
  );
}

function Graph3DCameraControls({
  view,
  resetToken,
}: {
  view: ProbeGraphView3DDraft;
  resetToken: number;
}) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();

  useEffect(() => {
    const yaw = (view.yaw * Math.PI) / 180;
    const pitch = (view.pitch * Math.PI) / 180;
    const radius = 10 / view.zoom;
    const x = Math.sin(yaw) * Math.cos(pitch) * radius;
    const y = Math.sin(pitch) * radius;
    const z = Math.cos(yaw) * Math.cos(pitch) * radius;

    camera.position.set(x, y, z);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const maybeControls = controlsRef.current as {
      target?: THREE.Vector3;
      update?: () => void;
    } | null;

    if (maybeControls?.target) {
      maybeControls.target.set(0, 0, 0);
    }
    maybeControls?.update?.();
  }, [camera, resetToken, view.pitch, view.yaw, view.zoom]);

  return (
    <TrackballControls
      ref={controlsRef}
      rotateSpeed={3.2}
      zoomSpeed={1.15}
      panSpeed={0.72}
      dynamicDampingFactor={0.08}
      staticMoving={false}
    />
  );
}

function Graph3DScene({
  expression,
  graphWindow,
  graphView,
  variables,
  selectedPoint,
  resetToken,
  disabled,
  onPointSelect,
}: {
  expression: string;
  graphWindow: ProbeGraphWindow3DDraft;
  graphView: ProbeGraphView3DDraft;
  variables: Variables;
  selectedPoint: ProbeGraphPoint3DDraft | null;
  resetToken: number;
  disabled?: boolean;
  onPointSelect: (point: ProbeGraphPoint3DDraft) => void;
}) {
  const xAxis = useMemo(
    () => [
      mapGraphToScene({ x: graphWindow.xMin, y: 0, z: 0, window: graphWindow }),
      mapGraphToScene({ x: graphWindow.xMax, y: 0, z: 0, window: graphWindow }),
    ],
    [graphWindow],
  );
  const yAxis = useMemo(
    () => [
      mapGraphToScene({ x: 0, y: graphWindow.yMin, z: 0, window: graphWindow }),
      mapGraphToScene({ x: 0, y: graphWindow.yMax, z: 0, window: graphWindow }),
    ],
    [graphWindow],
  );
  const zAxis = useMemo(
    () => [
      mapGraphToScene({ x: 0, y: 0, z: graphWindow.zMin, window: graphWindow }),
      mapGraphToScene({ x: 0, y: 0, z: graphWindow.zMax, window: graphWindow }),
    ],
    [graphWindow],
  );

  return (
    <>
      <color attach="background" args={["#090014"]} />
      <ambientLight intensity={0.58} />
      <directionalLight position={[5, 7, 6]} intensity={1.15} />
      <pointLight position={[-5, 3, -4]} intensity={0.5} />
      <gridHelper args={[10, 20, "#6d28d9", "#312e81"]} position={[0, -2.35, 0]} />
      <AxisLine points={xAxis} opacity={0.58} />
      <AxisLine points={yAxis} opacity={0.38} />
      <AxisLine points={zAxis} opacity={0.44} />
      <SurfaceMesh
        expression={expression}
        window={graphWindow}
        variables={variables}
        disabled={disabled}
        onPointSelect={onPointSelect}
      />
      <SelectedPoint3DMarker point={selectedPoint} window={graphWindow} />
      <Graph3DCameraControls view={graphView} resetToken={resetToken} />
    </>
  );
}

function Graph3DWorkspace({
  expression,
  graphWindow,
  graphView,
  variables,
  selectedPoint,
  disabled,
  onPointSelect,
}: {
  expression: string;
  graphWindow: ProbeGraphWindow3DDraft;
  graphView: ProbeGraphView3DDraft;
  variables: Variables;
  selectedPoint: ProbeGraphPoint3DDraft | null;
  disabled?: boolean;
  onPointSelect: (point: ProbeGraphPoint3DDraft) => void;
}) {
  const [resetToken, setResetToken] = useState(0);

  return (
    <div
      style={{
        position: "relative",
        minHeight: "430px",
        overflow: "hidden",
        border: "1px solid rgba(221,214,254,0.16)",
        borderRadius: "24px",
        background: "linear-gradient(145deg, rgba(5,5,16,0.96), rgba(39,13,64,0.76))",
      }}
    >
      <Canvas
        camera={{ position: [7, 5, 8], fov: 45, near: 0.1, far: 100 }}
        dpr={[1, 1.65]}
        style={{ height: "430px", width: "100%" }}
      >
        <Graph3DScene
          expression={expression}
          graphWindow={graphWindow}
          graphView={graphView}
          variables={variables}
          selectedPoint={selectedPoint}
          resetToken={resetToken}
          disabled={disabled}
          onPointSelect={onPointSelect}
        />
      </Canvas>

      <div
        style={{
          pointerEvents: "none",
          position: "absolute",
          left: "1rem",
          top: "1rem",
          maxWidth: "19rem",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "18px",
          background: "rgba(0,0,0,0.35)",
          padding: "0.72rem 0.82rem",
          color: "rgba(255,255,255,0.82)",
          fontSize: "0.78rem",
          lineHeight: 1.45,
          backdropFilter: "blur(10px)",
        }}
      >
        Drag to rotate. Scroll to zoom. Right-click or two-finger drag to pan.
        Click the surface to mark a point.
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setResetToken((value) => value + 1)}
        style={{
          position: "absolute",
          right: "1rem",
          top: "1rem",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: "999px",
          background: "rgba(255,255,255,0.1)",
          color: "white",
          padding: "0.48rem 0.72rem",
          fontSize: "0.78rem",
          fontWeight: 850,
          cursor: disabled ? "not-allowed" : "pointer",
          backdropFilter: "blur(10px)",
        }}
      >
        Reset camera
      </button>
    </div>
  );
}

export function GraphProbe(props: GenericProbeComponentProps) {
  const mode = props.draft.graph_mode ?? "2d";
  const graphWindow = normalizeWindow2D(props.draft.graph_window);
  const graph3DWindow = normalizeWindow3D(props.draft.graph_3d_window);
  const graph3DView = normalizeView3D(props.draft.graph_3d_view);
  const functions = normalizeFunctions(props.draft.graph_functions);
  const parameters = normalizeParameters(props.draft.graph_parameters);
  const variables = useMemo(() => parametersToVariables(parameters), [parameters]);
  const surfaceExpression =
    props.draft.graph_surface_expression?.trim() || DEFAULT_SURFACE_EXPRESSION;
  const selectedPoint = props.draft.graph_selected_point ?? null;
  const selectedPoint3D = props.draft.graph_selected_point_3d ?? null;
  const notes = props.draft.graph_notes ?? "";

  const firstFunctionExpression = functions[0]?.expression || "x";
  const firstFunctionStatus = getExpressionStatus({
    expression: firstFunctionExpression,
    variables,
    mode: "2d",
  });
  const surfaceStatus = getExpressionStatus({
    expression: surfaceExpression,
    variables,
    mode: "3d",
  });

  const functionPaths = useMemo(
    () =>
      functions.map((fn) => ({
        id: fn.id,
        path:
          fn.enabled === false ? "" : buildPath(fn.expression, graphWindow, variables),
        valid:
          fn.enabled === false ||
          evaluateExpression(fn.expression, { ...variables, x: 0 }) !== null,
      })),
    [functions, graphWindow, variables],
  );

  function updateGraph(next: {
    mode?: ProbeGraphModeDraft;
    functions?: ProbeGraphFunctionDraft[];
    parameters?: ProbeGraphParameterDraft[];
    graphWindow?: ProbeGraphWindowDraft;
    graph3DWindow?: ProbeGraphWindow3DDraft;
    graph3DView?: ProbeGraphView3DDraft;
    surfaceExpression?: string;
    selectedPoint?: ProbeGraphPointDraft | null;
    selectedPoint3D?: ProbeGraphPoint3DDraft | null;
    notes?: string;
  }) {
    const nextMode = next.mode ?? mode;
    const nextFunctions = next.functions ?? functions;
    const nextParameters = next.parameters ?? parameters;
    const nextWindow = next.graphWindow ?? graphWindow;
    const next3DWindow = next.graph3DWindow ?? graph3DWindow;
    const next3DView = next.graph3DView ?? graph3DView;
    const nextSurfaceExpression = next.surfaceExpression ?? surfaceExpression;
    const nextPoint =
      next.selectedPoint === undefined ? selectedPoint : next.selectedPoint;
    const nextPoint3D =
      next.selectedPoint3D === undefined ? selectedPoint3D : next.selectedPoint3D;
    const nextNotes = next.notes ?? notes;

    props.onDraftChange({
      ...props.draft,
      attempt_type: "graph",
      graph_mode: nextMode,
      graph_functions: nextFunctions,
      graph_parameters: nextParameters,
      graph_window: nextWindow,
      graph_3d_window: next3DWindow,
      graph_3d_view: next3DView,
      graph_surface_expression: nextSurfaceExpression,
      graph_selected_point: nextPoint,
      graph_selected_point_3d: nextPoint3D,
      graph_notes: nextNotes,
      graph_features: buildGraphFeatures({
        mode: nextMode,
        functions: nextFunctions,
        parameters: nextParameters,
        graphWindow: nextWindow,
        surfaceExpression: nextSurfaceExpression,
        graph3DWindow: next3DWindow,
        graph3DView: next3DView,
        selectedPoint: nextPoint,
        selectedPoint3D: nextPoint3D,
        notes: nextNotes,
      }),
    });
  }

  useEffect(() => {
    const hasGraphPayload = Boolean(props.draft.graph_features?.length);
    if (hasGraphPayload) return;

    updateGraph({});
    // Initialize the graph draft once when a graph probe first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateParameter(nextParameter: ProbeGraphParameterDraft) {
    updateGraph({
      parameters: parameters.map((candidate) =>
        candidate.name === nextParameter.name ? nextParameter : candidate,
      ),
    });
  }

  function appendToFirstFunction(insert: string) {
    const nextFunctions = functions.map((fn, index) =>
      index === 0
        ? {
            ...fn,
            expression: `${fn.expression}${fn.expression.trim() ? " + " : ""}${insert}`,
          }
        : fn,
    );
    updateGraph({ functions: nextFunctions });
  }

  function appendToSurface(insert: string) {
    updateGraph({
      surfaceExpression: `${surfaceExpression}${surfaceExpression.trim() ? " + " : ""}${insert}`,
    });
  }

  function handleGraphClick(event: React.MouseEvent<SVGSVGElement>) {
    if (mode !== "2d") return;

    const rect = event.currentTarget.getBoundingClientRect();
    const screenX = ((event.clientX - rect.left) / rect.width) * GRAPH_WIDTH;
    const screenY = ((event.clientY - rect.top) / rect.height) * GRAPH_HEIGHT;
    const x = screenToX(screenX, graphWindow);
    const firstEnabledFunction = functions.find(
      (fn) => fn.enabled !== false && fn.expression.trim(),
    );
    const evaluatedY = firstEnabledFunction
      ? evaluateExpression(firstEnabledFunction.expression, { ...variables, x })
      : null;
    const y = evaluatedY ?? screenToY(screenY, graphWindow);

    updateGraph({
      selectedPoint: {
        x: roundForStorage(x, 3),
        y: roundForStorage(y, 3),
        expression: firstEnabledFunction?.expression ?? null,
      },
    });
  }

  function select3DCenterPoint() {
    const x = (graph3DWindow.xMin + graph3DWindow.xMax) / 2;
    const y = (graph3DWindow.yMin + graph3DWindow.yMax) / 2;
    const z =
      evaluateExpression(surfaceExpression, {
        ...variables,
        x,
        y,
      }) ?? 0;

    updateGraph({
      selectedPoint3D: {
        x: roundForStorage(x, 3),
        y: roundForStorage(y, 3),
        z: roundForStorage(z, 3),
        expression: surfaceExpression,
      },
    });
  }

  return (
    <ProbeShell {...props}>
      <div style={{ display: "grid", gap: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            alignItems: "end",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>
              Build and explore the graph.
            </p>
            <p
              style={{
                margin: "0.35rem 0 0",
                color: "rgba(255,255,255,0.66)",
                fontSize: "0.84rem",
                lineHeight: 1.5,
              }}
            >
              Use 2D for y = f(x), or switch to 3D for z = f(x,y). The 3D view now
              uses Learning-Space-style movement: drag, pan, and zoom directly.
            </p>
          </div>

          <div
            style={{
              display: "inline-flex",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "999px",
              padding: "0.25rem",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            {(["2d", "3d"] as const).map((nextMode) => (
              <button
                key={nextMode}
                type="button"
                disabled={props.disabled}
                onClick={() => updateGraph({ mode: nextMode })}
                style={{
                  border: 0,
                  borderRadius: "999px",
                  padding: "0.52rem 0.8rem",
                  background: mode === nextMode ? "rgba(221,214,254,0.2)" : "transparent",
                  color: mode === nextMode ? "white" : "rgba(255,255,255,0.66)",
                  fontWeight: 900,
                  cursor: props.disabled ? "not-allowed" : "pointer",
                }}
              >
                {nextMode === "2d" ? "2D" : "3D"}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "minmax(18rem, 0.82fr) minmax(25rem, 1.38fr)",
          }}
        >
          <div style={{ display: "grid", gap: "0.85rem", alignContent: "start" }}>
            {mode === "2d" ? (
              <div
                style={{
                  display: "grid",
                  gap: "0.6rem",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "22px",
                  padding: "0.85rem",
                  background: "rgba(0,0,0,0.14)",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: "rgba(255,255,255,0.78)",
                    fontSize: "0.76rem",
                    fontWeight: 900,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                  }}
                >
                  Functions
                </p>

                {functions.map((fn, index) => {
                  const status = getExpressionStatus({
                    expression: fn.expression,
                    variables,
                    mode: "2d",
                  });

                  return (
                    <div
                      key={fn.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto auto minmax(0, 1fr) auto",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={fn.enabled !== false}
                        disabled={props.disabled}
                        onChange={(event) => {
                          updateGraph({
                            functions: functions.map((candidate) =>
                              candidate.id === fn.id
                                ? { ...candidate, enabled: event.target.checked }
                                : candidate,
                            ),
                          });
                        }}
                        style={{ accentColor: "#c4b5fd" }}
                      />
                      <span
                        style={{
                          color: "rgba(255,255,255,0.75)",
                          fontWeight: 900,
                          whiteSpace: "nowrap",
                        }}
                      >
                        y =
                      </span>
                      <input
                        value={fn.expression}
                        disabled={props.disabled}
                        aria-label={`Function ${index + 1}`}
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                        onChange={(event) => {
                          updateGraph({
                            functions: functions.map((candidate) =>
                              candidate.id === fn.id
                                ? { ...candidate, expression: event.target.value }
                                : candidate,
                            ),
                          });
                        }}
                        style={{
                          width: "100%",
                          border: status.isValid
                            ? "1px solid rgba(255,255,255,0.13)"
                            : "1px solid rgba(253,186,116,0.38)",
                          borderRadius: "14px",
                          background: "rgba(255,255,255,0.07)",
                          color: "white",
                          padding: "0.62rem 0.72rem",
                          outline: "none",
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        }}
                      />
                      <button
                        type="button"
                        disabled={props.disabled || functions.length <= 1}
                        onClick={() =>
                          updateGraph({
                            functions: functions.filter((candidate) => candidate.id !== fn.id),
                          })
                        }
                        style={{
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: "999px",
                          background: "rgba(255,255,255,0.06)",
                          color: "rgba(255,255,255,0.76)",
                          padding: "0.45rem 0.58rem",
                          cursor: props.disabled ? "not-allowed" : "pointer",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}

                {!firstFunctionStatus.isValid ? (
                  <p style={{ margin: 0, color: "rgba(254,215,170,0.88)", fontSize: "0.76rem", lineHeight: 1.45 }}>
                    {firstFunctionStatus.message}
                  </p>
                ) : null}

                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.42rem" }}>
                  {FUNCTION_EXAMPLES.map((example) => (
                    <button
                      key={example.label}
                      type="button"
                      disabled={props.disabled}
                      onClick={() =>
                        updateGraph({
                          functions: functions.map((candidate, index) =>
                            index === 0
                              ? { ...candidate, expression: example.expression, enabled: true }
                              : candidate,
                          ),
                        })
                      }
                      style={{
                        border: "1px solid rgba(255,255,255,0.13)",
                        borderRadius: "999px",
                        background: "rgba(255,255,255,0.07)",
                        color: "rgba(255,255,255,0.82)",
                        padding: "0.34rem 0.58rem",
                        fontSize: "0.72rem",
                        fontWeight: 750,
                        cursor: props.disabled ? "not-allowed" : "pointer",
                      }}
                    >
                      {example.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  {QUICK_INSERTS_2D.map((insert) => (
                    <button
                      key={insert}
                      type="button"
                      disabled={props.disabled}
                      onClick={() => appendToFirstFunction(insert)}
                      style={{
                        border: "1px solid rgba(221,214,254,0.13)",
                        borderRadius: "999px",
                        background: "rgba(221,214,254,0.055)",
                        color: "rgba(233,213,255,0.84)",
                        padding: "0.28rem 0.48rem",
                        fontSize: "0.68rem",
                        cursor: props.disabled ? "not-allowed" : "pointer",
                      }}
                    >
                      + {insert}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={props.disabled}
                  onClick={() =>
                    updateGraph({
                      functions: [
                        ...functions,
                        {
                          id: `f${Date.now()}`,
                          label: `f${functions.length + 1}(x)`,
                          expression: "a*x^2 + b*x + c",
                          enabled: true,
                        },
                      ],
                    })
                  }
                  style={{
                    justifySelf: "start",
                    border: "1px solid rgba(221,214,254,0.22)",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.08)",
                    color: "white",
                    padding: "0.52rem 0.74rem",
                    fontWeight: 900,
                    cursor: props.disabled ? "not-allowed" : "pointer",
                  }}
                >
                  + Add function
                </button>
              </div>
            ) : (
              <ExpressionInput
                label="Surface"
                prefix="z ="
                value={surfaceExpression}
                status={surfaceStatus}
                disabled={props.disabled}
                quickInserts={QUICK_INSERTS_3D}
                examples={SURFACE_EXAMPLES}
                onChange={(value) => updateGraph({ surfaceExpression: value })}
                onInsert={appendToSurface}
              />
            )}

            <details
              open
              style={{
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "22px",
                padding: "0.85rem",
                background: "rgba(0,0,0,0.12)",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.8)",
                  fontSize: "0.76rem",
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                Sliders
              </summary>
              <div style={{ display: "grid", gap: "0.6rem", marginTop: "0.75rem" }}>
                {parameters.map((parameter) => (
                  <ParameterControl
                    key={parameter.name}
                    parameter={parameter}
                    disabled={props.disabled}
                    onChange={updateParameter}
                  />
                ))}
                <button
                  type="button"
                  disabled={props.disabled}
                  onClick={() => updateGraph({ parameters: DEFAULT_PARAMETERS })}
                  style={{
                    justifySelf: "start",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.78)",
                    padding: "0.42rem 0.64rem",
                    fontSize: "0.75rem",
                    cursor: props.disabled ? "not-allowed" : "pointer",
                  }}
                >
                  Reset sliders
                </button>
              </div>
            </details>

            <details
              style={{
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "22px",
                padding: "0.85rem",
                background: "rgba(0,0,0,0.12)",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.78)",
                  fontSize: "0.76rem",
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                Window
              </summary>
              <div
                style={{
                  display: "grid",
                  gap: "0.55rem",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  marginTop: "0.75rem",
                }}
              >
                {mode === "2d"
                  ? ([
                      ["xMin", "x min"],
                      ["xMax", "x max"],
                      ["yMin", "y min"],
                      ["yMax", "y max"],
                    ] as const).map(([key, label]) => (
                      <NumberField
                        key={key}
                        label={label}
                        value={graphWindow[key]}
                        disabled={props.disabled}
                        onChange={(value) =>
                          updateGraph({
                            graphWindow: normalizeWindow2D({
                              ...graphWindow,
                              [key]: value,
                            }),
                          })
                        }
                      />
                    ))
                  : ([
                      ["xMin", "x min"],
                      ["xMax", "x max"],
                      ["yMin", "y min"],
                      ["yMax", "y max"],
                      ["zMin", "z min"],
                      ["zMax", "z max"],
                    ] as const).map(([key, label]) => (
                      <NumberField
                        key={key}
                        label={label}
                        value={graph3DWindow[key]}
                        disabled={props.disabled}
                        onChange={(value) =>
                          updateGraph({
                            graph3DWindow: normalizeWindow3D({
                              ...graph3DWindow,
                              [key]: value,
                            }),
                          })
                        }
                      />
                    ))}
              </div>
            </details>
          </div>

          <div style={{ display: "grid", gap: "0.85rem" }}>
            {mode === "2d" ? (
              <div
                style={{
                  overflow: "hidden",
                  border: "1px solid rgba(221,214,254,0.16)",
                  borderRadius: "24px",
                  background:
                    "linear-gradient(145deg, rgba(5,5,16,0.9), rgba(39,13,64,0.72))",
                }}
              >
                <svg
                  viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                  role="img"
                  aria-label="Interactive 2D graph"
                  onClick={handleGraphClick}
                  style={{ display: "block", width: "100%", cursor: "crosshair" }}
                >
                  <defs>
                    <pattern id="minor-grid-2d" width="38" height="38" patternUnits="userSpaceOnUse">
                      <path d="M 38 0 L 0 0 0 38" fill="none" stroke="rgba(255,255,255,0.055)" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect width={GRAPH_WIDTH} height={GRAPH_HEIGHT} fill="url(#minor-grid-2d)" />

                  {graphWindow.xMin < 0 && graphWindow.xMax > 0 ? (
                    <line
                      x1={xToScreen(0, graphWindow)}
                      x2={xToScreen(0, graphWindow)}
                      y1={0}
                      y2={GRAPH_HEIGHT}
                      stroke="rgba(255,255,255,0.28)"
                      strokeWidth={1.5}
                    />
                  ) : null}

                  {graphWindow.yMin < 0 && graphWindow.yMax > 0 ? (
                    <line
                      x1={0}
                      x2={GRAPH_WIDTH}
                      y1={yToScreen(0, graphWindow)}
                      y2={yToScreen(0, graphWindow)}
                      stroke="rgba(255,255,255,0.28)"
                      strokeWidth={1.5}
                    />
                  ) : null}

                  {functionPaths.map((fnPath, index) =>
                    fnPath.path ? (
                      <path
                        key={fnPath.id}
                        d={fnPath.path}
                        fill="none"
                        stroke={index === 0 ? "rgba(221,214,254,0.95)" : "rgba(125,211,252,0.82)"}
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null,
                  )}

                  {selectedPoint ? (
                    <g>
                      <line
                        x1={xToScreen(selectedPoint.x, graphWindow)}
                        x2={xToScreen(selectedPoint.x, graphWindow)}
                        y1={0}
                        y2={GRAPH_HEIGHT}
                        stroke="rgba(255,255,255,0.12)"
                        strokeDasharray="5 5"
                      />
                      <circle
                        cx={xToScreen(selectedPoint.x, graphWindow)}
                        cy={yToScreen(selectedPoint.y, graphWindow)}
                        r={7}
                        fill="white"
                        stroke="rgba(168,85,247,0.95)"
                        strokeWidth={4}
                      />
                    </g>
                  ) : null}
                </svg>
              </div>
            ) : (
              <Graph3DWorkspace
                expression={surfaceExpression}
                graphWindow={graph3DWindow}
                graphView={graph3DView}
                variables={variables}
                selectedPoint={selectedPoint3D}
                disabled={props.disabled}
                onPointSelect={(point) => updateGraph({ selectedPoint3D: point })}
              />
            )}

            {mode === "2d" ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  color: "rgba(255,255,255,0.72)",
                  fontSize: "0.82rem",
                }}
              >
                <span>Click the graph to mark a point.</span>
                <strong style={{ color: "rgba(255,255,255,0.92)" }}>
                  {formatPoint(selectedPoint)}
                </strong>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.6rem" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                  {VIEW_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={props.disabled}
                      onClick={() => updateGraph({ graph3DView: preset.view })}
                      style={{
                        border: "1px solid rgba(255,255,255,0.13)",
                        borderRadius: "999px",
                        background: "rgba(255,255,255,0.07)",
                        color: "rgba(255,255,255,0.84)",
                        padding: "0.42rem 0.68rem",
                        fontSize: "0.76rem",
                        cursor: props.disabled ? "not-allowed" : "pointer",
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={props.disabled}
                    onClick={select3DCenterPoint}
                    style={{
                      border: "1px solid rgba(255,255,255,0.13)",
                      borderRadius: "999px",
                      background: "rgba(255,255,255,0.07)",
                      color: "rgba(255,255,255,0.84)",
                      padding: "0.42rem 0.68rem",
                      fontSize: "0.76rem",
                      cursor: props.disabled ? "not-allowed" : "pointer",
                    }}
                  >
                    Mark center point
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    color: "rgba(255,255,255,0.72)",
                    fontSize: "0.82rem",
                  }}
                >
                  <span>Preset buttons reset the starting camera. Drag the graph for free movement.</span>
                  <strong style={{ color: "rgba(255,255,255,0.92)" }}>
                    {formatPoint3D(selectedPoint3D)}
                  </strong>
                </div>
              </div>
            )}
          </div>
        </div>

        <label style={{ display: "grid", gap: "0.5rem" }}>
          <span
            style={{
              color: "rgba(255,255,255,0.86)",
              fontSize: "0.9rem",
              fontWeight: 850,
            }}
          >
            What do you notice?
          </span>
          <textarea
            disabled={props.disabled}
            rows={4}
            value={notes}
            placeholder="Describe the pattern: increasing, decreasing, saddle shape, bowl shape, crosses the axis, has a turning point, levels off..."
            onChange={(event) => updateGraph({ notes: event.target.value })}
            style={{
              width: "100%",
              resize: "vertical",
              borderRadius: "18px",
              padding: "0.9rem",
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.065)",
              color: "inherit",
              outline: "none",
              lineHeight: 1.55,
            }}
          />
        </label>
      </div>
    </ProbeShell>
  );
}



