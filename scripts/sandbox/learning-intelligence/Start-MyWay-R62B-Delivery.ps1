[CmdletBinding()]
param([string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',[int]$Port=8879,[switch]$EnableReal,[switch]$EnableSpeech,[switch]$ReviewedRender)
$ErrorActionPreference='Stop'
if($EnableSpeech -and !$EnableReal){throw 'Speech requires -EnableReal and a separate explicit UI authorization.'}
$root=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $root branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -ne 'myway/learning-sandbox-v3_7a'){throw 'Protected research branch required.'}
$entry=Join-Path $root 'scripts/sandbox/learning-intelligence/r62b/server.mjs'
$argsList=@($entry,'--port',"$Port")
if($EnableReal){$argsList+='--enable-real'}
if($EnableSpeech){$argsList+='--enable-speech'}
if($ReviewedRender){$argsList+='--allow-reviewed-render'}
& node @argsList
if($LASTEXITCODE -ne 0){throw 'R6.2B server stopped; inspect output.'}
