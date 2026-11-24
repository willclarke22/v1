# Free, copy-only source-filtered reset of Spanish clean04 -> clean05; guarded by fingerprint and branch.
[CmdletBinding()]
param([string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment')
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current | Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a'){throw "Wrong Git branch '$branch'. STOP."}
$script=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r55-clean-session.mjs'
if(-not(Test-Path -LiteralPath $script -PathType Leaf)){throw 'R5.5 clean-session script missing.'}
Push-Location -LiteralPath $ProjectRoot
try {
 $target=Join-Path $ProjectRoot '.myway-patch-backups\learning-intelligence-reports\s62bfix1r43-goldloop\goldpilot01_clean05\state.json'
 if(Test-Path -LiteralPath $target){Write-Host 'clean05 already exists. Verifying instead of replacing it.' -ForegroundColor Cyan}
 else {
  $previewRaw=(& node $script preview | Out-String)
  if($LASTEXITCODE -ne 0){throw 'Spanish reset preview failed; no files changed.'}
  $p=$previewRaw|ConvertFrom-Json
  if($p.blocked_pending -or $p.excluded_topic_ids.Count -lt 1){throw 'Reset aborted: pending operation or no Spanish topic found.'}
  Write-Host "Reset preview: $($p.topics_before) -> $($p.topics_after) topics; $($p.turns_before) -> $($p.turns_after) turns; $($p.roots_after) roots retained." -ForegroundColor Yellow
  $resultRaw=(& node $script apply $p.source_fingerprint | Out-String)
  if($LASTEXITCODE -ne 0){throw 'Reset creation failed; source session unchanged.'}
  $r=$resultRaw|ConvertFrom-Json
  if($r.status -ne 'created_new_session' -or -not $r.verified){throw 'New clean05 did not verify.'}
 }
 $verifiedRaw=(& node $script verify | Out-String)
 if($LASTEXITCODE -ne 0){throw 'Reset verification failed; do not use clean05.'}
 $v=$verifiedRaw|ConvertFrom-Json
 if($v.status -ne 'clean_session_verified'){throw 'Unexpected verification result.'}
 Write-Host "SUCCESS: $($v.session) Spanish-free; $($v.topics) topics, $($v.turns) turns, $($v.roots) root records; zero cached vectors. Source untouched." -ForegroundColor Green
} finally {Pop-Location}
