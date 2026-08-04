param(
  [string]$BaseUrl = "http://localhost:3000",
  [string[]]$CaseId = @(),
  [string]$ResumeRunId = "",
  [string]$OutputRoot = "",
  [string]$HumanReviewFile = "",
  [switch]$SkipVisualCritic,
  [switch]$SkipPreparation
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $OutputRoot) {
  $OutputRoot = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "MyWayBenchmarkRuns"
}
$BaseUrl = $BaseUrl.TrimEnd("/")
$RunId = if ($ResumeRunId) { $ResumeRunId } else { Get-Date -Format "yyyyMMdd-HHmmss" }
$RunRoot = Join-Path $OutputRoot $RunId
New-Item -ItemType Directory -Force -Path $RunRoot | Out-Null

function Save-JsonFile {
  param(
    [Parameter(Mandatory = $true)]$Value,
    [Parameter(Mandatory = $true)][string]$Path
  )
  $directory = Split-Path -Parent $Path
  if ($directory) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }
  $Value |
    ConvertTo-Json -Depth 100 |
    Set-Content -LiteralPath $Path -Encoding UTF8
}

function Read-JsonFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Invoke-FoundryApi {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("GET", "POST")][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    $Body = $null
  )
  $uri = "$BaseUrl$Path"
  try {
    if ($Method -eq "GET") {
      return Invoke-RestMethod -Method Get -Uri $uri -Headers @{ "Cache-Control" = "no-store" }
    }
    $json = $Body | ConvertTo-Json -Depth 100 -Compress
    return Invoke-RestMethod `
      -Method Post `
      -Uri $uri `
      -ContentType "application/json" `
      -Headers @{ "Cache-Control" = "no-store" } `
      -Body $json
  } catch {
    $message = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      try {
        $provider = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($provider.error) {
          $message = [string]$provider.error
        } else {
          $message = $_.ErrorDetails.Message
        }
      } catch {
        $message = $_.ErrorDetails.Message
      }
    }
    throw "Foundry API request failed: $Method $uri`n$message"
  }
}

function Invoke-CheckpointStage {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )
  $existing = Read-JsonFile -Path $Path
  if ($existing -and $existing.ok -eq $true) {
    Write-Host "  Reusing $Name"
    return $existing
  }
  Write-Host "  Running $Name"
  $result = & $Action
  Save-JsonFile -Value $result -Path $Path
  if ($null -eq $result -or $result.ok -ne $true) {
    $detail = if ($result -and $result.error) { [string]$result.error } else { "Unknown stage failure." }
    throw "$Name failed: $detail"
  }
  return $result
}

function Get-StableJsonHash {
  param($Value)
  $json = $Value | ConvertTo-Json -Depth 100 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-TextHash {
  param([string]$Value)
  $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

$HumanReviewRoot = $null
if ($HumanReviewFile) {
  $resolvedReviewPath = [IO.Path]::GetFullPath($HumanReviewFile)
  if (-not (Test-Path -LiteralPath $resolvedReviewPath)) {
    throw "Human review file was not found: $resolvedReviewPath"
  }
  $HumanReviewRoot = Read-JsonFile -Path $resolvedReviewPath
}

function Get-HumanReview {
  param(
    [Parameter(Mandatory = $true)][string]$CaseRunId,
    [Parameter(Mandatory = $true)][string]$CaseId
  )
  $default = [ordered]@{
    status = "not_reviewed"
    reviewer = $null
    reviewed_at = $null
    notes = $null
  }
  if (-not $HumanReviewRoot) {
    return $default
  }
  $property = $HumanReviewRoot.PSObject.Properties[$CaseRunId]
  if (-not $property) {
    $property = $HumanReviewRoot.PSObject.Properties[$CaseId]
  }
  if (-not $property -or -not $property.Value) {
    return $default
  }
  $review = $property.Value
  $status = [string]$review.status
  if ($status -notin @("not_reviewed", "approved", "rejected")) {
    throw "Invalid human review status for $CaseRunId: $status"
  }
  $reviewer = if ($review.PSObject.Properties["reviewer"]) { [string]$review.reviewer } else { $null }
  if ($status -ne "not_reviewed" -and -not $reviewer) {
    throw "Human review for $CaseRunId must include reviewer when status is $status."
  }
  return [ordered]@{
    status = $status
    reviewer = $reviewer
    reviewed_at = if ($review.PSObject.Properties["reviewed_at"]) { $review.reviewed_at } else { $null }
    notes = if ($review.PSObject.Properties["notes"]) { $review.notes } else { $null }
  }
}

Write-Host "Foundry benchmark run: $RunId"
Write-Host "Output: $RunRoot"
Write-Host "API: $BaseUrl"

$manifestResponse = Invoke-FoundryApi -Method GET -Path "/api/sandbox/probe-lab/blender-python-builder/benchmark"
if ($manifestResponse.ok -ne $true -or -not $manifestResponse.manifest) {
  throw "The Foundry benchmark manifest endpoint did not return a manifest. Start pnpm dev and verify Patch 3D is installed."
}
Save-JsonFile -Value $manifestResponse.manifest -Path (Join-Path $RunRoot "benchmark-manifest.json")

$cases = @($manifestResponse.manifest.cases)
if ($CaseId.Count -gt 0) {
  $requested = @{}
  foreach ($id in $CaseId) { $requested[$id] = $true }
  $cases = @($cases | Where-Object { $requested.ContainsKey([string]$_.case_id) })
  if ($cases.Count -ne $CaseId.Count) {
    $found = @($cases | ForEach-Object { [string]$_.case_id })
    $missing = @($CaseId | Where-Object { $_ -notin $found })
    throw "Unknown benchmark case id(s): $($missing -join ', ')"
  }
}

$completedRuns = @()
foreach ($case in $cases) {
  $repeatCount = [Math]::Max(1, [int]$case.repeat_count)
  for ($repeat = 1; $repeat -le $repeatCount; $repeat += 1) {
    $caseRunId = if ($repeatCount -gt 1) { "$($case.case_id)-repeat-$repeat" } else { [string]$case.case_id }
    $caseRoot = Join-Path $RunRoot $caseRunId
    New-Item -ItemType Directory -Force -Path $caseRoot | Out-Null
    Write-Host "`n[$caseRunId] $($case.request)"

    $plan = Invoke-CheckpointStage `
      -Name "design planning" `
      -Path (Join-Path $caseRoot "01-plan.json") `
      -Action {
        Invoke-FoundryApi -Method POST -Path "/api/sandbox/probe-lab/blender-python-builder/plan" -Body @{
          request = $case.request
          style = $case.style
          quality_mode = $case.quality_mode
          animation_ready = [bool]$case.animation_ready
          target_extent_m = [double]$case.target_extent_m
          max_triangles = [int]$case.max_triangles
        }
      }

    $resources = Invoke-CheckpointStage `
      -Name "resource resolution" `
      -Path (Join-Path $caseRoot "02-resources.json") `
      -Action {
        Invoke-FoundryApi -Method POST -Path "/api/sandbox/probe-lab/blender-python-builder/resources" -Body @{
          action = "resolve"
          request = $case.request
          style = $case.style
          quality_mode = $case.quality_mode
          animation_ready = [bool]$case.animation_ready
          target_extent_m = [double]$case.target_extent_m
          max_triangles = [int]$case.max_triangles
          design_brief = $plan.design_brief
          resource_plan = $null
        }
      }

    if ($resources.plan.summary.requires_preparation -eq $true -and -not $SkipPreparation) {
      $resources = Invoke-CheckpointStage `
        -Name "R2 resource preparation" `
        -Path (Join-Path $caseRoot "03-resources-prepared.json") `
        -Action {
          Invoke-FoundryApi -Method POST -Path "/api/sandbox/probe-lab/blender-python-builder/resources" -Body @{
            action = "prepare"
            request = $case.request
            style = $case.style
            quality_mode = $case.quality_mode
            animation_ready = [bool]$case.animation_ready
            target_extent_m = [double]$case.target_extent_m
            max_triangles = [int]$case.max_triangles
            design_brief = $plan.design_brief
            resource_plan = $resources.plan
          }
        }
    }

    $generate = Invoke-CheckpointStage `
      -Name "Blender Python generation" `
      -Path (Join-Path $caseRoot "04-generate.json") `
      -Action {
        Invoke-FoundryApi -Method POST -Path "/api/sandbox/probe-lab/blender-python-builder/generate" -Body @{
          request = $case.request
          style = $case.style
          quality_mode = $case.quality_mode
          animation_ready = [bool]$case.animation_ready
          target_extent_m = [double]$case.target_extent_m
          max_triangles = [int]$case.max_triangles
          design_brief = $plan.design_brief
          resource_plan = $resources.plan
        }
      }

    $execute = Invoke-CheckpointStage `
      -Name "bounded Blender execution" `
      -Path (Join-Path $caseRoot "05-execute.json") `
      -Action {
        Invoke-FoundryApi -Method POST -Path "/api/sandbox/probe-lab/blender-python-builder/execute-with-repair" -Body @{
          code = $generate.code
          asset_name = $generate.design_brief.asset_id
          request = $case.request
          style = $case.style
          quality_mode = $case.quality_mode
          animation_ready = [bool]$case.animation_ready
          target_extent_m = [double]$case.target_extent_m
          max_triangles = [int]$case.max_triangles
          design_brief = $generate.design_brief
          asset_spec = $generate.asset_spec
          resource_plan = $resources.plan
          look_adjustments = $null
          max_repair_attempts = 2
          revision_number = 1
          revision_label = "benchmark initial build"
        }
      }

    $visual = $null
    if (-not $SkipVisualCritic) {
      $visual = Invoke-CheckpointStage `
        -Name "image-grounded visual critique" `
        -Path (Join-Path $caseRoot "06-visual-critique.json") `
        -Action {
          Invoke-FoundryApi -Method POST -Path "/api/sandbox/probe-lab/blender-python-builder/visual-critique" -Body @{
            job_id = $execute.job_id
          }
        }
    }

    $visualReport = if ($visual) { $visual.report } else { $null }
    $humanReview = Get-HumanReview -CaseRunId $caseRunId -CaseId ([string]$case.case_id)
    Write-Host "  Running benchmark gate evaluation"
    $evaluation = Invoke-FoundryApi -Method POST -Path "/api/sandbox/probe-lab/blender-python-builder/benchmark" -Body @{
      action = "evaluate"
      case_id = $case.case_id
      execution = $execute
      visual_critique = $visualReport
      human_review = $humanReview
    }
    Save-JsonFile -Value $evaluation -Path (Join-Path $caseRoot "07-evaluation.json")
    if ($evaluation.ok -ne $true) {
      throw "Benchmark gate evaluation failed for $caseRunId."
    }

    $materialSelections = @()
    foreach ($binding in @($execute.resource_plan.material_bindings)) {
      $materialSelections += [ordered]@{
        slot_id = $binding.slot.slot_id
        resource_id = $binding.selected.resource_id
        source_asset_id = $binding.selected.source_asset_id
        variant_id = $binding.selected.variant_id
        match_confidence = $binding.selected.match_confidence
      }
    }
    $provenance = [ordered]@{
      schema_version = "myway_foundry_benchmark_provenance_v1"
      run_id = $RunId
      case_run_id = $caseRunId
      case_id = $case.case_id
      repeat_index = $repeat
      request_hash = Get-TextHash -Value ([string]$case.request)
      design_brief_hash = Get-StableJsonHash -Value $generate.design_brief
      generated_source_hash = Get-TextHash -Value ([string]$generate.code)
      resource_plan_hash = Get-StableJsonHash -Value $execute.resource_plan
      resource_manifest_hash = Get-StableJsonHash -Value $execute.resource_manifest
      look_adjustments_hash = Get-StableJsonHash -Value $execute.look_adjustments
      context_schema_version = $generate.context_package.schema_version
      planning_model = $plan.model
      generation_model = $generate.model
      visual_model = if ($visualReport) { $visualReport.model } else { $null }
      helper_library_version = $execute.helper_library_version
      inspection_footer_version = $execute.inspection_footer_version
      blender_runtime = $execute.blender_runtime
      compile_smoke = $execute.compile_smoke
      execution_elapsed_ms = $execute.elapsed_ms
      visual_elapsed_ms = if ($visual) { $visual.elapsed_ms } else { $null }
      repair_attempts = $execute.repair_attempts
      material_selections = $materialSelections
      environment_selection = $execute.resource_plan.environment.selected
      evaluation_status = $evaluation.evaluation.status
      human_review = $humanReview
      created_at = (Get-Date).ToUniversalTime().ToString("o")
    }
    Save-JsonFile -Value $provenance -Path (Join-Path $caseRoot "08-provenance.json")

    $completedRuns += [pscustomobject]@{
      case_id = [string]$case.case_id
      case_run_id = $caseRunId
      stability_group = [string]$case.stability_group
      execution = $execute
      evaluation = $evaluation.evaluation
    }
    Write-Host "  Result: $($evaluation.evaluation.status)"
  }
}

$stabilityComparisons = @()
$groups = @($completedRuns | Where-Object { $_.stability_group } | Group-Object stability_group)
foreach ($group in $groups) {
  if ($group.Count -lt 2) { continue }
  $first = $group.Group[0]
  $second = $group.Group[1]
  $comparisonResponse = Invoke-FoundryApi -Method POST -Path "/api/sandbox/probe-lab/blender-python-builder/benchmark" -Body @{
    action = "compare_stability"
    stability_group = $group.Name
    first_execution = $first.execution
    second_execution = $second.execution
    first_evaluation = $first.evaluation
    second_evaluation = $second.evaluation
  }
  if ($comparisonResponse.ok -eq $true) {
    $stabilityComparisons += $comparisonResponse.comparison
  }
}

$summary = [ordered]@{
  schema_version = "myway_foundry_benchmark_run_summary_v1"
  run_id = $RunId
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  output_root = $RunRoot
  case_run_count = $completedRuns.Count
  statuses = @($completedRuns | Group-Object { $_.evaluation.status } | ForEach-Object {
    [ordered]@{ status = $_.Name; count = $_.Count }
  })
  stability_comparisons = $stabilityComparisons
  release_note = "Automated passes remain pending until a human reviewer approves the final revision."
}
Save-JsonFile -Value $summary -Path (Join-Path $RunRoot "run-summary.json")

Write-Host "`nBenchmark complete."
Write-Host "Summary: $(Join-Path $RunRoot 'run-summary.json')"
