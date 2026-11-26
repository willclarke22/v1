[CmdletBinding()]
param([string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',[ValidateRange(1024,65535)][int]$Port=8878)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current | Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "Wrong branch '$branch'."}
Write-Host 'R6.1: OFFLINE FIXTURE ONLY. No paid calls, database or deployment.' -ForegroundColor Cyan
Write-Host "Open http://127.0.0.1:$Port in your browser."
& node (Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\r61\server.mjs') --port $Port
if($LASTEXITCODE -ne 0){throw 'R6.1 server stopped with an error'}
