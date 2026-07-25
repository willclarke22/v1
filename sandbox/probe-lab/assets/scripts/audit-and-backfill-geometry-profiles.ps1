param(
  [string]$BaseUrl = "http://localhost:3000",
  [switch]$NoForce,
  [int]$PollSeconds = 8
)

$ErrorActionPreference = "Stop"

function Invoke-MyWayJson {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("GET", "POST")]
    [string]$Method,

    [Parameter(Mandatory = $true)]
    [string]$Uri,

    [object]$Body
  )

  $arguments = @{
    Method = $Method
    Uri = $Uri
    TimeoutSec = 300
    Headers = @{
      "Cache-Control" = "no-store"
    }
  }

  if ($Method -eq "POST") {
    $arguments.ContentType = "application/json"
    $arguments.Body = ($Body | ConvertTo-Json -Depth 8)
  }

  Invoke-RestMethod @arguments
}

$BaseUrl = $BaseUrl.TrimEnd("/")
$Endpoint = "$BaseUrl/api/sandbox/probe-lab/assets/geometry"

Write-Host "Queuing all eligible MyWay GLBs for geometry audit and backfill..." -ForegroundColor Cyan
Write-Host "Existing GLBs are measured in place; no asset is re-imported or replaced." -ForegroundColor Green
Write-Host "Keep pnpm dev running until this script completes." -ForegroundColor Yellow

$result = Invoke-MyWayJson `
  -Method POST `
  -Uri $Endpoint `
  -Body @{
    action = "profile_all"
    force = -not $NoForce.IsPresent
  }

if (-not $result.ok) {
  $message = "The geometry batch could not be queued."
  if ($result.error) { $message = [string]$result.error }
  throw $message
}

$assetIds = @(
  $result.entries |
    ForEach-Object { [string]$_.asset_id } |
    Where-Object { $_ } |
    Sort-Object -Unique
)

Write-Host ("Queued: {0}. Skipped before queueing: {1}." -f $result.queued_count, $result.skipped_count) -ForegroundColor Green

if ($assetIds.Count -eq 0) {
  Write-Host "No eligible GLBs needed geometry profiling." -ForegroundColor Green
  exit 0
}

while ($true) {
  Start-Sleep -Seconds ([Math]::Max(2, $PollSeconds))

  $snapshot = Invoke-MyWayJson `
    -Method GET `
    -Uri $Endpoint

  if (-not $snapshot.ok) {
    $message = "The geometry queue could not be read."
    if ($snapshot.error) { $message = [string]$snapshot.error }
    throw $message
  }

  $entries = @(
    $snapshot.queue |
      Where-Object { $assetIds -contains [string]$_.asset_id }
  )

  $queued = @($entries | Where-Object status -eq "queued").Count
  $running = @($entries | Where-Object status -eq "running").Count
  $completed = @($entries | Where-Object status -eq "completed").Count
  $review = @($entries | Where-Object audit_status -eq "review_required").Count
  $failed = @($entries | Where-Object status -eq "failed").Count
  $skipped = @($entries | Where-Object status -eq "skipped").Count
  $missing = [Math]::Max(0, $assetIds.Count - $entries.Count)

  Write-Host (
    "[{0}] queued={1} running={2} completed={3} review-required={4} failed={5} skipped={6} awaiting-status={7}" -f `
      (Get-Date -Format "HH:mm:ss"),
      $queued,
      $running,
      $completed,
      $review,
      $failed,
      $skipped,
      $missing
  )

  if ($missing -eq 0 -and $queued -eq 0 -and $running -eq 0) {
    Write-Host ""
    Write-Host "Geometry audit/backfill finished." -ForegroundColor Green
    Write-Host "Report: sandbox\probe-lab\assets\debug\latest-geometry-backfill-report.json" -ForegroundColor Cyan

    if ($review -gt 0) {
      Write-Host "Assets requiring review:" -ForegroundColor Yellow
      $entries |
        Where-Object audit_status -eq "review_required" |
        ForEach-Object {
          Write-Host ("- {0}: {1}" -f $_.asset_id, ($_.warnings -join "; ")) -ForegroundColor Yellow
        }
    }

    if ($failed -gt 0) {
      Write-Host "Failures:" -ForegroundColor Red
      $entries |
        Where-Object status -eq "failed" |
        ForEach-Object {
          Write-Host ("- {0}: {1}" -f $_.asset_id, $_.error) -ForegroundColor Red
        }
      exit 1
    }

    exit 0
  }
}
