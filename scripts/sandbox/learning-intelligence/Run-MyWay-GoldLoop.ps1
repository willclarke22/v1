# R4.3 isolated human learner GoldLoop launcher. No production or model spend without -AllowSpend.
[CmdletBinding()]
param(
    [ValidateSet('plan','preflight','retrieval-check','model')][string]$Mode = 'plan',
    [string]$ProjectRoot = 'C:\Users\willc\projects\MyWay\v1-learning-experiment',
    [string]$SessionId = 'goldpilot01',
    [string]$TurnId = 't001',
    [string]$MessageFile = '',
    [ValidateSet('gpt-4.1-mini','gpt-4.1')][string]$ModelA = 'gpt-4.1-mini',
    [ValidateSet('gpt-4.1-mini','gpt-4.1')][string]$ModelB = 'gpt-4.1-mini',
    [ValidateSet('gpt-4.1-mini','gpt-4.1')][string]$ModelX = 'gpt-4.1-mini',
    [ValidateSet('on','off')][string]$SecondRetrieval = 'on',
    [switch]$AllowSpend,
    [double]$BudgetUsd = 0.50
)
$ErrorActionPreference = 'Stop'
if ($SessionId -cnotmatch '^[A-Za-z][A-Za-z0-9_-]{0,39}$' -or $TurnId -cnotmatch '^[A-Za-z][A-Za-z0-9_-]{0,39}$') { throw 'Invalid SessionId or TurnId.' }
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$branch = (& git -C $ProjectRoot branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -cne 'myway/learning-sandbox-v3_7a') { throw "Wrong Git branch: $branch. Refusing to run." }
$runner = Join-Path $ProjectRoot 'scripts\sandbox\learning-intelligence\s62bfix1r43-goldloop-run.mjs'
if (-not (Test-Path -LiteralPath $runner)) { throw 'GoldLoop runner not installed.' }
$temporaryQueryFile = $null
if ($Mode -in @('model','retrieval-check') -and -not $MessageFile) {
    $text = Read-Host 'Enter the learner message (one line; or supply -MessageFile for longer input)'
    if (-not $text -or $text.Length -gt 4000) { throw 'Message must be between 1 and 4000 characters.' }
    if ($Mode -eq 'retrieval-check') {
        $temporaryQueryFile = Join-Path ([IO.Path]::GetTempPath()) ("myway-goldloop-" + [Guid]::NewGuid().ToString('N') + '.txt')
        $MessageFile = $temporaryQueryFile
    } else {
        $inputDir = Join-Path $ProjectRoot ".myway-patch-backups\learning-intelligence-reports\s62bfix1r43-goldloop\$SessionId\inputs"
        New-Item -ItemType Directory -Path $inputDir -Force | Out-Null
        $MessageFile = Join-Path $inputDir "$TurnId.txt"
        if (Test-Path -LiteralPath $MessageFile) { throw 'Message input file already exists; no overwrite.' }
    }
    Set-Content -LiteralPath $MessageFile -Value $text -Encoding utf8 -NoNewline
}
$argsForNode = @($runner,'--mode',$Mode,'--session-id',$SessionId,'--turn-id',$TurnId,'--model-a',$ModelA,'--model-b',$ModelB,'--model-x',$ModelX,'--second-retrieval',$SecondRetrieval)
if ($MessageFile) { $argsForNode += @('--message-file',(Resolve-Path -LiteralPath $MessageFile).Path) }
if ($Mode -eq 'model') {
    if (-not $AllowSpend) { throw 'Model mode requires -AllowSpend. Nothing was sent.' }
    if ($BudgetUsd -le 0 -or $BudgetUsd -gt 10) { throw 'BudgetUsd must be >0 and <=10.' }
    $argsForNode += @('--allow-spend','--budget-usd',([string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0}', $BudgetUsd)))
} elseif ($AllowSpend) { throw 'Spending flag only allowed in model mode.' }
try {
    & node @argsForNode
    $code = $LASTEXITCODE
} finally {
    if ($temporaryQueryFile -and (Test-Path -LiteralPath $temporaryQueryFile)) { Remove-Item -LiteralPath $temporaryQueryFile -Force }
}
if ($code -ne 0) { throw "GoldLoop reported an error (exit $code). Inspect its pending turn trace if in model mode. Do NOT automatically retry paid turns." }
