param([string]$Experiment = 'C:\Users\willc\projects\MyWay\v1-learning-experiment')
$ErrorActionPreference = 'Stop'
$Experiment = (Resolve-Path -LiteralPath $Experiment).Path
$Original = Join-Path (Split-Path -Parent $Experiment) 'v1'
& node (Join-Path $Experiment 'scripts\sandbox\v37c231\verify-v37c231.mjs') $Experiment $Original --remote
if ($LASTEXITCODE -ne 0) { throw 'V3.7C.2.3.1 NVIDIA safety verification failed; server not started.' }
& (Join-Path $Experiment 'scripts\sandbox\v37c23\run-glm-preview.ps1') -Experiment $Experiment
if ($LASTEXITCODE -ne 0) { throw 'Guarded experimental preview exited with an error.' }
