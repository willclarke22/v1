param(
  [string]$Experiment = 'C:\Users\willc\projects\MyWay\v1-learning-experiment'
)
$ErrorActionPreference = 'Stop'
$Original = Join-Path (Split-Path -Parent $Experiment) 'v1'
$ScriptRoot = Join-Path $Experiment 'scripts\sandbox\v37b2'
if (-not (Test-Path -LiteralPath (Join-Path $ScriptRoot 'installation.json'))) { throw 'V3.7B.2 BLOCK: installer marker missing.' }
$Destination = Join-Path $ScriptRoot 'sandbox-destination.json'
$EnvPath = Join-Path $Experiment '.env.local'
if ((Test-Path -LiteralPath $EnvPath) -or (Test-Path -LiteralPath $Destination)) { throw 'V3.7B.2 BLOCK: Sandbox config exists. Refusing to overwrite.' }
& git -C $Experiment check-ignore -q -- .env.local
if ($LASTEXITCODE -ne 0) { throw 'V3.7B.2 BLOCK: .env.local is not Git ignored.' }
Write-Host 'Select the myway_sandbox project in Supabase Dashboard > Project Settings > API.'
Write-Host 'Enter the NEW sandbox project URL and the NEW sandbox service_role secret. They will never be printed.'
$Url = (Read-Host 'Sandbox project URL, https://<ref>.supabase.co').Trim().TrimEnd('/')
$Sec = Read-Host 'Sandbox service_role key (hidden input)' -AsSecureString
$ptr=[IntPtr]::Zero
try {
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Sec)
  $Key=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim()
  if ([string]::IsNullOrWhiteSpace($Key)) { throw 'Missing sandbox key.' }
  if (($Url -match '[\r\n"\x27]') -or ($Key -match '[\r\n"\x27]')) { throw 'Credential contains unsupported characters.' }
  $env:MYWAY_SETUP_SUPABASE_URL = $Url
  $env:MYWAY_SETUP_SERVICE_KEY = $Key
  & node (Join-Path $ScriptRoot 'check-credentials.mjs') $Experiment $Original
  if ($LASTEXITCODE -ne 0) { throw 'Remote destination verification failed: no files written.' }
  $Bytes=[Text.Encoding]::UTF8.GetBytes("# MyWay experimental only -- DO NOT copy to original or Vercel`nNEXT_PUBLIC_SUPABASE_URL=$Url`nSUPABASE_SERVICE_ROLE_KEY=$Key`nMYWAY_EXPERIMENTAL_RUNTIME=v37b`nMYWAY_TOPIC_VECTOR_BACKEND=supabase`n")
  [IO.File]::WriteAllBytes($EnvPath,$Bytes)
  # The pin holds only SHA256 hashes and a project name hint, never credentials.
  & node (Join-Path $ScriptRoot 'pin-destination.mjs') $Experiment $Original
  if ($LASTEXITCODE -ne 0) { Remove-Item -LiteralPath $EnvPath -Force -ErrorAction SilentlyContinue; throw 'Could not establish destination pin.' }
  Write-Host 'V3.7B.2 CONFIG PASS: experimental .env.local created and pinned to distinct Supabase destination.'
  Write-Host 'DO NOT start Next.js or workers until runtime worker safeguards are completed.'
} finally {
  if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  Remove-Item Env:MYWAY_SETUP_SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:MYWAY_SETUP_SERVICE_KEY -ErrorAction SilentlyContinue
  $Key=$null
}
