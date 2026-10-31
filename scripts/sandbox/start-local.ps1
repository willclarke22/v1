param([string]$Experiment = 'C:\Users\willc\projects\MyWay\v1-learning-experiment')
$ErrorActionPreference = 'Stop'
function Halt([string]$Message){throw "MYWAY GUARDED LAUNCH STOP: $Message"}
function InvokeGitSafe([string]$Directory, [string[]]$Args){
  $out = & git.exe -C $Directory @Args
  if ($LASTEXITCODE -ne 0){Halt "Git verification failed: $($Args -join ' ')"}
  return ($out | Out-String).Trim()
}
$Experiment = (Resolve-Path -LiteralPath $Experiment).Path
$Original = 'C:\Users\willc\projects\MyWay\v1'
if ((Split-Path $Experiment -Leaf) -cne 'v1-learning-experiment'){Halt 'Wrong experiment directory'}
if ((InvokeGitSafe $Experiment @('branch','--show-current')) -cne 'myway/learning-sandbox-v3_7a'){Halt 'Wrong branch'}
if ((InvokeGitSafe $Original @('branch','--show-current')) -cne 'main'){Halt 'Original branch changed'}
if ((InvokeGitSafe $Original @('rev-parse','--short=7','HEAD')) -cne '462a7a4'){Halt 'Original main checkpoint changed'}
$ReleaseFile=Join-Path $Experiment 'scripts\sandbox\current-local-release.json'
if (!(Test-Path -LiteralPath $ReleaseFile -PathType Leaf)){Halt 'Release pointer missing'}
$r=Get-Content -LiteralPath $ReleaseFile -Raw | ConvertFrom-Json
if ($r.schema -cne 'myway-current-local-release-v1' -or $r.release -cnotmatch '^v37d2c[6-9][a-z0-9]*$') {Halt 'Invalid release pointer'}
foreach($name in @('verify','test')){
  $expected="scripts/sandbox/$($r.release)/$name-$($r.release).mjs"
  if ($r.$name -cne $expected){Halt "Unapproved $name path in release pointer"}
}
if ($r.marker -cne "scripts/sandbox/$($r.release)/installation.json"){Halt 'Invalid release marker path'}
$MarkerPath=Join-Path $Experiment ($r.marker.Replace('/','\'))
if (!(Test-Path -LiteralPath $MarkerPath -PathType Leaf)){Halt 'Missing installed-release marker'}
$marker=Get-Content -LiteralPath $MarkerPath -Raw | ConvertFrom-Json
if ($marker.schema -cne "myway-$($r.release)-local-install-v1"){Halt 'Installed-release marker mismatch'}
foreach($name in @('verify','test')){
  $rel=$r.$name
  $expectedHash=$marker.hashes.PSObject.Properties[$rel].Value
  if (!$expectedHash){Halt "Missing pinned $name hash"}
  $path=Join-Path $Experiment ($rel.Replace('/','\'))
  if (!(Test-Path -LiteralPath $path -PathType Leaf)){Halt "Missing $name file"}
  if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedHash){Halt "Altered $name verifier"}
}
foreach($name in @('test','verify')){
  & node (Join-Path $Experiment ($r.$name.Replace('/','\'))) $Experiment
  if ($LASTEXITCODE -ne 0){Halt "Current $name failed: $($r.release)"}
}
if (!(Test-Path -LiteralPath (Join-Path $Experiment 'node_modules\next') -PathType Container)){Halt 'Next.js dependencies not installed in experimental worktree'}
$old = [Environment]::GetEnvironmentVariable('MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL','Process')
Push-Location $Experiment
try {
  $env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL='v37c-route-audit-passed'
  Write-Host "MYWAY GUARDED LOCAL LAUNCH: verified $($r.release)" -ForegroundColor Green
  Write-Host 'Learning Space: http://127.0.0.1:3001/sandbox/probe-lab/learning-space'
  Write-Host 'Workbench: http://127.0.0.1:3001/sandbox/probe-lab/learning-space/workbench'
  Write-Host 'Launch approval applies to this process only; database and worker safeguards remain active.'
  & pnpm exec next dev --hostname 127.0.0.1 --port 3001
  if ($LASTEXITCODE -ne 0){Halt 'Local Next.js exited with an error'}
} finally {
  if ($null -eq $old){Remove-Item Env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL -ErrorAction SilentlyContinue}
  else {$env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL=$old}
  Pop-Location
}
