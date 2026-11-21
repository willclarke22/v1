# MyWay R4.5 longitudinal root-memory sandbox. LOCAL ONLY.
[CmdletBinding()]
param(
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',
 [ValidateRange(1024,65535)][int]$Port=8877
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "Wrong Git branch '$branch'. Use only the isolated experiment."}
$script=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r45-goldloop-web.mjs'
if(-not(Test-Path -LiteralPath $script -PathType Leaf)){throw 'R4.5 longitudinal root-memory UI is not installed.'}
Write-Host 'Starting MyWay R4.5 LOCAL sandbox (R4.4 highlights and retry retained).' -ForegroundColor Cyan
Write-Host 'Startup makes NO paid model calls. Review original Model A history before choosing an explicitly paid backfill.'
Write-Host 'Open the COMPLETE access URL below. Press Ctrl+C to stop.'
& node $script --port "$Port"
if($LASTEXITCODE -ne 0){throw 'R4.5 local sandbox exited with an error.'}
