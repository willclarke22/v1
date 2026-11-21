# Exactly reviewed goldpilot01 Spanish retry r0001. No API calls.
[CmdletBinding()]
param(
 [ValidateSet('Check','Commit','Reject')][string]$Mode='Check',
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment'
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "Wrong branch '$branch'"}
$script=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r48-recover-r0001.mjs'
& node $script "--$($Mode.ToLowerInvariant())"
if($LASTEXITCODE -ne 0){throw 'R4.8 offline recovery refused. Do not remove the pending trace or rerun paid calls.'}
