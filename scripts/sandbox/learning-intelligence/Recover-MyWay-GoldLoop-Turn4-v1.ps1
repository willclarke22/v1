[CmdletBinding()]
param(
  [ValidateSet('Check','Commit')][string]$Mode='Check',
  [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment'
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'myway/learning-sandbox-v3_7a') { throw "Refusing recovery: expected isolated branch myway/learning-sandbox-v3_7a, got '$branch'" }
$script=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r43-recover-t0004-offline-v1.mjs'
if (!(Test-Path -LiteralPath $script)) { throw "Recovery script missing: $script" }
$flag=if ($Mode -eq 'Check') {'--check'} else {'--commit'}
Write-Host "GoldLoop offline recovery: mode=$Mode session=goldpilot01 turn=t0004; ZERO model/embedding calls"
& node $script $flag
if ($LASTEXITCODE -ne 0) { throw "Recovery $Mode failed. Do not resend the paid turn; inspect the error above." }
