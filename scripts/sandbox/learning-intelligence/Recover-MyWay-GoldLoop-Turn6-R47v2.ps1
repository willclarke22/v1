# Repair the R4.7 recovery replay bug for goldpilot01/t0006. Always Check first.
[CmdletBinding()]
param([ValidateSet('Check','Commit')][string]$Mode='Check',
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment')
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "Wrong branch '$branch'; refusing recovery outside isolated experiment."}
$root=(& git -C $ProjectRoot rev-parse --show-toplevel).Trim()
if($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($root).TrimEnd([char]92,[char]47) -ine [IO.Path]::GetFullPath($ProjectRoot).TrimEnd([char]92,[char]47)){throw 'ProjectRoot must be the isolated Git worktree root.'}
$script=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r47v2-recover-t0006.mjs'
if(-not(Test-Path -LiteralPath $script -PathType Leaf)){throw 'R4.7v2 recovery tool missing; install patch first.'}
if($Mode -eq 'Commit'){Write-Warning 'EXPLICIT OFFLINE COMMIT: stop the sandbox server first. Raw paid responses are not retried or changed.'}
$flag=if($Mode -eq 'Check'){'--check'}else{'--commit'}
& node $script $flag
if($LASTEXITCODE -ne 0){throw 'Recovery refused; leave t0006.pending.json intact and export the session for manual review. No automatic retry.'}
