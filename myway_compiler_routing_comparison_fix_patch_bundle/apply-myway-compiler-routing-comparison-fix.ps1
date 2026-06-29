param(
  [switch]$RunBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = (Get-Location).Path
$patchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$patchFilesRoot = Join-Path $patchRoot "patch-files"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $repoRoot "archive\patch-backups\myway-compiler-routing-comparison-fix-$timestamp"

Write-Host "Applying MyWay compiler routing + comparison fix patch..."
Write-Host "Repo root: $repoRoot"
Write-Host "Patch root: $patchRoot"
Write-Host ""

$files = @(
  "ui\learning-space\probes\generated-video\procedural-compiler\compile-video-director-to-procedural-plan.ts"
)

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

foreach ($relative in $files) {
  $source = Join-Path $patchFilesRoot $relative
  $target = Join-Path $repoRoot $relative

  if (-not (Test-Path -LiteralPath $source)) {
    throw "Patch source missing: $source"
  }

  $targetDir = Split-Path -Parent $target
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

  if (Test-Path -LiteralPath $target) {
    $backup = Join-Path $backupRoot $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
    Copy-Item -LiteralPath $target -Destination $backup -Force
  }

  Copy-Item -LiteralPath $source -Destination $target -Force
}

Write-Host "Applied files:"
$files | ForEach-Object { Write-Host "  $_" }
Write-Host ""
Write-Host "Backups created here:"
Write-Host "  $backupRoot"
Write-Host ""

# Remove extracted patch source files so Next.js does not type-check duplicate code inside the bundle.
Write-Host "Removing patch source files from extracted bundle so Next.js does not type-check them..."
Remove-Item -LiteralPath $patchFilesRoot -Recurse -Force

Write-Host ""
Write-Host "Patch applied. This fixes the Spanish se / comparison_space_3d case compiling into a surface."
Write-Host "Expected procedural strategy after this patch: comparison_reveal"
Write-Host ""

if ($RunBuild) {
  Write-Host "Running pnpm build..."
  pnpm build
}
