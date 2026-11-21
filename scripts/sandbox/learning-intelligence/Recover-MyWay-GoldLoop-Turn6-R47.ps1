# Inspect the already-paid t0006 Spanish turn; commit offline ONLY after a PASSing check.
[CmdletBinding()]
param([ValidateSet('Check','Commit')][string]$Mode='Check',
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment')
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "Wrong Git branch '$branch'; never modify main."}
$script=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r47-recover-t0006.mjs'
if(-not(Test-Path -LiteralPath $script -PathType Leaf)){throw 'R4.7 recovery tool was not installed.'}
if($Mode -eq 'Commit'){Write-Warning 'You requested local OFFLINE COMMIT. Stop the sandbox server first. This never repeats paid calls.'}
$flag=if($Mode -eq 'Check'){'--check'}else{'--commit'}
& node $script $flag
if($LASTEXITCODE -ne 0){throw 'Recovery refused; do NOT delete pending trace or resubmit. Export the blocked session for manual review.'}
