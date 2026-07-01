"use client";

import type { MouseEvent } from "react";
import type {
  ProbeGraphFunctionDraft,
  ProbeGraphPointDraft,
  ProbeGraphWindowDraft,
} from "../probe-ui-types";
import { ProbePill, probeTheme } from "../shared";
import {
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  type GraphVariables,
} from "./graph-types";
import type { GraphVisualState } from "./graph-visual-actions";
import {
  buildPath,
  evaluateExpression,
  formatNumber,
  formatPoint,
  roundForStorage,
  screenToX,
  screenToY,
  xToScreen,
  yToScreen,
} from "./graph-expression";

function clampRange(from: number, to: number, min: number, max: number) {
  const safeFrom = Math.max(min, Math.min(max, from));
  const safeTo = Math.max(min, Math.min(max, to));
  return [Math.min(safeFrom, safeTo), Math.max(safeFrom, safeTo)] as const;
}

function buildAreaRegionPath(args: {
  expression: string;
  graphWindow: ProbeGraphWindowDraft;
  variables: GraphVariables;
  from: number;
  to: number;
}) {
  const [from, to] = clampRange(args.from, args.to, args.graphWindow.xMin, args.graphWindow.xMax);
  const samples = 72;
  const points: string[] = [];
  const baselineY = Math.min(Math.max(0, args.graphWindow.yMin), args.graphWindow.yMax);
  points.push(`${xToScreen(from, args.graphWindow)},${yToScreen(baselineY, args.graphWindow)}`);

  for (let index = 0; index <= samples; index += 1) {
    const x = from + ((to - from) * index) / samples;
    const y = evaluateExpression(args.expression, { ...args.variables, x });
    if (y === null || !Number.isFinite(y)) continue;
    points.push(`${xToScreen(x, args.graphWindow)},${yToScreen(y, args.graphWindow)}`);
  }

  points.push(`${xToScreen(to, args.graphWindow)},${yToScreen(baselineY, args.graphWindow)}`);
  return points.length >= 3 ? `M ${points.join(" L ")} Z` : "";
}

function buildTangentLine(args: {
  expression: string;
  graphWindow: ProbeGraphWindowDraft;
  variables: GraphVariables;
  x: number;
}) {
  const h = Math.max((args.graphWindow.xMax - args.graphWindow.xMin) / 1200, 0.001);
  const y0 = evaluateExpression(args.expression, { ...args.variables, x: args.x });
  const yLeft = evaluateExpression(args.expression, { ...args.variables, x: args.x - h });
  const yRight = evaluateExpression(args.expression, { ...args.variables, x: args.x + h });
  if (y0 === null || yLeft === null || yRight === null) return null;

  const slope = (yRight - yLeft) / (2 * h);
  const xSpan = (args.graphWindow.xMax - args.graphWindow.xMin) * 0.32;
  const x1 = Math.max(args.graphWindow.xMin, args.x - xSpan);
  const x2 = Math.min(args.graphWindow.xMax, args.x + xSpan);
  const y1 = y0 + slope * (x1 - args.x);
  const y2 = y0 + slope * (x2 - args.x);

  return {
    x1: xToScreen(x1, args.graphWindow),
    y1: yToScreen(y1, args.graphWindow),
    x2: xToScreen(x2, args.graphWindow),
    y2: yToScreen(y2, args.graphWindow),
    px: xToScreen(args.x, args.graphWindow),
    py: yToScreen(y0, args.graphWindow),
    slope,
  };
}

function buildSecantLine(args: {
  expression: string;
  graphWindow: ProbeGraphWindowDraft;
  variables: GraphVariables;
  from: number;
  to: number;
}) {
  const [from, to] = clampRange(args.from, args.to, args.graphWindow.xMin, args.graphWindow.xMax);
  const y1 = evaluateExpression(args.expression, { ...args.variables, x: from });
  const y2 = evaluateExpression(args.expression, { ...args.variables, x: to });
  if (y1 === null || y2 === null) return null;

  return {
    x1: xToScreen(from, args.graphWindow),
    y1: yToScreen(y1, args.graphWindow),
    x2: xToScreen(to, args.graphWindow),
    y2: yToScreen(y2, args.graphWindow),
  };
}

function findIntersections(args: {
  functions: ProbeGraphFunctionDraft[];
  graphWindow: ProbeGraphWindowDraft;
  variables: GraphVariables;
}) {
  const [first, second] = args.functions;
  if (!first || !second || second.enabled === false) return [];

  const points: Array<{ x: number; y: number }> = [];
  const samples = 220;
  let previousX: number | null = null;
  let previousDiff: number | null = null;

  for (let index = 0; index <= samples; index += 1) {
    const x = args.graphWindow.xMin + ((args.graphWindow.xMax - args.graphWindow.xMin) * index) / samples;
    const y1 = evaluateExpression(first.expression, { ...args.variables, x });
    const y2 = evaluateExpression(second.expression, { ...args.variables, x });
    if (y1 === null || y2 === null) continue;

    const diff = y1 - y2;
    if (previousX !== null && previousDiff !== null && Math.sign(diff) !== Math.sign(previousDiff)) {
      const ratio = Math.abs(previousDiff) / (Math.abs(previousDiff) + Math.abs(diff));
      const hitX = previousX + (x - previousX) * ratio;
      const hitY = evaluateExpression(first.expression, { ...args.variables, x: hitX });
      if (hitY !== null) points.push({ x: roundForStorage(hitX, 3), y: roundForStorage(hitY, 3) });
    }

    if (Math.abs(diff) < 0.015) {
      points.push({ x: roundForStorage(x, 3), y: roundForStorage(y1, 3) });
    }

    previousX = x;
    previousDiff = diff;
  }

  return points.slice(0, 5);
}

export function Graph2DWorkspace({
  expression,
  functions,
  graphWindow,
  variables,
  selectedPoint,
  disabled,
  visualState,
  onPointSelect,
}: {
  expression: string;
  functions: ProbeGraphFunctionDraft[];
  graphWindow: ProbeGraphWindowDraft;
  variables: GraphVariables;
  selectedPoint: ProbeGraphPointDraft | null;
  disabled?: boolean;
  visualState?: GraphVisualState;
  onPointSelect: (point: ProbeGraphPointDraft) => void;
}) {
  const functionPaths = functions.map((fn) => ({
    id: fn.id,
    label: fn.label ?? fn.id,
    path: fn.enabled === false ? "" : buildPath(fn.expression, graphWindow, variables),
  }));

  const xAxisHighlighted = visualState?.highlightedAxis === "x";
  const yAxisHighlighted = visualState?.highlightedAxis === "y";
  const tangent = visualState?.tangent
    ? buildTangentLine({ expression, graphWindow, variables, x: visualState.tangent.x })
    : null;
  const secant = visualState?.secant
    ? buildSecantLine({ expression, graphWindow, variables, from: visualState.secant.from, to: visualState.secant.to })
    : null;
  const areaPath = visualState?.areaRegion
    ? buildAreaRegionPath({ expression, graphWindow, variables, from: visualState.areaRegion.from, to: visualState.areaRegion.to })
    : "";
  const intersections = visualState?.showIntersections
    ? findIntersections({ functions, graphWindow, variables })
    : [];

  function handleGraphClick(event: MouseEvent<SVGSVGElement>) {
    if (disabled) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const screenX = ((event.clientX - rect.left) / rect.width) * GRAPH_WIDTH;
    const screenY = ((event.clientY - rect.top) / rect.height) * GRAPH_HEIGHT;
    const x = screenToX(screenX, graphWindow);
    const evaluatedY = evaluateExpression(expression, { ...variables, x });
    const y = evaluatedY ?? screenToY(screenY, graphWindow);

    onPointSelect({
      x: roundForStorage(x, 3),
      y: roundForStorage(y, 3),
      expression,
    });
  }

  return (
    <div style={{ display: "grid", gap: "0.72rem" }}>
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          border: "1px solid rgba(221,214,254,0.16)",
          borderRadius: "24px",
          background:
            "linear-gradient(145deg, rgba(5,5,16,0.93), rgba(39,13,64,0.72))",
        }}
      >
        <svg
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
          role="img"
          aria-label="Interactive 2D graph"
          onClick={handleGraphClick}
          style={{ display: "block", width: "100%", cursor: disabled ? "default" : "crosshair" }}
        >
          <defs>
            <pattern id="minor-grid-2d" width="38" height="38" patternUnits="userSpaceOnUse">
              <path
                d="M 38 0 L 0 0 0 38"
                fill="none"
                stroke="rgba(255,255,255,0.055)"
                strokeWidth="1"
              />
            </pattern>
            <radialGradient id="graph-glow-2d" cx="50%" cy="48%" r="60%">
              <stop offset="0%" stopColor="rgba(168,85,247,0.16)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
          </defs>

          <rect width={GRAPH_WIDTH} height={GRAPH_HEIGHT} fill="url(#minor-grid-2d)" />
          <rect width={GRAPH_WIDTH} height={GRAPH_HEIGHT} fill="url(#graph-glow-2d)" />

          {areaPath ? (
            <path
              d={areaPath}
              fill="rgba(251,191,36,0.18)"
              stroke="rgba(251,191,36,0.55)"
              strokeWidth={1.5}
            />
          ) : null}

          {graphWindow.xMin < 0 && graphWindow.xMax > 0 ? (
            <line
              x1={xToScreen(0, graphWindow)}
              x2={xToScreen(0, graphWindow)}
              y1={0}
              y2={GRAPH_HEIGHT}
              stroke={yAxisHighlighted ? "rgba(251,191,36,0.95)" : "rgba(255,255,255,0.28)"}
              strokeWidth={yAxisHighlighted ? 4 : 1.5}
            />
          ) : null}

          {graphWindow.yMin < 0 && graphWindow.yMax > 0 ? (
            <line
              x1={0}
              x2={GRAPH_WIDTH}
              y1={yToScreen(0, graphWindow)}
              y2={yToScreen(0, graphWindow)}
              stroke={xAxisHighlighted ? "rgba(251,191,36,0.95)" : "rgba(255,255,255,0.28)"}
              strokeWidth={xAxisHighlighted ? 4 : 1.5}
            />
          ) : null}

          <text
            x={GRAPH_WIDTH - 28}
            y={graphWindow.yMin < 0 && graphWindow.yMax > 0 ? yToScreen(0, graphWindow) - 10 : GRAPH_HEIGHT - 20}
            fill={xAxisHighlighted ? "rgba(251,191,36,0.98)" : "rgba(255,255,255,0.42)"}
            fontSize={xAxisHighlighted ? 22 : 16}
            fontWeight="900"
          >
            x
          </text>
          <text
            x={graphWindow.xMin < 0 && graphWindow.xMax > 0 ? xToScreen(0, graphWindow) + 10 : 18}
            y={24}
            fill={yAxisHighlighted ? "rgba(251,191,36,0.98)" : "rgba(255,255,255,0.42)"}
            fontSize={yAxisHighlighted ? 22 : 16}
            fontWeight="900"
          >
            y
          </text>

          {functionPaths.map((fnPath, index) =>
            fnPath.path ? (
              <path
                key={fnPath.id}
                d={fnPath.path}
                fill="none"
                stroke={visualState?.activeFunctionId === fnPath.id ? "rgba(251,191,36,0.98)" : index === 0 ? "rgba(221,214,254,0.98)" : "rgba(125,211,252,0.82)"}
                strokeWidth={visualState?.activeFunctionId === fnPath.id ? 5 : 3.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null,
          )}

          {secant ? (
            <g>
              <line
                x1={secant.x1}
                y1={secant.y1}
                x2={secant.x2}
                y2={secant.y2}
                stroke="rgba(125,211,252,0.95)"
                strokeWidth={3}
                strokeDasharray="8 6"
              />
              <circle cx={secant.x1} cy={secant.y1} r={6} fill="white" />
              <circle cx={secant.x2} cy={secant.y2} r={6} fill="white" />
            </g>
          ) : null}

          {tangent ? (
            <g>
              <line
                x1={tangent.x1}
                y1={tangent.y1}
                x2={tangent.x2}
                y2={tangent.y2}
                stroke="rgba(251,191,36,0.98)"
                strokeWidth={3.4}
              />
              <circle cx={tangent.px} cy={tangent.py} r={7} fill="white" stroke="rgba(251,191,36,0.95)" strokeWidth={4} />
            </g>
          ) : null}

          {intersections.map((point, index) => (
            <g key={`${point.x}-${point.y}-${index}`}>
              <circle
                cx={xToScreen(point.x, graphWindow)}
                cy={yToScreen(point.y, graphWindow)}
                r={8}
                fill="rgba(125,211,252,0.95)"
                stroke="white"
                strokeWidth={3}
              />
              <text
                x={xToScreen(point.x, graphWindow) + 10}
                y={yToScreen(point.y, graphWindow) - 10}
                fill="white"
                fontSize="13"
                fontWeight="900"
              >
                both rules
              </text>
            </g>
          ))}

          {visualState?.point ? (
            <g>
              <circle
                cx={xToScreen(visualState.point.x, graphWindow)}
                cy={yToScreen(visualState.point.y, graphWindow)}
                r={8}
                fill="white"
                stroke="rgba(251,191,36,0.95)"
                strokeWidth={4}
              />
              {visualState.point.label ? (
                <text
                  x={xToScreen(visualState.point.x, graphWindow) + 12}
                  y={yToScreen(visualState.point.y, graphWindow) - 12}
                  fill="white"
                  fontSize="13"
                  fontWeight="900"
                >
                  {visualState.point.label}
                </text>
              ) : null}
            </g>
          ) : null}

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
              <line
                x1={0}
                x2={GRAPH_WIDTH}
                y1={yToScreen(selectedPoint.y, graphWindow)}
                y2={yToScreen(selectedPoint.y, graphWindow)}
                stroke="rgba(255,255,255,0.1)"
                strokeDasharray="5 5"
              />
              <circle
                cx={xToScreen(selectedPoint.x, graphWindow)}
                cy={yToScreen(selectedPoint.y, graphWindow)}
                r={8}
                fill="white"
                stroke="rgba(168,85,247,0.95)"
                strokeWidth={4}
              />
            </g>
          ) : null}
        </svg>

        <div
          style={{
            pointerEvents: "none",
            position: "absolute",
            left: "1rem",
            top: "1rem",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "999px",
            background: "rgba(0,0,0,0.32)",
            padding: "0.42rem 0.62rem",
            color: "rgba(255,255,255,0.74)",
            fontSize: "0.76rem",
            backdropFilter: "blur(10px)",
          }}
        >
          <span style={{ display: "block", color: "white", fontWeight: 950 }}>{visualState?.overlayTitle ?? visualState?.activeStepTitle ?? "2D graph"}</span>
          {visualState?.overlayText ? (
            <span style={{ display: "block", marginTop: "0.25rem", color: "rgba(255,255,255,0.82)", lineHeight: 1.45 }}>{visualState.overlayText}</span>
          ) : (
            <span>Click the curve to mark a point</span>
          )}
        </div>

        {visualState?.highlightedTerm ? (
          <div
            style={{
              pointerEvents: "none",
              position: "absolute",
              right: "1rem",
              top: "1rem",
              border: "1px solid rgba(251,191,36,0.36)",
              borderRadius: "16px",
              background: "rgba(0,0,0,0.42)",
              padding: "0.55rem 0.72rem",
              color: "rgba(254,243,199,0.96)",
              fontSize: "0.82rem",
              fontWeight: 900,
              backdropFilter: "blur(10px)",
            }}
          >
            watching: {visualState.highlightedTerm}
          </div>
        ) : null}

        {visualState?.labels.length ? (
          <div
            style={{
              pointerEvents: "none",
              position: "absolute",
              left: "1rem",
              bottom: "1rem",
              display: "grid",
              gap: "0.4rem",
              maxWidth: "21rem",
            }}
          >
            {visualState.labels.slice(-4).map((label) => (
              <div
                key={label.id}
                style={{
                  border: "1px solid rgba(221,214,254,0.18)",
                  borderRadius: "16px",
                  background: "rgba(0,0,0,0.42)",
                  padding: "0.5rem 0.65rem",
                  color: "rgba(255,255,255,0.86)",
                  fontSize: "0.78rem",
                  lineHeight: 1.4,
                  backdropFilter: "blur(10px)",
                }}
              >
                {label.text}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "center",
          color: probeTheme.text.secondary,
          fontSize: "0.82rem",
        }}
      >
        <span>
          {visualState?.areaRegion ? `Area ${formatNumber(visualState.areaRegion.from)} to ${formatNumber(visualState.areaRegion.to)}` : "Selected point"}
        </span>
        <ProbePill tone={selectedPoint ? "purple" : "default"}>
          {formatPoint(selectedPoint)}
        </ProbePill>
      </div>
    </div>
  );
}
