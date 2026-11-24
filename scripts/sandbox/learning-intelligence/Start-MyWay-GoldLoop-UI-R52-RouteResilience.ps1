# R5.2 local-only GoldLoop with R5.1 thought bubbles and robust route titles. No model calls at launch.
[CmdletBinding()]
param(
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',
 [ValidateRange(1024,65535)][int]$Port=8877
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "STOP: wrong Git branch '$branch'. Original main is protected."}
$server=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r52-goldloop-web.mjs'
if(-not(Test-Path -LiteralPath $server -PathType Leaf)){throw 'R5.2 server not installed.'}
Write-Host 'R5.2 GoldLoop: resilient topic titles + thought bubbles.' -ForegroundColor Cyan
Write-Host 'R5.2 uses a versioned R5.0-derived runner; original runner and session data remain unchanged. No paid calls at startup.'
Write-Host 'Open the FULL URL printed below; press Ctrl+C to stop.'
& node $server --port "$Port"
if($LASTEXITCODE -ne 0){throw 'R5.2 local server stopped with an error.'}
