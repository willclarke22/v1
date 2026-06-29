param(
  [switch]$RunBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = (Get-Location).Path
$patchRoot = Join-Path $repoRoot "myway_procedural_visual_compiler_patch_bundle"
$patchFiles = Join-Path $patchRoot "patch-files"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $repoRoot "archive\patch-backups\myway-procedural-visual-compiler-$timestamp"

Write-Host "Applying MyWay procedural visual compiler patch..."
Write-Host "Repo root: $repoRoot"
Write-Host "Patch root: $patchRoot"
Write-Host ""

if (-not (Test-Path -LiteralPath $patchFiles)) {
  throw "Missing patch-files directory at $patchFiles. Make sure you expanded the zip into the repo root."
}

$files = @(
  "app\api\probe-lab\generated-video\blender-render\route.ts",
  "scripts\blender\render-myway-director.py",
  "ui\learning-space\probes\generated-video\index.ts",
  "ui\learning-space\probes\generated-video\procedural-compiler\index.ts",
  "ui\learning-space\probes\generated-video\procedural-compiler\procedural-visual-contract.ts",
  "ui\learning-space\probes\generated-video\procedural-compiler\compile-video-director-to-procedural-plan.ts"
)

$backedUp = @()
$applied = @()

foreach ($relative in $files) {
  $source = Join-Path $patchFiles $relative
  $target = Join-Path $repoRoot $relative

  if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing patch source: $source"
  }

  $targetDir = Split-Path -Parent $target
  if (-not (Test-Path -LiteralPath $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  }

  if (Test-Path -LiteralPath $target) {
    $backupPath = Join-Path $backupRoot $relative
    $backupDir = Split-Path -Parent $backupPath
    if (-not (Test-Path -LiteralPath $backupDir)) {
      New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    }
    Copy-Item -LiteralPath $target -Destination $backupPath -Force
    $backedUp += $relative
  }

  Copy-Item -LiteralPath $source -Destination $target -Force
  $applied += $relative
}

Write-Host "Applied files:"
foreach ($file in $applied) {
  Write-Host "  $file"
}

if ($backedUp.Count -gt 0) {
  Write-Host ""
  Write-Host "Backups created here:"
  Write-Host "  $backupRoot"
  Write-Host "Backed up files:"
  foreach ($file in $backedUp) {
    Write-Host "  $file"
  }
} else {
  Write-Host ""
  Write-Host "No existing files needed backups."
}

Write-Host ""
Write-Host "Removing patch source files from extracted bundle so Next.js does not type-check them..."
Remove-Item -LiteralPath $patchFiles -Recurse -Force

Write-Host ""
Write-Host "Patch applied. This keeps the work inside probe-lab/generated-video sandbox."
Write-Host "Open after dev restart: http://localhost:3000/probe-lab/generated-video"

if ($RunBuild) {
  Write-Host ""
  Write-Host "Running pnpm build..."
  pnpm build
}
