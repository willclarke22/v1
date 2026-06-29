param(
  [switch]$RunBuild,
  [switch]$KeepPatchFiles
)

$ErrorActionPreference = "Stop"

$repoRoot = Get-Location
$patchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$patchFiles = Join-Path $patchRoot "patch-files"

if (-not (Test-Path -LiteralPath $patchFiles)) {
  throw "Missing patch-files folder at $patchFiles"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $repoRoot "archive\patch-backups\myway-blender-frame-sequence-$timestamp"
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$files = @(
  "app\api\probe-lab\generated-video\blender-render\route.ts",
  "app\probe-lab\page.tsx",
  "app\probe-lab\generated-video\page.tsx",
  "scripts\blender\render-myway-director.py",
  "public\generated-video-renders\.gitkeep",
  "ui\learning-space\probes\generated-video\index.ts",
  "ui\learning-space\probes\generated-video\blender\index.ts",
  "ui\learning-space\probes\generated-video\blender\blender-director-render-lab.tsx",
  "ui\learning-space\probes\generated-video\blender\blender-frame-sequence-player.tsx"
)

Write-Host "Applying MyWay Blender frame-sequence generated-video patch..." -ForegroundColor Cyan
Write-Host "Repo root: $repoRoot"
Write-Host "Patch root: $patchRoot"
Write-Host ""

$applied = @()
$backedUp = @()

foreach ($relative in $files) {
  $source = Join-Path $patchFiles $relative
  $dest = Join-Path $repoRoot $relative

  if (-not (Test-Path -LiteralPath $source)) {
    throw "Patch source missing: $source"
  }

  if (Test-Path -LiteralPath $dest) {
    $backupPath = Join-Path $backupRoot $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backupPath) | Out-Null
    Copy-Item -LiteralPath $dest -Destination $backupPath -Force
    $backedUp += $relative
  }

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
  Copy-Item -LiteralPath $source -Destination $dest -Force
  $applied += $relative
}

$envLine = 'MYWAY_BLENDER_EXE=C:\Program Files\Blender Foundation\Blender 5.1\blender.exe'
$envPath = Join-Path $repoRoot ".env.local"
if (Test-Path -LiteralPath $envPath) {
  if (-not (Select-String -Path $envPath -Pattern '^MYWAY_BLENDER_EXE=' -Quiet)) {
    Add-Content -LiteralPath $envPath -Value $envLine
    Write-Host "Added MYWAY_BLENDER_EXE to .env.local" -ForegroundColor Green
  } else {
    Write-Host "MYWAY_BLENDER_EXE already exists in .env.local" -ForegroundColor DarkGray
  }
} else {
  Set-Content -LiteralPath $envPath -Value $envLine
  Write-Host "Created .env.local with MYWAY_BLENDER_EXE" -ForegroundColor Green
}

Write-Host ""
Write-Host "Applied files:" -ForegroundColor Green
$applied | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "Backups created here:" -ForegroundColor Yellow
Write-Host "  $backupRoot"
if ($backedUp.Count) {
  Write-Host "Backed up files:" -ForegroundColor Yellow
  $backedUp | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Host "No existing files needed backups."
}

if (-not $KeepPatchFiles) {
  Write-Host ""
  Write-Host "Removing patch source files from extracted bundle so Next.js does not type-check them..." -ForegroundColor DarkGray
  Remove-Item -LiteralPath $patchFiles -Recurse -Force
}

Write-Host ""
Write-Host "Patch applied. Restart pnpm dev before testing Blender from the browser." -ForegroundColor Cyan
Write-Host "Open: http://localhost:3000/probe-lab/generated-video" -ForegroundColor Cyan

if ($RunBuild) {
  Write-Host ""
  Write-Host "Running pnpm build..." -ForegroundColor Cyan
  pnpm build
}
