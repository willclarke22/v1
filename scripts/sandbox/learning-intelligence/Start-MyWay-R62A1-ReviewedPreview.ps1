[CmdletBinding()]
param([string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',[ValidateRange(1024,65535)][int]$Port=8879)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current | Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw 'Wrong branch.'}
Write-Host "Open http://127.0.0.1:$Port - R6.2A.1 reviewed preview (no paid generation)"
& node (Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\r62\reviewed-preview-server.mjs') --port "$Port"
if($LASTEXITCODE -ne 0){throw 'Preview server stopped with an error.'}
