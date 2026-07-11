# Primitive Builder Sandbox

A sandbox-only lane for testing the "Lego primitives" idea: MyWay should be able to construct useful, good-looking teaching objects from small procedural parts before relying on external assets.

Current version:

- Client-side only.
- No model call yet.
- Deterministic prompt-to-plan heuristics for car/vehicle, rocket, house, robot, bridge, and generic build requests.
- React Three Fiber rendering using boxes, spheres, cylinders, cones, torus meshes, labels, and simple build-step controls.

Goal:

- Prove that MyWay can build the structure of an object from primitives.
- Later, connect the same plan shape to a model-generated construction plan.
- Later still, let registered BlendKit/GLB assets replace primitive parts when they improve the scene.
