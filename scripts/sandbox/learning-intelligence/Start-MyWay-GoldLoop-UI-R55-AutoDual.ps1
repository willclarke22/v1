# R5.5 local-only auto dual experience; no spend merely by launching.
[CmdletBinding()]
param(
  [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',
  [ValidateRange(1024,65535)][int]$Port=8877
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current | Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "Wrong Git branch '$branch'. Original main is protected."}
$server=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r55-goldloop-web.mjs'
if(-not(Test-Path -LiteralPath $server -PathType Leaf)){throw 'R5.5 files are not installed.'}
Write-Host 'MyWay R5.5 — automatic B-only / B+X comparison; model-first learner experience.' -ForegroundColor Cyan
Write-Host 'Both variants generate after the user authorizes a bounded session research budget.'
Write-Host 'No automatic retry; uncertain billing outcomes pause subsequent calls. Local 127.0.0.1 only.'
Write-Host 'Open the COMPLETE localhost URL printed below. Ctrl+C stops the sandbox.'
& node $server --port "$Port"
if($LASTEXITCODE -ne 0){throw 'Local R5.5 server returned an error.'}
