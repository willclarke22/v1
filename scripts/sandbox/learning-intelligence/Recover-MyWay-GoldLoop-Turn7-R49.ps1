# R4.9 read-only check or explicit offline commit. No provider calls.
[CmdletBinding()]
param(
 [ValidateSet('Check','Commit')][string]$Mode='Check',
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment'
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "Wrong Git branch '$branch'; do not touch production main."}
$script=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r49-recover-t0007.mjs'
if(-not(Test-Path -LiteralPath $script -PathType Leaf)){throw 'R4.9 recovery script not installed.'}
$flag=if($Mode -eq 'Check'){'--check'}else{'--commit'}
& node $script $flag
if($LASTEXITCODE -ne 0){throw 'Recovery refused. Do NOT delete the pending trace or resubmit the paid turn; export for review.'}
