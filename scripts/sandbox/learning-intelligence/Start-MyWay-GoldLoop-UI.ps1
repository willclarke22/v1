# Local-only R4.3 GoldLoop UI launcher. Real paid calls require browser authorization for EACH turn.
[CmdletBinding()]
param(
    [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',
    [ValidateRange(1024,65535)][int]$Port=8877
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "Wrong Git branch '$branch'; this is only for the isolated experiment."}
$server=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r43-goldloop-web.mjs'
if(-not(Test-Path -LiteralPath $server)){throw 'R4.3 GoldLoop browser server is not installed.'}
Write-Host 'Starting LOCAL-ONLY MyWay GoldLoop research sandbox. No models are charged by starting the page.' -ForegroundColor Cyan
Write-Host 'Keep this PowerShell terminal open. Use Ctrl+C to stop.'
& node $server --port "$Port"
if($LASTEXITCODE -ne 0){throw 'GoldLoop local server stopped with an error.'}
