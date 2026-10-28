param([string]$Experiment = 'C:\Users\willc\projects\MyWay\v1-learning-experiment')
$ErrorActionPreference = 'Stop'
$Experiment = (Resolve-Path -LiteralPath $Experiment).Path
$Original = Join-Path (Split-Path -Parent $Experiment) 'v1'
& node (Join-Path $Experiment 'scripts\sandbox\v37c23\verify-v37c23.mjs') $Experiment $Original --remote
if ($LASTEXITCODE -ne 0) { throw 'V3.7C.2.3 safety verification failed; build not started.' }
& (Join-Path $Experiment 'scripts\sandbox\v37c2\run-guarded-build.ps1') -Experiment $Experiment
if ($LASTEXITCODE -ne 0) { throw 'Guarded build exited with an error.' }
