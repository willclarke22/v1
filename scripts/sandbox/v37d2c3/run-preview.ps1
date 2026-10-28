param([string]$Experiment='C:\Users\willc\projects\MyWay\v1-learning-experiment')
$ErrorActionPreference='Stop'
$Experiment=(Resolve-Path -LiteralPath $Experiment).Path
& node (Join-Path $Experiment 'scripts\sandbox\v37d2c3\verify-v37d2c3.mjs') $Experiment --remote
if($LASTEXITCODE -ne 0){throw 'V3.7D.2C.3 verification failed. No local server started.'}
Push-Location $Experiment
$previous=[Environment]::GetEnvironmentVariable('MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL','Process')
try {
 $env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL='v37c-route-audit-passed'
 Write-Host 'Local Learning Space: http://127.0.0.1:3001/sandbox/probe-lab/learning-space'
 Write-Host 'Cloud additions are inactive here; existing local read/write approvals preserved.'
 & pnpm exec next dev --hostname 127.0.0.1 --port 3001
 if($LASTEXITCODE -ne 0){throw 'Local Next dev exited with error.'}
}finally {
 if($null -eq $previous){Remove-Item Env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL -ErrorAction SilentlyContinue}
 else{$env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL=$previous}
 Pop-Location
}
