param(
  [string]$ProjectRoot = (Get-Location).Path,
  [Parameter(Mandatory = $true)]
  [string]$SourceGlbPath,
  [Parameter(Mandatory = $true)]
  [string]$AssetId,
  [string]$DisplayName = "",
  [ValidateSet("generic", "biology", "chemistry", "physics", "medicine", "math", "law", "coding", "automotive", "plumbing", "other")]
  [string]$Domain = "generic",
  [string]$Tags = "generic,object",
  [string]$RenderRoles = "reference_object",
  [ValidateSet("cc0", "royalty_free", "self_owned", "unknown")]
  [string]$LicenseKind = "unknown",
  [ValidateSet("recorded", "needs_review", "sandbox_only", "app_ready")]
  [string]$LicenseStatus = "needs_review",
  [ValidateSet("blenderkit", "blendkit", "blender_manual_export", "self_made", "built_in", "unknown")]
  [string]$SourceType = "blender_manual_export",
  [switch]$SafeToPromoteToApp,
  [string]$Notes = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Split-List([string]$Value) {
  return @(
    $Value -split "," |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_.Length -gt 0 } |
      Select-Object -Unique
  )
}

function Assert-AssetId([string]$Value) {
  if ($Value -notmatch "^[a-z0-9][a-z0-9_\-]*[a-z0-9]$") {
    throw "AssetId must use lowercase letters, numbers, hyphens, or underscores. Example: mitochondrion_v1"
  }
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$SourceGlbPath = (Resolve-Path -LiteralPath $SourceGlbPath).Path
Assert-AssetId $AssetId

if (-not (Test-Path -LiteralPath $SourceGlbPath -PathType Leaf)) {
  throw "Source GLB not found: $SourceGlbPath"
}

if ([System.IO.Path]::GetExtension($SourceGlbPath).ToLowerInvariant() -ne ".glb") {
  throw "SourceGlbPath must point to a .glb file. Got: $SourceGlbPath"
}

if ([string]::IsNullOrWhiteSpace($DisplayName)) {
  $DisplayName = ($AssetId -replace "_", " ")
  $DisplayName = (Get-Culture).TextInfo.ToTitleCase($DisplayName)
}

$TargetDir = Join-Path $ProjectRoot "public\sandbox-assets\visual-experience\models\$Domain"
$TargetFile = Join-Path $TargetDir "$AssetId.glb"
$RegistryPath = Join-Path $ProjectRoot "sandbox\probe-lab\visual-experience\assets\registry.json"
$LicenseDir = Join-Path $ProjectRoot "sandbox\probe-lab\visual-experience\assets\licenses"
$LicensePath = Join-Path $LicenseDir "$AssetId.json"

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
New-Item -ItemType Directory -Force -Path $LicenseDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $RegistryPath) | Out-Null

Copy-Item -LiteralPath $SourceGlbPath -Destination $TargetFile -Force

$Today = (Get-Date).ToString("yyyy-MM-dd")
$IsoNow = (Get-Date).ToString("o")
$PublicPath = "/sandbox-assets/visual-experience/models/$Domain/$AssetId.glb"
$LicenseRecordPath = "sandbox/probe-lab/visual-experience/assets/licenses/$AssetId.json"

$SemanticTags = Split-List $Tags
if ($SemanticTags.Count -eq 0) { $SemanticTags = @($Domain, "object") }
if (-not ($SemanticTags -contains $Domain)) { $SemanticTags = @($Domain) + $SemanticTags }

$Roles = Split-List $RenderRoles
if ($Roles.Count -eq 0) { $Roles = @("reference_object") }

$ExistingRegistry = $null
if (Test-Path -LiteralPath $RegistryPath -PathType Leaf) {
  $ExistingRegistry = Get-Content -LiteralPath $RegistryPath -Raw | ConvertFrom-Json
}

if ($null -eq $ExistingRegistry) {
  $ExistingRegistry = [pscustomobject]@{
    schema_version = "myway_visual_asset_registry_v1"
    updated_at = $IsoNow
    asset_root_public_url = "/sandbox-assets/visual-experience"
    notes = "Sandbox visual asset shelf."
    assets = @()
  }
}

$ExistingAssets = @($ExistingRegistry.assets)
$OtherAssets = @($ExistingAssets | Where-Object { $_.asset_id -ne $AssetId })
$Previous = @($ExistingAssets | Where-Object { $_.asset_id -eq $AssetId } | Select-Object -First 1)
$CreatedAt = if ($Previous.Count -gt 0 -and $Previous[0].created_at) { $Previous[0].created_at } else { $Today }

$AssetRecord = [ordered]@{
  asset_id = $AssetId
  display_name = $DisplayName
  asset_type = "glb"
  domain = $Domain
  source_type = $SourceType
  public_path = $PublicPath
  source_path = $SourceGlbPath
  license_record_path = $LicenseRecordPath
  semantic_tags = @($SemanticTags)
  render_roles = @($Roles)
  experience_modes = @("asset_preview", "model_selected_scene", "generic_scene")
  license_kind = $LicenseKind
  license_status = $LicenseStatus
  commercial_use_allowed = $true
  raw_redistribution_allowed = ($LicenseKind -eq "cc0")
  safe_to_use_in_sandbox = $true
  safe_to_promote_to_app = [bool]$SafeToPromoteToApp
  notes = $Notes
  created_at = $CreatedAt
  updated_at = $Today
}

$UpdatedAssets = @($OtherAssets) + ([pscustomobject]$AssetRecord)
$UpdatedAssets = @($UpdatedAssets | Sort-Object domain, asset_id)

$UpdatedRegistry = [ordered]@{
  schema_version = "myway_visual_asset_registry_v1"
  updated_at = $IsoNow
  asset_root_public_url = "/sandbox-assets/visual-experience"
  notes = $ExistingRegistry.notes
  assets = @($UpdatedAssets)
}

$UpdatedRegistry | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $RegistryPath -Encoding UTF8

$LicenseRecord = [ordered]@{
  asset_id = $AssetId
  source = $SourceType
  original_file = $SourceGlbPath
  exported_public_path = $PublicPath
  license = $LicenseKind
  license_status = $LicenseStatus
  downloaded_or_exported_at = $Today
  promotion_status = if ($SafeToPromoteToApp) { "app_ready" } else { "sandbox_only" }
  notes = if ($Notes.Length -gt 0) { $Notes } else { "Fill in original asset source URL/creator when available." }
}

$LicenseRecord | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $LicensePath -Encoding UTF8

$CopiedFile = Get-Item -LiteralPath $TargetFile

[PSCustomObject]@{
  Registered = $true
  AssetId = $AssetId
  DisplayName = $DisplayName
  Domain = $Domain
  PublicPath = $PublicPath
  TargetFile = $CopiedFile.FullName
  SizeMB = [Math]::Round($CopiedFile.Length / 1MB, 2)
  RegistryPath = $RegistryPath
  LicensePath = $LicensePath
  PreviewPage = "http://localhost:3000/sandbox/probe-lab/visual-experience"
}
