param([string]$Experiment = 'C:\Users\willc\projects\MyWay\v1-learning-experiment')
$ErrorActionPreference = 'Stop'
$Experiment = (Resolve-Path -LiteralPath $Experiment).Path
$Original = Join-Path (Split-Path -Parent $Experiment) 'v1'
$Verifier = Join-Path $Experiment 'scripts\sandbox\v37c1\verify-preview.mjs'
if (!(Test-Path -LiteralPath $Verifier -PathType Leaf)) { throw 'V3.7C.1 is not installed' }
Write-Host 'V3.7C.1: Verifying local-only route gate, database pin and read-only seeded records...'
& node $Verifier $Experiment $Original --remote
if ($LASTEXITCODE -ne 0) { throw 'V3.7C.1 runtime verification failed; no server started.' }
Push-Location $Experiment
$OldApproval = [Environment]::GetEnvironmentVariable('MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL', 'Process')
try {
    if (!(Test-Path -LiteralPath (Join-Path $Experiment 'node_modules\next'))) {
        throw 'Next.js dependencies missing in experiment. First run pnpm install --frozen-lockfile in this worktree; then rerun this guarded launcher.'
    }
    $env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL = 'v37c-route-audit-passed'
    Write-Host 'V3.7C.1 READ-ONLY LAUNCH: http://127.0.0.1:3001/sandbox/probe-lab/learning-space'
    Write-Host 'Workbench: http://127.0.0.1:3001/sandbox/probe-lab/learning-space/workbench'
    Write-Host 'This process binds to loopback only. Legacy API routes remain blocked by proxy.ts. Stop with Ctrl+C.'
    & pnpm exec next dev --hostname 127.0.0.1 --port 3001
    if ($LASTEXITCODE -ne 0) { throw 'Next.js exited with an error. No background worker was started.' }
} finally {
    if ($null -eq $OldApproval) { Remove-Item Env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL -ErrorAction SilentlyContinue }
    else { $env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL = $OldApproval }
    Pop-Location
}
