# Explicit reviewed t0009 checkpoint: Check is free; Continue calls only B and X after opt-in.
[CmdletBinding()]
param(
 [ValidateSet('Check','Continue')][string]$Mode='Check',
 [string]$ProjectRoot='C:\Users\willc\projects\MyWay\v1-learning-experiment',
 [ValidateSet('gpt-4.1-mini','gpt-4.1')][string]$ModelB='gpt-4.1-mini',
 [ValidateSet('gpt-4.1-mini','gpt-4.1')][string]$ModelX='gpt-4.1-mini',
 [double]$BudgetUsd=0.50,
 [switch]$AllowSpend
)
$ErrorActionPreference='Stop'
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$branch=(& git -C $ProjectRoot branch --show-current).Trim()
if($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a') {throw "Wrong branch '$branch' (original production main is prohibited)."}
$runner=Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r50-resume-t0009.mjs'
if(-not(Test-Path -LiteralPath $runner -PathType Leaf)){throw 'R5.0 checkpoint runner missing; install R5.0 patch first.'}
if($Mode -eq 'Check'){
 if($AllowSpend.IsPresent){throw 'Read-only Check cannot allow spending.'}
 & node $runner --mode check
 if($LASTEXITCODE -ne 0){throw 'R5.0 recovery Check refused; leave t0009.pending.json unchanged and export for review.'}
 return
}
if(-not $AllowSpend.IsPresent){throw 'Continue requires the explicit -AllowSpend switch.'}
if($BudgetUsd -le 0 -or $BudgetUsd -gt 10){throw 'BudgetUsd must be greater than zero and at most $10. This is only a software admission threshold, not a billing cap.'}
Write-Host 'CONTINUE WILL MAKE UP TO TWO NEW PAID API CALLS: Model B, then Model X. It will reuse the already-returned ROUTE and A.' -ForegroundColor Yellow
Write-Host 'Stop the browser server before running Continue. This command is not automatically retried.' -ForegroundColor Yellow
& node $runner --mode continue --model-b $ModelB --model-x $ModelX --budget-usd $BudgetUsd --allow-spend
if($LASTEXITCODE -ne 0){throw 'R5.0 checkpoint continuation stopped. Do NOT repeat this command; review and export pending paid trace.'}
