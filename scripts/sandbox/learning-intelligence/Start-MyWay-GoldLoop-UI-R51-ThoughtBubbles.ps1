# R5.1 local-only GoldLoop thought bubbles, R5.0 runner unchanged. No model calls at launch.
[CmdletBinding()]
param(
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',
 [ValidateRange(1024,65535)][int]$Port=8877
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "STOP: wrong Git branch '$branch'. Original main is protected."}
$server=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r51-goldloop-web.mjs'
if(-not(Test-Path -LiteralPath $server -PathType Leaf)){throw 'R5.1 server not installed.'}
Write-Host 'R5.1 GoldLoop · animated thought bubbles with verified progress from paid-turn checkpoints.' -ForegroundColor Cyan
Write-Host 'R5.0 model runner, prompts and session data remain unchanged. No model calls on startup.'
Write-Host 'Open the FULL URL printed below; press Ctrl+C to stop.'
& node $server --port "$Port"
if($LASTEXITCODE -ne 0){throw 'R5.1 local server stopped with an error.'}
