# R4.7 human sandbox with three independent scroll panes and X coverage safeguards. LOCAL ONLY, no provider calls on startup.
[CmdletBinding()]
param(
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',
 [ValidateRange(1024,65535)][int]$Port=8877
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "Wrong Git branch '$branch'. Never use original production main."}
$script=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r47-goldloop-web.mjs'
if(-not(Test-Path -LiteralPath $script -PathType Leaf)){throw 'R4.7 coverage and scroll patch is not installed.'}
Write-Host 'Starting R4.7 local GoldLoop: optional interactive probe placeholders + R4.5 root memory + R4.4 highlights.' -ForegroundColor Cyan
Write-Host 'No paid model call on startup or on probe submission. Regular teaching turns still require explicit per-turn approval.'
Write-Host 'Copy the COMPLETE access URL from this terminal. Press Ctrl+C to stop.'
& node $script --port "$Port"
if($LASTEXITCODE -ne 0){throw 'R4.6 sandbox exited with an error.'}
