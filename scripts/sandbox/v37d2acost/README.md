# MyWay V3.7D.2A Cost Observability (2026-10-27)

Adds provider-reported token usage to sandbox OpenAI assessment and teaching responses. Workbench calculates a USD estimate from standard published GPT-4o mini / GPT-4.1 mini rates, accounts for cached input tokens when reported, shows a per-stage breakdown, and adds cost to the local last-12-run metrics.

Pricing snapshot (USD / 1M tokens):
- GPT-4o mini: 0.15 input, 0.075 cached input, 0.60 output.
- GPT-4.1 mini: 0.40 input, 0.10 cached input, 1.60 output.
Official sources: https://developers.openai.com/api/docs/models/gpt-4o-mini ; https://developers.openai.com/api/docs/models/gpt-4.1-mini

Provider metadata is not a billing invoice. Exact billed spend may differ due to discounts, taxes, endpoint routing, billing adjustments, future pricing changes, and local compute cost. No token counts are inferred from prompt characters. GLM rate left unknown unless separately verified; Edge on-device has no cloud token billing from this flow. Missing or failed calls show partial/unavailable cost rather than treating them as free.

No changes to learner state, topic memory write approval, database, search, routes, workers, Director, or geometry. Installer does not contact LLMs or write to Supabase.

Run: `& .\scripts\sandbox\v37d2acost\run-preview.ps1`
Roll back using the original extracted patch's `ROLLBACK_V37D2ACOST.ps1`; it will refuse if files changed since installation.
