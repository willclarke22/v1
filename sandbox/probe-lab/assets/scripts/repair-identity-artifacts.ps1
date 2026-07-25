param(
  [string]$BaseUrl = "http://localhost:3000",
  [int]$PollSeconds = 5
)

$ErrorActionPreference = "Stop"

$LibraryUrl = "$BaseUrl/api/sandbox/probe-lab/assets/library"
$EnrichmentUrl = "$BaseUrl/api/sandbox/probe-lab/assets/enrichment"

Write-Host "Repairing asset identity artifacts..." -ForegroundColor Cyan

$result = Invoke-RestMethod `
  -Method Patch `
  -Uri $LibraryUrl `
  -ContentType "application/json" `
  -Body (@{
    action = "repair_all_identity_artifacts"
  } | ConvertTo-Json)

$repaired = @($result.repaired)
$failed = @($result.failed)
$moved = @(
  $repaired |
    ForEach-Object { @($_.moved_identity_files) } |
    Where-Object { $_ }
)
$queued = @(
  $repaired |
    Where-Object { $_.embedding_refresh_queued -eq $true }
)

Write-Host "Checked: $($repaired.Count)" -ForegroundColor Green
Write-Host "Embedding files moved: $($moved.Count)" -ForegroundColor Green
Write-Host "Embedding refreshes queued: $($queued.Count)" -ForegroundColor Green

if ($failed.Count -gt 0) {
  Write-Host "Repair failures: $($failed.Count)" -ForegroundColor Red
  $failed | ForEach-Object {
    Write-Host "  $($_.asset_id): $($_.error)" -ForegroundColor Red
  }
}

if ($queued.Count -gt 0) {
  Write-Host "Waiting for queued embedding refreshes..." -ForegroundColor Cyan

  while ($true) {
    Start-Sleep -Seconds ([Math]::Max(1, $PollSeconds))
    $queue = Invoke-RestMethod -Method Get -Uri $EnrichmentUrl
    $active = @(
      @($queue.queue) |
        Where-Object {
          $_.status -eq "queued" -or
          $_.status -eq "running"
        }
    )
    $identityEntries = @(
      @($queue.queue) |
        Where-Object { $_.mode -eq "embedding_only" }
    )
    $completed = @(
      $identityEntries |
        Where-Object { $_.status -eq "completed" }
    )
    $refreshFailed = @(
      $identityEntries |
        Where-Object { $_.status -eq "failed" }
    )

    Write-Host (
      "Embedding refreshes: active={0} completed={1} failed={2}" -f `
        $active.Count, $completed.Count, $refreshFailed.Count
    )

    if ($active.Count -eq 0) {
      if ($refreshFailed.Count -gt 0) {
        $refreshFailed | ForEach-Object {
          Write-Host "  $($_.asset_id): $($_.error)" -ForegroundColor Red
        }
        exit 1
      }
      break
    }
  }
}

if ($failed.Count -gt 0) {
  exit 1
}

Write-Host "Asset identity artifact repair completed." -ForegroundColor Green
