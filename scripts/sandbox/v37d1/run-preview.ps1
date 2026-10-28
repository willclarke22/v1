param([string]$Experiment = 'C:\Users\willc\projects\MyWay\v1-learning-experiment')
$ErrorActionPreference = 'Stop'
$Experiment=(Resolve-Path -LiteralPath $Experiment).Path
$Verify=Join-Path $Experiment 'scripts\sandbox\v37d1\verify-v37d1.mjs'
& node $Verify $Experiment --remote
if ($LASTEXITCODE -ne 0) { throw 'V3.7D.1 guard failed. No server started.' }
if (!(Test-Path -LiteralPath (Join-Path $Experiment 'node_modules\next'))) {
  throw 'Next dependency missing in experiment. Install dependencies separately using pnpm install --frozen-lockfile.'
}
Push-Location $Experiment
$old=[Environment]::GetEnvironmentVariable('MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL','Process')
try {
  $env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL='v37c-route-audit-passed'
  Write-Host 'V3.7D.1 local-only: http://127.0.0.1:3001/sandbox/probe-lab/learning-space' -ForegroundColor Green
  Write-Host 'Workbench: http://127.0.0.1:3001/sandbox/probe-lab/learning-space/workbench'
  Write-Host 'Topic memory decisions preview only; sandbox DB is read only. Director and legacy worker remain disabled. Stop with Ctrl+C.'
  & pnpm exec next dev --hostname 127.0.0.1 --port 3001
  if ($LASTEXITCODE -ne 0) { throw 'Next dev server exited with an error.' }
} finally {
  if ($null -eq $old) {Remove-Item Env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL -ErrorAction SilentlyContinue} else {$env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL=$old}
  Pop-Location
}
