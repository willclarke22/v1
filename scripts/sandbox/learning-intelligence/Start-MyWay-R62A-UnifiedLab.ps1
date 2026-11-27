[CmdletBinding()]
param([string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',[ValidateRange(1024,65535)][int]$Port=8879,[switch]$EnableReal,[switch]$AllowExperimentalRender)
$ErrorActionPreference='Stop';$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current | Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw 'Wrong branch.'}
$nodeArgs=@((Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\r62\server.mjs'),'--port',"$Port")
if($EnableReal){$nodeArgs+='--enable-real';Write-Warning 'Real mode enabled but requires explicit session authorization; no paid calls at startup.'}
if($AllowExperimentalRender){$nodeArgs+='--allow-experimental-render';Write-Warning 'Experimental generated code is NOT a hardened sandbox. Only use a disposable network-isolated browser.'}
Write-Host "Open http://127.0.0.1:$Port — Unified Learning Lab R6.2A"
& node @nodeArgs
if($LASTEXITCODE -ne 0){throw 'R6.2A server stopped with an error'}
