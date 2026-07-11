# Primitive Builder Lab

A sandbox lane for testing whether MyWay can build recognizable, useful, and beautiful 3D scenes from procedural primitives.

## Current lane

- User types a build request.
- The page calls `/api/sandbox/probe-lab/primitive-builder/generate`.
- DeepSeek or GLM-5.2 produces `primitive_scene_graph_v1` JSON.
- MyWay validates and normalizes the grouped scene graph.
- The client renderer assembles it with a closed React Three Fiber primitive vocabulary.
- Motion is represented with allowed motion semantics such as `pathLoop`, `swingY`, `rotateZ`, `oscillateY`, `orbitAround`, `followTarget`, `connectBetween`, and `pulse`.

The model never writes React, Three.js code, asset paths, file paths, or arbitrary JavaScript. It only outputs a structured grouped scene graph.

## Philosophy

This is the Lego approach: build meaning from small reusable pieces first. Assets can later replace primitive pieces when available, but the semantic scene should work without them.

The key upgrade from the original flat planner is that scenes are now grouped:

- big scene masses first
- meaningful parent groups
- local child coordinates
- articulated subparts
- explicit motion semantics
- optional flat `plan` compatibility generated from the graph for debugging/sidebar display
