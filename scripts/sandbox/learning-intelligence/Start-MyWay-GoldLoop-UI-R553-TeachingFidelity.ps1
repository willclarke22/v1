# R5.5.3 free offline research launcher. Does not make paid calls on startup.
[CmdletBinding()]
param([string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',[ValidateRange(1024,65535)][int]$Port=8877)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current | Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "Wrong branch '$branch'. Production main is protected."}
$server=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r553-goldloop-web.mjs'
if(-not(Test-Path -LiteralPath $server -PathType Leaf)){throw 'R5.5.3 is not installed'}
Write-Host 'R5.5.3 clean prompts + visual reliability; same existing sessions' -ForegroundColor Cyan
Write-Host 'No paid call on launch. Existing authorization is PRESERVED; sending a new message can incur paid calls.'
& node $server --port "$Port"
if($LASTEXITCODE -ne 0){throw 'Local research server stopped with an error'}
