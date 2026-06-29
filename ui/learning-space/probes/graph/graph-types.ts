"use client";

import type {
  ProbeGraphFunctionDraft,
  ProbeGraphModeDraft,
  ProbeGraphParameterDraft,
  ProbeGraphView3DDraft,
  ProbeGraphWindow3DDraft,
  ProbeGraphWindowDraft,
} from "../probe-ui-types";

export type GraphVariables = Record<string, number>;

export type GraphExpressionStatus = {
  isValid: boolean;
  message: string;
};

export type GraphExample = {
  id: string;
  label: string;
  expression: string;
  explanation: string;
};

export type GraphAnimationId = "a" | "b" | "c";

export type GraphAnimationPreset = {
  id: GraphAnimationId;
  label: string;
  body: string;
};

export type GraphViewPreset = {
  id: string;
  label: string;
  view: ProbeGraphView3DDraft;
};

export const DEFAULT_WINDOW_2D: ProbeGraphWindowDraft = {
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10,
};

export const DEFAULT_WINDOW_3D: ProbeGraphWindow3DDraft = {
  xMin: -5,
  xMax: 5,
  yMin: -5,
  yMax: 5,
  zMin: -6,
  zMax: 12,
};

export const DEFAULT_VIEW_3D: ProbeGraphView3DDraft = {
  yaw: 42,
  pitch: 28,
  zoom: 1,
};

export const DEFAULT_FUNCTIONS: ProbeGraphFunctionDraft[] = [
  { id: "f1", label: "f(x)", expression: "a*x^2 + b*x + c", enabled: true },
];

export const DEFAULT_PARAMETERS: ProbeGraphParameterDraft[] = [
  { name: "a", value: 1, min: -5, max: 5, step: 0.01 },
  { name: "b", value: 0, min: -5, max: 5, step: 0.01 },
  { name: "c", value: 0, min: -10, max: 10, step: 0.01 },
];

export const DEFAULT_SURFACE_EXPRESSION = "a*x^2 - b*y^2 + c";

export const GRAPH_WIDTH = 760;
export const GRAPH_HEIGHT = 430;
export const SAMPLE_COUNT_2D = 280;
export const SURFACE_RESOLUTION = 44;
export const SCENE_X_SIZE = 7.5;
export const SCENE_Y_SIZE = 4.5;
export const SCENE_Z_SIZE = 7.5;

export const VIEW_PRESETS: GraphViewPreset[] = [
  { id: "home", label: "Home", view: { yaw: 42, pitch: 28, zoom: 1 } },
  { id: "top", label: "Top", view: { yaw: 0, pitch: 74, zoom: 1.05 } },
  { id: "front", label: "Front", view: { yaw: 0, pitch: 5, zoom: 1.05 } },
  { id: "side", label: "Side", view: { yaw: 90, pitch: 8, zoom: 1.05 } },
];

export const FUNCTION_EXAMPLES: GraphExample[] = [
  {
    id: "line",
    label: "Line",
    expression: "a*x + c",
    explanation: "Shows steady change.",
  },
  {
    id: "quadratic",
    label: "Bowl",
    expression: "a*x^2 + b*x + c",
    explanation: "Shows a turning point.",
  },
  {
    id: "sine",
    label: "Wave",
    expression: "a*sin(b*x) + c",
    explanation: "Shows repeated motion.",
  },
  {
    id: "growth",
    label: "Growth",
    expression: "a*exp(b*x) + c",
    explanation: "Shows change that compounds.",
  },
];

export const SURFACE_EXAMPLES: GraphExample[] = [
  {
    id: "saddle",
    label: "Saddle",
    expression: "a*x^2 - b*y^2 + c",
    explanation: "Curves up one way and down the other.",
  },
  {
    id: "bowl",
    label: "Bowl",
    expression: "a*x^2 + b*y^2 + c",
    explanation: "Everything rises away from the center.",
  },
  {
    id: "wave",
    label: "Wave field",
    expression: "a*sin(x) + b*cos(y) + c",
    explanation: "Two directions create a moving surface.",
  },
  {
    id: "ridge",
    label: "Ridge",
    expression: "a*x*y + c",
    explanation: "One variable changes the effect of the other.",
  },
];

export const ANIMATION_PRESETS_2D: GraphAnimationPreset[] = [
  {
    id: "a",
    label: "Bend",
    body: "Animates a to show how the graph opens or flips.",
  },
  {
    id: "b",
    label: "Slide tilt",
    body: "Animates b to show how the line/curve leans.",
  },
  {
    id: "c",
    label: "Lift",
    body: "Animates c to show the whole graph moving up or down.",
  },
];

export const ANIMATION_PRESETS_3D: GraphAnimationPreset[] = [
  {
    id: "a",
    label: "X direction",
    body: "Animates a to show the x-direction bend.",
  },
  {
    id: "b",
    label: "Y direction",
    body: "Animates b to show the y-direction bend.",
  },
  {
    id: "c",
    label: "Lift",
    body: "Animates c to show the whole surface rising or falling.",
  },
];

export const QUICK_INSERTS_2D = ["x", "x^2", "sin(x)", "cos(x)", "sqrt(x)", "abs(x)", "ln(x)", "pi"];
export const QUICK_INSERTS_3D = ["x", "y", "x^2", "y^2", "sin(x)", "cos(y)", "sqrt(x^2+y^2)", "a", "b", "c"];

export const GRAPH_MODE_COPY: Record<ProbeGraphModeDraft, { title: string; body: string; equationPrefix: string }> = {
  "2d": {
    title: "Explore one changing input.",
    body: "Use this when MyWay wants to show how y changes as x changes.",
    equationPrefix: "y =",
  },
  "3d": {
    title: "Explore two changing inputs.",
    body: "Use this when MyWay wants to show how z changes as x and y change together.",
    equationPrefix: "z =",
  },
};
