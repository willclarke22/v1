# Primitive Builder Lab

A sandbox lane for testing whether MyWay can build recognizable, useful, and beautiful 3D scenes from procedural primitives.

## Current lane

- User types a build request.
- The page calls `/api/sandbox/probe-lab/primitive-builder/generate`.
- DeepSeek or GLM-5.2 produces `primitive_build_plan_v1` JSON.
- MyWay validates and normalizes the plan.
- The client renderer assembles the scene with closed React Three Fiber primitives.

The model never writes React, Three.js code, asset paths, or file paths. It only outputs a structured build plan.

## Philosophy

This is the Lego approach: build meaning from small reusable pieces first. Assets can later replace primitive pieces when available, but the semantic scene should work without them.
