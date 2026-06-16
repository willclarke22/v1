$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Applying MyWay Step 28d updated learning-space files"
Write-Host "Project root: $(Get-Location)"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "archive\manual-step-28d-before-apply-$timestamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$filesToCopy = @(
  "lib\learning-space\build-learning-space.ts",
  "lib\learning-space\relationship-graph\relationship-policy.ts",
  "lib\learning-space\relationship-graph\relationship-types.ts",
  "lib\learning-space\relationship-graph\build-topic-relationships.ts"
)

foreach ($relative in $filesToCopy) {
  $source = Join-Path $sourceRoot $relative
  $destination = Join-Path (Get-Location) $relative

  if (!(Test-Path -LiteralPath $source)) {
    throw "Missing source file in update package: $source"
  }

  if (!(Test-Path -LiteralPath $destination)) {
    throw "Missing destination file in project: $destination"
  }

  $backupName = $relative.Replace("\", "__").Replace("/", "__")
  Copy-Item -LiteralPath $destination -Destination (Join-Path $backupDir "$backupName.before") -Force
  Copy-Item -LiteralPath $source -Destination $destination -Force
  Write-Host "Updated $relative"
}

$bridgePath = "lib\learning-space\engine-bridge.ts"
if (Test-Path -LiteralPath $bridgePath) {
  Copy-Item -LiteralPath $bridgePath -Destination (Join-Path $backupDir "lib__learning-space__engine-bridge.ts.before") -Force
  Move-Item -LiteralPath $bridgePath -Destination (Join-Path $backupDir "engine-bridge.ts.archived") -Force
  Write-Host "Archived $bridgePath"
} else {
  Write-Host "$bridgePath was already absent."
}

Write-Host ""
Write-Host "Verification:"
Select-String -Path @(
  "lib\learning-space\build-learning-space.ts",
  "lib\learning-space\relationship-graph\relationship-policy.ts",
  "lib\learning-space\relationship-graph\relationship-types.ts",
  "lib\learning-space\relationship-graph\build-topic-relationships.ts"
) -Pattern @(
  "engine-bridge",
  "relationship-graph",
  "visual-test",
  "visual-testing",
  "CALIBRATION_MIN_STRENGTH_BY_TYPE",
  "topic_insight_average_gap_calibrated_v3"
) -SimpleMatch | ForEach-Object {
  Write-Host "$($_.Path):$($_.LineNumber): $($_.Line.Trim())"
}

Write-Host ""
Write-Host "Backups archived under:"
Write-Host $backupDir
Write-Host ""
Write-Host "Next command:"
Write-Host "pnpm build"
