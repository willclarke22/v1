# MyWay Step 28d updated learning-space files

This package updates:

- lib/learning-space/build-learning-space.ts
- lib/learning-space/relationship-graph/relationship-policy.ts
- lib/learning-space/relationship-graph/relationship-types.ts
- lib/learning-space/relationship-graph/build-topic-relationships.ts

It archives:

- lib/learning-space/engine-bridge.ts

Why:
- build-learning-space.ts now imports directly from lib/learning-space/relationship-graph.
- engine-bridge.ts is no longer needed as a compatibility re-export.
- stale visual-test wording is cleaned to calibration wording.
- shallow-field fallback wording is preserved where the code is using older shallow topic fields as fallback.
