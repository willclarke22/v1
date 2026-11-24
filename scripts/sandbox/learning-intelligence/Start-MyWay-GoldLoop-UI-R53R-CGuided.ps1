# R5.3R local GoldLoop — creative probe experiment and feedback investigator.
# No model calls or state writes at startup.
[CmdletBinding()]
param(
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',
 [ValidateRange(1024,65535)][int]$Port=8877
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "STOP: wrong Git branch '$branch'. Original main is protected."}
$server=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r53r-goldloop-web.mjs'
if(-not(Test-Path -LiteralPath $server -PathType Leaf)){throw 'R5.3R server not installed.'}
Write-Host 'R5.3R GoldLoop: optional Model C planning plus explicitly approved C-guided B/X revisions; existing A/B/X and probes remain unchanged.' -ForegroundColor Cyan
Write-Host 'R5.3 keeps R5.2P, R5.2S, R5.2 and R5.1. No provider calls at startup; no automatic retries.'
Write-Host 'Open the COMPLETE local access URL printed below; press Ctrl+C to stop.'
& node $server --port "$Port"
if($LASTEXITCODE -ne 0){throw 'R5.3 local server stopped with an error.'}
