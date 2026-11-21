# Reviewed Spanish t0006 recovery. Read-only Check by default; explicit offline Commit only after review.
[CmdletBinding()]
param(
 [ValidateSet('Check','Commit')][string]$Mode='Check',
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment'
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a') { throw "Wrong Git branch '$branch'; original main must remain untouched." }
$repo=(& git -C $ProjectRoot rev-parse --show-toplevel).Trim()
if($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($repo).TrimEnd([char]92,[char]47) -ine [IO.Path]::GetFullPath($ProjectRoot).TrimEnd([char]92,[char]47)){ throw 'ProjectRoot must be the isolated Git worktree root.' }
$script=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r47v3-recover-t0006.mjs'
if(-not(Test-Path -LiteralPath $script -PathType Leaf)){throw 'R4.7v3 reviewed recovery tool is not installed.'}
if($Mode -eq 'Commit'){Write-Warning 'OFFLINE COMMIT requested. Stop your sandbox server first. No paid API or embeddings calls will be made.'}
$flag=if($Mode -eq 'Check'){'--check'}else{'--commit'}
& node $script $flag
if($LASTEXITCODE -ne 0){throw 'Recovery refused. Do not delete pending trace or repeat paid turn. Local data may differ from reviewed export; send a fresh session ZIP for inspection.'}
