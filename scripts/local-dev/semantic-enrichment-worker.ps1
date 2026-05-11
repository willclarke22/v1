param(
  [string]$AppBaseUrl = "http://localhost:3000",
  [string]$EmbeddingHealthUrl = "http://127.0.0.1:8001/health",
  [string]$EmbeddingHost = "127.0.0.1",
  [int]$EmbeddingPort = 8001,
  [int]$EnrichmentLimit = 1,
  [int]$LayoutLimit = 5,
  [int]$PollSeconds = 1,
  [int]$AbortPollSeconds = 1,
  [string]$PythonExe = ".\.venv\Scripts\python.exe",
  [int]$EmbeddingStartupTimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"

function Write-WorkerLog {
  param([string]$Message)
  $timestamp = Get-Date -Format "HH:mm:ss"
  Write-Host "[$timestamp] $Message"
}

function Get-IdleState {
  try {
    return Invoke-RestMethod -Method GET "$AppBaseUrl/api/local-dev/idle-state" -TimeoutSec 5
  } catch {
    Write-WorkerLog "Could not read idle-state. Is pnpm dev running? $($_.Exception.Message)"
    return $null
  }
}

function Get-PendingStatus {
  try {
    return Invoke-RestMethod -Method GET "$AppBaseUrl/api/semantic-enrichment/pending-status" -TimeoutSec 10
  } catch {
    Write-WorkerLog "Could not read pending-status. $($_.Exception.Message)"
    return $null
  }
}

function Set-EnrichmentInFlight {
  param([bool]$Value)

  try {
    $body = @{
      enrichment_in_flight = $Value
      last_activity_at = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json -Depth 10

    Invoke-RestMethod `
      -Method POST `
      "$AppBaseUrl/api/local-dev/idle-state" `
      -ContentType "application/json" `
      -Body $body `
      -TimeoutSec 5 | Out-Null
  } catch {
    Write-WorkerLog "Could not update enrichment_in_flight=$Value. $($_.Exception.Message)"
  }
}

function Test-EmbeddingServiceHealthy {
  try {
    $health = Invoke-RestMethod -Method GET $EmbeddingHealthUrl -TimeoutSec 2
    return [bool]$health.ok
  } catch {
    return $false
  }
}

function Start-EmbeddingService {
  Write-WorkerLog "Starting embedding service on $EmbeddingHost`:$EmbeddingPort..."

  if (-not (Test-Path $PythonExe)) {
    throw "Could not find Python executable at $PythonExe. Are you running from the project root?"
  }

  $logDir = Join-Path (Get-Location) "local-dev-logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null

  $stdoutLog = Join-Path $logDir "embedding-service.out.log"
  $stderrLog = Join-Path $logDir "embedding-service.err.log"

  Write-WorkerLog "Embedding stdout log: $stdoutLog"
  Write-WorkerLog "Embedding stderr log: $stderrLog"

  $process = Start-Process `
    -FilePath $PythonExe `
    -ArgumentList @(
      "-m", "uvicorn",
      "services.embeddings.app:app",
      "--host", $EmbeddingHost,
      "--port", "$EmbeddingPort",
      "--log-level", "info"
    ) `
    -WorkingDirectory (Get-Location) `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog

  $startedAt = Get-Date

  while (((Get-Date) - $startedAt).TotalSeconds -lt $EmbeddingStartupTimeoutSeconds) {
    if ($process.HasExited) {
      $stderrPreview = ""
      if (Test-Path $stderrLog) {
        $stderrPreview = (Get-Content $stderrLog -Tail 40 -ErrorAction SilentlyContinue) -join "`n"
      }

      throw "Embedding service process exited early with code $($process.ExitCode). Recent stderr:`n$stderrPreview"
    }

    if (Test-EmbeddingServiceHealthy) {
      Write-WorkerLog "Embedding service is healthy."
      return $process
    }

    Start-Sleep -Seconds 1
  }

  $stderrTimeoutPreview = ""
  if (Test-Path $stderrLog) {
    $stderrTimeoutPreview = (Get-Content $stderrLog -Tail 40 -ErrorAction SilentlyContinue) -join "`n"
  }

  try {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  } catch {}

  throw "Embedding service did not become healthy within $EmbeddingStartupTimeoutSeconds seconds. Recent stderr:`n$stderrTimeoutPreview"
}

function Stop-EmbeddingService {
  param($Process)

  if ($null -eq $Process) {
    return
  }

  try {
    if (-not $Process.HasExited) {
      Write-WorkerLog "Stopping embedding service..."
      Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }
  } catch {
    Write-WorkerLog "Could not stop embedding service cleanly. $($_.Exception.Message)"
  }
}

function Stop-ExistingEmbeddingServiceOnPort {
  $connections = Get-NetTCPConnection -LocalPort $EmbeddingPort -State Listen -ErrorAction SilentlyContinue

  foreach ($connection in $connections) {
    $pidToStop = $connection.OwningProcess

    if ($pidToStop -and $pidToStop -ne $PID) {
      try {
        Write-WorkerLog "Stopping existing process on embedding port $EmbeddingPort. PID=$pidToStop"
        Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue
      } catch {
        Write-WorkerLog "Could not stop existing embedding process PID=$pidToStop. $($_.Exception.Message)"
      }
    }
  }
}

function Test-ShouldAbortEnrichment {
  $idle = Get-IdleState

  if ($null -eq $idle) {
    return @{
      should_abort = $true
      reason = "idle_state_unavailable"
    }
  }

  if ($idle.decision.should_abort_enrichment -eq $true) {
    $reasons = ($idle.decision.reasons -join ", ")
    return @{
      should_abort = $true
      reason = $reasons
    }
  }

  return @{
    should_abort = $false
    reason = $null
  }
}

function Invoke-PostRouteWithAbortWatch {
  param(
    [string]$RouteName,
    [string]$Url
  )

  $job = Start-Job -ScriptBlock {
    param($Url)

    Invoke-RestMethod `
      -Method POST `
      $Url
  } -ArgumentList $Url

  try {
    while ($job.State -eq "Running") {
      Start-Sleep -Seconds $AbortPollSeconds

      $abortCheck = Test-ShouldAbortEnrichment

      if ($abortCheck.should_abort -eq $true) {
        Write-WorkerLog "Abort requested while $RouteName is running. Reason: $($abortCheck.reason)"
        Stop-Job $job -ErrorAction SilentlyContinue
        return $null
      }
    }

    return Receive-Job $job
  } finally {
    Remove-Job $job -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-EnrichmentWithAbortWatch {
  $url = "$AppBaseUrl/api/semantic-enrichment/run-pending?limit=$EnrichmentLimit"

  return Invoke-PostRouteWithAbortWatch `
    -RouteName "semantic enrichment" `
    -Url $url
}

function Invoke-LayoutWithAbortWatch {
  $url = "$AppBaseUrl/api/semantic-layout/recompute-pending?limit=$LayoutLimit"

  return Invoke-PostRouteWithAbortWatch `
    -RouteName "semantic layout recompute" `
    -Url $url
}

Write-WorkerLog "Semantic enrichment worker started."
Write-WorkerLog "App: $AppBaseUrl"
Write-WorkerLog "This worker only enriches when idle-state is safe AND pending topics exist."
Write-WorkerLog "After enrichment, it recomputes semantic layout targets."
Write-WorkerLog "Poll interval: $PollSeconds second(s)."
Write-WorkerLog "Python executable: $PythonExe"
Write-WorkerLog "Enrichment limit: $EnrichmentLimit"
Write-WorkerLog "Layout limit: $LayoutLimit"

while ($true) {
  $idle = Get-IdleState

  if ($null -eq $idle) {
    Start-Sleep -Seconds $PollSeconds
    continue
  }

  if ($idle.decision.safe_to_start_enrichment -ne $true) {
    $reasons = ($idle.decision.reasons -join ", ")
    Write-WorkerLog "Not safe to enrich yet. Reasons: $reasons"
    Start-Sleep -Seconds $PollSeconds
    continue
  }

  $pending = Get-PendingStatus

  if ($null -eq $pending) {
    Start-Sleep -Seconds $PollSeconds
    continue
  }

  if ($pending.ok -ne $true) {
    Write-WorkerLog "Pending-status returned not ok. Skipping cycle."
    Start-Sleep -Seconds $PollSeconds
    continue
  }

  if ([int]$pending.pending_topics_found -le 0) {
    Write-WorkerLog "Idle, but no pending topics. Not starting embedding service."
    Start-Sleep -Seconds $PollSeconds
    continue
  }

  Write-WorkerLog "Pending topics found: $($pending.pending_topics_found). Preparing enrichment."

  $embeddingProcess = $null

  try {
    Set-EnrichmentInFlight -Value $true

    $abortBeforeStart = Test-ShouldAbortEnrichment
    if ($abortBeforeStart.should_abort -eq $true) {
      Write-WorkerLog "Abort condition appeared before startup. Reason: $($abortBeforeStart.reason)"
      continue
    }

    Stop-ExistingEmbeddingServiceOnPort

    $embeddingProcess = Start-EmbeddingService

    $abortAfterStartup = Test-ShouldAbortEnrichment
    if ($abortAfterStartup.should_abort -eq $true) {
      Write-WorkerLog "Abort condition appeared after embedding startup. Reason: $($abortAfterStartup.reason)"
      continue
    }

    Write-WorkerLog "Running semantic enrichment batch with limit=$EnrichmentLimit..."
    $enrichmentResult = Invoke-EnrichmentWithAbortWatch

    if ($null -eq $enrichmentResult) {
      Write-WorkerLog "Enrichment was aborted or returned no result."
      continue
    }

    Write-WorkerLog "Enrichment result:"
    $enrichmentResult | ConvertTo-Json -Depth 20 | Write-Host

    $enrichedCount = 0
    if ($null -ne $enrichmentResult.enriched_count) {
      $enrichedCount = [int]$enrichmentResult.enriched_count
    }

    if ($enrichedCount -le 0) {
      Write-WorkerLog "No topics were enriched this cycle. Skipping semantic layout recompute."
      continue
    }

    $abortBeforeLayout = Test-ShouldAbortEnrichment
    if ($abortBeforeLayout.should_abort -eq $true) {
      Write-WorkerLog "Abort condition appeared before semantic layout. Reason: $($abortBeforeLayout.reason)"
      continue
    }

    Write-WorkerLog "Running semantic layout recompute with limit=$LayoutLimit..."
    $layoutResult = Invoke-LayoutWithAbortWatch

    if ($null -eq $layoutResult) {
      Write-WorkerLog "Semantic layout recompute was aborted or returned no result."
    } else {
      Write-WorkerLog "Semantic layout result:"
      $layoutResult | ConvertTo-Json -Depth 20 | Write-Host
    }
  } catch {
    Write-WorkerLog "Worker cycle failed: $($_.Exception.Message)"
  } finally {
    Set-EnrichmentInFlight -Value $false
    Stop-EmbeddingService -Process $embeddingProcess
  }

  Start-Sleep -Seconds $PollSeconds
}