# R5.0 local research sandbox launcher. No provider calls at startup.
[CmdletBinding()]
param(
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',
 [ValidateRange(1024,65535)][int]$Port=8877
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "Wrong Git branch '$branch': do not start on original main."}
$server=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r50-goldloop-web.mjs'
if(-not(Test-Path -LiteralPath $server -PathType Leaf)){throw 'R5.0 web server is missing. Install R5.0 first.'}
Write-Host 'R5.0 research sandbox: bounded evidence packets, selective retrieval, checkpoint auditing.' -ForegroundColor Cyan
Write-Host 'Local only. Copy the complete access URL. Use Ctrl+C to stop. Paid turns still require explicit authorization.'
& node $server --port "$Port"
if($LASTEXITCODE -ne 0){throw 'R5.0 server stopped with an error.'}
