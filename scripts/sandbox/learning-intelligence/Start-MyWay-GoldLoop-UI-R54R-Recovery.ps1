# R5.4R creative probes + X-only recovery — isolated local research interface, no provider call at startup.
[CmdletBinding()]
param(
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',
 [ValidateRange(1024,65535)][int]$Port=8877
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "STOP: wrong Git branch '$branch'. Original main protected."}
$server=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r54r-goldloop-web.mjs'
if(-not(Test-Path -LiteralPath $server -PathType Leaf)){throw 'R5.4R recovery server is not installed.'}
Write-Host 'R5.4R GoldLoop — creative B-only vs B+X optional research; B/X can author custom sandboxed HTML/CSS/JS interactions.' -ForegroundColor Cyan
Write-Host 'Normal ROUTE/A/B/X learning, R5.3R Model C, old probes, and historical sessions remain available.'
Write-Host 'Real model calls are optional, charged only after explicit approval. Failed paid calls are never automatically retried. X-only recovery requires a new separate paid approval.'
Write-Host 'Open COMPLETE local access URL below; Ctrl+C stops the server.'
& node $server --port "$Port"
if($LASTEXITCODE -ne 0){throw 'R5.4 local server stopped with an error.'}
