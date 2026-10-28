param([string]$Experiment = 'C:\Users\willc\projects\MyWay\v1-learning-experiment')
$ErrorActionPreference = 'Stop'
$Experiment = (Resolve-Path -LiteralPath $Experiment).Path
$Original = Join-Path (Split-Path -Parent $Experiment) 'v1'
Write-Host 'V3.7C.2: Verifying local-only inference routes, baseline hashes and Supabase destination...'
& node (Join-Path $Experiment 'scripts\sandbox\v37c2\verify-v37c2.mjs') $Experiment $Original --remote
if ($LASTEXITCODE -ne 0) { throw 'V3.7C.2 preflight failed; no server started.' }
if (!(Test-Path -LiteralPath (Join-Path $Experiment 'node_modules\next'))) { throw 'Dependencies missing. Run pnpm install --frozen-lockfile in experiment only.' }
Push-Location $Experiment
$OldApproval = [Environment]::GetEnvironmentVariable('MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL','Process')
try {
 $env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL = 'v37c-route-audit-passed'
 Write-Host 'V3.7C.2 LOCAL PREVIEW: http://127.0.0.1:3001/sandbox/probe-lab/learning-space'
 Write-Host 'This stage permits local inference and read-only topic retrieval; persistent learning writes and workers remain disabled.'
 & pnpm exec next dev --hostname 127.0.0.1 --port 3001
 if ($LASTEXITCODE -ne 0) { throw 'Next.js exited nonzero. No worker started.' }
} finally {
 if ($null -eq $OldApproval) { Remove-Item Env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL -ErrorAction SilentlyContinue }
 else { $env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL = $OldApproval }
 Pop-Location
}
