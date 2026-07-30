param(
  [string]$ProjectRoot = "",
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = (Resolve-Path -LiteralPath ".").Path
}
else {
  $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $ProjectRoot "phase2-baseline-audit.txt"
}
elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path $ProjectRoot $OutputPath
}

function Add-AuditLine {
  param([AllowEmptyString()][string]$Text = "")

  Add-Content `
    -LiteralPath $OutputPath `
    -Value $Text `
    -Encoding UTF8
}

function Get-CompatibleRelativePath {
  param(
    [Parameter(Mandatory)][string]$BasePath,
    [Parameter(Mandatory)][string]$ChildPath
  )

  $BaseFullPath = [System.IO.Path]::GetFullPath($BasePath)
  $ChildFullPath = [System.IO.Path]::GetFullPath($ChildPath)
  $Separator = [string][System.IO.Path]::DirectorySeparatorChar
  $BasePrefix = $BaseFullPath

  if (-not $BasePrefix.EndsWith($Separator)) {
    $BasePrefix += $Separator
  }

  if (-not $ChildFullPath.StartsWith(
    $BasePrefix,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
    throw "Path '$ChildFullPath' is not below base path '$BaseFullPath'."
  }

  return $ChildFullPath.Substring($BasePrefix.Length).Replace("/", "\")
}

function Invoke-CapturedCommand {
  param(
    [Parameter(Mandatory)][string]$Label,
    [Parameter(Mandatory)][scriptblock]$Command
  )

  Add-AuditLine ("--- " + $Label + " ---")
  try {
    $result = & $Command 2>&1
    if ($null -eq $result -or @($result).Count -eq 0) {
      Add-AuditLine "[no output]"
    }
    else {
      foreach ($line in @($result)) {
        Add-AuditLine ([string]$line)
      }
    }
  }
  catch {
    Add-AuditLine ("ERROR: " + $_.Exception.Message)
  }
  Add-AuditLine ""
}

function Get-PathSummary {
  param([Parameter(Mandatory)][string]$RelativePath)

  $absolutePath = Join-Path $ProjectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $absolutePath)) {
    return [pscustomobject]@{
      Path = $RelativePath
      Exists = $false
      Files = 0
      Bytes = 0
    }
  }

  $item = Get-Item -LiteralPath $absolutePath
  if ($item.PSIsContainer) {
    $files = @(
      Get-ChildItem `
        -LiteralPath $absolutePath `
        -Recurse `
        -File `
        -ErrorAction SilentlyContinue
    )
    return [pscustomobject]@{
      Path = $RelativePath
      Exists = $true
      Files = $files.Count
      Bytes = ($files | Measure-Object -Property Length -Sum).Sum
    }
  }

  return [pscustomobject]@{
    Path = $RelativePath
    Exists = $true
    Files = 1
    Bytes = $item.Length
  }
}

if (Test-Path -LiteralPath $OutputPath) {
  Remove-Item -LiteralPath $OutputPath -Force
}

Add-AuditLine "MYWAY PHASE 2 BASELINE AUDIT"
Add-AuditLine ("Generated: " + (Get-Date).ToString("o"))
Add-AuditLine ("Project root: " + $ProjectRoot)
Add-AuditLine ""

Push-Location $ProjectRoot
try {
  Invoke-CapturedCommand "Git branch" {
    git branch --show-current
  }
  Invoke-CapturedCommand "Git commit" {
    git rev-parse HEAD
  }
  Invoke-CapturedCommand "Git status --short" {
    git status --short
  }
  Invoke-CapturedCommand "Node version" {
    node --version
  }
  Invoke-CapturedCommand "pnpm version" {
    pnpm --version
  }

  Add-AuditLine "--- Canonical Phase 2 files ---"
  $CanonicalPaths = @(
    "sandbox\probe-lab\ARCHITECTURE.md",
    "sandbox\probe-lab\PHASE2_BASELINE.md",
    "sandbox\probe-lab\CLEANUP_INVENTORY.md",
    "sandbox\probe-lab\director\director-contract.ts",
    "sandbox\probe-lab\director\normalize-director-plan.ts",
    "sandbox\probe-lab\scene-resources\scene-resource-contract.ts",
    "sandbox\probe-lab\scene-resources\normalize-scene-resource-plan.ts",
    "sandbox\probe-lab\scene-resources\resource-plan-adapters.ts",
    "sandbox\probe-lab\scene-resources\validate-scene-resource-plan.ts",
    "sandbox\probe-lab\primitive-builder\primitive-scene-graph.ts",
    "sandbox\probe-lab\visual-experience\visual-learning-turn.ts",
    "sandbox\probe-lab\visual-experience\normalize-visual-learning-turn-output.ts",
    "sandbox\probe-lab\scenes\scene-manifest.ts",
    "sandbox\probe-lab\scenes\validate-scene-manifest.ts",
    "sandbox\probe-lab\assets\asset-types.ts",
    "sandbox\probe-lab\assets\asset-library.server.ts",
    "sandbox\probe-lab\assets\asset-resolver.server.ts",
    "sandbox\probe-lab\assets\catalog\ambientcg\ambientcg-types.ts",
    "sandbox\probe-lab\assets\storage\r2-asset-storage.server.ts"
  )

  foreach ($relativePath in $CanonicalPaths) {
    $summary = Get-PathSummary $relativePath
    Add-AuditLine (
      "{0} | exists={1} | files={2} | bytes={3}" -f `
        $summary.Path,
        $summary.Exists,
        $summary.Files,
        $summary.Bytes
    )
  }
  Add-AuditLine ""

  Add-AuditLine "--- Generated-state and cleanup candidates ---"
  $GeneratedPaths = @(
    "sandbox\probe-lab\assets\debug",
    "sandbox\probe-lab\assets\embeddings",
    "sandbox\probe-lab\assets\acquisition\missing-asset-jobs.json",
    "sandbox\probe-lab\assets\downloads\ambientcg\jobs.json",
    "sandbox\probe-lab\blender-python-builder\jobs",
    "sandbox\probe-lab\assets\library\source-records",
    "sandbox\probe-lab\assets\library\licenses"
  )

  foreach ($relativePath in $GeneratedPaths) {
    $summary = Get-PathSummary $relativePath
    Add-AuditLine (
      "{0} | exists={1} | files={2} | bytes={3}" -f `
        $summary.Path,
        $summary.Exists,
        $summary.Files,
        $summary.Bytes
    )
  }
  Add-AuditLine ""

  Add-AuditLine "--- Active sandbox text-file count ---"
  $TextExtensions = @(
    ".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs",
    ".json", ".md", ".txt", ".py", ".css", ".scss",
    ".html", ".yml", ".yaml"
  )
  $ActiveRoots = @(
    "sandbox",
    "app\sandbox",
    "app\api\sandbox",
    "lib\sandbox"
  )
  $ActiveFiles = @()

  foreach ($root in $ActiveRoots) {
    $absoluteRoot = Join-Path $ProjectRoot $root
    if (-not (Test-Path -LiteralPath $absoluteRoot)) {
      continue
    }

    $ActiveFiles += Get-ChildItem `
      -LiteralPath $absoluteRoot `
      -Recurse `
      -File `
      -ErrorAction SilentlyContinue |
      Where-Object {
        $relative = Get-CompatibleRelativePath `
          -BasePath $ProjectRoot `
          -ChildPath $_.FullName

        $TextExtensions -contains $_.Extension.ToLowerInvariant() -and
        $relative -notlike "sandbox\probe-lab\assets\jobs\*" -and
        $relative -notlike ".myway-patch-backups\*"
      }
  }

  $UniqueActiveFiles = @(
    $ActiveFiles |
      Sort-Object FullName -Unique
  )
  Add-AuditLine ("Files: " + $UniqueActiveFiles.Count)
  Add-AuditLine (
    "Bytes: " +
    (($UniqueActiveFiles |
      Measure-Object -Property Length -Sum).Sum)
  )
  Add-AuditLine ""

  Add-AuditLine "--- Phase 2B contract invariants ---"
  Add-AuditLine "Director remains educational source of truth."
  Add-AuditLine "Resource plan schema: myway_scene_resource_plan_v1"
  Add-AuditLine "Default acquisition policy: never"
  Add-AuditLine "Stable entity ids preserved by fallback policy: true"
  Add-AuditLine "Environment intent is scene-level."
  Add-AuditLine "Materials target entity slots or named surfaces."
  Add-AuditLine ""
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Phase 2 baseline audit complete."
Write-Host "Output: $OutputPath"
Write-Host ""
