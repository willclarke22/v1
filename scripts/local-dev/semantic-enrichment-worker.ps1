param(
  [string]$AppBaseUrl = "http://localhost:3000",
  [string]$EmbeddingHealthUrl = "http://127.0.0.1:8001/health",
  [string]$EmbeddingHost = "127.0.0.1",
  [int]$EmbeddingPort = 8001,
  [string]$ConfusionInsightHealthUrl = "http://127.0.0.1:8003/health",
  [string]$ConfusionInsightHost = "127.0.0.1",
  [int]$ConfusionInsightPort = 8003,
  [int]$EnrichmentLimit = 25,
  [int]$MessageEmbeddingLimit = 25,
  [int]$ConfusionInsightLimit = 10,
  [int]$LayoutLimit = 25,
  [int]$LayoutCommitCooldownSeconds = 12,
  [int]$PollSeconds = 1,
  [int]$AbortPollSeconds = 1,
  [string]$PythonExe = ".\.venv\Scripts\python.exe",
  [int]$EmbeddingStartupTimeoutSeconds = 90,
  [int]$ConfusionInsightStartupTimeoutSeconds = 90,
  [int]$MaxEmbeddingCyclesPerStartup = 3,
  [int]$MaxConfusionInsightCyclesPerStartup = 3
)

$ErrorActionPreference = "Stop"

$script:LastLayoutCommitAt = [DateTime]::MinValue

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

function Test-ConfusionInsightServiceHealthy {
  try {
    $health = Invoke-RestMethod -Method GET $ConfusionInsightHealthUrl -TimeoutSec 2
    return [bool]($health.status -eq "ok" -or $health.ok -eq $true)
  } catch {
    return $false
  }
}

function Start-ConfusionInsightService {
  Write-WorkerLog "Starting confusion/insight service on $ConfusionInsightHost`:$ConfusionInsightPort..."

  if (-not (Test-Path $PythonExe)) {
    throw "Could not find Python executable at $PythonExe. Are you running from the project root?"
  }

  $logDir = Join-Path (Get-Location) "local-dev-logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null

  $stdoutLog = Join-Path $logDir "confusion-insight-service.out.log"
  $stderrLog = Join-Path $logDir "confusion-insight-service.err.log"

  Write-WorkerLog "Confusion/insight stdout log: $stdoutLog"
  Write-WorkerLog "Confusion/insight stderr log: $stderrLog"

  $process = Start-Process `
    -FilePath $PythonExe `
    -ArgumentList @(
      "-m", "uvicorn",
      "services.confusion_insight.app:app",
      "--host", $ConfusionInsightHost,
      "--port", "$ConfusionInsightPort",
      "--log-level", "info"
    ) `
    -WorkingDirectory (Get-Location) `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog

  $startedAt = Get-Date

  while (((Get-Date) - $startedAt).TotalSeconds -lt $ConfusionInsightStartupTimeoutSeconds) {
    if ($process.HasExited) {
      $stderrPreview = ""
      if (Test-Path $stderrLog) {
        $stderrPreview = (Get-Content $stderrLog -Tail 40 -ErrorAction SilentlyContinue) -join "`n"
      }

      throw "Confusion/insight service process exited early with code $($process.ExitCode). Recent stderr:`n$stderrPreview"
    }

    if (Test-ConfusionInsightServiceHealthy) {
      Write-WorkerLog "Confusion/insight service is healthy."
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

  throw "Confusion/insight service did not become healthy within $ConfusionInsightStartupTimeoutSeconds seconds. Recent stderr:`n$stderrTimeoutPreview"
}

function Stop-ConfusionInsightService {
  param($Process)

  if ($null -eq $Process) {
    return
  }

  try {
    if (-not $Process.HasExited) {
      Write-WorkerLog "Stopping confusion/insight service..."
      Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }
  } catch {
    Write-WorkerLog "Could not stop confusion/insight service cleanly. $($_.Exception.Message)"
  }
}

function Stop-ExistingConfusionInsightServiceOnPort {
  $connections = Get-NetTCPConnection -LocalPort $ConfusionInsightPort -State Listen -ErrorAction SilentlyContinue

  foreach ($connection in $connections) {
    $pidToStop = $connection.OwningProcess

    if ($pidToStop -and $pidToStop -ne $PID) {
      try {
        Write-WorkerLog "Stopping existing process on confusion/insight port $ConfusionInsightPort. PID=$pidToStop"
        Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue
      } catch {
        Write-WorkerLog "Could not stop existing confusion/insight process PID=$pidToStop. $($_.Exception.Message)"
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

function Invoke-TopicMessageEmbeddingsWithAbortWatch {
  $url = "$AppBaseUrl/api/topic-message-embeddings/run-pending?limit=$MessageEmbeddingLimit"

  return Invoke-PostRouteWithAbortWatch `
    -RouteName "topic-message embeddings" `
    -Url $url
}

function Invoke-ConfusionInsightWithAbortWatch {
  $url = "$AppBaseUrl/api/confusion-insight/run-pending?limit=$ConfusionInsightLimit"

  return Invoke-PostRouteWithAbortWatch `
    -RouteName "confusion/insight scoring" `
    -Url $url
}

function Invoke-LayoutWithAbortWatch {
  param([bool]$Force = $false)

  $url = "$AppBaseUrl/api/semantic-layout/recompute-pending?limit=$LayoutLimit"

  if ($Force) {
    $url = "$url&force=true"
  }

  return Invoke-PostRouteWithAbortWatch `
    -RouteName "semantic layout recompute" `
    -Url $url
}

function Invoke-LayoutCommitWithAbortWatch {
  param([bool]$Force = $false)

  $url = "$AppBaseUrl/api/semantic-layout/commit-pending?limit=$LayoutLimit"

  if ($Force) {
    $url = "$url&force=true"
  }

  return Invoke-PostRouteWithAbortWatch `
    -RouteName "semantic layout commit" `
    -Url $url
}

function Invoke-LayoutCommitIfNeeded {
  param(
    [object]$PendingStatus,
    [string]$Reason,
    [bool]$Force = $false
  )

  $pendingLayoutCommitTopicsFound = 0
  if ($null -ne $PendingStatus -and $null -ne $PendingStatus.pending_layout_commit_topics_found) {
    $pendingLayoutCommitTopicsFound = [int]$PendingStatus.pending_layout_commit_topics_found
  }

  $secondsSinceLastCommit = ((Get-Date) - $script:LastLayoutCommitAt).TotalSeconds
  $cooldownSatisfied = $secondsSinceLastCommit -ge $LayoutCommitCooldownSeconds

  if (-not $Force -and $pendingLayoutCommitTopicsFound -le 0) {
    Write-WorkerLog "Skipping semantic layout commit ($Reason): no pending layout commits reported."
    return $null
  }

  if (-not $Force -and -not $cooldownSatisfied) {
    $remaining = [Math]::Ceiling($LayoutCommitCooldownSeconds - $secondsSinceLastCommit)
    Write-WorkerLog "Skipping semantic layout commit ($Reason): cooldown active for about $remaining more second(s). pending_layout_commit_topics=$pendingLayoutCommitTopicsFound."
    return $null
  }

  Write-WorkerLog "Running semantic layout commit ($Reason) with limit=$LayoutLimit. pending_layout_commit_topics=$pendingLayoutCommitTopicsFound force=$Force..."

  $layoutCommitResult = Invoke-LayoutCommitWithAbortWatch -Force:$Force
  $script:LastLayoutCommitAt = Get-Date

  if ($null -eq $layoutCommitResult) {
    Write-WorkerLog "Semantic layout commit ($Reason) was aborted or returned no result."
  } else {
    Write-WorkerLog "Semantic layout commit result ($Reason):"
    $layoutCommitResult | ConvertTo-Json -Depth 20 | Write-Host
  }

  return $layoutCommitResult
}

Write-WorkerLog "Semantic enrichment worker started."
Write-WorkerLog "App: $AppBaseUrl"
Write-WorkerLog "This worker runs when idle-state is safe. Layout commits can run even when no embedding-backed work is pending."
Write-WorkerLog "Confusion/insight scoring is worker-default in local dev; this worker drains structured v1_1 scores and legacy backfill scores."
Write-WorkerLog "It processes worker-default structured v1_1 confusion/insight scores, legacy confusion/insight backfill scores, topic-message embeddings, semantic enrichment, semantic layout targets, and semantic layout commits."
Write-WorkerLog "Poll interval: $PollSeconds second(s)."
Write-WorkerLog "Python executable: $PythonExe"
Write-WorkerLog "Enrichment limit: $EnrichmentLimit"
Write-WorkerLog "Message embedding limit: $MessageEmbeddingLimit"
Write-WorkerLog "Confusion/insight limit: $ConfusionInsightLimit"
Write-WorkerLog "Layout limit: $LayoutLimit"
Write-WorkerLog "Layout commit cooldown: $LayoutCommitCooldownSeconds second(s)"
Write-WorkerLog "Max embedding cycles per startup: $MaxEmbeddingCyclesPerStartup"
Write-WorkerLog "Max confusion/insight cycles per startup: $MaxConfusionInsightCyclesPerStartup"

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

  $pendingTopicsFound = 0
  if ($null -ne $pending.pending_topics_found) {
    $pendingTopicsFound = [int]$pending.pending_topics_found
  }

  $pendingMessageEmbeddingItemsFound = 0
  if ($null -ne $pending.pending_topic_message_embedding_items_found) {
    $pendingMessageEmbeddingItemsFound = [int]$pending.pending_topic_message_embedding_items_found
  }

  $pendingConfusionInsightItemsFound = 0
  if ($null -ne $pending.pending_confusion_insight_items_found) {
    $pendingConfusionInsightItemsFound = [int]$pending.pending_confusion_insight_items_found
  }

  $embeddingBackedWorkFound = $pendingTopicsFound + $pendingMessageEmbeddingItemsFound
  $pendingWorkFound = $embeddingBackedWorkFound + $pendingConfusionInsightItemsFound

  Write-WorkerLog "Idle-safe cycle. Checking whether semantic layout commit is actually needed..."

  try {
    Invoke-LayoutCommitIfNeeded `
      -PendingStatus $pending `
      -Reason "pre-cycle" | Out-Null
  } catch {
    Write-WorkerLog "Pre-cycle semantic layout commit check failed: $($_.Exception.Message)"
  }

  if ($pendingWorkFound -le 0) {
    Write-WorkerLog "Idle, but no worker-backed work is pending. Not starting worker-managed model services."
    Start-Sleep -Seconds $PollSeconds
    continue
  }

  if ($pendingConfusionInsightItemsFound -gt 0) {
    $structuredV11Count = 0
    if ($null -ne $pending.pending_confusion_insight_structured_v1_1_items_found) {
      $structuredV11Count = [int]$pending.pending_confusion_insight_structured_v1_1_items_found
    }

    $legacyTextCount = 0
    if ($null -ne $pending.pending_confusion_insight_legacy_text_items_found) {
      $legacyTextCount = [int]$pending.pending_confusion_insight_legacy_text_items_found
    }

    Write-WorkerLog "Confusion/insight queue found: total=$pendingConfusionInsightItemsFound structured_v1_1=$structuredV11Count legacy_text=$legacyTextCount. Preparing worker drain cycle."

    $confusionInsightProcess = $null
    $confusionInsightStartedByWorker = $false

    try {
      Set-EnrichmentInFlight -Value $true

      $abortBeforeConfusionStart = Test-ShouldAbortEnrichment
      if ($abortBeforeConfusionStart.should_abort -eq $true) {
        Write-WorkerLog "Abort condition appeared before confusion/insight worker drain. Reason: $($abortBeforeConfusionStart.reason)"
      } else {
        if (Test-ConfusionInsightServiceHealthy) {
          Write-WorkerLog "Confusion/insight service is already healthy on $ConfusionInsightHost`:$ConfusionInsightPort. Reusing it instead of restarting it."
        } else {
          Write-WorkerLog "Confusion/insight service is not healthy. Starting worker-managed service for structured v1_1 / legacy queue drain."
          $confusionInsightProcess = Start-ConfusionInsightService
          $confusionInsightStartedByWorker = $true
        }

        for ($confusionCycle = 1; $confusionCycle -le $MaxConfusionInsightCyclesPerStartup; $confusionCycle += 1) {
          $cyclePending = Get-PendingStatus

          if ($null -eq $cyclePending -or $cyclePending.ok -ne $true) {
            Write-WorkerLog "Could not refresh pending-status during confusion/insight worker cycle $confusionCycle. Ending drain loop."
            break
          }

          $cyclePendingConfusionInsightItemsFound = 0
          if ($null -ne $cyclePending.pending_confusion_insight_items_found) {
            $cyclePendingConfusionInsightItemsFound = [int]$cyclePending.pending_confusion_insight_items_found
          }

          if ($cyclePendingConfusionInsightItemsFound -le 0) {
            Write-WorkerLog "Confusion/insight worker drain cycle $confusionCycle found no remaining pending scores."
            break
          }

          $abortBeforeConfusionBatch = Test-ShouldAbortEnrichment
          if ($abortBeforeConfusionBatch.should_abort -eq $true) {
            Write-WorkerLog "Abort condition appeared before confusion/insight worker drain cycle $confusionCycle. Reason: $($abortBeforeConfusionBatch.reason)"
            break
          }

          Write-WorkerLog "Running confusion/insight worker scoring batch $confusionCycle/$MaxConfusionInsightCyclesPerStartup with limit=$ConfusionInsightLimit..."
          $confusionInsightResult = Invoke-ConfusionInsightWithAbortWatch

          if ($null -eq $confusionInsightResult) {
            Write-WorkerLog "Confusion/insight scoring batch was aborted or returned no result."
            break
          }

          Write-WorkerLog "Confusion/insight scoring result:"
          $confusionInsightResult | ConvertTo-Json -Depth 20 | Write-Host

          if ($null -eq $confusionInsightResult.processed_score_count -or [int]$confusionInsightResult.processed_score_count -le 0) {
            Write-WorkerLog "Confusion/insight scoring returned no processed scores. Ending drain loop to avoid spinning."
            break
          }
        }
      }
    } catch {
      Write-WorkerLog "Confusion/insight worker cycle failed: $($_.Exception.Message)"
    } finally {
      Set-EnrichmentInFlight -Value $false

      if ($confusionInsightStartedByWorker -eq $true) {
        Stop-ConfusionInsightService -Process $confusionInsightProcess
      } else {
        Write-WorkerLog "Leaving existing confusion/insight service running."
      }
    }
  }

  $pending = Get-PendingStatus

  if ($null -eq $pending -or $pending.ok -ne $true) {
    Start-Sleep -Seconds $PollSeconds
    continue
  }

  $pendingTopicsFound = 0
  if ($null -ne $pending.pending_topics_found) {
    $pendingTopicsFound = [int]$pending.pending_topics_found
  }

  $pendingMessageEmbeddingItemsFound = 0
  if ($null -ne $pending.pending_topic_message_embedding_items_found) {
    $pendingMessageEmbeddingItemsFound = [int]$pending.pending_topic_message_embedding_items_found
  }

  $embeddingBackedWorkFound = $pendingTopicsFound + $pendingMessageEmbeddingItemsFound

  if ($embeddingBackedWorkFound -le 0) {
    Write-WorkerLog "No embedding-backed work remains after confusion/insight cycle. Layout commit check already ran; not starting embedding service."
    Start-Sleep -Seconds $PollSeconds
    continue
  }

  Write-WorkerLog "Pending embedding-backed work found: enrichment_topics=$pendingTopicsFound, topic_message_embedding_items=$pendingMessageEmbeddingItemsFound. Preparing embedding worker cycle."

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

    $topicMessageEmbeddingProcessedCount = 0
    $topicMessageEmbeddingUpdatedTopicCount = 0
    $enrichedCount = 0

    for ($batchCycle = 1; $batchCycle -le $MaxEmbeddingCyclesPerStartup; $batchCycle += 1) {
      $cyclePending = Get-PendingStatus

      if ($null -eq $cyclePending -or $cyclePending.ok -ne $true) {
        Write-WorkerLog "Could not refresh pending-status during embedding batch cycle $batchCycle. Ending drain loop."
        break
      }

      $cyclePendingTopicsFound = 0
      if ($null -ne $cyclePending.pending_topics_found) {
        $cyclePendingTopicsFound = [int]$cyclePending.pending_topics_found
      }

      $cyclePendingMessageEmbeddingItemsFound = 0
      if ($null -ne $cyclePending.pending_topic_message_embedding_items_found) {
        $cyclePendingMessageEmbeddingItemsFound = [int]$cyclePending.pending_topic_message_embedding_items_found
      }

      $cyclePendingWorkFound = $cyclePendingTopicsFound + $cyclePendingMessageEmbeddingItemsFound

      if ($cyclePendingWorkFound -le 0) {
        Write-WorkerLog "Embedding drain cycle $batchCycle found no remaining embedding-backed work."
        break
      }

      Write-WorkerLog "Embedding drain cycle $batchCycle/$MaxEmbeddingCyclesPerStartup. enrichment_topics=$cyclePendingTopicsFound, topic_message_embedding_items=$cyclePendingMessageEmbeddingItemsFound."

      $abortBeforeBatch = Test-ShouldAbortEnrichment
      if ($abortBeforeBatch.should_abort -eq $true) {
        Write-WorkerLog "Abort condition appeared before embedding drain cycle $batchCycle. Reason: $($abortBeforeBatch.reason)"
        break
      }

      if ($cyclePendingMessageEmbeddingItemsFound -gt 0) {
        Write-WorkerLog "Running topic-message embedding batch with limit=$MessageEmbeddingLimit..."
        $topicMessageEmbeddingResult = Invoke-TopicMessageEmbeddingsWithAbortWatch

        if ($null -eq $topicMessageEmbeddingResult) {
          Write-WorkerLog "Topic-message embedding batch was aborted or returned no result."
        } else {
          Write-WorkerLog "Topic-message embedding result:"
          $topicMessageEmbeddingResult | ConvertTo-Json -Depth 20 | Write-Host

          if ($null -ne $topicMessageEmbeddingResult.processed_message_count) {
            $topicMessageEmbeddingProcessedCount += [int]$topicMessageEmbeddingResult.processed_message_count
          }

          if ($null -ne $topicMessageEmbeddingResult.updated_topic_count) {
            $topicMessageEmbeddingUpdatedTopicCount += [int]$topicMessageEmbeddingResult.updated_topic_count
          }
        }
      } else {
        Write-WorkerLog "No pending topic-message embeddings in drain cycle $batchCycle."
      }

      $abortBeforeEnrichment = Test-ShouldAbortEnrichment
      if ($abortBeforeEnrichment.should_abort -eq $true) {
        Write-WorkerLog "Abort condition appeared before semantic enrichment in drain cycle $batchCycle. Reason: $($abortBeforeEnrichment.reason)"
        break
      }

      if ($cyclePendingTopicsFound -gt 0) {
        Write-WorkerLog "Running semantic enrichment batch with limit=$EnrichmentLimit..."
        $enrichmentResult = Invoke-EnrichmentWithAbortWatch

        if ($null -eq $enrichmentResult) {
          Write-WorkerLog "Enrichment was aborted or returned no result."
        } else {
          Write-WorkerLog "Enrichment result:"
          $enrichmentResult | ConvertTo-Json -Depth 20 | Write-Host

          if ($null -ne $enrichmentResult.enriched_count) {
            $enrichedCount += [int]$enrichmentResult.enriched_count
          }
        }
      } else {
        Write-WorkerLog "No pending semantic enrichment topics in drain cycle $batchCycle."
      }
    }

    $shouldRunLayout = ($enrichedCount -gt 0) -or ($topicMessageEmbeddingProcessedCount -gt 0)

    if (-not $shouldRunLayout) {
      Write-WorkerLog "No embeddings were updated this cycle. Checking for pending layout commit without recompute."

      $pendingBeforeFinalCommit = Get-PendingStatus

      if ($null -ne $pendingBeforeFinalCommit -and $pendingBeforeFinalCommit.ok -eq $true) {
        Invoke-LayoutCommitIfNeeded `
          -PendingStatus $pendingBeforeFinalCommit `
          -Reason "final-no-recompute" | Out-Null
      } else {
        Write-WorkerLog "Skipping final layout commit check because pending-status could not be refreshed."
      }

      continue
    }

    $abortBeforeLayout = Test-ShouldAbortEnrichment
    if ($abortBeforeLayout.should_abort -eq $true) {
      Write-WorkerLog "Abort condition appeared before semantic layout. Reason: $($abortBeforeLayout.reason)"
      continue
    }

    $forceLayout = $topicMessageEmbeddingProcessedCount -gt 0

    if ($forceLayout) {
      Write-WorkerLog "Running forced semantic layout recompute because topic-message embeddings changed. limit=$LayoutLimit..."
    } else {
      Write-WorkerLog "Running semantic layout recompute with limit=$LayoutLimit..."
    }

    $layoutResult = Invoke-LayoutWithAbortWatch -Force $forceLayout

    if ($null -eq $layoutResult) {
      Write-WorkerLog "Semantic layout recompute was aborted or returned no result. Skipping layout commit."
      continue
    }

    Write-WorkerLog "Semantic layout result:"
    $layoutResult | ConvertTo-Json -Depth 20 | Write-Host

    $layoutComputedCount = 0
    if ($null -ne $layoutResult.computed_count) {
      $layoutComputedCount = [int]$layoutResult.computed_count
    } elseif ($null -ne $layoutResult.updated_count) {
      $layoutComputedCount = [int]$layoutResult.updated_count
    } elseif ($null -ne $layoutResult.semantic_positions_written_count) {
      $layoutComputedCount = [int]$layoutResult.semantic_positions_written_count
    }

    if ($layoutComputedCount -le 0) {
      Write-WorkerLog "Semantic layout recompute returned no newly computed/updated semantic positions. Still running commit, because existing semantic targets may already be waiting."
    }

    $abortBeforeLayoutCommit = Test-ShouldAbortEnrichment
    if ($abortBeforeLayoutCommit.should_abort -eq $true) {
      Write-WorkerLog "Abort condition appeared before semantic layout commit. Reason: $($abortBeforeLayoutCommit.reason)"
      continue
    }

    $pendingBeforeLayoutCommit = Get-PendingStatus

    if ($null -ne $pendingBeforeLayoutCommit -and $pendingBeforeLayoutCommit.ok -eq $true) {
      Invoke-LayoutCommitIfNeeded `
        -PendingStatus $pendingBeforeLayoutCommit `
        -Reason "after-layout-recompute" `
        -Force $true | Out-Null
    } else {
      Write-WorkerLog "Skipping semantic layout commit after recompute because pending-status could not be refreshed."
    }
  } catch {
    Write-WorkerLog "Worker cycle failed: $($_.Exception.Message)"
  } finally {
    Set-EnrichmentInFlight -Value $false
    Stop-EmbeddingService -Process $embeddingProcess
  }

  Start-Sleep -Seconds $PollSeconds
}