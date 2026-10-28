param([string]$Experiment = 'C:\Users\willc\projects\MyWay\v1-learning-experiment')
$ErrorActionPreference = 'Stop'
$Experiment = (Resolve-Path -LiteralPath $Experiment).Path
$Original = Join-Path (Split-Path -Parent $Experiment) 'v1'
& node (Join-Path $Experiment 'scripts\sandbox\v37c2\verify-v37c2.mjs') $Experiment $Original --remote
if ($LASTEXITCODE -ne 0) { throw 'Build preflight failed; no build started.' }
Push-Location $Experiment
$OldApproval = [Environment]::GetEnvironmentVariable('MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL','Process')
try {
  if (!(Test-Path -LiteralPath 'node_modules\next')) { throw 'Run pnpm install --frozen-lockfile first.' }
  Write-Host 'V3.7C.2: Running guarded TypeScript project check...'
  & pnpm exec tsc --noEmit
  if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed; Next build not attempted.' }
  # Next config is intentionally guarded. This variable is scoped to this verified process only.
  $env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL = 'v37c-route-audit-passed'
  Write-Host 'V3.7C.2: Running guarded Next production build. Legacy routes remain blocked by proxy.'
  & pnpm exec next build
  if ($LASTEXITCODE -ne 0) { throw 'Build failed. See diagnostics; original checkout untouched.' }
  Write-Host 'V3.7C.2 GUARDED BUILD PASS'
} finally {
  if ($null -eq $OldApproval) { Remove-Item Env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL -ErrorAction SilentlyContinue }
  else { $env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL = $OldApproval }
  Pop-Location
}
