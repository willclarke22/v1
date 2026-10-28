param([string]$Experiment = 'C:\Users\willc\projects\MyWay\v1-learning-experiment')
$ErrorActionPreference = 'Stop'
$Script=Join-Path $Experiment 'scripts\sandbox\v37b3\readonly-runtime-audit.mjs'
if (!(Test-Path -LiteralPath $Script -PathType Leaf)) { throw 'V3.7B.3 audit script not installed' }
& node $Script $Experiment
if ($LASTEXITCODE -ne 0) { throw 'V3.7B.3 READ-ONLY AUDIT FAILED. Do not start application or workers.' }
