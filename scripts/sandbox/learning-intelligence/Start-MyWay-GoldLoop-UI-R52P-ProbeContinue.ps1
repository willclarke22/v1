# R5.2P: local GoldLoop with submitted-probe continuation. No calls at startup.
[CmdletBinding()]
param(
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',
 [ValidateRange(1024,65535)][int]$Port=8877
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "STOP: wrong Git branch '$branch'. Original main is protected."}
$server=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r52p-goldloop-web.mjs'
if(-not(Test-Path -LiteralPath $server -PathType Leaf)){throw 'R5.2P server not installed.'}
Write-Host 'R5.2P GoldLoop: probe-to-A/B/X continuation on R5.2S clean session.' -ForegroundColor Cyan
Write-Host 'R5.2P preserves R5.2S, R5.2 routing, R5.1 thought bubbles. Probe saving stays free; continuation requires explicit approval. No calls at startup.'
Write-Host 'Open the FULL URL printed below; press Ctrl+C to stop.'
& node $server --port "$Port"
if($LASTEXITCODE -ne 0){throw 'R5.2P local server stopped with an error.'}
