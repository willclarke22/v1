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
  [int]$MaxConfusionInsightCyclesPerStartup = 3,

  <#
   managed:
     Worker starts the service only when work is pending, then stops it.

   external:
     Worker expects the service to already be running. This is the easiest
     future GPU path: run the heavy services separately on the GPU machine and
     point the health URLs/hosts/ports here.

   auto:
     Reuse an already healthy service if present; otherwise start/stop a
     worker-managed local service.

   disabled:
     Skip that service's work entirely.
  #>
  [ValidateSet("managed", "external", "auto", "disabled")]
  [string]$EmbeddingServiceMode = "managed",

  [ValidateSet("managed", "external", "auto", "disabled")]
  [string]$ConfusionInsightServiceMode = "disabled",

  <#
   When true, managed service startup will kill existing listeners on the
   target port only if the health check is not already passing.
  #>
  [bool]$StopUnhealthyProcessOnManagedPort = $true
)

$ErrorActionPreference = "Stop"

$script:LastLayoutCommitAt = [DateTime]::MinValue

function Write-WorkerLog {
  param([string]$Message)

  $timestamp = Get-Date -Format "HH:mm:ss"
  Write-Host "[$timestamp] $Message"
}

function Get-IntValue {
  param(
    [object]$Object,
    [string]$PropertyName,
    [int]$Default = 0
  )

  if ($null -eq $Object) {
    return $Default
  }

  $property = $Object.PSObject.Properties[$PropertyName]

  if ($null -eq $property -or $null -eq $property.Value) {
    return $Default
  }

  try {
    return [int]$property.Value
  } catch {
    return $Default
  }
}

function Invoke-WorkerGet {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 10,
    [string]$FailureLabel = "GET request"
  )

  try {
    return Invoke-RestMethod -Method GET $Url -TimeoutSec $TimeoutSeconds
  } catch {
    Write-WorkerLog "$FailureLabel failed. $($_.Exception.Message)"
    return $null
  }
}

function Invoke-WorkerPost {
  param(
    [string]$Url,
    [object]$Body = $null,
    [int]$TimeoutSeconds = 10,
    [string]$FailureLabel = "POST request"
  )

  try {
    if ($null -eq $Body) {
      return Invoke-RestMethod -Method POST $Url -TimeoutSec $TimeoutSeconds
    }

    return Invoke-RestMethod `
      -Method POST `
      $Url `
      -ContentType "application/json" `
      -Body ($Body | ConvertTo-Json -Depth 20) `
      -TimeoutSec $TimeoutSeconds
  } catch {
    Write-WorkerLog "$FailureLabel failed. $($_.Exception.Message)"
    return $null
  }
}

function Get-IdleState {
  return Invoke-WorkerGet `
    -Url "$AppBaseUrl/api/local-dev/idle-state" `
    -TimeoutSeconds 5 `
    -FailureLabel "Could not read idle-state. Is pnpm dev running?"
}

function Get-PendingStatus {
  return Invoke-WorkerGet `
    -Url "$AppBaseUrl/api/semantic-enrichment/pending-status" `
    -TimeoutSeconds 10 `
    -FailureLabel "Could not read pending-status"
}

function Set-EnrichmentInFlight {
  param([bool]$Value)

  Invoke-WorkerPost `
    -Url "$AppBaseUrl/api/local-dev/idle-state" `
    -Body @{
      enrichment_in_flight = $Value
      last_activity_at = (Get-Date).ToUniversalTime().ToString("o")
    } `
    -TimeoutSeconds 5 `
    -FailureLabel "Could not update enrichment_in_flight=$Value" | Out-Null
}

function Test-ServiceHealthy {
  param(
    [string]$HealthUrl,
    [string]$ServiceName
  )

  try {
    $health = Invoke-RestMethod -Method GET $HealthUrl -TimeoutSec 2

    return [bool](
      $health.ok -eq $true -or
      $health.status -eq "ok" -or
      $health.status -eq "healthy"
    )
  } catch {
    return $false
  }
}

function Stop-ExistingProcessOnPort {
  param(
    [int]$Port,
    [string]$ServiceName
  )

  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

  foreach ($connection in $connections) {
    $pidToStop = $connection.OwningProcess

    if ($pidToStop -and $pidToStop -ne $PID) {
      try {
        Write-WorkerLog "Stopping existing process on $ServiceName port $Port. PID=$pidToStop"
        Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue
      } catch {
        Write-WorkerLog "Could not stop existing $ServiceName process PID=$pidToStop. $($_.Exception.Message)"
      }
    }
  }
}

function Start-ManagedUvicornService {
  param(
    [string]$ServiceName,
    [string]$AppImportPath,
    [string]$ServiceHost,
    [int]$Port,
    [string]$HealthUrl,
    [int]$StartupTimeoutSeconds,
    [string]$StdoutLogName,
    [string]$StderrLogName
  )

  Write-WorkerLog "Starting $ServiceName service on $ServiceHost`:$Port..."

  if (-not (Test-Path $PythonExe)) {
    throw "Could not find Python executable at $PythonExe. Are you running from the project root?"
  }

  $logDir = Join-Path (Get-Location) "local-dev-logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null

  $stdoutLog = Join-Path $logDir $StdoutLogName
  $stderrLog = Join-Path $logDir $StderrLogName

  Write-WorkerLog "$ServiceName stdout log: $stdoutLog"
  Write-WorkerLog "$ServiceName stderr log: $stderrLog"

  $process = Start-Process `
    -FilePath $PythonExe `
    -ArgumentList @(
      "-m", "uvicorn",
      $AppImportPath,
      "--host", $ServiceHost,
      "--port", "$Port",
      "--log-level", "info"
    ) `
    -WorkingDirectory (Get-Location) `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog

  $startedAt = Get-Date

  while (((Get-Date) - $startedAt).TotalSeconds -lt $StartupTimeoutSeconds) {
    if ($process.HasExited) {
      $stderrPreview = ""

      if (Test-Path $stderrLog) {
        $stderrPreview = (Get-Content $stderrLog -Tail 40 -ErrorAction SilentlyContinue) -join "`n"
      }

      throw "$ServiceName service process exited early with code $($process.ExitCode). Recent stderr:`n$stderrPreview"
    }

    if (Test-ServiceHealthy -HealthUrl $HealthUrl -ServiceName $ServiceName) {
      Write-WorkerLog "$ServiceName service is healthy."
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

  throw "$ServiceName service did not become healthy within $StartupTimeoutSeconds seconds. Recent stderr:`n$stderrTimeoutPreview"
}

function Stop-ManagedService {
  param(
    [object]$Process,
    [string]$ServiceName
  )

  if ($null -eq $Process) {
    return
  }

  try {
    if (-not $Process.HasExited) {
      Write-WorkerLog "Stopping $ServiceName service..."
      Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }
  } catch {
    Write-WorkerLog "Could not stop $ServiceName service cleanly. $($_.Exception.Message)"
  }
}

function Ensure-ServiceForWork {
  param(
    [string]$ServiceName,
    [ValidateSet("managed", "external", "auto", "disabled")]
    [string]$Mode,
    [string]$HealthUrl,
    [string]$ServiceHost,
    [int]$Port,
    [string]$AppImportPath,
    [int]$StartupTimeoutSeconds,
    [string]$StdoutLogName,
    [string]$StderrLogName
  )

  if ($Mode -eq "disabled") {
    return @{
      ok = $false
      process = $null
      started_by_worker = $false
      reason = "service_disabled"
    }
  }

  if (Test-ServiceHealthy -HealthUrl $HealthUrl -ServiceName $ServiceName) {
    Write-WorkerLog "$ServiceName service is already healthy. Reusing it."
    return @{
      ok = $true
      process = $null
      started_by_worker = $false
      reason = "reused_healthy_service"
    }
  }

  if ($Mode -eq "external") {
    Write-WorkerLog "$ServiceName service mode is external, but health check is not passing at $HealthUrl."
    return @{
      ok = $false
      process = $null
      started_by_worker = $false
      reason = "external_service_unhealthy"
    }
  }

  if ($StopUnhealthyProcessOnManagedPort) {
    Stop-ExistingProcessOnPort -Port $Port -ServiceName $ServiceName
  }

  $process = Start-ManagedUvicornService `
    -ServiceName $ServiceName `
    -AppImportPath $AppImportPath `
    -ServiceHost $ServiceHost `
    -Port $Port `
    -HealthUrl $HealthUrl `
    -StartupTimeoutSeconds $StartupTimeoutSeconds `
    -StdoutLogName $StdoutLogName `
    -StderrLogName $StderrLogName

  return @{
    ok = $true
    process = $process
    started_by_worker = $true
    reason = "started_managed_service"
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

    Invoke-RestMethod -Method POST $Url
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

  $pendingLayoutCommitTopicsFound = Get-IntValue `
    -Object $PendingStatus `
    -PropertyName "pending_layout_commit_topics_found" `
    -Default 0

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

function Get-PendingCounts {
  param([object]$PendingStatus)

  $pendingTopicsFound = Get-IntValue `
    -Object $PendingStatus `
    -PropertyName "pending_topics_found" `
    -Default 0

  $pendingMessageEmbeddingItemsFound = Get-IntValue `
    -Object $PendingStatus `
    -PropertyName "pending_topic_message_embedding_items_found" `
    -Default 0

  $pendingConfusionInsightItemsFound = Get-IntValue `
    -Object $PendingStatus `
    -PropertyName "pending_confusion_insight_items_found" `
    -Default 0

  $pendingStructuredV11ConfusionInsightItemsFound = Get-IntValue `
    -Object $PendingStatus `
    -PropertyName "pending_confusion_insight_structured_v1_1_items_found" `
    -Default 0

  $pendingLegacyTextConfusionInsightItemsFound = Get-IntValue `
    -Object $PendingStatus `
    -PropertyName "pending_confusion_insight_legacy_text_items_found" `
    -Default 0

  return @{
    enrichment_topics = $pendingTopicsFound
    topic_message_embedding_items = $pendingMessageEmbeddingItemsFound
    confusion_insight_items = $pendingConfusionInsightItemsFound
    confusion_insight_structured_v1_1_items = $pendingStructuredV11ConfusionInsightItemsFound
    confusion_insight_legacy_text_items = $pendingLegacyTextConfusionInsightItemsFound
    embedding_backed_work = $pendingTopicsFound + $pendingMessageEmbeddingItemsFound
    total_worker_backed_work = $pendingTopicsFound + $pendingMessageEmbeddingItemsFound
  }
}

function Invoke-ConfusionInsightDrain {
  param([object]$InitialPendingCounts)

  if ($ConfusionInsightServiceMode -eq "disabled") {
    Write-WorkerLog "Confusion/insight service mode is disabled. Skipping pending confusion/insight work."
    return
  }

  if ($InitialPendingCounts.confusion_insight_items -le 0) {
    return
  }

  Write-WorkerLog "Confusion/insight queue found: total=$($InitialPendingCounts.confusion_insight_items) structured_v1_1=$($InitialPendingCounts.confusion_insight_structured_v1_1_items) legacy_text=$($InitialPendingCounts.confusion_insight_legacy_text_items). Preparing worker drain cycle."

  $service = $null

  try {
    Set-EnrichmentInFlight -Value $true

    $abortBeforeStart = Test-ShouldAbortEnrichment

    if ($abortBeforeStart.should_abort -eq $true) {
      Write-WorkerLog "Abort condition appeared before confusion/insight worker drain. Reason: $($abortBeforeStart.reason)"
      return
    }

    $service = Ensure-ServiceForWork `
      -ServiceName "confusion/insight" `
      -Mode $ConfusionInsightServiceMode `
      -HealthUrl $ConfusionInsightHealthUrl `
      -ServiceHost $ConfusionInsightHost `
      -Port $ConfusionInsightPort `
      -AppImportPath "services.confusion_insight.app:app" `
      -StartupTimeoutSeconds $ConfusionInsightStartupTimeoutSeconds `
      -StdoutLogName "confusion-insight-service.out.log" `
      -StderrLogName "confusion-insight-service.err.log"

    if ($service.ok -ne $true) {
      Write-WorkerLog "Confusion/insight service is unavailable. Reason: $($service.reason)."
      return
    }

    for ($confusionCycle = 1; $confusionCycle -le $MaxConfusionInsightCyclesPerStartup; $confusionCycle += 1) {
      $cyclePending = Get-PendingStatus

      if ($null -eq $cyclePending -or $cyclePending.ok -ne $true) {
        Write-WorkerLog "Could not refresh pending-status during confusion/insight worker cycle $confusionCycle. Ending drain loop."
        break
      }

      $cycleCounts = Get-PendingCounts -PendingStatus $cyclePending

      if ($cycleCounts.confusion_insight_items -le 0) {
        Write-WorkerLog "Confusion/insight worker drain cycle $confusionCycle found no remaining pending scores."
        break
      }

      $abortBeforeBatch = Test-ShouldAbortEnrichment

      if ($abortBeforeBatch.should_abort -eq $true) {
        Write-WorkerLog "Abort condition appeared before confusion/insight worker drain cycle $confusionCycle. Reason: $($abortBeforeBatch.reason)"
        break
      }

      Write-WorkerLog "Running confusion/insight worker scoring batch $confusionCycle/$MaxConfusionInsightCyclesPerStartup with limit=$ConfusionInsightLimit..."
      $result = Invoke-ConfusionInsightWithAbortWatch

      if ($null -eq $result) {
        Write-WorkerLog "Confusion/insight scoring batch was aborted or returned no result."
        break
      }

      Write-WorkerLog "Confusion/insight scoring result:"
      $result | ConvertTo-Json -Depth 20 | Write-Host

      $processedScoreCount = Get-IntValue `
        -Object $result `
        -PropertyName "processed_score_count" `
        -Default 0

      if ($processedScoreCount -le 0) {
        Write-WorkerLog "Confusion/insight scoring returned no processed scores. Ending drain loop to avoid spinning."
        break
      }
    }
  } catch {
    Write-WorkerLog "Confusion/insight worker cycle failed: $($_.Exception.Message)"
  } finally {
    Set-EnrichmentInFlight -Value $false

    if ($null -ne $service -and $service.started_by_worker -eq $true) {
      Stop-ManagedService `
        -Process $service.process `
        -ServiceName "confusion/insight"
    } elseif ($null -ne $service -and $service.ok -eq $true) {
      Write-WorkerLog "Leaving existing confusion/insight service running."
    }
  }
}

function Invoke-EmbeddingBackedDrain {
  param([object]$InitialPendingCounts)

  if ($EmbeddingServiceMode -eq "disabled") {
    Write-WorkerLog "Embedding service mode is disabled. Skipping pending embedding-backed work."
    return
  }

  if ($InitialPendingCounts.embedding_backed_work -le 0) {
    return
  }

  Write-WorkerLog "Pending embedding-backed work found: enrichment_topics=$($InitialPendingCounts.enrichment_topics), topic_message_embedding_items=$($InitialPendingCounts.topic_message_embedding_items). Preparing embedding worker cycle."

  $service = $null

  try {
    Set-EnrichmentInFlight -Value $true

    $abortBeforeStart = Test-ShouldAbortEnrichment

    if ($abortBeforeStart.should_abort -eq $true) {
      Write-WorkerLog "Abort condition appeared before embedding startup. Reason: $($abortBeforeStart.reason)"
      return
    }

    $service = Ensure-ServiceForWork `
      -ServiceName "embedding" `
      -Mode $EmbeddingServiceMode `
      -HealthUrl $EmbeddingHealthUrl `
      -ServiceHost $EmbeddingHost `
      -Port $EmbeddingPort `
      -AppImportPath "services.embeddings.app:app" `
      -StartupTimeoutSeconds $EmbeddingStartupTimeoutSeconds `
      -StdoutLogName "embedding-service.out.log" `
      -StderrLogName "embedding-service.err.log"

    if ($service.ok -ne $true) {
      Write-WorkerLog "Embedding service is unavailable. Reason: $($service.reason)."
      return
    }

    $abortAfterStartup = Test-ShouldAbortEnrichment

    if ($abortAfterStartup.should_abort -eq $true) {
      Write-WorkerLog "Abort condition appeared after embedding startup. Reason: $($abortAfterStartup.reason)"
      return
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

      $cycleCounts = Get-PendingCounts -PendingStatus $cyclePending

      if ($cycleCounts.embedding_backed_work -le 0) {
        Write-WorkerLog "Embedding drain cycle $batchCycle found no remaining embedding-backed work."
        break
      }

      Write-WorkerLog "Embedding drain cycle $batchCycle/$MaxEmbeddingCyclesPerStartup. enrichment_topics=$($cycleCounts.enrichment_topics), topic_message_embedding_items=$($cycleCounts.topic_message_embedding_items)."

      $abortBeforeBatch = Test-ShouldAbortEnrichment

      if ($abortBeforeBatch.should_abort -eq $true) {
        Write-WorkerLog "Abort condition appeared before embedding drain cycle $batchCycle. Reason: $($abortBeforeBatch.reason)"
        break
      }

      if ($cycleCounts.topic_message_embedding_items -gt 0) {
        Write-WorkerLog "Running topic-message embedding batch with limit=$MessageEmbeddingLimit..."
        $topicMessageEmbeddingResult = Invoke-TopicMessageEmbeddingsWithAbortWatch

        if ($null -eq $topicMessageEmbeddingResult) {
          Write-WorkerLog "Topic-message embedding batch was aborted or returned no result."
        } else {
          Write-WorkerLog "Topic-message embedding result:"
          $topicMessageEmbeddingResult | ConvertTo-Json -Depth 20 | Write-Host

          $topicMessageEmbeddingProcessedCount += Get-IntValue `
            -Object $topicMessageEmbeddingResult `
            -PropertyName "processed_message_count" `
            -Default 0

          $topicMessageEmbeddingUpdatedTopicCount += Get-IntValue `
            -Object $topicMessageEmbeddingResult `
            -PropertyName "updated_topic_count" `
            -Default 0
        }
      } else {
        Write-WorkerLog "No pending topic-message embeddings in drain cycle $batchCycle."
      }

      $abortBeforeEnrichment = Test-ShouldAbortEnrichment

      if ($abortBeforeEnrichment.should_abort -eq $true) {
        Write-WorkerLog "Abort condition appeared before semantic enrichment in drain cycle $batchCycle. Reason: $($abortBeforeEnrichment.reason)"
        break
      }

      if ($cycleCounts.enrichment_topics -gt 0) {
        Write-WorkerLog "Running semantic enrichment batch with limit=$EnrichmentLimit..."
        $enrichmentResult = Invoke-EnrichmentWithAbortWatch

        if ($null -eq $enrichmentResult) {
          Write-WorkerLog "Enrichment was aborted or returned no result."
        } else {
          Write-WorkerLog "Enrichment result:"
          $enrichmentResult | ConvertTo-Json -Depth 20 | Write-Host

          $enrichedCount += Get-IntValue `
            -Object $enrichmentResult `
            -PropertyName "enriched_count" `
            -Default 0
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

      return
    }

    $abortBeforeLayout = Test-ShouldAbortEnrichment

    if ($abortBeforeLayout.should_abort -eq $true) {
      Write-WorkerLog "Abort condition appeared before semantic layout. Reason: $($abortBeforeLayout.reason)"
      return
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
      return
    }

    Write-WorkerLog "Semantic layout result:"
    $layoutResult | ConvertTo-Json -Depth 20 | Write-Host

    $layoutComputedCount = Get-IntValue `
      -Object $layoutResult `
      -PropertyName "computed_count" `
      -Default 0

    if ($layoutComputedCount -le 0) {
      $layoutComputedCount = Get-IntValue `
        -Object $layoutResult `
        -PropertyName "updated_count" `
        -Default 0
    }

    if ($layoutComputedCount -le 0) {
      $layoutComputedCount = Get-IntValue `
        -Object $layoutResult `
        -PropertyName "semantic_positions_written_count" `
        -Default 0
    }

    if ($layoutComputedCount -le 0) {
      Write-WorkerLog "Semantic layout recompute returned no newly computed/updated semantic positions. Still running commit, because existing semantic targets may already be waiting."
    }

    $abortBeforeLayoutCommit = Test-ShouldAbortEnrichment

    if ($abortBeforeLayoutCommit.should_abort -eq $true) {
      Write-WorkerLog "Abort condition appeared before semantic layout commit. Reason: $($abortBeforeLayoutCommit.reason)"
      return
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

    if ($null -ne $service -and $service.started_by_worker -eq $true) {
      Stop-ManagedService `
        -Process $service.process `
        -ServiceName "embedding"
    } elseif ($null -ne $service -and $service.ok -eq $true) {
      Write-WorkerLog "Leaving existing embedding service running."
    }
  }
}

Write-WorkerLog "Semantic enrichment worker started."
Write-WorkerLog "App: $AppBaseUrl"
Write-WorkerLog "This worker runs when idle-state is safe. Layout commits can run even when no embedding-backed work is pending."
Write-WorkerLog "Service mode: embedding=$EmbeddingServiceMode"
Write-WorkerLog "Use service mode external when heavy services are already running locally or on a GPU box."
Write-WorkerLog "It processes topic-message embeddings, semantic enrichment, semantic layout targets, and semantic layout commits."
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

  $pendingCounts = Get-PendingCounts -PendingStatus $pending

  Write-WorkerLog "Idle-safe cycle. Checking whether semantic layout commit is actually needed..."

  try {
    Invoke-LayoutCommitIfNeeded `
      -PendingStatus $pending `
      -Reason "pre-cycle" | Out-Null
  } catch {
    Write-WorkerLog "Pre-cycle semantic layout commit check failed: $($_.Exception.Message)"
  }

  if ($pendingCounts.total_worker_backed_work -le 0) {
    Write-WorkerLog "Idle, but no worker-backed work is pending. Not starting worker-managed model services."
    Start-Sleep -Seconds $PollSeconds
    continue
  }
  if ($pendingCounts.embedding_backed_work -le 0) {
    Write-WorkerLog "No embedding-backed work is pending. Layout commit check already ran; not starting embedding service."
    Start-Sleep -Seconds $PollSeconds
    continue
  }

  Invoke-EmbeddingBackedDrain -InitialPendingCounts $pendingCounts

  Start-Sleep -Seconds $PollSeconds
}

