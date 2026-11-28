[CmdletBinding()]
param([string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment')
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $root branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -ne 'myway/learning-sandbox-v3_7a'){throw 'Protected research branch required.'}
$top=(& git -C $root rev-parse --show-toplevel).Trim()
if($LASTEXITCODE -ne 0 -or (Resolve-Path -LiteralPath $top).Path -ne $root){throw 'Run against the repository root.'}
Push-Location -LiteralPath $root
try {
  & node (Join-Path $root 'scripts/sandbox/learning-intelligence/r65a1/server.mjs')
  if($LASTEXITCODE -ne 0){throw 'Inspection lab stopped; inspect output.'}
} finally {Pop-Location}
