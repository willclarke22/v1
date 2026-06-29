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
import {
  buildPath,
  evaluateExpression,
  formatPoint,
  roundForStorage,
  screenToX,
  screenToY,
  xToScreen,
  yToScreen,
} from "./graph-expression";

export function Graph2DWorkspace({
  expression,
  functions,
  graphWindow,
  variables,
  selectedPoint,
  disabled,
  onPointSelect,
}: {
  expression: string;
  functions: ProbeGraphFunctionDraft[];
  graphWindow: ProbeGraphWindowDraft;
  variables: GraphVariables;
  selectedPoint: ProbeGraphPointDraft | null;
  disabled?: boolean;
  onPointSelect: (point: ProbeGraphPointDraft) => void;
}) {
  const functionPaths = functions.map((fn) => ({
    id: fn.id,
    path: fn.enabled === false ? "" : buildPath(fn.expression, graphWindow, variables),
  }));

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

          <text
            x={GRAPH_WIDTH - 28}
            y={graphWindow.yMin < 0 && graphWindow.yMax > 0 ? yToScreen(0, graphWindow) - 10 : GRAPH_HEIGHT - 20}
            fill="rgba(255,255,255,0.42)"
            fontSize="16"
            fontWeight="800"
          >
            x
          </text>
          <text
            x={graphWindow.xMin < 0 && graphWindow.xMax > 0 ? xToScreen(0, graphWindow) + 10 : 18}
            y={24}
            fill="rgba(255,255,255,0.42)"
            fontSize="16"
            fontWeight="800"
          >
            y
          </text>

          {functionPaths.map((fnPath, index) =>
            fnPath.path ? (
              <path
                key={fnPath.id}
                d={fnPath.path}
                fill="none"
                stroke={index === 0 ? "rgba(221,214,254,0.98)" : "rgba(125,211,252,0.82)"}
                strokeWidth={3.2}
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
          Click the curve to mark a point
        </div>
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
        <span>Selected point</span>
        <ProbePill tone={selectedPoint ? "purple" : "default"}>
          {formatPoint(selectedPoint)}
        </ProbePill>
      </div>
    </div>
  );
}
