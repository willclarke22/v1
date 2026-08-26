param(
  [string]$BaseUrl = "http://localhost:3000",
  [int]$PollSeconds = 6,
  [int]$MaxMinutes = 240
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
$Endpoint = "$BaseUrl/api/sandbox/probe-lab/assets/enrichment"

try {
  $health = Invoke-MyWayJson `
    -Method GET `
    -Uri $Endpoint
}
catch {
  throw "Could not reach the MyWay enrichment route at $Endpoint. Start the local Next.js server (for example pnpm dev) and rerun this script. $($_.Exception.Message)"
}

if (-not $health.ok) {
  throw "The MyWay enrichment route responded but did not report ok=true."
}

Write-Host "Scanning Asset Library → Needs Review for missing vision or embeddings..." -ForegroundColor Cyan
Write-Host "Keep the local Next.js server running until this script completes." -ForegroundColor Yellow

$result = Invoke-MyWayJson `
  -Method POST `
  -Uri $Endpoint `
  -Body @{
    action = "backfill_needs_review_missing"
  }

if (-not $result.ok) {
  $message = "The Needs Review enrichment backfill could not be queued."
  if ($result.error) { $message = [string]$result.error }
  throw $message
}

Write-Host (
  "Needs Review: {0}; incomplete: {1}; already complete: {2}; not applicable: {3}; queued: {4} (vision+embedding: {5}; embedding-only: {6}); skipped: {7}." -f `
    $result.needs_review_count, `
    $result.incomplete_count, `
    $result.already_complete_count, `
    $result.not_applicable_count, `
    $result.queued_count, `
    $result.full_count, `
    $result.embedding_only_count, `
    $result.skipped_count
) -ForegroundColor Green

$skipped = @($result.skipped)
if ($skipped.Count -gt 0) {
  Write-Host ""
  Write-Host "Incomplete Needs Review assets that could not be queued:" -ForegroundColor DarkYellow
  $skipped | ForEach-Object {
    Write-Host ("- {0} [{1}]: {2}" -f $_.asset_id, $_.mode, $_.reason) -ForegroundColor DarkYellow
  }
}

$assetIds = @(
  $result.entries |
    ForEach-Object { [string]$_.asset_id } |
    Where-Object { $_ } |
    Sort-Object -Unique
)

if ($assetIds.Count -eq 0) {
  if ($skipped.Count -gt 0) {
    throw "No provider work was queued, but $($skipped.Count) incomplete Needs Review asset(s) were skipped."
  }

  Write-Host "Every eligible Needs Review asset already has vision and a durable embedding." -ForegroundColor Green
  exit 0
}

Write-Host ""
Write-Host "Queued asset modes:" -ForegroundColor Cyan
$result.entries |
  Sort-Object asset_id |
  ForEach-Object {
    Write-Host ("- {0}: {1}" -f $_.asset_id, $_.mode)
  }

$deadline = (Get-Date).AddMinutes([Math]::Max(1, $MaxMinutes))
$missingPolls = 0

while ($true) {
  if ((Get-Date) -gt $deadline) {
    throw "Timed out waiting for the enrichment queue after $MaxMinutes minute(s)."
  }

  Start-Sleep -Seconds ([Math]::Max(2, $PollSeconds))

  $snapshot = Invoke-MyWayJson `
    -Method GET `
    -Uri $Endpoint

  if (-not $snapshot.ok) {
    $message = "The enrichment queue could not be read."
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
  $failed = @($entries | Where-Object status -eq "failed").Count
  $known = $entries.Count
  $missing = [Math]::Max(0, $assetIds.Count - $known)

  if ($missing -gt 0) {
    $missingPolls += 1
  }
  else {
    $missingPolls = 0
  }

  Write-Host (
    "[{0}] queued={1} running={2} completed={3} failed={4} awaiting-status={5}" -f `
      (Get-Date -Format "HH:mm:ss"),
      $queued,
      $running,
      $completed,
      $failed,
      $missing
  )

  if ($missingPolls -ge 5) {
    throw "The in-memory enrichment queue lost status for $missing asset(s). The Next.js server may have restarted; rerun this script after the server is stable."
  }

  if (
    $missing -eq 0 -and
    $queued -eq 0 -and
    $running -eq 0
  ) {
    if ($failed -gt 0) {
      Write-Host ""
      Write-Host "Needs Review enrichment completed with failures:" -ForegroundColor Red
      $entries |
        Where-Object status -eq "failed" |
        Sort-Object asset_id |
        ForEach-Object {
          Write-Host ("- {0} [{1}]: {2}" -f $_.asset_id, $_.mode, $_.error) -ForegroundColor Red
        }
      exit 1
    }

    if ($skipped.Count -gt 0) {
      throw "Provider work completed, but $($skipped.Count) incomplete Needs Review asset(s) remain skipped because their model file is unavailable."
    }

    Write-Host ""
    Write-Host "All queued Needs Review assets now finished the missing vision/embedding work." -ForegroundColor Green
    exit 0
  }
}
