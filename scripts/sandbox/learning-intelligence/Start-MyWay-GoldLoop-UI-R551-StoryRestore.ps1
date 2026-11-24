# Restored visual-story dual comparison, no provider call just by launching.
[CmdletBinding()]
param(
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',
 [ValidateRange(1024,65535)][int]$Port=8877
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current | Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "Wrong Git branch '$branch'. Production main is protected."}
$server=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r551-goldloop-web.mjs'
if(-not(Test-Path -LiteralPath $server -PathType Leaf)){throw 'R5.5.1 source is not installed'}
Write-Host 'MyWay R5.5.1 - dark visual-story + automatic B-only/B+X comparison' -ForegroundColor Cyan
Write-Host 'The prior authorized session allowance is preserved. No call is made by launching.'
Write-Host 'Open the entire localhost URL printed below. Press Ctrl+C to stop.'
& node $server --port "$Port"
if($LASTEXITCODE -ne 0){throw 'GoldLoop server returned an error'}
