[CmdletBinding()]
param([string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',[ValidateRange(0,30)][int]$Samples=15,[switch]$IncludePreviews)
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $root branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -ne 'myway/learning-sandbox-v3_7a'){throw 'Protected research branch required.'}
$top=(& git -C $root rev-parse --show-toplevel).Trim()
if($LASTEXITCODE -ne 0 -or (Resolve-Path -LiteralPath $top).Path -ne $root){throw 'Run against the repository root.'}
$entry=Join-Path $root 'scripts/sandbox/learning-intelligence/r65a/inventory.mjs'
$argsList=@($entry,'--samples',"$Samples")
if($IncludePreviews){$argsList+='--include-previews'}
Push-Location -LiteralPath $root
try {
  & node @argsList
  if($LASTEXITCODE -ne 0){throw 'Inventory returned an incomplete or failed audit. Inspect the output and any research ZIP.'}
} finally { Pop-Location }
