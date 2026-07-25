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
$Endpoint = "$BaseUrl/api/sandbox/probe-lab/assets/enrichment"

Write-Host "Queuing all existing MyWay assets for style analysis..." -ForegroundColor Cyan
Write-Host "Keep the Next.js server running until this script completes." -ForegroundColor Yellow

$result = Invoke-MyWayJson `
  -Method POST `
  -Uri $Endpoint `
  -Body @{
    action = "enrich_all"
    force = -not $NoForce.IsPresent
  }

if (-not $result.ok) {
  $message = "The analysis batch could not be queued."
  if ($result.error) { $message = [string]$result.error }
  throw $message
}

$assetIds = @(
  $result.entries |
    ForEach-Object { [string]$_.asset_id } |
    Where-Object { $_ } |
    Sort-Object -Unique
)

Write-Host ("Queued: {0} asset(s). Skipped: {1}." -f $result.queued_count, $result.skipped_count) -ForegroundColor Green

if ($result.skipped_count -gt 0) {
  $result.skipped |
    ForEach-Object {
      Write-Host ("Skipped {0}: {1}" -f $_.asset_id, $_.reason) -ForegroundColor DarkYellow
    }
}

if ($assetIds.Count -eq 0) {
  Write-Host "No eligible assets needed analysis." -ForegroundColor Green
  exit 0
}

while ($true) {
  Start-Sleep -Seconds ([Math]::Max(2, $PollSeconds))

  $snapshot = Invoke-MyWayJson `
    -Method GET `
    -Uri $Endpoint

  if (-not $snapshot.ok) {
    $message = "The analysis queue could not be read."
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

  Write-Host (
    "[{0}] queued={1} running={2} completed={3} failed={4} awaiting-status={5}" -f `
      (Get-Date -Format "HH:mm:ss"),
      $queued,
      $running,
      $completed,
      $failed,
      $missing
  )

  if (
    $missing -eq 0 -and
    $queued -eq 0 -and
    $running -eq 0
  ) {
    if ($failed -gt 0) {
      Write-Host "" 
      Write-Host "Analysis completed with failures:" -ForegroundColor Red
      $entries |
        Where-Object status -eq "failed" |
        ForEach-Object {
          Write-Host ("- {0}: {1}" -f $_.asset_id, $_.error) -ForegroundColor Red
        }
      exit 1
    }

    Write-Host ""
    Write-Host "All queued assets finished style analysis and embedding." -ForegroundColor Green
    exit 0
  }
}
