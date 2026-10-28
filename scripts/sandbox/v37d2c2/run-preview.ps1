param([string]$Experiment='C:\Users\willc\projects\MyWay\v1-learning-experiment')
$ErrorActionPreference='Stop'
$Experiment=(Resolve-Path -LiteralPath $Experiment).Path
& node (Join-Path $Experiment 'scripts\sandbox\v37d2c2\verify-v37d2c2.mjs') $Experiment --remote
if($LASTEXITCODE -ne 0){throw 'V3.7D.2C.2 guard failed. No Next server started.'}
if(!(Test-Path -LiteralPath (Join-Path $Experiment 'node_modules\next'))){throw 'Next dependencies missing.'}
Push-Location $Experiment
$old=[Environment]::GetEnvironmentVariable('MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL','Process')
try{
 $env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL='v37c-route-audit-passed'
 Write-Host 'MyWay D.2C.2 guarded local Learning Space: http://127.0.0.1:3001/sandbox/probe-lab/learning-space'
 Write-Host 'Workbench: http://127.0.0.1:3001/sandbox/probe-lab/learning-space/workbench'
 Write-Host 'Model C: human-reviewed association only; strict deterministic auto-updates unchanged; observation store OFF by default.'
 Write-Host 'No global layout worker, legacy workers, automatic topic creation, or Director writes.'
 & pnpm exec next dev --hostname 127.0.0.1 --port 3001
 if($LASTEXITCODE -ne 0){throw 'Next dev exited with error.'}
}finally{
 if($null -eq $old){Remove-Item Env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL -ErrorAction SilentlyContinue}else{$env:MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL=$old}
 Pop-Location
}
