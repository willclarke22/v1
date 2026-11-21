# R4.4 local-only highlighted-feedback and targeted-retry sandbox launcher.
[CmdletBinding()]
param(
    [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',
    [ValidateRange(1024,65535)][int]$Port=8877
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "Wrong Git branch '$branch'; use the isolated experiment only."}
$script=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r44-goldloop-web.mjs'
if(-not(Test-Path -LiteralPath $script -PathType Leaf)){throw 'R4.4 highlight/retry sandbox not installed.'}
Write-Host 'Starting R4.4 LOCAL MyWay sandbox: span highlighting, free feedback, paid opt-in targeted retry.' -ForegroundColor Cyan
Write-Host 'No model calls occur on startup. Open the COMPLETE access URL shown below. Stop with Ctrl+C.'
& node $script --port "$Port"
if($LASTEXITCODE -ne 0){throw 'R4.4 local sandbox exited with an error.'}
