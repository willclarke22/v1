# MyWay sandbox

This folder holds experiments, labs, and prototype routes that are not part of the active app runtime.

The goal is to keep production runtime code focused while preserving useful experiments for reference.

Current direction:

- Model outputs structured visual plans.
- MyWay validates and compiles those plans into supported primitives, actions, and interactions.
- Trusted renderers execute the compiled scene.

Useful sandbox code can later be promoted into `lib/visual-story`, `lib/visual-compiler`, or active UI renderers after it is generalized.
