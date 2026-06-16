# Mock model artifact providers

This folder is the TypeScript bridge from mock files under `models/` into the
MyWay engine.

It is intentionally dev-only for now.

Current proof path:

```txt
models/diagnosis/mock-v0/*.json
models/probe-contract/mock-v0/*.json
models/attempt-evaluator/mock-v0/*.json
â†’ loadMockThreeModelScenario()
â†’ buildMockThreeModelTurn()
â†’ EngineRenderableProbe
â†’ local-dev route
```

Next step is to wire this behind an env flag into `/api/message`, so the real UI
can receive `delivered_probe_preview.engineRenderableProbe`.
