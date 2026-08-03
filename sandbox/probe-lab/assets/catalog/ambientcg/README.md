
# ambientCG Phase 1 catalog

This folder mirrors ambientCG API v3 metadata without downloading every binary
asset. The browser-facing workspace lives at:

`/sandbox/probe-lab/asset-library/ambientcg`

The sync endpoint processes one page at a time and stores a resumable checkpoint.
Materials and HDRIs are cached only when selected in the UI. Other ambientCG
resource types remain searchable catalog records for later phases.


## Material appearance enrichment

Material ids such as `Leather034` remain the permanent ambientCG identity. A
separate appearance registry stores a concise vision description, measured
dominant colors, and measured dark/medium/light brightness under that source id.

The material prompt is intentionally narrow:

> Describe the visible surface appearance of this material in one concise
> sentence. Mention color character, visible texture, pattern or grain, surface
> variation, and apparent finish only when clearly visible. Do not infer brand,
> age, origin, durability, composition, or object suitability.

The AmbientCG page can analyze one material or the next three pending materials.
For a full local run, keep `pnpm dev` running and execute:

```powershell
& ".\sandbox\probe-lab\assets\scripts\analyze-all-ambientcg-materials.ps1"
```
