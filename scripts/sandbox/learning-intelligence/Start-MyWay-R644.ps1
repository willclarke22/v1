[CmdletBinding()]
param([string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',[int]$Port=8879,[switch]$Offline)
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $root branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -ne 'myway/learning-sandbox-v3_7a'){throw 'Protected research branch required.'}
$entry=Join-Path $root 'scripts/sandbox/learning-intelligence/r644/launch.py'
$argsList=@($entry,'--port',"$Port")
if($Offline){$argsList+='--offline'}
Push-Location -LiteralPath $root
try {
    & python @argsList
    if($LASTEXITCODE -ne 0){throw 'Learning Lab stopped; inspect the message above.'}
} finally { Pop-Location }
