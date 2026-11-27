param([Parameter(Mandatory=$true)][string]$JobFile)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$job=Get-Content -LiteralPath $JobFile -Raw -Encoding UTF8 | ConvertFrom-Json
$synth=New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $english=@($synth.GetInstalledVoices() | Where-Object {$_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq 'en'})
  if($english.Count -gt 0){$synth.SelectVoice($english[0].VoiceInfo.Name)}
  $synth.Rate=0
  $synth.Volume=100
  foreach($cue in $job.cues){
    $synth.SetOutputToWaveFile([string]$cue.file)
    try{$synth.Speak([string]$cue.text)}finally{$synth.SetOutputToNull()}
  }
  [System.IO.File]::WriteAllText([string]$job.meta, ($synth.Voice.Name | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))
} finally {$synth.Dispose()}
