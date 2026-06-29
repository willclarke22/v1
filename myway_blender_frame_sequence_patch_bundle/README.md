# MyWay Blender Frame Sequence Generated-Video Patch

This patch adds a safe local Blender render path to the generated-video probe lab.

It does **not** let the model write Blender Python. The model writes the existing MyWay video director contract, then a trusted MyWay-owned Python script renders a PNG frame sequence.

## Adds

- `app/api/probe-lab/generated-video/blender-render/route.ts`
- `scripts/blender/render-myway-director.py`
- `ui/learning-space/probes/generated-video/blender/blender-director-render-lab.tsx`
- `ui/learning-space/probes/generated-video/blender/blender-frame-sequence-player.tsx`
- `ui/learning-space/probes/generated-video/blender/index.ts`
- `public/generated-video-renders/.gitkeep`

## Modifies

- `app/probe-lab/page.tsx`
- `app/probe-lab/generated-video/page.tsx`
- `ui/learning-space/probes/generated-video/index.ts`

## Apply

From repo root:

```powershell
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\myway_blender_frame_sequence_patch_bundle.zip" -DestinationPath . -Force
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\myway_blender_frame_sequence_patch_bundle\apply-myway-blender-frame-sequence-patch.ps1 -RunBuild
```

The script adds this to `.env.local` if it is missing:

```env
MYWAY_BLENDER_EXE=C:\Program Files\Blender Foundation\Blender 5.1\blender.exe
```

Restart `pnpm dev` after applying.

## Test

Open:

```txt
http://localhost:3000/probe-lab/generated-video
```

Use the new **Blender director render** section.

Recommended first test:

- Learner message: `I understand x squared and y squared separately, but I do not get why x squared minus y squared makes a saddle.`
- Topic: `Multivariable surfaces`
- Diagnosis: `representation_gap`
- Interests: `mountains, skiing, maps`

Click:

```txt
Generate director + render with Blender
```

The route returns PNG frames under:

```txt
public/generated-video-renders/<render_id>/frame_0001.png
```

The browser plays those frames as an animation without needing ffmpeg.
